// Ports api/list.php, api/notifications.php, api/watch_history.php.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth, AUTO_SESSION_LIFETIME_SECONDS } from '../lib/auth';
import { MalAPI } from '../lib/mal-api';
import { AnimeTracker } from '../lib/tracker';
import { pushListSync } from '../lib/list-sync';
import { Notification } from '../lib/notification';
import { timeAgo } from '../lib/helpers';

export const apiListRoutes = new Hono<{ Bindings: Env }>();

async function buildCtx(c: any) {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  return { db, session, lifetime, auth };
}

// ── api/list.php ───────────────────────────────────────────────────────────
apiListRoutes.on(['GET', 'POST'], '/api/list.php', async (c) => {
  const { db, session, lifetime, auth } = await buildCtx(c);
  const mal = new MalAPI(c.env, c.env.API_CACHE, db);

  const body = c.req.method === 'POST' ? await c.req.parseBody() : {};
  const action = (body.action as string) ?? c.req.query('action') ?? '';

  // 'add' and 'favorite' are allowed to silently create an account for a
  // signed-out visitor (mirrors the client's ensureAccount() call in app.js
  // — this is just the server-side backstop in case that call didn't fire).
  // 'remove'/'get' stay gated: there's nothing to remove/fetch for someone
  // who's never had an account.
  let autoAccount: { username: string; password: string } | undefined;
  if (!auth.check()) {
    if (action === 'add' || action === 'favorite') {
      const reg = await auth.autoRegister();
      if (!reg.success) {
        await session.save(c, lifetime);
        return c.json({ success: false, message: reg.message ?? 'Could not create an account.' }, 500);
      }
      autoAccount = { username: reg.username!, password: reg.password! };
    } else {
      await session.save(c, lifetime);
      return c.json({ success: false, message: 'Not logged in' }, 401);
    }
  }
  const userId = session.user_id!;

  let result: any;
  switch (action) {
    case 'add': {
      result = await AnimeTracker.addOrUpdate(db, mal, userId, body as Record<string, any>);
      if (result.success) {
        const animeId = parseInt((body.anime_id as string) ?? '0', 10) || 0;
        const status = (body.status as string) || 'plan_to_watch';
        const watched = parseInt((body.episodes_watched as string) ?? '0', 10) || 0;
        const score = body.score ? parseInt(body.score as string, 10) : null;
        // Fire-and-forget: keep any connected MAL/AniList account current.
        // Never blocks or fails the local update if MAL/AniList is down.
        await pushListSync(c.env, db, userId, animeId, status, watched, score).catch(() => {});
      }
      break;
    }
    case 'remove': {
      const animeId = parseInt((body.anime_id as string) ?? '0', 10) || 0;
      result = await AnimeTracker.remove(db, userId, animeId);
      break;
    }
    case 'get': {
      const animeId = parseInt(c.req.query('anime_id') ?? '0', 10) || 0;
      const entry = await AnimeTracker.getUserEntry(db, userId, animeId);
      result = { entry: entry ?? null };
      break;
    }
    case 'favorite': {
      const animeId = parseInt((body.anime_id as string) ?? '0', 10) || 0;
      const title = (body.anime_title as string) ?? '';
      const image = (body.anime_image as string) ?? '';
      result = await AnimeTracker.toggleFavorite(db, userId, animeId, title, image);
      break;
    }
    default:
      await session.save(c, lifetime);
      return c.json({ success: false, message: 'Unknown action' }, 400);
  }
  if (autoAccount) result = { ...result, auto_account: autoAccount };
  await session.save(c, autoAccount ? AUTO_SESSION_LIFETIME_SECONDS : lifetime);
  return c.json(result);
});

