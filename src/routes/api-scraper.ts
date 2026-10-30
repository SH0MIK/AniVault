// Ports the streaming-provider proxy endpoints: animeheaven_stream.php,
// anikoto_stream.php, server_check.php, server_check_stream.php (SSE),
// dub_check.php, dub_report.php, embed.php, discord_user.php.
// senshi_stream.php, miruro_stream.php, and miruro_stream_cached.php were
// removed — both providers stopped working upstream and are no longer
// shown on the watch page (see watch-script1.ts).
// curl -> fetch throughout. api/series.php was NOT ported: it calls
// JikanAPI::getAnimeSeries(), a method that doesn't exist anywhere in the
// PHP codebase (would have fatally errored if ever hit), and nothing in
// app.js or any page calls this endpoint -- it's dead code in the original.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { h } from '../lib/helpers';
import { findIdentityByHoshikaId, findIdentityByLegacyMalId } from '../lib/anime-identity';
import { getHoshikaAnimeById, getHoshikaAnimeEpisodesById } from '../lib/hoshika-api';
import { AnimeTracker } from '../lib/tracker';
import { resolveAnimeHeavenMp4 } from '../lib/scrapers/animeheaven';
import { getReanimeEpisodes, getReanimeServers, getReanimeStream } from '../lib/scrapers/reanime';

type ReanimeProxyResource = { url: string; playlistKey: string | null; referer: string; kind: 'playlist' | 'asset' };
const REANIME_PROXY_TTL = 1800;

// The scraper's playback routes require the explicit canonical `hsk-` prefix.
// The site stores/passes the raw Hoshika short ID, so normalize it at this boundary.
function scraperHoshikaId(id: string): string {
  const raw = String(id ?? '').trim().replace(/^hsk-/i, '');
  return raw ? `hsk-${raw}` : '';
}

async function storeReanimeResource(kv: KVNamespace, resource: ReanimeProxyResource): Promise<string> {
  const token = crypto.randomUUID();
  await kv.put('rean-hls:' + token, JSON.stringify(resource), { expirationTtl: REANIME_PROXY_TTL });
  return '/api/reanime_hls/' + token;
}

function decodeReanimePlaylist(text: string, playlistKey: string | null): string {
  if (text.trimStart().startsWith('#EXTM3U') || !playlistKey) return text;
  try {
    const keyBinary = atob(playlistKey.replace(/-/g, '+').replace(/_/g, '/'));
    const encryptedBinary = atob(text.trim().replace(/-/g, '+').replace(/_/g, '/'));
    const decoded = new Uint8Array(encryptedBinary.length);
    for (let i = 0; i < encryptedBinary.length; i++) decoded[i] = encryptedBinary.charCodeAt(i) ^ keyBinary.charCodeAt(i % keyBinary.length);
    const plain = new TextDecoder().decode(decoded);
    return plain.trimStart().startsWith('#EXTM3U') ? plain : text;
  } catch { return text; }
}

function reanimeResourceKind(url: string): 'playlist' | 'asset' {
  try { return /\\.(?:m3u8?|m3u)(?:$|\\?)/i.test(new URL(url).pathname + new URL(url).search) ? 'playlist' : 'asset'; }
  catch { return 'asset'; }
}

async function rewriteReanimePlaylist(text: string, baseUrl: string, kv: KVNamespace, playlistKey: string | null, referer: string): Promise<string> {
  const proxyUrl = async (raw: string): Promise<string> => {
    try {
      const absolute = new URL(raw, baseUrl).toString();
      if (!/^https?:$/.test(new URL(absolute).protocol)) return raw;
      return await storeReanimeResource(kv, { url: absolute, playlistKey, referer, kind: reanimeResourceKind(absolute) });
    } catch { return raw; }
  };
  const lines = text.split(/\\r?\\n/);
  const rewritten: string[] = [];
  for (const line of lines) {
    if (!line.trim()) { rewritten.push(line); continue; }
    if (line.trimStart().startsWith('#')) {
      const match = line.match(/URI="([^"]+)"/);
      if (match) rewritten.push(line.replace(match[0], 'URI="' + await proxyUrl(match[1]) + '"'));
      else rewritten.push(line);
    } else {
      rewritten.push(await proxyUrl(line.trim()));
    }
  }
  return rewritten.join('\\n');
}


export const scraperRoutes = new Hono<{ Bindings: Env }>();

// Scraper backend base URL — set via `wrangler secret put SCRAPER_API_BASE`
// (or SCRAPER_API_BASE in .dev.vars for local dev). Never hardcode this or
// commit it; it's the address of the private scraping service.
//
// Accepts either form: "https://host" or "https://host/api" — a trailing
// "/api" (with or without a trailing slash) is stripped so callers can
// append "/api/watch/..." or "/watch/..." consistently regardless of which
// form was configured. Returns null if unset so callers can fail with a
// clean error instead of throwing.
function getScraperBase(env: Env): string | null {
  const base = env.SCRAPER_API_BASE;
  if (!base) return null;
  return base.replace(/\/+$/, '').replace(/\/api$/i, '');
}

async function fetchJson(url: string, timeoutMs = 12000, apiKey = ''): Promise<{ ok: boolean; code: number; data: any }> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { headers: { Accept: 'application/json', ...(apiKey ? { 'x-anivault-api-key': apiKey } : {}) }, signal: controller.signal });
    clearTimeout(t);
    const data = await res.json().catch(() => null);
    return { ok: res.ok, code: res.status, data };
  } catch {
    return { ok: false, code: 0, data: null };
  }
}

