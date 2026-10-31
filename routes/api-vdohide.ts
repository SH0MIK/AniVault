import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { resolveVdoHide } from '../lib/vdohide-resolver';

export const vdoHideApiRoutes = new Hono<{ Bindings: Env }>();

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── In-memory Playlist Cache (10 minutes TTL) ───────────────────────────────
interface CacheEntry {
  body: string;
  contentType: string;
  expiresAt: number;
}
const playlistCache = new Map<string, CacheEntry>();

// ─── Allowed hosts for proxy ──────────────────────────────────────────────────
const ALLOWED_HOSTS = new Set([
  'vdohide.com', 'fembed.co', 'vdohls.com', 'vdohls.net', 'vdohls.org',
  'vdohls.info', 'vidhidepro.com', 'vidhide.com', 'static.vdohls.com',
  'avxtube-4.xyz', 'cdn-1.avxtube-4.xyz'
]);

function isAllowedVdoHost(hostname: string): boolean {
  const h = hostname.toLowerCase().trim();
  if (ALLOWED_HOSTS.has(h)) return true;
  for (const a of ALLOWED_HOSTS) {
    if (h.endsWith('.' + a)) return true;
  }
  return false;
}

export function vdoProxyUrl(origin: string, url: string, referer?: string): string {
  let res = `${origin}/api/vdohide_proxy.php?url=${encodeURIComponent(url)}`;
  if (referer) res += `&referer=${encodeURIComponent(referer)}`;
  return res;
}

function safeUrl(raw: string, base?: string): URL {
  let val = raw.trim();
  if (val.startsWith('//')) {
    val = (base ? new URL(base).protocol : 'https:') + val;
  }
  return base ? new URL(val, base) : new URL(val);
}

function rewriteVdoPlaylist(manifest: string, baseUrl: URL, origin: string, referer: string): string {
  return manifest.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    if (trimmed.startsWith('#')) {
      return line.replace(/URI=(["']?)([^"',\s]+)\1/gi, (_, _quote, uri) => {
        try {
          const abs = safeUrl(uri, baseUrl.href).href;
          return `URI="${vdoProxyUrl(origin, abs, referer)}"`;
        } catch {
          return line;
        }
      });
    }

    try {
      const abs = safeUrl(trimmed, baseUrl.href).href;
      return vdoProxyUrl(origin, abs, referer);
    } catch {
      return line;
    }
  }).join('\n');
}

// ─── Track helpers ────────────────────────────────────────────────────────────
export function extractVdoId(url: string): string | null {
  if (!url) return null;
  const cdnMatch = url.match(/cdn\.anivault\.co\/stream\/([A-Za-z0-9_-]+)/i);
  if (cdnMatch) return cdnMatch[1];
  const hlsMatch = url.match(/vdohls\.[a-z]+\/([A-Za-z0-9_-]+)/i);
  if (hlsMatch) return hlsMatch[1];
  const embedMatch = url.match(/(?:\/embed\/|\/e\/|\/v\/|\/d\/)([A-Za-z0-9_-]+)/i);
  if (embedMatch) return embedMatch[1];
  return null;
}

export function getCdnStreamUrl(vdoId: string): string {
  return `https://cdn.anivault.co/stream/${vdoId}.m3u8`;
}

let _cachedKey: CryptoKey | null = null;
async function getCryptoKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey;
  const secretBuf = new TextEncoder().encode('anivault-cdn-secret-2026');
  const hashBuf = await crypto.subtle.digest('SHA-256', secretBuf);
  _cachedKey = await crypto.subtle.importKey('raw', hashBuf, { name: 'AES-CTR' }, false, ['encrypt']);
  return _cachedKey;
}

function arrayBufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function encodeCdnToken(url: string, referer?: string): Promise<string> {
  const key = await getCryptoKey();
  const payload = referer ? url + '\x00' + referer : url;
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: 'AES-CTR', counter: new Uint8Array(16), length: 64 },
    key,
    new TextEncoder().encode(payload)
  );
  return arrayBufferToBase64Url(encryptedBuf);
}