// ── api/notifications.php ──────────────────────────────────────────────────
// app.js hits this two different ways: the dropdown ("get"/"count") uses a
// plain GET with the action in the query string, while mark-read/delete/etc
// use POST with a FormData body. Accept both.
apiListRoutes.on(['GET', 'POST'], '/api/notifications.php', async (c) => {
  const { db, session, lifetime, auth } = await buildCtx(c);
  if (!auth.check()) {
    await session.save(c, lifetime);
    return c.json({ success: false, message: 'Not logged in.' }, 401);
  }
  const userId = session.user_id!;
  const body = c.req.method === 'POST' ? await c.req.parseBody() : ({} as Record<string, unknown>);
  const action = (c.req.query('action') || (body.action as string) || '').trim();
  const getParam = (key: string): string => (c.req.query(key) ?? (body[key] as string) ?? '');

  let result: any;
  switch (action) {
    case 'get': {
      const notifs = await Notification.getForUser(db, userId, 15);
      const items = notifs.map((n) => {
        const meta = Notification.getMeta(n.type);
        return {
          id: n.id, text: Notification.getText(n), link: Notification.getLink(n, c.env.SITE_URL),
          icon: meta.icon, color: meta.color, is_read: !!n.is_read, time: timeAgo(n.created_at),
          actor_name: n.actor_name, actor_avatar: n.actor_avatar ?? null,
        };
      });
      result = { success: true, notifications: items, unread: await Notification.unreadCount(db, userId) };
      break;
    }
    case 'read': {
      const id = parseInt(getParam('id') || '0', 10) || 0;
      if (id) await Notification.markRead(db, id, userId);
      result = { success: true };
      break;
    }
    case 'read_all':
      await Notification.markAllRead(db, userId);
      result = { success: true };
      break;
    case 'delete': {
      const id = parseInt(getParam('id') || '0', 10) || 0;
      if (id) await Notification.delete(db, id, userId);
      result = { success: true };
      break;
    }
    case 'like_review': {
      const reviewId = parseInt(getParam('review_id') || '0', 10) || 0;
      if (!reviewId) { result = { success: false, message: 'Invalid review.' }; break; }
      const review = await db.fetchOne<{ id: number; user_id: number; anime_id: number; anime_title: string | null }>(
        `SELECT r.*, al.anime_title as list_anime_title FROM reviews r
         LEFT JOIN anime_list al ON al.anime_id=r.anime_id AND al.user_id=r.user_id
         WHERE r.id=? AND r.is_visible=1`,
        [reviewId]
      );
      if (!review) { result = { success: false, message: 'Review not found.' }; break; }
      const existing = await db.fetchOne('SELECT id FROM review_likes WHERE user_id=? AND review_id=?', [userId, reviewId]);
      let liked: boolean;
      if (existing) {
        await db.query('DELETE FROM review_likes WHERE user_id=? AND review_id=?', [userId, reviewId]);
        await db.query('UPDATE reviews SET likes = MAX(0, likes-1) WHERE id=?', [reviewId]);
        liked = false;
      } else {
        await db.insert('INSERT INTO review_likes (user_id, review_id) VALUES (?,?)', [userId, reviewId]);
        await db.query('UPDATE reviews SET likes = likes+1 WHERE id=?', [reviewId]);
        liked = true;
        const animeMeta = (review as any).anime_title ?? (review as any).list_anime_title ?? null;
        await Notification.create(db, review.user_id, userId, 'like_review', review.anime_id, animeMeta);
      }
      const newCount = await db.count('SELECT COUNT(*) as cnt FROM review_likes WHERE review_id=?', [reviewId]);
      result = { success: true, liked, count: newCount };
      break;
    }
    case 'count':
      result = { success: true, unread: await Notification.unreadCount(db, userId) };
      break;
    default:
      await session.save(c, lifetime);
      return c.json({ success: false, message: 'Unknown action.' }, 400);
  }
  await session.save(c, lifetime);
  return c.json(result);
});

