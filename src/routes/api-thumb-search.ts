// Admin debug endpoint for Hoshika's public episode-thumbnail lookup.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { findEpisodeThumbnails } from '../lib/episode-thumb';

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

  // The title is required to resolve Hoshika's own shortId safely.
  if (!animeTitle || !epNum || !malId) {
    await session.save(c, lifetime);
    return c.json({ success: false, error: !malId ? 'Missing mal_id' : 'Missing anime or ep' });
  }

  const { thumbs, log, hoshikaConfigured } = await findEpisodeThumbnails(c.env, epNum, malId, isList, animeTitle);

  if (debug) {
    await session.save(c, lifetime);
    return c.json({
      success: true, thumbs, debug_log: log,
      inputs: { animeTitle, epNum, malId }, hoshika_configured: hoshikaConfigured,
    });
  }

  const result = isList ? { success: true, thumbs } : { success: true, thumb: thumbs[0] ?? null };
  await session.save(c, lifetime);
  return c.json(result);
});