// ── api/animeheaven_stream.php ─────────────────────────────────────────────
// Hoshika IDs are the only accepted playback identity.
// AnimeHeaven is resolved by the external scraper service; the Worker only proxies it.
scraperRoutes.get('/api/animeheaven_stream.php', async (c) => {
  const hoshikaId = (c.req.query('hoshikaId') ?? '').trim();
  const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;
  const audio = ['sub', 'dub', 'raw'].includes(c.req.query('audio') ?? '') ? c.req.query('audio')! : 'sub';
  const server = (c.req.query('server') ?? '').trim();
  if (!hoshikaId || !epNum) return c.json({ error: 'Missing Hoshika ID or episode' }, 400);
  const base = getScraperBase(c.env);
  if (!base) return c.json({ error: 'Scraper API not configured' }, 500);
  let watchUrl = `${base}/api/watch/animeheaven/${scraperHoshikaId(hoshikaId)}/${epNum}/${audio}`;
  if (server) watchUrl += `?server=${encodeURIComponent(server)}`;
  const { ok, code, data } = await fetchJson(watchUrl, 23000, c.env.SCRAPER_API_KEY || '');
  if (!ok) return c.json({ error: data?.error ?? `AnimeHeaven fetch failed HTTP ${code}` }, 502);
  const m3u8 = data?.hlsProxyUrl ?? data?.m3u8 ?? null;
  const mp4 = data?.mp4ProxyUrl ?? data?.mp4 ?? null;
  if (data?.iframeOnly) return c.json({ servers: data?.availableServers ?? [], embedUrl: data.embedUrl ?? '', iframeOnly: true, server: data.server ?? server });
  if (m3u8) return c.json({ servers: data?.availableServers ?? [], m3u8, server: data.server ?? server, subtitles: data.subtitles ?? [], qualities: data.qualities ?? [] });
  if (mp4) return c.json({ servers: data?.availableServers ?? [], mp4, server: data.server ?? server, qualities: data.qualities ?? [] });
  return c.json({ error: 'No stream URL in response' });
});

scraperRoutes.get('/api/anikoto_stream.php', async (c) => {
  const hoshikaId = (c.req.query('hoshikaId') ?? '').trim();
  const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;
  const audio = ['sub', 'dub', 'raw'].includes(c.req.query('audio') ?? '') ? c.req.query('audio')! : 'sub';
  const server = (c.req.query('server') ?? '').trim();
  if (!hoshikaId || !epNum) return c.json({ error: 'Missing Hoshika ID or episode' }, 400);
  const base = getScraperBase(c.env);
  if (!base) return c.json({ error: 'Scraper API not configured' }, 500);

  // Anikoto receives the canonical Hoshika ID directly.
  let watchUrl = `${base}/api/watch/anikoto/${scraperHoshikaId(hoshikaId)}/${epNum}/${audio}`;
  if (server !== '') watchUrl += `?server=${encodeURIComponent(server)}`;

  const { ok, code, data } = await fetchJson(watchUrl, 23000, c.env.SCRAPER_API_KEY || '');
  if (!ok) return c.json({ error: data?.error ?? `Anikoto fetch failed HTTP ${code}` });

  const servers = (data?.availableServers ?? []).map((s: string) => ({ name: s, type: audio }));
  const m3u8 = data?.hlsProxyUrl ?? data?.m3u8 ?? null;

  if (data?.iframeOnly) return c.json({ servers, embedUrl: data.embedUrl ?? '', iframeOnly: true, server: data.server ?? server });
  if (m3u8) return c.json({ servers, m3u8, server: data.server ?? server, subtitles: data.subtitles ?? [] });
  return c.json({ error: 'No stream URL in response' });
});

// ── api/desidub_stream.php ──────────────────────────────────────────────────
// DesiDubAnime (Hindi dub + regional multi-audio) source, added alongside
// AnimeHeaven/Anikoto. Shares the same read-only-proxy reasoning as the two
// above (no session writes). `audio` here is 'dub' (HLS/MP4-capable Hindi
// dub servers — VidMoly, StreamRuby, GDMirrorBot mirrors, etc.) or 'raw'
// (embed-only hosts the scraper couldn't resolve to a direct stream, e.g.
// Abyss/CLOUD — surfaced on the watch page with an "Embed" badge and played
// back in a plain iframe instead of the custom player).
scraperRoutes.get('/api/desidub_stream.php', async (c) => {
  const hoshikaId = (c.req.query('hoshikaId') ?? '').trim();
  const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;
  const audio = ['dub', 'raw'].includes(c.req.query('audio') ?? '') ? c.req.query('audio')! : 'dub';
  const server = (c.req.query('server') ?? '').trim();
  if (!hoshikaId || !epNum) return c.json({ error: 'Missing Hoshika ID or episode' }, 400);
  const base = getScraperBase(c.env);
  if (!base) return c.json({ error: 'Scraper API not configured' }, 500);

  let watchUrl = `${base}/api/watch/desidub/${scraperHoshikaId(hoshikaId)}/${epNum}/${audio}`;
  if (server !== '') watchUrl += `?server=${encodeURIComponent(server)}`;

  const { ok, code, data } = await fetchJson(watchUrl, 23000, c.env.SCRAPER_API_KEY || '');
  if (!ok) return c.json({ error: data?.error ?? `DesiDub fetch failed HTTP ${code}` });

  const servers = (data?.availableServers ?? []).map((s: string) => ({ name: s, type: audio }));
  const m3u8 = data?.hlsProxyUrl ?? data?.m3u8 ?? null;
  const mp4 = data?.mp4ProxyUrl ?? data?.mp4 ?? null;

  if (data?.iframeOnly) return c.json({ servers, embedUrl: data.embedUrl ?? '', iframeOnly: true, server: data.server ?? server });
  if (m3u8) return c.json({ servers, m3u8, server: data.server ?? server, subtitles: data.subtitles ?? [] });
  if (mp4) return c.json({ servers, mp4, server: data.server ?? server });
  return c.json({ error: 'No stream URL in response' });
});

