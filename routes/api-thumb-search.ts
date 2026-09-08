// Ports api/thumb_search.php. curl -> fetch, file-cache -> KV.
// The actual lookup now lives in ../lib/episode-thumb.ts, which just calls
// our own scraper API (SCRAPER_API_BASE) -- no third-party APIs anymore.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { findEpisodeThumbnails, episodeThumbCacheKey, getCachedRaw, putCachedRaw } from '../lib/episode-thumb';

export const thumbSearchRoutes = new Hono<{ Bindings: Env }>();

thumbSearchRoutes.get('/api/thumb_search.php', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');

  if (!auth.isAdmin()) {
    await session.save(c, lifetime);
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const animeTitle = (c.req.query('anime') ?? '').trim();
  const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;
  const malId = parseInt(c.req.query('mal_id') ?? '0', 10) || 0;
  let mode = c.req.query('mode') ?? 'auto';
  const debug = mode === 'debug';
  if (debug) mode = 'list';
  const isList = mode === 'list';

  // animeTitle no longer drives the lookup (the scraper keys off malId
  // alone) but is still required in the query so the admin UI's mismatched
  // requests surface the same "Missing anime or ep" error as before.
  if (!animeTitle || !epNum || !malId) {
    await session.save(c, lifetime);
    return c.json({ success: false, error: !malId ? 'Missing mal_id' : 'Missing anime or ep' });
  }

  const cacheKey = episodeThumbCacheKey(malId, epNum);
  if (!debug) {
    const cachedRaw = await getCachedRaw(db, cacheKey);
    if (cachedRaw) { await session.save(c, lifetime); return c.json(JSON.parse(cachedRaw)); }
  }

  const { thumbs, log, scraperConfigured } = await findEpisodeThumbnails(c.env, epNum, malId, isList);

  if (debug) {
    await session.save(c, lifetime);
    return c.json({
      success: true, thumbs, debug_log: log,
      inputs: { animeTitle, epNum, malId }, scraper_configured: scraperConfigured,
    });
  }

  const result = isList ? { success: true, thumbs } : { success: true, thumb: thumbs[0] ?? null };
  await putCachedRaw(db, cacheKey, JSON.stringify(result), 3600);
  await session.save(c, lifetime);
  return c.json(result);
});