export async function cdnProxyUrl(url: string, referer?: string): Promise<string> {
  if (!url) return '';
  // If already clean /v/ token URL, keep it
  if (url.startsWith('https://cdn.anivault.co/v/')) return url;
  if (url.includes('localhost') && url.includes('/api/subtitles/')) return url;

  // If it was an old proxy URL, unwrap the real target URL first
  let actualUrl = url;
  let actualReferer = referer || '';
  if (url.includes('/api/proxy?') || url.includes('/api/vdohide_proxy.php?')) {
    try {
      const u = new URL(url);
      const targetParam = u.searchParams.get('url');
      if (targetParam) actualUrl = targetParam;
      const refParam = u.searchParams.get('referer');
      if (refParam) actualReferer = refParam;
    } catch {}
  }

  const token = await encodeCdnToken(actualUrl, actualReferer);
  return `https://cdn.anivault.co/v/${token}`;
}

function trackGroup(track: any): 'sub' | 'dub' | 'hindi' | 'multi' {
  const label = String(track?.name || track?.label || '').trim().toLowerCase();
  const lang = String(track?.lang || '').trim().toLowerCase();
  const text = (label + ' ' + lang).trim();
  if (lang === 'hi' || lang === 'hin' || /^hi$|^hin$|hindi|हिन्दी|हिंदी/.test(text) || /hindi/.test(label)) return 'hindi';
  if (lang === 'en' || lang === 'eng' || /^en$|^eng$|english/.test(text) || /english/.test(label)) return 'dub';
  if (lang === 'ja' || lang === 'jpn' || /^ja$|^jpn$|japanese|日本語|\b(sub|subtitle|original)\b/.test(text)) return 'sub';
  return track?.default ? 'sub' : 'multi';
}
function trackKey(track: any, occurrence: number): string {
  const l = String(track?.name || track?.label || '').trim().toLowerCase();
  const la = String(track?.lang || '').trim().toLowerCase();
  return [l, la, trackGroup(track), occurrence].join('|');
}
function trackMeta(audio: any[]): string {
  const seen: Record<string, number> = {};
  return JSON.stringify((audio || []).map((a: any) => {
    const base = String(a?.name || a?.label || '').trim().toLowerCase() + '|' + String(a?.lang || '').trim().toLowerCase() + '|' + trackGroup(a);
    const occurrence = seen[base] || 0; seen[base] = occurrence + 1;
    return { key: trackKey(a, occurrence), label: a.name || a.label || a.lang || 'Audio', lang: a.lang || '', group: trackGroup(a), default: !!a.default };
  }));
}