// ── api/reanime_stream.php ───────────────────────────────────────────────
// ReAnime now resolves directly in the Worker; no external scraper API call.
// ReAnime playback is handled by the scraper API, not a Worker-side resolver.
scraperRoutes.get('/api/reanime_stream.php', async (c) => {
  const hoshikaId = (c.req.query('hoshikaId') ?? '').trim();
  const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;
  const audio = ['sub', 'dub', 'raw'].includes(c.req.query('audio') ?? '') ? c.req.query('audio')! : 'sub';
  const server = (c.req.query('server') ?? '').trim();
  if (!hoshikaId || !epNum) return c.json({ error: 'Missing Hoshika ID or episode' }, 400);
  const base = getScraperBase(c.env);
  if (!base) return c.json({ error: 'Scraper API not configured' }, 500);
  let watchUrl = `${base}/api/watch/reanime/${scraperHoshikaId(hoshikaId)}/${epNum}/${audio}`;
  if (server) watchUrl += `?server=${encodeURIComponent(server)}`;
  const { ok, code, data } = await fetchJson(watchUrl, 23000, c.env.SCRAPER_API_KEY || '');
  if (!ok) return c.json({ error: data?.error ?? `ReAnime fetch failed HTTP ${code}` }, 502);
  const servers = (data?.availableServers ?? []).map((s: string) => ({ name: s, type: audio }));
  const m3u8 = data?.hlsProxyUrl ?? data?.m3u8 ?? null;
  const mp4 = data?.mp4ProxyUrl ?? data?.mp4 ?? null;
  const qualities = Array.isArray(data?.qualities) ? data.qualities : [];
  if (data?.iframeOnly) return c.json({ servers, embedUrl: data.embedUrl ?? '', iframeOnly: true, server: data.server ?? server });
  if (m3u8) return c.json({ servers, m3u8, server: data.server ?? server, subtitles: data.subtitles ?? [], qualities });
  if (mp4) return c.json({ servers, mp4, server: data.server ?? server, qualities });
  return c.json({ error: 'No stream URL in response' });
});

