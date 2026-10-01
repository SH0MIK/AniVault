export interface LuluTrack {
  lang: string;
  label: string;
  url: string;
  default?: boolean;
  groupId?: string;
}

export interface LuluResolveResult {
  provider: 'lulustream';
  embedUrl: string;
  finalUrl: string;
  video: { url: string; type: 'hls' | 'mp4' };
  audio: LuluTrack[];
  subtitles: LuluTrack[];
  poster: string | null;
  title: string | null;
  referer: string;
}

function decodeHtml(value: string): string {
  return value
    .replace(/\u0026/g, '&')
    .replace(/\u003d/g, '=')
    .replace(/\u002f/g, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/gi, "'");
}

function unescapeJs(value: string): string {
  return decodeHtml(value)
    .replace(/\\/g, '\\')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
}

function absoluteUrl(value: string, base: string): string | null {
  const decoded = unescapeJs(value.trim());
  try { return new URL(decoded, base).toString(); } catch { return null; }
}

function extractFirst(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) return unescapeJs(m[1]);
  }
  return null;
}


const PACKED_RE =
  /eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/;

const PACK_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function unpackPacked(html: string): string | null {
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

  const map = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    const token = toBase(i);
    map.set(token, words[i] || token);
  }

  return payload.replace(/\b\w+\b/g, (token) => map.get(token) ?? token);
}