// ─── Universal Proxy Handler (No auth, full CORS, Range/206 support) ──────────
async function handleVdoProxy(c: any): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
  };

  if (c.req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const rawUrl = c.req.query('url');
  if (!rawUrl) {
    return new Response('Missing ?url= parameter', { status: 400, headers: corsHeaders });
  }

  let target: URL;
  try {
    target = safeUrl(rawUrl);
  } catch {
    return new Response('Invalid target URL', { status: 400, headers: corsHeaders });
  }

  if (!isAllowedVdoHost(target.hostname)) {
    return new Response(`Target host ${target.hostname} is not allowed`, { status: 403, headers: corsHeaders });
  }

  const referer = String(c.req.query('referer') || target.origin + '/');
  const cacheKey = `${target.href}#${referer}`;

  const pathname = target.pathname.toLowerCase();
  const isPlaylist = pathname.endsWith('.m3u8');
  const isSubtitle = pathname.endsWith('.vtt') || pathname.endsWith('.srt');

  // 1. FAST-PATH: Playlist In-Memory Cache hit
  if (isPlaylist && c.req.method !== 'HEAD') {
    const cached = playlistCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return new Response(cached.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=300',
          'X-Cache-Status': 'HIT',
        },
      });
    }
  }

  try {
    const upstreamHeaders: Record<string, string> = {
      'User-Agent': UA,
      'Accept': '*/*',
      'Referer': referer,
      'Origin': new URL(referer).origin,
    };

    const range = c.req.header('range');
    if (range) {
      upstreamHeaders['Range'] = range;
    }

    const upstream = await fetch(target.href, {
      method: c.req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: upstreamHeaders,
      redirect: 'follow',
    });

    if (!upstream.ok && upstream.status !== 206 && upstream.status !== 304) {
      return new Response(`Upstream HTTP ${upstream.status} ${upstream.statusText}`, {
        status: upstream.status,
        headers: corsHeaders,
      });
    }

    const upstreamType = upstream.headers.get('content-type') || '';
    const actualIsPlaylist = isPlaylist || upstreamType.includes('mpegurl');

    // Handle Playlist (Rewrite & store in playlistCache)
    if (actualIsPlaylist && c.req.method !== 'HEAD') {
      const rawText = await upstream.text();
      const origin = new URL(c.req.url).origin;
      const rewritten = rewriteVdoPlaylist(rawText, new URL(upstream.url || target.href), origin, referer);

      playlistCache.set(cacheKey, {
        body: rewritten,
        contentType: 'application/vnd.apple.mpegurl; charset=utf-8',
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      return new Response(rewritten, {
        status: upstream.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          'X-Cache-Status': 'MISS',
        },
      });
    }

    // Determine correct MIME type (especially disguised .jpeg TS segments)
    let detectedType = upstreamType;
    if (isSubtitle) {
      detectedType = 'text/vtt; charset=utf-8';
    } else if (
      pathname.endsWith('.ts') ||
      pathname.endsWith('.jpeg') ||
      pathname.endsWith('.jpg') ||
      pathname.endsWith('.png') ||
      pathname.endsWith('.bin') ||
      upstreamType.includes('jpeg')
    ) {
      detectedType = 'video/mp2t';
    } else if (pathname.endsWith('.mp4') || pathname.endsWith('.m4s')) {
      detectedType = 'video/mp4';
    }

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', detectedType || 'application/octet-stream');
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

    if (upstream.headers.has('content-range')) {
      responseHeaders.set('Content-Range', upstream.headers.get('content-range')!);
    }
    if (upstream.headers.has('accept-ranges')) {
      responseHeaders.set('Accept-Ranges', upstream.headers.get('accept-ranges')!);
    }
    if (upstream.headers.has('content-length')) {
      responseHeaders.set('Content-Length', upstream.headers.get('content-length')!);
    }
    responseHeaders.set('Cache-Control', 'public, max-age=86400, immutable');

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(`Proxy error: ${err instanceof Error ? err.message : String(err)}`, {
      status: 502,
      headers: corsHeaders,
    });
  }
}

// Register proxy endpoints
vdoHideApiRoutes.all('/api/vdohide_proxy.php', handleVdoProxy);
vdoHideApiRoutes.all('/api/proxy', handleVdoProxy);

// ─── Direct Subtitle Serving (from R2 bucket) ────────────────────────────────
vdoHideApiRoutes.all('/api/subtitles/:filename', async (c) => {
  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      }
    });
  }
  const filename = c.req.param('filename');
  if (!filename || !/^[a-zA-Z0-9_.-]+$/.test(filename)) {
    return c.text('Invalid filename', 400);
  }
  const obj = await c.env.AVATARS.get(`subtitles/${filename}`);
  if (!obj) {
    return c.text('Subtitle not found', 404);
  }
  return new Response(c.req.method === 'HEAD' ? null : obj.body, {
    headers: {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Cache-Control': 'public, max-age=31536000, immutable',
    }
  });
});