scraperRoutes.get('/api/reanime_hls/:token', async (c) => {
  const token = c.req.param('token');
  if (!/^[0-9a-f-]{36}$/i.test(token)) return c.text('Not found', 404);
  const stored = await c.env.API_CACHE.get('rean-hls:' + token);
  if (!stored) return c.text('Stream link expired; reload the episode.', 410);
  let resource: ReanimeProxyResource;
  try { resource = JSON.parse(stored) as ReanimeProxyResource; } catch { return c.text('Invalid stream link', 500); }
  let target: URL;
  try { target = new URL(resource.url); } catch { return c.text('Invalid stream URL', 400); }
  if (!['http:', 'https:'].includes(target.protocol)) return c.text('Invalid stream protocol', 400);

  try {
    const upstream = await fetch(target.toString(), {
      headers: { Accept: '*/*', Referer: resource.referer || 'https://flixcloud.cc/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36' },
      redirect: 'follow',
    });
    if (!upstream.ok) return c.text('Upstream stream returned HTTP ' + upstream.status, 502);
    if (resource.kind === 'playlist') {
      const raw = await upstream.text();
      const decoded = decodeReanimePlaylist(raw, resource.playlistKey);
      if (!decoded.trimStart().startsWith('#EXTM3U')) return c.text('Invalid HLS playlist', 502);
      const rewritten = await rewriteReanimePlaylist(decoded, target.toString(), c.env.API_CACHE, resource.playlistKey, resource.referer);
      return new Response(rewritten, { headers: { 'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/octet-stream', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[ReAnime HLS] Proxy failed:', error instanceof Error ? error.message : String(error));
    return c.text('Could not fetch ReAnime stream resource', 502);
  }
});

// ── api/animenosub_stream.php ────────────────────────────────────────────
// English-dub-only source. Same shape as reanime_stream.php above.
scraperRoutes.get('/api/animenosub_stream.php', async (c) => {
  const hoshikaId = (c.req.query('hoshikaId') ?? '').trim();
  const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;
  const audio = ['sub', 'dub', 'raw'].includes(c.req.query('audio') ?? '') ? c.req.query('audio')! : 'sub';
  const server = (c.req.query('server') ?? '').trim();
  if (!hoshikaId || !epNum) return c.json({ error: 'Missing Hoshika ID or episode' }, 400);
  const base = getScraperBase(c.env);
  if (!base) return c.json({ error: 'Scraper API not configured' }, 500);

  let watchUrl = `${base}/api/watch/animenosub/${scraperHoshikaId(hoshikaId)}/${epNum}/${audio}`;
  if (server !== '') watchUrl += `?server=${encodeURIComponent(server)}`;

  const { ok, code, data } = await fetchJson(watchUrl, 23000, c.env.SCRAPER_API_KEY || '');
  if (!ok) return c.json({ error: data?.error ?? `AnimeNoSub fetch failed HTTP ${code}` });

  const servers = (data?.availableServers ?? []).map((s: string) => ({ name: s, type: audio }));
  const m3u8 = data?.hlsProxyUrl ?? data?.m3u8 ?? null;
  const mp4 = data?.mp4ProxyUrl ?? data?.mp4 ?? null;
  const qualities = Array.isArray(data?.qualities) ? data.qualities : [];

  if (data?.iframeOnly) return c.json({ servers, embedUrl: data.embedUrl ?? '', iframeOnly: true, server: data.server ?? server });
  if (m3u8) return c.json({ servers, m3u8, server: data.server ?? server, subtitles: data.subtitles ?? [], qualities });
  if (mp4) return c.json({ servers, mp4, server: data.server ?? server, qualities });
  return c.json({ error: 'No stream URL in response' });
});

// ── api/aniwaves_stream.php ──────────────────────────────────────────────
// English-dub-only source. Same shape as reanime_stream.php above.
scraperRoutes.get('/api/aniwaves_stream.php', async (c) => {
  const hoshikaId = (c.req.query('hoshikaId') ?? '').trim();
  const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;
  const audio = ['sub', 'dub', 'raw'].includes(c.req.query('audio') ?? '') ? c.req.query('audio')! : 'sub';
  const server = (c.req.query('server') ?? '').trim();
  if (!hoshikaId || !epNum) return c.json({ error: 'Missing Hoshika ID or episode' }, 400);
  const base = getScraperBase(c.env);
  if (!base) return c.json({ error: 'Scraper API not configured' }, 500);

  let watchUrl = `${base}/api/watch/aniwaves/${scraperHoshikaId(hoshikaId)}/${epNum}/${audio}`;
  if (server !== '') watchUrl += `?server=${encodeURIComponent(server)}`;

  const { ok, code, data } = await fetchJson(watchUrl, 23000, c.env.SCRAPER_API_KEY || '');
  if (!ok) return c.json({ error: data?.error ?? `AniWaves fetch failed HTTP ${code}` });

  const servers = (data?.availableServers ?? []).map((s: string) => ({ name: s, type: audio }));
  const m3u8 = data?.hlsProxyUrl ?? data?.m3u8 ?? null;
  const mp4 = data?.mp4ProxyUrl ?? data?.mp4 ?? null;
  const qualities = Array.isArray(data?.qualities) ? data.qualities : [];

  if (data?.iframeOnly) return c.json({ servers, embedUrl: data.embedUrl ?? '', iframeOnly: true, server: data.server ?? server });
  if (m3u8) return c.json({ servers, m3u8, server: data.server ?? server, subtitles: data.subtitles ?? [], qualities });
  if (mp4) return c.json({ servers, mp4, server: data.server ?? server, qualities });
  return c.json({ error: 'No stream URL in response' });
});

// ── api/anizone_stream.php ───────────────────────────────────────────────
// Multi-dub-language source (English, Hindi, Tamil, Telugu, Spanish,
// German, Portuguese, French, Italian, Thai...) — unlike the three
// English-only sources above, listing mode here calls the scraper's
// /servers route instead of /watch, since only /servers exposes each
// server's `lang` field (needed client-side to bucket into the Dub /
// Hindi Dub / Multi Dub groups). Resolve mode forwards an optional `lang`
// to disambiguate same-named servers across languages.
scraperRoutes.get('/api/anizone_stream.php', async (c) => {
  const hoshikaId = (c.req.query('hoshikaId') ?? '').trim();
  const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;
  const audio = ['sub', 'dub', 'raw'].includes(c.req.query('audio') ?? '') ? c.req.query('audio')! : 'sub';
  const server = (c.req.query('server') ?? '').trim();
  const lang = (c.req.query('lang') ?? '').trim();
  if (!hoshikaId || !epNum) return c.json({ error: 'Missing Hoshika ID or episode' }, 400);
  const base = getScraperBase(c.env);
  if (!base) return c.json({ error: 'Scraper API not configured' }, 500);

  if (server === '') {
    const listUrl = `${base}/api/servers?hoshikaId=${encodeURIComponent(hoshikaId)}&ep=${epNum}&type=${audio}&source=anizone`;
    const { ok, code, data } = await fetchJson(listUrl, 28000, c.env.SCRAPER_API_KEY || '');
    if (!ok) return c.json({ error: data?.error ?? `AniZone list failed HTTP ${code}` });
    const servers = (data?.servers ?? []).map((s: any) => ({ name: s.name, type: s.type, lang: String(s.lang ?? '').toLowerCase() }));
    return c.json({ servers });
  }

  let watchUrl = `${base}/api/watch/anizone/${scraperHoshikaId(hoshikaId)}/${epNum}/${audio}?server=${encodeURIComponent(server)}`;
  if (lang !== '') watchUrl += `&lang=${encodeURIComponent(lang)}`;

  const { ok, code, data } = await fetchJson(watchUrl, 23000, c.env.SCRAPER_API_KEY || '');
  if (!ok) return c.json({ error: data?.error ?? `AniZone fetch failed HTTP ${code}` });

  if (data?.iframeOnly) return c.json({ embedUrl: data.embedUrl ?? '', iframeOnly: true, server: data.server ?? server });
  const m3u8 = data?.hlsProxyUrl ?? data?.m3u8 ?? null;
  const mp4 = data?.mp4ProxyUrl ?? data?.mp4 ?? null;
  const qualities = Array.isArray(data?.qualities) ? data.qualities : [];

  if (m3u8) return c.json({ m3u8, server: data.server ?? server, subtitles: data.subtitles ?? [], qualities });
  if (mp4) return c.json({ mp4, server: data.server ?? server, qualities });
  return c.json({ error: 'No stream URL in response' });
});

// ── api/animesalt_stream.php ─────────────────────────────────────────────
// Multi-dub-language source (Japanese, English, Hindi, Tamil, Telugu, Kannada, Malayalam...).
// Same shape and reasoning as anizone_stream.php above.
scraperRoutes.get('/api/animesalt_stream.php', async (c) => {
  let hoshikaId = (c.req.query('hoshikaId') ?? '').trim();
  const animeId = parseInt(c.req.query('anime') ?? '0', 10) || 0;
  if (!hoshikaId && animeId > 0) {
    const ident = await findIdentityByLegacyMalId(new Db(c.env.DB), animeId).catch(() => null);
    if (ident?.hoshika_short_id) hoshikaId = ident.hoshika_short_id;
  }
  const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;
  const audio = ['sub', 'dub', 'raw'].includes(c.req.query('audio') ?? '') ? c.req.query('audio')! : 'sub';
  const server = (c.req.query('server') ?? '').trim();
  const lang = (c.req.query('lang') ?? '').trim();
  if (!hoshikaId || !epNum) return c.json({ error: 'Missing Hoshika ID or episode' }, 400);
  const base = getScraperBase(c.env);
  if (!base) return c.json({ error: 'Scraper API not configured' }, 500);

  if (server === '') {
    const listUrl = `${base}/api/servers?hoshikaId=${encodeURIComponent(hoshikaId)}&ep=${epNum}&type=${audio}&source=animesalt`;
    const { ok, code, data } = await fetchJson(listUrl, 28000, c.env.SCRAPER_API_KEY || '');
    if (!ok) return c.json({ error: data?.error ?? `AnimeSalt list failed HTTP ${code}` });
    const servers = (data?.servers ?? []).map((s: any) => ({ name: s.name, type: s.type, lang: String(s.lang ?? '').toLowerCase() }));
    return c.json({ servers });
  }

  let watchUrl = `${base}/api/watch/animesalt/${scraperHoshikaId(hoshikaId)}/${epNum}/${audio}?server=${encodeURIComponent(server)}`;
  if (lang !== '') watchUrl += `&lang=${encodeURIComponent(lang)}`;

  const { ok, code, data } = await fetchJson(watchUrl, 23000, c.env.SCRAPER_API_KEY || '');
  if (!ok) return c.json({ error: data?.error ?? `AnimeSalt fetch failed HTTP ${code}` });

  if (data?.iframeOnly) return c.json({ embedUrl: data.embedUrl ?? '', iframeOnly: true, server: data.server ?? server });
  const m3u8 = data?.hlsProxyUrl ?? data?.m3u8 ?? null;
  const mp4 = data?.mp4ProxyUrl ?? data?.mp4 ?? null;
  const qualities = Array.isArray(data?.qualities) ? data.qualities : [];

  if (m3u8) return c.json({ m3u8, server: data.server ?? server, subtitles: data.subtitles ?? [], qualities });
  if (mp4) return c.json({ mp4, server: data.server ?? server, qualities });
  return c.json({ error: 'No stream URL in response' });
});

// ── api/watchanimeworld_stream.php ───────────────────────────────────────
// Multi-dub-language source (English, Hindi, Tamil, Telugu...). Same shape
// and reasoning as anizone_stream.php above.
scraperRoutes.get('/api/watchanimeworld_stream.php', async (c) => {
  const hoshikaId = (c.req.query('hoshikaId') ?? '').trim();
  const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;
  const audio = ['sub', 'dub', 'raw'].includes(c.req.query('audio') ?? '') ? c.req.query('audio')! : 'sub';
  const server = (c.req.query('server') ?? '').trim();
  const lang = (c.req.query('lang') ?? '').trim();
  if (!hoshikaId || !epNum) return c.json({ error: 'Missing Hoshika ID or episode' }, 400);
  const base = getScraperBase(c.env);
  if (!base) return c.json({ error: 'Scraper API not configured' }, 500);

  if (server === '') {
    const listUrl = `${base}/api/servers?hoshikaId=${encodeURIComponent(hoshikaId)}&ep=${epNum}&type=${audio}&source=watchanimeworld`;
    const { ok, code, data } = await fetchJson(listUrl, 28000, c.env.SCRAPER_API_KEY || '');
    if (!ok) return c.json({ error: data?.error ?? `WatchAnimeWorld list failed HTTP ${code}` });
    const servers = (data?.servers ?? []).map((s: any) => ({ name: s.name, type: s.type, lang: String(s.lang ?? '').toLowerCase() }));
    return c.json({ servers });
  }

  let watchUrl = `${base}/api/watch/watchanimeworld/${scraperHoshikaId(hoshikaId)}/${epNum}/${audio}?server=${encodeURIComponent(server)}`;
  if (lang !== '') watchUrl += `&lang=${encodeURIComponent(lang)}`;

  const { ok, code, data } = await fetchJson(watchUrl, 23000, c.env.SCRAPER_API_KEY || '');
  if (!ok) return c.json({ error: data?.error ?? `WatchAnimeWorld fetch failed HTTP ${code}` });

  if (data?.iframeOnly) return c.json({ embedUrl: data.embedUrl ?? '', iframeOnly: true, server: data.server ?? server });
  const m3u8 = data?.hlsProxyUrl ?? data?.m3u8 ?? null;
  const mp4 = data?.mp4ProxyUrl ?? data?.mp4 ?? null;
  const qualities = Array.isArray(data?.qualities) ? data.qualities : [];

  if (m3u8) return c.json({ m3u8, server: data.server ?? server, subtitles: data.subtitles ?? [], qualities });
  if (mp4) return c.json({ mp4, server: data.server ?? server, qualities });
  return c.json({ error: 'No stream URL in response' });
});

// ── api/server_check.php ───────────────────────────────────────────────────
const ERROR_PHRASES = ['episode not found', 'video not found', '404 not found', 'page not found', 'no video found', 'no sources found', 'no servers found', 'this episode is not available', 'something went wrong'];

async function checkSenshiUp(base: string, malId: number, epNum: number, apiKey: string): Promise<boolean> {
  const { ok, data } = await fetchJson(`${base}/watch/senshi/mal-${malId}/${epNum}/sub`, 10000, apiKey);
  if (!ok) return false;
  return !!(data?.hlsProxyUrl ?? data?.m3u8);
}

async function checkEmbedUp(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AniVaultServerCheck/1.0)', Accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal,
    });
    clearTimeout(t);
    if (res.status === 404 || res.status === 410 || res.status >= 500) return false;
    const body = (await res.text()).toLowerCase();
    if (!body) return false;
    return !ERROR_PHRASES.some((p) => body.includes(p));
  } catch {
    return false;
  }
}

