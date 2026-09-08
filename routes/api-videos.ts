// Ports api/videos.php. Table creation / ALTER-for-qualities-column dropped
// since D1 already has the right schema from the Phase 1 migration.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { MalAPI } from '../lib/mal-api';
import { getAnimeTitle } from '../lib/helpers';
import { Logger } from '../lib/logger';

export const apiVideosRoutes = new Hono<{ Bindings: Env }>();

export function sanitiseIframe(raw: string): string {
  const match = raw.match(/<iframe[\s\S]*?<\/iframe>/i);
  if (!match) return '';
  let iframe = match[0];
  iframe = iframe.replace(/\bsrc=(["'])http:\/\//i, 'src=$1https://');
  iframe = iframe.replace(/\bon\w+\s*=\s*["'][^"']*["']\s*/gi, '');
  iframe = iframe.replace(/javascript:/gi, '');
  if (!/src=["']https:\/\//i.test(iframe)) return '';
  if (!/allowfullscreen/i.test(iframe)) {
    iframe = iframe.replace(/<\/iframe>/i, ' allowfullscreen></iframe>');
  }
  return iframe;
}

apiVideosRoutes.on(['GET', 'POST'], '/api/videos.php', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');

  if (c.req.method === 'GET') {
    const animeId = parseInt(c.req.query('anime_id') ?? '0', 10) || 0;
    const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;

    if (animeId && epNum) {
      const row = await db.fetchOne('SELECT * FROM episode_videos WHERE anime_id = ? AND episode_num = ? AND is_active = 1', [animeId, epNum]);
      await session.save(c, lifetime);
      return c.json({ success: true, video: row ?? null });
    }
    if (animeId) {
      const rows = await db.fetchAll(
        'SELECT episode_num, title, video_type, platform FROM episode_videos WHERE anime_id = ? AND is_active = 1 ORDER BY episode_num ASC',
        [animeId]
      );
      await session.save(c, lifetime);
      return c.json({ success: true, videos: rows });
    }
    await session.save(c, lifetime);
    return c.json({ success: false, error: 'Missing params' });
  }

  if (c.req.method === 'POST' && c.req.query('action') === 'delete') {
    if (!auth.isAdmin()) { await session.save(c, lifetime); return c.json({ success: false, error: 'Forbidden' }, 403); }
    const id = parseInt(c.req.query('id') ?? '0', 10) || 0;
    if (!id) { await session.save(c, lifetime); return c.json({ success: false, error: 'Missing id' }); }
    await db.query('DELETE FROM episode_videos WHERE id = ?', [id]);
    await session.save(c, lifetime);
    return c.json({ success: true });
  }

  if (c.req.method === 'POST') {
    if (!auth.isAdmin()) { await session.save(c, lifetime); return c.json({ success: false, error: 'Forbidden' }, 403); }

    const body: any = await c.req.json().catch(() => ({}));
    const id = parseInt(body.id ?? '0', 10) || 0;
    const animeId = parseInt(body.anime_id ?? '0', 10) || 0;
    const epNum = parseInt(body.episode_num ?? '0', 10) || 0;
    let title = (body.title ?? '').trim();
    let description = (body.description ?? '').trim();
    const isActive = parseInt(body.is_active ?? '1', 10) || 0;
    const videoType = 'Review';
    const platform = 'other';

    if (!animeId || !epNum) {
      await session.save(c, lifetime);
      return c.json({ success: false, error: 'Missing anime_id or episode_num' });
    }

    const qualitiesRaw = body.qualities ?? [];
    const tracks: { sub: any[]; dub: any[] } = ('sub' in qualitiesRaw || 'dub' in qualitiesRaw)
      ? { sub: qualitiesRaw.sub ?? [], dub: qualitiesRaw.dub ?? [] }
      : { sub: Array.isArray(qualitiesRaw) ? qualitiesRaw : Object.values(qualitiesRaw ?? {}), dub: [] };

    const cleanQualities: { sub: any[]; dub: any[] } = { sub: [], dub: [] };
    for (const track of ['sub', 'dub'] as const) {
      for (const q of tracks[track]) {
        const qlabel = (q?.label ?? '').trim();
        const qembed = (q?.embed ?? '').trim();
        if (!qlabel || !qembed) continue;
        const cleaned = sanitiseIframe(qembed);
        if (cleaned) cleanQualities[track].push({ label: qlabel, embed: cleaned });
      }
    }
    const qualitiesJson = (cleanQualities.sub.length || cleanQualities.dub.length) ? JSON.stringify(cleanQualities) : null;

    let cleanEmbed = '';
    const embedCode = (body.embed_code ?? '').trim();
    if (embedCode) {
      cleanEmbed = sanitiseIframe(embedCode);
      if (!cleanEmbed) {
        const hasIframe = /<iframe[\s\S]*?<\/iframe>/i.test(embedCode);
        await session.save(c, lifetime);
        return c.json({ success: false, error: hasIframe ? 'Embed src must use https://. Check your embed code.' : 'Invalid embed code. Paste the full <iframe>...</iframe> tag.' });
      }
    }

    let animeTitle = '';
    let animeSynopsis = '';
    try {
      const mal = new MalAPI(c.env, c.env.API_CACHE, db);
      const animeData = await mal.getAnime(animeId);
      if (animeData.data) {
        animeTitle = getAnimeTitle(animeData.data);
        animeSynopsis = animeData.data.synopsis ?? '';
      }
    } catch { /* non-critical */ }

    if (!title && animeTitle) title = animeTitle;
    if (!description && animeSynopsis) description = animeSynopsis.substring(0, 500);

    if (id) {
      await db.query(
        `UPDATE episode_videos SET anime_title=?, title=?, video_type=?, platform=?, embed_code=?, qualities=?, description=?, is_active=?, updated_at=datetime('now')
         WHERE id=? AND anime_id=?`,
        [animeTitle || null, title || null, videoType, platform, cleanEmbed, qualitiesJson, description || null, isActive, id, animeId]
      );
    } else {
      await db.query(
        `INSERT INTO episode_videos (anime_id, episode_num, anime_title, title, video_type, platform, embed_code, qualities, description, is_active, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(anime_id, episode_num) DO UPDATE SET
           anime_title=excluded.anime_title, title=excluded.title, video_type=excluded.video_type, platform=excluded.platform,
           embed_code=excluded.embed_code, qualities=excluded.qualities, description=excluded.description,
           is_active=excluded.is_active, updated_at=datetime('now')`,
        [animeId, epNum, animeTitle || null, title || null, videoType, platform, cleanEmbed, qualitiesJson, description || null, isActive, session.user_id ?? null]
      );
    }

    await Logger.log(db, session.user_id ?? 0, 'episode_video', `Saved video for ep ${epNum} of anime ${animeId}`);
    await session.save(c, lifetime);
    return c.json({ success: true });
  }

  await session.save(c, lifetime);
  return c.json({ success: false, error: 'Method not allowed' }, 405);
});