// ─── Permanent Stream Endpoint ────────────────────────────────────────────────
// GET /stream/:id.m3u8 or /stream/:id or /stream?url=<embedUrl>
async function handlePermanentStream(c: any): Promise<Response> {
  try {
    let target = c.req.query('url') || c.req.param('id');
    if (!target) {
      return new Response('Provide a video ID or ?url=<embedUrl>', { status: 400 });
    }
    target = target.replace(/\.m3u8$/i, '');

    let embedUrl = target;
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      embedUrl = `https://fembed.co/embed/${target}`;
    }

    const resolved = await resolveVdoHide(embedUrl);
    if (!resolved.masterUrl) {
      return new Response('Failed to resolve stream: No masterUrl', { status: 502 });
    }

    const origin = new URL(c.req.url).origin;
    // Fetch and proxy the master playlist directly
    const proxyTargetUrl = safeUrl(resolved.masterUrl);
    const referer = resolved.embedUrl;

    const upstream = await fetch(proxyTargetUrl.href, {
      headers: {
        'User-Agent': UA,
        'Accept': '*/*',
        'Referer': referer,
        'Origin': new URL(referer).origin,
      },
      redirect: 'follow',
    });

    if (!upstream.ok) {
      return new Response(`Upstream master playlist returned HTTP ${upstream.status}`, { status: upstream.status });
    }

    const rawText = await upstream.text();
    const rewritten = rewriteVdoPlaylist(rawText, new URL(upstream.url || proxyTargetUrl.href), origin, referer);

    return new Response(rewritten, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response('Permanent stream error: ' + (err instanceof Error ? err.message : String(err)), { status: 502 });
  }
}

vdoHideApiRoutes.all('/stream/:id', handlePermanentStream);
vdoHideApiRoutes.all('/stream/:id{.+\\.m3u8$}', handlePermanentStream);
vdoHideApiRoutes.all('/stream', handlePermanentStream);

// ─── GET /api/vdohide_stream.php?id=<row_id> ─────────────────────────────────
// Public stream API: returns resolved master proxy URL + audio/sub tracks
vdoHideApiRoutes.get('/api/vdohide_stream.php', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS || 86400);
  const session = await Session.load(c, db, lifetime);

  const id = Number(c.req.query('id') || 0);
  if (!id) {
    await session.save(c, lifetime);
    return c.json({ error: 'Missing id' }, 400);
  }

  const row = await db.fetchOne<any>(
    'SELECT * FROM vdohide_servers WHERE id=? AND is_active=1',
    [id]
  );
  if (!row) {
    await session.save(c, lifetime);
    return c.json({ error: 'VdoHide server not found' }, 404);
  }

  const origin = new URL(c.req.url).origin;
  const siteUrl = c.env.SITE_URL || origin;

  let masterUrl = String(row.master_url || '');
  let qualities: any[] = [];
  let audioTracks: any[] = [];
  let subtitles: any[] = [];

  try { qualities = JSON.parse(String(row.qualities_json || '[]')); } catch { qualities = []; }
  try { audioTracks = JSON.parse(String(row.audio_tracks || '[]')); } catch { audioTracks = []; }
  try { subtitles = JSON.parse(String(row.subtitles_json || '[]')); } catch { subtitles = []; }

  const vdoId = extractVdoId(masterUrl) || extractVdoId(String(row.embed_url || ''));

  let playableM3u8 = '';
  if (masterUrl.startsWith('https://cdn.anivault.co/stream/')) {
    playableM3u8 = masterUrl;
  } else if (vdoId) {
    playableM3u8 = getCdnStreamUrl(vdoId);
    masterUrl = playableM3u8;
    // Update DB with the CDN stream URL for zero-overhead next requests
    db.query(`UPDATE vdohide_servers SET master_url=?, proxy_url=?, updated_at=datetime('now') WHERE id=?`, [playableM3u8, playableM3u8, id]).catch(() => {});
  } else if (!masterUrl) {
    try {
      const resolved = await resolveVdoHide(String(row.embed_url));
      const resolvedVdoId = extractVdoId(resolved.masterUrl) || extractVdoId(String(row.embed_url));
      masterUrl = resolvedVdoId ? getCdnStreamUrl(resolvedVdoId) : resolved.masterUrl;
      playableM3u8 = resolvedVdoId ? masterUrl : vdoProxyUrl(origin, masterUrl, row.embed_url);
      qualities = resolved.qualities;
      audioTracks = resolved.audioTracks;
      subtitles = resolved.subtitles;
      const proxyUrl = masterUrl;
      const newAudioMeta = trackMeta(audioTracks);
      await db.query(
        `UPDATE vdohide_servers SET master_url=?,proxy_url=?,qualities_json=?,audio_tracks=?,subtitles_json=?,updated_at=datetime('now') WHERE id=?`,
        [masterUrl, proxyUrl, JSON.stringify(qualities), newAudioMeta, JSON.stringify(subtitles), id]
      );
    } catch (e) {
      await session.save(c, lifetime);
      return c.json({ error: 'VdoHide resolve failed', detail: e instanceof Error ? e.message : String(e) }, 502);
    }
  } else {
    playableM3u8 = vdoProxyUrl(origin, masterUrl, row.embed_url);
  }

  // Rewrite subtitle URLs through CDN proxy as clean /v/ tokens
  const proxiedSubs = await Promise.all(
    subtitles.map(async (s: any) => ({
      ...s,
      url: s.url ? await cdnProxyUrl(s.url, row.embed_url) : s.url,
    }))
  );

  await session.save(c, lifetime);
  return c.json({
    id: row.id,
    label: row.label,
    embedUrl: row.embed_url,
    masterUrl,
    m3u8: playableM3u8,
    qualities,
    audioTracks,
    subtitles: proxiedSubs,
    title: '',
  });
});