scraperRoutes.get('/api/server_check.php', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const malId = parseInt(c.req.query('mal') ?? '0', 10) || 0;
  const anilistId = parseInt(c.req.query('anilist') ?? '0', 10) || 0;
  const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;
  if (!malId || !anilistId || !epNum) { await session.save(c, lifetime); return c.json({ error: 'Missing mal, anilist, or ep' }, 400); }
  const base = getScraperBase(c.env);
  if (!base) { await session.save(c, lifetime); return c.json({ error: 'Scraper API not configured' }, 500); }

  const cacheKey = `serverchk_${malId}_${anilistId}_${epNum}`;
  const cached = await c.env.API_CACHE.get(cacheKey, 'json');
  if (cached) { await session.save(c, lifetime); return c.json(cached); }

  const [volt, warp, ayame] = await Promise.all([
    checkSenshiUp(base, malId, epNum, c.env.SCRAPER_API_KEY || ''),
    checkEmbedUp(`https://tryembed.us.cc/embed/anime/${anilistId}/${epNum}/sub`),
    checkEmbedUp(`https://vidnest.fun/animepahe/${anilistId}/${epNum}/sub`),
  ]);
  const result = { volt, warp, ayame };
  await c.env.API_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 300 });
  await session.save(c, lifetime);
  return c.json(result);
});