function findMediaUrl(html: string, base: string): string | null {
  const sources = [html, unpackPacked(html)].filter(Boolean) as string[];

  for (const source of sources) {
    const decoded = decodeHtml(source);
    const candidates = [
      ...decoded.matchAll(/https?:\/\/[^\s"'\\<>]+\.m3u8(?:\?[^\s"'\\<>]*)?/gi),
      ...decoded.matchAll(/(?:file|src|source)\s*[:=]\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)(?:\?[^"']*)?)["']/gi),
      ...decoded.matchAll(/["']file["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi),
    ];

    for (const match of candidates) {
      const raw = match[1] || match[0];
      const url = absoluteUrl(raw, base);
      if (url && /\.(?:m3u8|mp4)(?:[?#]|$)/i.test(url)) return url;
    }
  }

  return null;
}

function parseHtmlTracks(html: string, base: string): { audio: LuluTrack[]; subtitles: LuluTrack[] } {
  const audio: LuluTrack[] = [];
  const subtitles: LuluTrack[] = [];

  const push = (kind: 'audio' | 'subtitles', urlRaw: string, labelRaw?: string, langRaw?: string) => {
    const url = absoluteUrl(urlRaw, base);
    if (!url) return;
    const list = kind === 'audio' ? audio : subtitles;
    if (list.some(x => x.url === url)) return;
    const label = decodeHtml(labelRaw || langRaw || (kind === 'audio' ? 'Audio' : 'Subtitle'));
    const lang = decodeHtml(langRaw || label || (kind === 'audio' ? 'und' : 'en'));
    list.push({ lang, label, url });
  };

  const trackRe = /(?:tracks|captions|subtitles|subtitleTracks)\s*:\s*\[([\s\S]*?)\]/gi;
  for (const block of html.matchAll(trackRe)) {
    const text = block[1];
    const itemRe = /\{([\s\S]*?)\}/g;
    for (const item of text.matchAll(itemRe)) {
      const obj = item[1];
      const url = /(?:file|src|url)\s*:\s*["']([^"']+)["']/i.exec(obj)?.[1];
      if (!url) continue;
      const label = /(?:label|name|title)\s*:\s*["']([^"']+)["']/i.exec(obj)?.[1];
      const lang = /(?:srclang|language|lang)\s*:\s*["']([^"']+)["']/i.exec(obj)?.[1];
      const kind = /kind\s*:\s*["']([^"']+)["']/i.exec(obj)?.[1]?.toLowerCase();
      push(kind === 'audio' ? 'audio' : 'subtitles', url, label, lang);
    }
  }

  return { audio, subtitles };
}

function parseM3u8Tracks(manifest: string, manifestUrl: string): { audio: LuluTrack[]; subtitles: LuluTrack[] } {
  const audio: LuluTrack[] = [];
  const subtitles: LuluTrack[] = [];
  const lines = manifest.split(/\r?\n/);

  for (const line of lines) {
    if (!line.startsWith('#EXT-X-MEDIA:')) continue;
    const attrs: Record<string, string> = {};
    const re = /([A-Z0-9-]+)=("(?:[^"]|"")*"|[^,]*)/g;
    for (const m of line.slice('#EXT-X-MEDIA:'.length).matchAll(re)) {
      attrs[m[1]] = m[2].replace(/^"|"$/g, '');
    }
    const type = attrs.TYPE?.toUpperCase();
    if (type !== 'AUDIO' && type !== 'SUBTITLES') continue;

    const uri = attrs.URI ? absoluteUrl(attrs.URI, manifestUrl) : null;
    if (!uri) continue;
    const track: LuluTrack = {
      lang: attrs.LANGUAGE || attrs.NAME || (type === 'AUDIO' ? 'und' : 'en'),
      label: attrs.NAME || attrs.LANGUAGE || (type === 'AUDIO' ? 'Audio' : 'Subtitle'),
      url: uri,
      default: attrs.DEFAULT?.toUpperCase() === 'YES',
      ...(attrs['GROUP-ID'] ? { groupId: attrs['GROUP-ID'] } : {}),
    };
    const list = type === 'AUDIO' ? audio : subtitles;
    if (!list.some(x => x.url === uri)) list.push(track);
  }

  return { audio, subtitles };
}

export async function resolveLuluStream(embedUrl: string): Promise<LuluResolveResult> {
  const input = new URL(embedUrl);
  if (!/^https?:$/.test(input.protocol)) throw new Error('Only http(s) URLs are supported');
  if (!/(^|\.)lulust\.com$/i.test(input.hostname)) {
    throw new Error('Only lulust.com embed URLs are supported');
  }

  const res = await fetch(input.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Referer': 'https://lulust.com/',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`LuluStream page returned HTTP ${res.status}`);

  const html = await res.text();
  const finalUrl = res.url || input.toString();

  const videoUrl = findMediaUrl(html, finalUrl);
  if (!videoUrl) throw new Error('No playable media source found in LuluStream page');

  const htmlTracks = parseHtmlTracks(html, finalUrl);
  let audio = htmlTracks.audio;
  let subtitles = htmlTracks.subtitles;

  if (/\.m3u8(?:[?#]|$)/i.test(videoUrl)) {
    const manifestRes = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
        'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
        'Referer': finalUrl,
      },
      redirect: 'follow',
    });
    if (manifestRes.ok) {
      const manifest = await manifestRes.text();
      const manifestTracks = parseM3u8Tracks(manifest, manifestRes.url || videoUrl);
      audio = [...audio, ...manifestTracks.audio.filter(x => !audio.some(y => y.url === x.url))];
      subtitles = [...subtitles, ...manifestTracks.subtitles.filter(x => !subtitles.some(y => y.url === x.url))];
    }
  }

  const poster = extractFirst(html, [
    /poster\s*[:=]\s*["']([^"']+)["']/i,
    /property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
  ]);

  const title = extractFirst(html, [
    /property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<title[^>]*>([^<]+)<\/title>/i,
  ]);

  return {
    provider: 'lulustream',
    embedUrl: input.toString(),
    finalUrl,
    video: { url: videoUrl, type: /\.m3u8(?:[?#]|$)/i.test(videoUrl) ? 'hls' : 'mp4' },
    audio,
    subtitles,
    poster: poster ? absoluteUrl(poster, finalUrl) : null,
    title: title ? decodeHtml(title).trim() : null,
    referer: finalUrl,
  };
}
