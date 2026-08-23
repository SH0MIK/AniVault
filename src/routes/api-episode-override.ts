// Ports api/episode_override.php.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { MalAPI } from '../lib/mal-api';
import { Logger } from '../lib/logger';
import { getAnimeEpisodeThumbnails } from '../lib/episode-thumb';

export const episodeOverrideRoutes = new Hono<{ Bindings: Env }>();

const ALLOWED_SERVICES = ['crunchyroll', 'netflix', 'hidive', 'funimation', 'amazon', 'hulu', 'apple', 'disney', 'youtube', 'bilibili'];

function isValidUrl(url: string): boolean {
  try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

episodeOverrideRoutes.on(['GET', 'POST'], '/api/episode_override.php', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');

  const animeId = parseInt(c.req.query('anime_id') ?? '0', 10) || 0;
  const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;

  if (c.req.method === 'GET') {
    if (animeId && c.req.query('all') !== undefined) {
      const rows: any[] = await db.fetchAll('SELECT * FROM episode_overrides WHERE anime_id = ?', [animeId]);
      const mal = new MalAPI(c.env, c.env.API_CACHE, db);
      const animeData = await mal.getAnime(animeId);
      const totalEps = animeData.data?.episodes ?? 0;

      // Fill in episodes that don't have an admin-saved override with a
      // live lookup against our own scraper API (one HTTP call for the
      // whole anime, D1-cached -- see getAnimeEpisodeThumbnails). This is
      // what both the watch page sidebar and the episode grid on anime
      // detail pages call, so fixing it here covers both. Passing the
      // show's status lets a Finished Airing show get cached permanently
      // instead of re-fetched every 6h.
      const overriddenEps = new Set(rows.map((r) => Number(r.episode_num)));
      const scraped = await getAnimeEpisodeThumbnails(c.env, db, animeId, animeData.data?.status);
      const combined = [...rows];
      for (const [epNumStr, image_url] of Object.entries(scraped)) {
        const epNum = Number(epNumStr);
        if (!overriddenEps.has(epNum)) combined.push({ anime_id: animeId, episode_num: epNum, image_url });
      }

      await session.save(c, lifetime);
      return c.json({ success: true, overrides: combined, total_eps: totalEps });
    }

    if (!animeId || !epNum) {
      await session.save(c, lifetime);
      return c.json({ success: false, error: 'Missing params' });
    }
    const row = await db.fetchOne<any>('SELECT * FROM episode_overrides WHERE anime_id = ? AND episode_num = ?', [animeId, epNum]);
    let watchLinks: any[] = [];
    if (row?.watch_links) { try { watchLinks = JSON.parse(row.watch_links); } catch { /* ignore */ } }
    await session.save(c, lifetime);
    return c.json({ success: true, override: row ?? null, watch_links: watchLinks });
  }

  // ── DELETE via POST ?action=delete ──────────────────────
  if (c.req.method === 'POST' && c.req.query('action') === 'delete') {
    if (!auth.isAdmin()) {
      await session.save(c, lifetime);
      return c.json({ success: false, error: 'Forbidden' }, 403);
    }
    const id = parseInt(c.req.query('id') ?? '0', 10) || 0;
    if (id) {
      await db.query('DELETE FROM episode_overrides WHERE id = ?', [id]);
    } else {
      if (!animeId || !epNum) { await session.save(c, lifetime); return c.json({ success: false, error: 'Missing id' }); }
      await db.query('DELETE FROM episode_overrides WHERE anime_id = ? AND episode_num = ?', [animeId, epNum]);
    }
    await session.save(c, lifetime);
    return c.json({ success: true });
  }

  // ── POST (save override) ────────────────────────────────
  if (c.req.method === 'POST') {
    if (!auth.isAdmin()) {
      await session.save(c, lifetime);
      return c.json({ success: false, error: 'Forbidden' }, 403);
    }
    const body: any = await c.req.json().catch(() => ({}));
    const bAnimeId = parseInt(body.anime_id ?? '0', 10) || 0;
    const bEpNum = parseInt(body.episode_num ?? '0', 10) || 0;
    const imageUrl = (body.image_url ?? '').trim();
    const synopsis = (body.synopsis ?? '').trim();
    const links = Array.isArray(body.watch_links) ? body.watch_links : [];

    if (!bAnimeId || !bEpNum) {
      await session.save(c, lifetime);
      return c.json({ success: false, error: 'Missing anime_id or episode_num' });
    }

    const cleanLinks = links
      .map((l: any) => ({ service: (l.service ?? '').toLowerCase().trim(), url: (l.url ?? '').trim() }))
      .filter((l: any) => ALLOWED_SERVICES.includes(l.service) && isValidUrl(l.url));

    await db.query(
      `INSERT INTO episode_overrides (anime_id, episode_num, image_url, synopsis, watch_links, updated_by)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(anime_id, episode_num) DO UPDATE SET
         image_url=excluded.image_url, synopsis=excluded.synopsis, watch_links=excluded.watch_links,
         updated_by=excluded.updated_by, updated_at=datetime('now')`,
      [bAnimeId, bEpNum, imageUrl || null, synopsis || null, JSON.stringify(cleanLinks), session.user_id]
    );
    await Logger.log(db, session.user_id!, 'episode_override', `Edited ep ${bEpNum} of anime ${bAnimeId}`);
    await session.save(c, lifetime);
    return c.json({ success: true });
  }

  await session.save(c, lifetime);
  return c.json({ success: false, error: 'Method not allowed' }, 405);
});