// ── api/server_check_stream.php (SSE) ──────────────────────────────────────
scraperRoutes.get('/api/server_check_stream.php', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const malId = parseInt(c.req.query('mal') ?? '0', 10) || 0;
  const anilistId = parseInt(c.req.query('anilist') ?? '0', 10) || 0;
  const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      if (!malId || !anilistId || !epNum) { send('error', { message: 'Missing mal, anilist, or ep' }); controller.close(); return; }
      const base = getScraperBase(c.env);
      if (!base) { send('error', { message: 'Scraper API not configured' }); controller.close(); return; }

      const cacheKey = `serverchk_${malId}_${anilistId}_${epNum}`;
      const cached = await c.env.API_CACHE.get(cacheKey, 'json') as Record<string, boolean> | null;
      if (cached) {
        for (const [name, available] of Object.entries(cached)) send('server', { name, available });
        send('done', {});
        controller.close();
        return;
      }

      const results: Record<string, boolean> = {};
      const checks: [string, Promise<boolean>][] = [
        ['volt', checkSenshiUp(base, malId, epNum, c.env.SCRAPER_API_KEY || '')],
        ['warp', checkEmbedUp(`https://tryembed.us.cc/embed/anime/${anilistId}/${epNum}/sub`)],
        ['ayame', checkEmbedUp(`https://vidnest.fun/animepahe/${anilistId}/${epNum}/sub`)],
      ];
      // Emit each result the moment it resolves, not waiting for the others (curl_multi equivalent).
      await Promise.all(checks.map(async ([name, promise]) => {
        const available = await promise;
        results[name] = available;
        send('server', { name, available });
      }));

      await c.env.API_CACHE.put(cacheKey, JSON.stringify(results), { expirationTtl: 300 });
      send('done', {});
      controller.close();
    },
  });

  await session.save(c, lifetime);
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
  });
});

// ── api/dub_check.php ───────────────────────────────────────────────────────
scraperRoutes.get('/api/dub_check.php', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);

  const animeId = parseInt(c.req.query('anime_id') ?? '0', 10) || 0;
  const epNum = parseInt(c.req.query('ep') ?? '1', 10) || 1;
  if (!animeId) { await session.save(c, lifetime); return c.json({ success: false, error: 'Invalid params' }); }

  const cachedRow = await db.fetchOne<{ has_dub: number; checked_at: string | null }>(
    'SELECT has_dub, checked_at FROM anime_dub_status WHERE anime_id=?', [animeId]
  );
  if (cachedRow?.checked_at) {
    const age = Date.now() / 1000 - new Date(cachedRow.checked_at.replace(' ', 'T') + 'Z').getTime() / 1000;
    if (age < 7 * 86400) {
      await session.save(c, lifetime);
      return c.json({ success: true, has_dub: !!cachedRow.has_dub, cached: true });
    }
  }

  const dubUrl = `https://megaplay.buzz/stream/mal/${animeId}/${epNum}/dub`;
  let httpCode = 0;
  let body = '';
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(dubUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://anivault.co/',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: controller.signal,
    });
    clearTimeout(t);
    httpCode = res.status;
    body = await res.text();
  } catch { /* network failure -> treated as no dub below */ }

  let hasDub = false;
  if (httpCode === 200 && body) {
    const isError = ['error - megaplay', 'error code: 410', "we're sorry", 'got deleted', 'copyright violation'].some((p) => body.toLowerCase().includes(p));
    hasDub = !isError;
  }

  try {
    await db.query(
      `INSERT INTO anime_dub_status (anime_id, has_dub, checked_at) VALUES (?,?,datetime('now'))
       ON CONFLICT(anime_id) DO UPDATE SET has_dub=excluded.has_dub, checked_at=datetime('now')`,
      [animeId, hasDub ? 1 : 0]
    );
  } catch { /* non-fatal */ }

  await session.save(c, lifetime);
  return c.json({ success: true, has_dub: hasDub, cached: false, http: httpCode });
});