// ── api/watch_history.php ──────────────────────────────────────────────────
apiListRoutes.post('/api/watch_history.php', async (c) => {
  const { db, session, lifetime, auth } = await buildCtx(c);
  const isLoggedIn = auth.check();
  const userId = isLoggedIn ? session.user_id! : null;
  const guestId = !isLoggedIn ? `g_${session.id}` : null;

  const body = await c.req.json().catch(() => ({}));
  const action = body.action ?? '';

  const guestAllowed = ['save_progress', 'get_progress'].includes(action);
  if (!isLoggedIn && !guestAllowed) {
    await session.save(c, lifetime);
    return c.json({ success: false, error: 'Not logged in' }, 403);
  }

  if (action === 'save_progress') {
    const animeId = parseInt(body.anime_id ?? '0', 10) || 0;
    const epNum = parseInt(body.episode_num ?? '0', 10) || 0;
    const watchTime = parseInt(body.watch_time ?? '0', 10) || 0;
    const duration = parseInt(body.episode_duration ?? '0', 10) || 0;
    if (!animeId || !epNum || watchTime < 0) {
      await session.save(c, lifetime);
      return c.json({ success: false, error: 'Invalid params' });
    }

    if (isLoggedIn) {
      // Matches the PHP version's behavior exactly: the unique key is
      // (user_id, anime_id), and ON CONFLICT deliberately only touches
      // watch_time/episode_duration/watched_at -- episode_num/titles/thumb
      // are left alone here because the watch page's own page-load upsert
      // (in watch.ts) already set them correctly before playback started.
      const existing = await db.fetchOne<{ id: number; anime_title: string | null; anime_image: string | null }>(
        'SELECT id, anime_title, anime_image FROM watch_history WHERE user_id = ? AND anime_id = ? AND episode_num = ?',
        [userId, animeId, epNum]
      );
      let animeTitle = (body.anime_title ?? '').trim();
      let animeImage = (body.anime_image ?? '').trim();
      if (existing) {
        if (duration > 0) {
          await db.query('UPDATE watch_history SET watch_time=?, episode_duration=? WHERE id=?', [watchTime, duration, existing.id]);
        } else {
          await db.query('UPDATE watch_history SET watch_time=? WHERE id=?', [watchTime, existing.id]);
        }
        animeTitle = animeTitle || existing.anime_title || '';
        animeImage = animeImage || existing.anime_image || '';
      } else if (duration > 0) {
        const epThumb = (body.ep_thumb ?? '').trim();
        const epTitle = (body.ep_title ?? '').trim();
        await db.query(
          `INSERT INTO watch_history (user_id, anime_id, anime_title, anime_image, episode_num, ep_title, ep_thumb, watch_time, episode_duration, watched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(user_id, anime_id) DO UPDATE SET
             watch_time = excluded.watch_time, episode_duration = excluded.episode_duration, watched_at = datetime('now')`,
          [userId, animeId, animeTitle, animeImage, epNum, epTitle, epThumb, watchTime, duration]
        );
      }
      // else: episode_duration isn't known yet (null/0) -- skip writing a
      // row until the client sends a real duration, so we don't save a
      // permanently-null watch log entry.

      // Auto-track the watchlist off real watch percentage: 5% watched ->
      // ensure it's on the list as "watching"; 90%+ -> mark this episode
      // watched (and "completed" once the last episode is reached).
      if (duration > 0) {
        const pct = watchTime / duration;
        const totalEpsParam = parseInt(body.total_eps ?? '0', 10) || 0;
        await AnimeTracker.autoTrackProgress(db, userId, animeId, epNum, pct, totalEpsParam, animeTitle, animeImage);
      }
    } else {
      const existing = await db.fetchOne<{ id: number }>(
        'SELECT id FROM watch_history WHERE guest_id = ? AND anime_id = ? AND episode_num = ?',
        [guestId, animeId, epNum]
      );
      if (existing) {
        if (duration > 0) {
          await db.query('UPDATE watch_history SET watch_time=?, episode_duration=? WHERE id=?', [watchTime, duration, existing.id]);
        } else {
          await db.query('UPDATE watch_history SET watch_time=? WHERE id=?', [watchTime, existing.id]);
        }
      } else if (duration > 0) {
        const animeTitle = (body.anime_title ?? '').trim();
        const animeImage = (body.anime_image ?? '').trim();
        const epTitle = (body.ep_title ?? '').trim();
        await db.query(
          `INSERT INTO watch_history (guest_id, anime_id, anime_title, anime_image, episode_num, ep_title, watch_time, episode_duration, watched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [guestId, animeId, animeTitle, animeImage, epNum, epTitle, watchTime, duration]
        );
      }
    }
    await session.save(c, lifetime);
    return c.json({ success: true });
  }

  if (action === 'get_progress') {
    const animeId = parseInt(body.anime_id ?? '0', 10) || 0;
    const epNum = parseInt(body.episode_num ?? '0', 10) || 0;
    if (!animeId || !epNum) {
      await session.save(c, lifetime);
      return c.json({ success: false, error: 'Missing params' });
    }
    const row = isLoggedIn
      ? await db.fetchOne<{ watch_time: number; episode_duration: number }>(
          'SELECT watch_time, episode_duration FROM watch_history WHERE user_id = ? AND anime_id = ? AND episode_num = ?', [userId, animeId, epNum])
      : await db.fetchOne<{ watch_time: number; episode_duration: number }>(
          'SELECT watch_time, episode_duration FROM watch_history WHERE guest_id = ? AND anime_id = ? AND episode_num = ?', [guestId, animeId, epNum]);
    await session.save(c, lifetime);
    return c.json({ success: true, watch_time: row?.watch_time ?? 0, episode_duration: row?.episode_duration ?? 0 });
  }

  // Remaining actions require login
  if (action === 'set_ep_info') {
    const animeId = parseInt(body.anime_id ?? '0', 10) || 0;
    const epNum = parseInt(body.episode_num ?? '0', 10) || 0;
    const epThumb = (body.ep_thumb ?? '').trim();
    const epTitle = (body.ep_title ?? '').trim();
    if (!animeId || !epNum) { await session.save(c, lifetime); return c.json({ success: false }); }
    if (epThumb && !epThumb.startsWith('https://') && !epThumb.startsWith('http://')) {
      await session.save(c, lifetime);
      return c.json({ success: false, error: 'Invalid thumb URL' });
    }
    const sets: string[] = [];
    const params: unknown[] = [];
    if (epThumb) { sets.push('ep_thumb = ?'); params.push(epThumb); }
    if (epTitle) { sets.push('ep_title = ?'); params.push(epTitle); }
    if (sets.length === 0) { await session.save(c, lifetime); return c.json({ success: false }); }
    params.push(userId, animeId, epNum);
    await db.query(`UPDATE watch_history SET ${sets.join(', ')} WHERE user_id = ? AND anime_id = ? AND episode_num = ?`, params);
    await session.save(c, lifetime);
    return c.json({ success: true });
  }

  if (action === 'get_at_offset') {
    const offset = parseInt(body.offset ?? '0', 10) || 0;
    const row = await db.fetchOne(
      `SELECT anime_id, anime_title, anime_image, episode_num, ep_title, ep_thumb, watched_at, watch_time, episode_duration
       FROM watch_history WHERE user_id = ? ORDER BY watched_at DESC LIMIT 1 OFFSET ?`,
      [userId, offset]
    );
    await session.save(c, lifetime);
    return c.json({ success: true, item: row ?? null });
  }

  if (action === 'remove') {
    const animeId = parseInt(body.anime_id ?? '0', 10) || 0;
    if (!animeId) { await session.save(c, lifetime); return c.json({ success: false, error: 'Missing anime_id' }); }
    await db.query('DELETE FROM watch_history WHERE user_id = ? AND anime_id = ?', [userId, animeId]);
    await session.save(c, lifetime);
    return c.json({ success: true });
  }

  if (action === 'clear') {
    await db.query('DELETE FROM watch_history WHERE user_id = ?', [userId]);
    await session.save(c, lifetime);
    return c.json({ success: true });
  }

  await session.save(c, lifetime);
  return c.json({ success: false, error: 'Unknown action' }, 400);
});
