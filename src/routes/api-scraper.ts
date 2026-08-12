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
import { Auth } from '../lib/auth';
import { h } from '../lib/helpers';

export const scraperRoutes = new Hono<{ Bindings: Env }>();

const SENSHI_BASE = 'https://anivault-api.up.railway.app/api';
const ANIKOTO_MIRURO_BASE = 'https://anivault-api.up.railway.app/';

async function fetchJson(url: string, timeoutMs = 12000): Promise<{ ok: boolean; code: number; data: any }> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    clearTimeout(t);
    const data = await res.json().catch(() => null);
    return { ok: res.ok, code: res.status, data };
  } catch {
    return { ok: false, code: 0, data: null };
  }
}

// ── api/animeheaven_stream.php ─────────────────────────────────────────────
// Read-only proxy — doesn't set/change anything, so it doesn't touch the
// session at all. The watch page fires this alongside several Anikoto
// probes at once; every one of those used to do a D1 read+write against
// the SAME session row, and concurrent writes to one row queue up in D1
// instead of running in parallel. That's what was causing the whole
// "Finding the best server..." probe burst to crawl even though each
// request is fast in isolation.
scraperRoutes.get('/api/animeheaven_stream.php', async (c) => {
  const animeId = parseInt(c.req.query('anime') ?? '0', 10) || 0;
  const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;
  if (!animeId || !epNum) return c.json({ error: 'Missing anime or ep' }, 400);

  const { ok, code, data } = await fetchJson(`${SENSHI_BASE}/watch/animeheaven/mal-${animeId}/${epNum}/sub`, 20000);
  if (!ok) return c.json({ error: data?.error ?? `Scraper API error HTTP ${code}` });
  const mp4 = data?.mp4ProxyUrl ?? data?.streamUrl ?? data?.mp4 ?? null;
  if (!mp4) return c.json({ error: 'No stream URL in response', raw: data });
  return c.json({ mp4, playbackMode: 'mp4' });
});

// ── api/anikoto_stream.php ─────────────────────────────────────────────────
// ── api/anikoto_stream.php ─────────────────────────────────────────────────
// Same reasoning as animeheaven_stream.php above: read-only proxy, no
// session data to persist, and this is the one that gets hit MOST often
// per page load (once for the list, then once per provider found) — so
// it was the biggest contributor to the D1 session-row write pileup.
scraperRoutes.get('/api/anikoto_stream.php', async (c) => {
  const animeId = parseInt(c.req.query('anime') ?? '0', 10) || 0;
  const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;
  const audio = ['sub', 'dub', 'raw'].includes(c.req.query('audio') ?? '') ? c.req.query('audio')! : 'sub';
  const server = (c.req.query('server') ?? '').trim();
  if (!animeId || !epNum) return c.json({ error: 'Missing anime or ep' }, 400);

  // Anikoto moved from the anivault-scraper Railway service to the same
  // one senshi_stream.php uses, and now expects a "mal-" prefixed ID.
  let watchUrl = `${SENSHI_BASE}/watch/anikoto/mal-${animeId}/${epNum}/${audio}`;
  if (server !== '') watchUrl += `?server=${encodeURIComponent(server)}`;

  const { ok, code, data } = await fetchJson(watchUrl, 20000);
  if (!ok) return c.json({ error: data?.error ?? `Anikoto fetch failed HTTP ${code}` });

  const servers = (data?.availableServers ?? []).map((s: string) => ({ name: s, type: audio }));
  const m3u8 = data?.hlsProxyUrl ?? data?.m3u8 ?? null;

  if (data?.iframeOnly) return c.json({ servers, embedUrl: data.embedUrl ?? '', iframeOnly: true, server: data.server ?? server });
  if (m3u8) return c.json({ servers, m3u8, server: data.server ?? server, subtitles: data.subtitles ?? [] });
  return c.json({ error: 'No stream URL in response' });
});

// ── api/server_check.php ───────────────────────────────────────────────────
const ERROR_PHRASES = ['episode not found', 'video not found', '404 not found', 'page not found', 'no video found', 'no sources found', 'no servers found', 'this episode is not available', 'something went wrong'];