// ── api/dub_report.php ──────────────────────────────────────────────────────
const DUB_CONFIRM_THRESHOLD = 2;

scraperRoutes.post('/api/dub_report.php', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);

  const body: any = await c.req.json().catch(() => ({}));
  const animeId = parseInt(body.anime_id ?? '0', 10) || 0;
  const action = body.action ?? '';
  if (!animeId || !['confirm_dub', 'deny_dub'].includes(action)) {
    await session.save(c, lifetime);
    return c.json({ success: false, error: 'Invalid params' });
  }

  try {
    if (action === 'confirm_dub') {
      const existing = await db.fetchOne<{ confirm_count: number }>('SELECT confirm_count FROM anime_dub_status WHERE anime_id=?', [animeId]);
      const newCount = (existing?.confirm_count ?? 0) + 1;
      const hasDub = newCount >= DUB_CONFIRM_THRESHOLD ? 1 : 0;
      await db.query(
        `INSERT INTO anime_dub_status (anime_id, has_dub, confirm_count, deny_count) VALUES (?,0,1,0)
         ON CONFLICT(anime_id) DO UPDATE SET confirm_count=confirm_count+1, has_dub=CASE WHEN confirm_count+1>=? THEN 1 ELSE has_dub END`,
        [animeId, DUB_CONFIRM_THRESHOLD]
      );
      const row = await db.fetchOne<{ has_dub: number; confirm_count: number }>('SELECT has_dub, confirm_count FROM anime_dub_status WHERE anime_id=?', [animeId]);
      await session.save(c, lifetime);
      return c.json({ success: true, has_dub: !!(row?.has_dub ?? hasDub), confirm_count: row?.confirm_count ?? newCount });
    } else {
      await db.query(
        `INSERT INTO anime_dub_status (anime_id, has_dub, confirm_count, deny_count) VALUES (?,0,0,1)
         ON CONFLICT(anime_id) DO UPDATE SET deny_count=deny_count+1`,
        [animeId]
      );
      await session.save(c, lifetime);
      return c.json({ success: true });
    }
  } catch (e: any) {
    await session.save(c, lifetime);
    return c.json({ success: false, error: e.message ?? 'DB error' });
  }
});