// ─── POST /api/vdohide_refresh.php ───────────────────────────────────────────
// Auto-retry on playback failure: re-resolves and updates DB.
vdoHideApiRoutes.post('/api/vdohide_refresh.php', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS || 86400);
  const session = await Session.load(c, db, lifetime);

  let id = 0;
  try {
    const body = await c.req.json().catch(() => null);
    id = Number(body?.id || c.req.query('id') || 0);
  } catch { id = Number(c.req.query('id') || 0); }

  if (!id) {
    await session.save(c, lifetime);
    return c.json({ error: 'Missing id' }, 400);
  }

  const row = await db.fetchOne<any>(
    'SELECT * FROM vdohide_servers WHERE id=? AND is_active=1',
    [id]
  );
  if (!row) {
    await session.save(c, lifetime);
    return c.json({ error: 'VdoHide server not found' }, 404);
  }

  try {
    const embedUrl = String(row.embed_url);
    const vdoId = extractVdoId(embedUrl);
    let masterUrl = vdoId ? getCdnStreamUrl(vdoId) : '';
    let qualities: any[] = [];
    let audioTracks: any[] = [];
    let subtitles: any[] = [];

    try {
      const resolved = await resolveVdoHide(embedUrl);
      if (!masterUrl) masterUrl = resolved.masterUrl;
      qualities = resolved.qualities;
      audioTracks = resolved.audioTracks;
      subtitles = resolved.subtitles;
    } catch {
      // If internal resolver had an issue, fallback to CDN stream url directly
    }

    if (vdoId) {
      masterUrl = getCdnStreamUrl(vdoId);
    }
    const proxyUrl = masterUrl;
    const newAudioMeta = audioTracks.length ? trackMeta(audioTracks) : row.audio_tracks;

    await db.query(
      `UPDATE vdohide_servers SET master_url=?,proxy_url=?,qualities_json=?,audio_tracks=?,subtitles_json=?,updated_at=datetime('now') WHERE id=?`,
      [masterUrl, proxyUrl, JSON.stringify(qualities), newAudioMeta, JSON.stringify(subtitles), id]
    );

    const proxiedSubs = await Promise.all(
      subtitles.map(async (s: any) => ({
        ...s,
        url: s.url ? await cdnProxyUrl(s.url, embedUrl) : s.url,
      }))
    );

    await session.save(c, lifetime);
    return c.json({
      success: true,
      id: row.id,
      m3u8: masterUrl,
      masterUrl,
      qualities,
      audioTracks,
      subtitles: proxiedSubs,
    });
  } catch (e) {
    await session.save(c, lifetime);
    return c.json({
      error: 'VdoHide re-resolve failed',
      detail: e instanceof Error ? e.message : String(e),
    }, 502);
  }
});
