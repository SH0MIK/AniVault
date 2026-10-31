// src/lib/vdohide-resolver.ts
// Cloudflare Workers-compatible VdoHide/Fembed stream resolver.
// No Node.js APIs — uses only Web platform globals (fetch, URL, etc.)

export interface VdoHideQuality {
  label: string;
  url: string;
  height: number | null;
  bandwidth: number | null;
}

export interface VdoHideAudioTrack {
  name: string;
  lang: string;
  url: string | null;
  default: boolean;
  groupId: string;
}

export interface VdoHideSubtitle {
  label: string;
  lang: string;
  url: string;
  default: boolean;
}

export interface VdoHideResolveResult {
  provider: 'vdohide';
  vdoId: string;
  embedUrl: string;
  masterUrl: string;
  title: string | null;
  qualities: VdoHideQuality[];
  audioTracks: VdoHideAudioTrack[];
  subtitles: VdoHideSubtitle[];
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';

const ALLOWED_HOSTS = new Set([
  'vdohide.com', 'fembed.co', 'vdohls.com', 'vdohls.net', 'vdohls.org',
  'vdohls.info', 'vidhidepro.com', 'vidhide.com', 'static.vdohls.com',
  'avxtube-4.xyz', 'cdn-1.avxtube-4.xyz',
]);

const PLAYLIST_HOSTS = ['vdohls.com', 'vdohls.net', 'vdohls.org', 'vdohls.info'];

function isAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(h)) return true;
  for (const ah of ALLOWED_HOSTS) {
    if (h.endsWith('.' + ah)) return true;
  }
  return false;
}

function fixUrl(url: string, protocol: string): string {
  if (url.startsWith('//')) return protocol + ':' + url;
  return url;
}

function parseM3u8Attrs(attrStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  const re = /([A-Z0-9-]+)=("(?:[^"\\]|\\.)*"|[^,]*)/g;
  for (const m of attrStr.matchAll(re)) {
    result[m[1]] = m[2].startsWith('"') ? m[2].slice(1, -1) : m[2];
  }
  return result;
}