// ── api/embed.php (social-media embed page) ────────────────────────────────
scraperRoutes.get('/api/embed.php', async (c) => {
  const siteUrl = c.env.SITE_URL;
  const animeId = parseInt(c.req.query('anime') ?? '0', 10) || 0;
  const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;
  if (!animeId || !epNum) return c.text('Not found', 404);

  // This legacy URL still receives a MAL ID. Resolve it through the
  // verified map; never pass it to Hoshika as though it were a shortId.
  const db = new Db(c.env.DB);
  const identity = await findIdentityByLegacyMalId(db, animeId).catch(() => null);
  const hoshikaId = identity?.verified === 1 ? identity.hoshika_short_id : null;
  const [animeData, episodes] = hoshikaId
    ? await Promise.all([getHoshikaAnimeById(hoshikaId, c.env.HOSHIKA_API_KEY), getHoshikaAnimeEpisodesById(hoshikaId, c.env.HOSHIKA_API_KEY)])
    : [null, null];
  const title = animeData?.titleEnglish || animeData?.title || 'Anime';
  const image = animeData?.poster || '';
  const epTitle = episodes?.find((ep) => ep.number === epNum)?.title || `Episode ${epNum}`;

  // Admin overrides win; otherwise use the Hoshika episode still, then cover art.
  let ogImage = episodes?.find((ep) => ep.number === epNum)?.thumbnail || image;
  try {
    const row = await db.fetchOne<{ image_url: string | null }>(
      'SELECT image_url FROM episode_overrides WHERE anime_id = ? AND episode_num = ?',
      [animeId, epNum]
    );
    if (row?.image_url) ogImage = row.image_url;
  } catch { /* fall back to Hoshika art */ }

  const watchUrl = `${siteUrl}/watch?anime=${animeId}&ep=${epNum}`;
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Ep ${epNum} — ${h(title)} | AniVault</title>
<meta property="og:title" content="Ep ${epNum} — ${h(title)} | AniVault">
<meta property="og:description" content="&quot;${h(epTitle)}&quot; · Watch on AniVault">
<meta property="og:image" content="${h(ogImage)}">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="720">
<meta property="og:url" content="${h(watchUrl)}">
<meta property="og:type" content="video.episode">
<meta property="og:site_name" content="AniVault">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Ep ${epNum} — ${h(title)} | AniVault">
<meta name="twitter:description" content="&quot;${h(epTitle)}&quot; · Watch on AniVault">
<meta name="twitter:image" content="${h(ogImage)}">
<meta name="theme-color" content="#7c3aed">
</head>
<body style="margin:0;padding:20px;font-family:sans-serif;background:#0a0a0f;color:#fff;text-align:center;">
  <h1>${h(title)}</h1>
  <h2>Episode ${epNum}: ${h(epTitle)}</h2>
  <p>Watch on AniVault</p>
  <p><a href="${h(watchUrl)}" style="color:#7c3aed;">Click to Watch →</a></p>
</body>
</html>`;
  return c.html(html);
});

// ── api/discord_user.php — internal, called only by the AniVault Discord
//    bot's /user command (see anivault-bot's api/interactions.ts). Secret is
//    read from the x-bot-secret header rather than a query string so it never
//    ends up in server/proxy access logs. Reuses AnimeTracker.getStats (same
//    stats the public /u/:username profile page shows) instead of duplicating
//    the aggregation query here.
scraperRoutes.get('/api/discord_user.php', async (c) => {
  const db = new Db(c.env.DB);
  const secret = c.req.header('x-bot-secret') ?? '';
  if (!c.env.BOT_SECRET || secret !== c.env.BOT_SECRET) return c.json({ error: 'Unauthorized' }, 401);

  const username = (c.req.query('username') ?? '').trim();
  if (!username) return c.json({ error: 'Missing username' }, 400);

  const user = await db.fetchOne<any>(
    'SELECT id, username, avatar_url, role, created_at FROM users WHERE username = ? AND is_active = 1',
    [username]
  );
  if (!user) return c.json({ error: 'User not found' }, 404);

  const displayIdRow = await db.fetchOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM users WHERE id <= ?', [user.id]);
  user.display_id = displayIdRow?.cnt ?? user.id;
  user.stats = await AnimeTracker.getStats(db, user.id);

  return c.json({ user });
});

// ── api/anime_info.php ──────────────────────────────────────────────────
// Same-origin proxy for the scraper's /api/info?malId=X (episodeCount,
// siteIds, etc). Client-side scripts (e.g. the admin episode-thumbnail
// tool) hit this instead of calling the scraper host directly, so
// SCRAPER_API_BASE stays server-side only.
scraperRoutes.get('/api/anime_info.php', async (c) => {
  const malId = parseInt(c.req.query('malId') ?? '0', 10) || 0;
  if (!malId) return c.json({ error: 'Missing malId' }, 400);
  const base = getScraperBase(c.env);
  if (!base) return c.json({ error: 'Scraper API not configured' }, 500);

  const { ok, code, data } = await fetchJson(`${base}/api/info?malId=${malId}`, 8000, c.env.SCRAPER_API_KEY || '');
  if (!ok) return c.json({ error: data?.error ?? `Scraper API error HTTP ${code}` }, 502);
  return c.json(data);
});

// ── api/ep_count.php ────────────────────────────────────────────────────
// Legacy episode-count endpoint: only verified Hoshika mappings can resolve
// a MAL-keyed request. Unmapped records return null rather than using another
// anime provider or guessing from a title.
scraperRoutes.get('/api/ep_count.php', async (c) => {
  const animeId = parseInt(c.req.query('anime_id') ?? '0', 10) || 0;
  if (!animeId) return c.json({ error: 'Missing anime_id' }, 400);
  const db = new Db(c.env.DB);

  // Legacy page callers pass MAL IDs. Never treat those as Hoshika IDs or
  // fall back to MAL/Jikan; only a verified identity can bridge the request.
  const identity = await findIdentityByLegacyMalId(db, animeId).catch(() => null);
  if (identity?.verified !== 1) return c.json({ aired: null, total: null });

  const [anime, episodes] = await Promise.all([
    getHoshikaAnimeById(identity.hoshika_short_id, c.env.HOSHIKA_API_KEY),
    getHoshikaAnimeEpisodesById(identity.hoshika_short_id, c.env.HOSHIKA_API_KEY),
  ]);
  const total = anime?.episodes ?? episodes?.length ?? null;
  const aired = episodes?.length ?? null;
  return c.json({ aired, total });
});

// ── api/anime_episodes.php ──────────────────────────────────────────────────
// Legacy detail pages still pass MAL IDs. Episode metadata now comes only
// from Hoshika after an explicit verified mapping; there is no MAL/Jikan or
// title-based fallback. Unmapped legacy IDs return an empty list so the page
// can still render numbered stubs for videos already stored in D1.
scraperRoutes.get('/api/anime_episodes.php', async (c) => {
  const animeId = parseInt(c.req.query('anime') ?? '0', 10) || 0;
  const hoshikaId = (c.req.query('hoshikaId') ?? '').trim();
  const page = parseInt(c.req.query('page') ?? '1', 10) || 1;
  if (!animeId) return c.json({ error: 'Missing anime' }, 400);
  const db = new Db(c.env.DB);
  const identity = await findIdentityByLegacyMalId(db, animeId).catch(() => null);
  if (identity?.verified !== 1) {
    return c.json({ data: [], pagination: { last_visible_page: 1, has_next_page: false } });
  }
  const episodes = await getHoshikaAnimeEpisodesById(identity.hoshika_short_id, c.env.HOSHIKA_API_KEY);
  const data = (episodes ?? []).map((episode) => ({
    mal_id: episode.number,
    title: episode.title,
    title_japanese: null,
    aired: episode.aired,
    filler: episode.filler,
    recap: episode.recap,
    images: { jpg: { image_url: episode.thumbnail } },
    thumbnail: episode.thumbnail,
  }));
  return c.json({
    data: page > 1 ? [] : data,
    pagination: { last_visible_page: 1, has_next_page: false },
  });
});

// Hoshika's currently confirmed public API does not expose character, theme-song,
// trailer, or picture-gallery endpoints. Return explicit unavailable states;
// never substitute MAL/Jikan catalogue data.
for (const [path, label] of [
  ['/api/anime_characters.php', 'Character data'],
  ['/api/anime_themes.php', 'Theme-song data'],
  ['/api/anime_videos.php', 'Trailer data'],
  ['/api/anime_pictures.php', 'Picture-gallery data'],
] as const) {
  scraperRoutes.get(path, (c) => {
    const animeId = parseInt(c.req.query('anime') ?? '0', 10) || 0;
  const hoshikaId = (c.req.query('hoshikaId') ?? '').trim();
    if (!animeId) return c.json({ error: 'Missing anime' }, 400);
    return c.json({ data: [], unavailable: true, message: label + ' is not available from the confirmed Hoshika API.' }, 501);
  });
}