async function checkSenshiUp(malId: number, epNum: number): Promise<boolean> {
  const { ok, data } = await fetchJson(`${ANIKOTO_MIRURO_BASE}/watch/senshi/mal-${malId}/${epNum}/sub`, 10000);
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
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  if (!auth.check()) { await session.save(c, lifetime); return c.json({ error: 'Unauthorized' }, 401); }

  const malId = parseInt(c.req.query('mal') ?? '0', 10) || 0;
  const anilistId = parseInt(c.req.query('anilist') ?? '0', 10) || 0;
  const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;
  if (!malId || !anilistId || !epNum) { await session.save(c, lifetime); return c.json({ error: 'Missing mal, anilist, or ep' }, 400); }

  const cacheKey = `serverchk_${malId}_${anilistId}_${epNum}`;
  const cached = await c.env.API_CACHE.get(cacheKey, 'json');
  if (cached) { await session.save(c, lifetime); return c.json(cached); }

  const [volt, warp, ayame] = await Promise.all([
    checkSenshiUp(malId, epNum),
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
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');

  const malId = parseInt(c.req.query('mal') ?? '0', 10) || 0;
  const anilistId = parseInt(c.req.query('anilist') ?? '0', 10) || 0;
  const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      if (!auth.check()) { send('error', { message: 'Unauthorized' }); controller.close(); return; }
      if (!malId || !anilistId || !epNum) { send('error', { message: 'Missing mal, anilist, or ep' }); controller.close(); return; }

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
        ['volt', checkSenshiUp(malId, epNum)],
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

  const animeRes = await fetchJson(`https://api.jikan.moe/v4/anime/${animeId}`, 5000);
  const title = animeRes.data?.data?.title ?? 'Anime';
  const image = animeRes.data?.data?.images?.jpg?.image_url ?? '';

  const epRes = await fetchJson(`https://api.jikan.moe/v4/anime/${animeId}/episodes`, 5000);
  let epTitle = `Episode ${epNum}`;
  for (const ep of epRes.data?.data ?? []) {
    if (Number(ep.mal_id ?? 0) === epNum && ep.title && ep.title !== 'TBA') { epTitle = ep.title; break; }
  }

  let ogImage = image;
  const skipSites = ['netflix', 'amazon', 'prime', 'disney', 'hulu', 'apple'];
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'query ($malId: Int) { Media(idMal: $malId, type: ANIME) { streamingEpisodes { title thumbnail site } } }',
        variables: { malId: animeId },
      }),
    });
    const data: any = await res.json();
    const eps = data?.data?.Media?.streamingEpisodes ?? [];
    const epRegex = new RegExp(`Episode\\s+${epNum}`, 'i');
    for (const ep of eps) {
      if (epRegex.test(ep.title ?? '')) {
        const site = (ep.site ?? '').toLowerCase();
        if (!skipSites.some((s) => site.includes(s)) && ep.thumbnail) { ogImage = ep.thumbnail; break; }
      }
    }
  } catch { /* fall back to anime cover */ }

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

// ── api/discord_user.php (internal, bot-secret protected) ─────────────────
scraperRoutes.get('/api/discord_user.php', async (c) => {
  const db = new Db(c.env.DB);
  const secret = (c.req.query('secret') ?? '').trim();
  if (!c.env.BOT_SECRET || secret !== c.env.BOT_SECRET) return c.json({ error: 'Unauthorized' }, 401);

  const username = (c.req.query('username') ?? '').trim();
  if (!username) return c.json({ error: 'Missing username' }, 400);

  const user = await db.fetchOne<any>('SELECT id, username, avatar_url, role, created_at FROM users WHERE username = ?', [username]);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const displayIdRow = await db.fetchOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM users WHERE id <= ?', [user.id]);
  user.display_id = displayIdRow?.cnt ?? user.id;

  const statsRows = await db.fetchAll<{ status: string; cnt: number; ep_sum: number; avg_score: number | null }>(
    'SELECT status, COUNT(*) as cnt, SUM(episodes_watched) as ep_sum, AVG(score) as avg_score FROM anime_list WHERE user_id=? GROUP BY status',
    [user.id]
  );
  const stats: Record<string, number> = {
    watching: 0, completed: 0, on_hold: 0, dropped: 0, plan_to_watch: 0, total_episodes: 0, avg_score: 0, total: 0,
  };
  let scoreTotal = 0, scoreCount = 0;
  for (const r of statsRows) {
    if (r.status in stats) stats[r.status] = r.cnt;
    stats.total += r.cnt;
    stats.total_episodes += Number(r.ep_sum ?? 0);
    if (r.avg_score) { scoreTotal += r.avg_score * r.cnt; scoreCount += r.cnt; }
  }
  stats.avg_score = scoreCount ? Math.round((scoreTotal / scoreCount) * 10) / 10 : 0;
  user.stats = stats;

  return c.json({ user });
});