// Pure-JS P.A.C.K.E.R. decoder (no vm.runInNewContext)
const PACK_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PACKED_RE = /eval\(function\(p,a,c,k,e,(?:d|r)\)\{[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/;

function unpackPacker(html: string): string | null {
  const m = html.match(PACKED_RE);
  if (!m) return null;
  const payload = m[1].replace(/\\'/g, "'");
  const radix = Number(m[2]);
  const count = Number(m[3]);
  const words = m[4].split('|');

  const toBase = (n: number): string => {
    if (n === 0) return '0';
    let out = '';
    while (n > 0) {
      out = PACK_CHARS[n % radix] + out;
      n = Math.floor(n / radix);
    }
    return out;
  };

  const dict = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    const token = toBase(i);
    if (words[i]) dict.set(token, words[i]);
  }

  return payload.replace(/\b\w+\b/g, (t) => dict.get(t) ?? t);
}

function extractBalancedObject(str: string, startIndex: number): string | null {
  const start = str.indexOf('{', startIndex);
  if (start < 0) return null;
  let depth = 0, quote = '', escaped = false;
  for (let i = start; i < str.length; i++) {
    const c = str[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '{') {
      depth++;
    } else if (c === '}' && --depth === 0) {
      return str.slice(start, i + 1);
    }
  }
  return null;
}

function extractPlayerConfig(html: string): Record<string, unknown> | null {
  // 1. Try balanced object extraction directly from HTML
  const configMatch = html.match(/(?:window\.)?PLAYER_CONFIG\s*=\s*/);
  if (configMatch && configMatch.index !== undefined) {
    const rawObj = extractBalancedObject(html, configMatch.index + configMatch[0].length);
    if (rawObj) {
      try { return JSON.parse(rawObj) as Record<string, unknown>; } catch { /* fall through */ }
    }
  }

  // 2. Try unpacking P.A.C.K.E.R. obfuscated scripts
  const unpacked = unpackPacker(html);
  if (unpacked) {
    const subMatch = unpacked.match(/(?:window\.)?PLAYER_CONFIG\s*=\s*/);
    if (subMatch && subMatch.index !== undefined) {
      const rawObj = extractBalancedObject(unpacked, subMatch.index + subMatch[0].length);
      if (rawObj) {
        try { return JSON.parse(rawObj) as Record<string, unknown>; } catch { /* fall through */ }
      }
    }
  }

  // 3. Try all <script> blocks
  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  for (const sm of html.matchAll(scriptRe)) {
    const scriptText = sm[1];
    const um = unpackPacker(scriptText);
    const sources = [scriptText, um].filter(Boolean) as string[];
    for (const src of sources) {
      const cm = src.match(/(?:window\.)?PLAYER_CONFIG\s*=\s*/);
      if (cm && cm.index !== undefined) {
        const rawObj = extractBalancedObject(src, cm.index + cm[0].length);
        if (rawObj) {
          try { return JSON.parse(rawObj) as Record<string, unknown>; } catch { /* continue */ }
        }
      }
    }
  }
  return null;
}

function extractFallbackM3u8(html: string): string | null {
  // Look for direct m3u8 URLs in page
  const re = /["'](https?:\/\/[^"'<>\s]+\.m3u8(?:\?[^"'<>\s]*)?)["']/g;
  for (const m of html.matchAll(re)) {
    try {
      const u = new URL(m[1]);
      if (isAllowedHost(u.hostname)) return m[1];
    } catch { /* skip */ }
  }
  return null;
}

function parseMasterPlaylist(manifest: string, manifestUrl: string, protocol: string): {
  qualities: VdoHideQuality[];
  audioTracks: VdoHideAudioTrack[];
  subtitles: VdoHideSubtitle[];
} {
  const qualities: VdoHideQuality[] = [];
  const audioTracks: VdoHideAudioTrack[] = [];
  const subtitles: VdoHideSubtitle[] = [];
  const lines = manifest.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXT-X-MEDIA:')) {
      const attrs = parseM3u8Attrs(line.slice('#EXT-X-MEDIA:'.length));
      const type = attrs.TYPE?.toUpperCase();
      const rawUri = attrs.URI;
      const uri = rawUri ? new URL(fixUrl(rawUri, protocol), manifestUrl).toString() : null;

      if (type === 'AUDIO') {
        audioTracks.push({
          name: attrs.NAME || attrs.LANGUAGE || 'Audio',
          lang: attrs.LANGUAGE || attrs.NAME || 'und',
          url: uri,
          default: attrs.DEFAULT?.toUpperCase() === 'YES',
          groupId: attrs['GROUP-ID'] || 'audio',
        });
      } else if (type === 'SUBTITLES') {
        if (uri) {
          subtitles.push({
            label: attrs.NAME || attrs.LANGUAGE || 'Subtitle',
            lang: attrs.LANGUAGE || attrs.NAME || 'en',
            url: uri,
            default: attrs.DEFAULT?.toUpperCase() === 'YES',
          });
        }
      }
    }

    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const attrs = parseM3u8Attrs(line.slice('#EXT-X-STREAM-INF:'.length));
      // Find next non-comment line
      let urlLine = '';
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (next && !next.startsWith('#')) { urlLine = next; i = j; break; }
      }
      if (!urlLine) continue;
      const absUrl = new URL(fixUrl(urlLine, protocol), manifestUrl).toString();
      const res = attrs.RESOLUTION; // e.g. "1280x720"
      const height = res ? parseInt(res.split('x')[1] || '0', 10) || null : null;
      const bandwidth = attrs.BANDWIDTH ? parseInt(attrs.BANDWIDTH, 10) || null : null;
      const label = height ? `${height}p` : (bandwidth ? `${Math.round(bandwidth / 1000)}k` : 'Auto');
      qualities.push({ label, url: absUrl, height, bandwidth });
    }
  }

  // Sort qualities by height descending
  qualities.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  return { qualities, audioTracks, subtitles };
}

export async function resolveVdoHide(embedUrl: string): Promise<VdoHideResolveResult> {
  const input = new URL(embedUrl);
  if (!/^https?:$/.test(input.protocol)) throw new Error('Only http/https URLs are supported');
  if (!isAllowedHost(input.hostname)) throw new Error(`Host ${input.hostname} is not an allowed VdoHide/Fembed host`);

  // Step 1: Fetch embed page
  const pageRes = await fetch(input.toString(), {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,*/*',
      'Referer': input.origin + '/',
    },
    redirect: 'follow',
  });
  if (!pageRes.ok) throw new Error(`Embed page returned HTTP ${pageRes.status}`);
  const html = await pageRes.text();
  const finalEmbedUrl = pageRes.url || input.toString();
  const protocol = new URL(finalEmbedUrl).protocol.replace(':', '');

  // Step 2: Extract PLAYER_CONFIG
  const config = extractPlayerConfig(html);
  if (!config) {
    // Fallback: look for direct m3u8 in page
    const directM3u8 = extractFallbackM3u8(html);
    if (!directM3u8) throw new Error('Could not extract PLAYER_CONFIG or any m3u8 URL from embed page');
    // Minimal result with direct URL
    const masterRes = await fetch(directM3u8, {
      headers: { 'User-Agent': UA, 'Referer': finalEmbedUrl, 'Accept': 'application/vnd.apple.mpegurl,*/*' },
      redirect: 'follow',
    });
    const manifest = masterRes.ok ? await masterRes.text() : '';
    const parsed = manifest.includes('#EXTM3U')
      ? parseMasterPlaylist(manifest, masterRes.url || directM3u8, protocol)
      : { qualities: [], audioTracks: [], subtitles: [] };
    return {
      provider: 'vdohide',
      vdoId: '',
      embedUrl: finalEmbedUrl,
      masterUrl: directM3u8,
      title: null,
      ...parsed,
    };
  }

  const vdoId = String(config.vdoId || config.vid || config.id || '');
  if (!vdoId) throw new Error('PLAYER_CONFIG found but vdoId is missing');

  // Step 3: Get subtitles from PLAYER_CONFIG tracks
  const configSubtitles: VdoHideSubtitle[] = [];
  if (Array.isArray(config.tracks)) {
    for (const t of config.tracks as Array<Record<string, unknown>>) {
      if (!t || !t.file) continue;
      const kind = String(t.kind || '').toLowerCase();
      if (kind === 'captions' || kind === 'subtitles' || !kind) {
        try {
          const subUrl = new URL(fixUrl(String(t.file), protocol), finalEmbedUrl).toString();
          configSubtitles.push({
            label: String(t.label || t.lang || 'Subtitle'),
            lang: String(t.lang || t.srclang || 'en'),
            url: subUrl,
            default: !!t.default,
          });
        } catch { /* skip invalid */ }
      }
    }
  }

  // Step 4: Try fetching master playlist from multiple hosts
  const playlistHost = config.playlistHost ? String(config.playlistHost).replace(/^\/\//, '') : null;
  const hostsToTry = playlistHost
    ? [playlistHost, ...PLAYLIST_HOSTS.filter(h => h !== playlistHost)]
    : PLAYLIST_HOSTS;

  let masterUrl = '';
  let masterManifest = '';

  for (const host of hostsToTry) {
    const candidate = `https://${host}/${vdoId}/playlist.m3u8`;
    try {
      const res = await fetch(candidate, {
        headers: {
          'User-Agent': UA,
          'Accept': 'application/vnd.apple.mpegurl,application/x-mpegURL,*/*',
          'Referer': finalEmbedUrl,
          'Origin': input.origin,
        },
        redirect: 'follow',
      });
      if (res.ok) {
        const text = await res.text();
        if (text.includes('#EXTM3U')) {
          masterUrl = res.url || candidate;
          masterManifest = text;
          break;
        }
      }
    } catch { /* try next host */ }
  }

  if (!masterUrl) throw new Error(`Could not fetch master playlist for vdoId=${vdoId} from any host`);

  // Step 5: Parse master playlist
  const parsed = parseMasterPlaylist(masterManifest, masterUrl, protocol);

  // Merge subtitles: prefer m3u8 parsed ones, add config ones not already present
  const allSubs = [...parsed.subtitles];
  for (const cs of configSubtitles) {
    if (!allSubs.some(s => s.url === cs.url)) allSubs.push(cs);
  }

  // Extract title from HTML
  const titleMatch = html.match(/(?:property=["']og:title["'][^>]+content=["']([^"']+)["']|<title[^>]*>([^<]+)<\/title>)/i);
  const title = titleMatch ? (titleMatch[1] || titleMatch[2] || '').trim() || null : null;

  return {
    provider: 'vdohide',
    vdoId,
    embedUrl: finalEmbedUrl,
    masterUrl,
    title,
    qualities: parsed.qualities,
    audioTracks: parsed.audioTracks,
    subtitles: allSubs,
  };
}
