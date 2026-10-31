import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { searchHoshikaAnime, getHoshikaAnimeById, getHoshikaAnimeEpisodesById } from '../lib/hoshika-api';
import { findIdentityByLegacyMalId, findIdentityByHoshikaId } from '../lib/anime-identity';
import { getUserAnimeStatuses } from '../lib/user-list';

export const mobileContentRoutes = new Hono<{ Bindings: Env }>();

async function buildCtx(c: any) {
  const db = new Db(c.env.DB); const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  return { db, session, auth };
}

mobileContentRoutes.get('/api/mobile/browse', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  // Hoshika currently exposes public search but not the old MAL genre/top
  // catalogue endpoints. Never silently fall back to another anime provider.
  if (!q) return c.json({
    data: [], pagination: { current_page: page, last_visible_page: 1 },
    genres: [], source: 'hoshika',
    message: 'Search by title while the Hoshika catalogue filters are being migrated.',
  }, 200, { 'Cache-Control': 'no-store' });
  const items = await searchHoshikaAnime(q, 50, c.env.HOSHIKA_API_KEY);
  const data = items.map((a) => ({
    id: a.shortId, shortId: a.shortId, title: a.title,
    image: a.poster, score: a.score, type: a.type, episodes: a.episodes ?? 0,
    status: a.status, year: a.year, genres: a.genres, source: 'hoshika',
  }));
  return c.json({
    data, pagination: { current_page: page, last_visible_page: 1, has_next_page: false },
    genres: [], source: 'hoshika',
  }, 200, { 'Cache-Control': 'no-store' });
});

mobileContentRoutes.get('/api/mobile/anime/:id', async (c) => {
  const { db, auth } = await buildCtx(c);
  const requestedId = c.req.param('id').trim();
  if (!requestedId) return c.json({ success: false, message: 'Invalid anime id.' }, 400);
  // Search returns Hoshika short IDs. Older app links may still pass a numeric
  // legacy ID, which is accepted only through a verified mapping.
  const isLegacyId = /^\d+$/.test(requestedId);
  const legacyId = isLegacyId ? Number(requestedId) : null;
  const identity = isLegacyId
    ? await findIdentityByLegacyMalId(db, legacyId!).catch(() => null)
    : await findIdentityByHoshikaId(db, requestedId).catch(() => null);
  if (isLegacyId && (identity?.verified !== 1 || !identity.hoshika_short_id)) {
    return c.json({ success: false, message: 'This legacy anime ID has no verified Hoshika mapping.', source: 'hoshika' }, 404, { 'Cache-Control': 'no-store' });
  }
  const shortId = isLegacyId ? identity!.hoshika_short_id! : requestedId;
  const anime = await getHoshikaAnimeById(shortId, c.env.HOSHIKA_API_KEY);
  if (!anime) return c.json({ success: false, message: 'Anime not found in Hoshika.', source: 'hoshika' }, 404, { 'Cache-Control': 'no-store' });
  const mappedLegacyId = identity?.verified === 1 && identity.legacy_mal_id ? Number(identity.legacy_mal_id) : legacyId;
  const currentUser = auth.check() ? await auth.getCurrentUser() : null;
  let userEntry = null; let isFavorite = false;
  if (currentUser && mappedLegacyId) {
    const { AnimeTracker } = await import('../lib/tracker');
    userEntry = await AnimeTracker.getUserEntry(db, currentUser.id, mappedLegacyId);
    isFavorite = await AnimeTracker.isFavorite(db, currentUser.id, mappedLegacyId);
  }
  return c.json({
    success: true,
    anime: {
      id: mappedLegacyId ?? anime.shortId, legacyId: mappedLegacyId,
      shortId: anime.shortId, title: anime.title,
      titleJapanese: anime.titleJapanese || null, image: anime.poster,
      cover: anime.cover, synopsis: anime.synopsis, score: anime.score,
      status: anime.status, type: anime.type,
      genres: anime.genres.map((name) => ({ name })),
      totalEpisodes: anime.episodes ?? 0, airedSoFar: null,
      isAiring: /airing/i.test(anime.status), dubbedLangs: [],
      related: [],
    },
    userEntry, isFavorite, source: 'hoshika',
  }, 200, { 'Cache-Control': 'no-store' });
});

mobileContentRoutes.get('/api/mobile/anime/:id/episodes', async (c) => {
  const { db } = await buildCtx(c);
  const requestedId = c.req.param('id').trim();
  if (!requestedId) return c.json({ success: false, message: 'Invalid anime id.' }, 400);
  const isLegacyId = /^\d+$/.test(requestedId);
  const identity = isLegacyId
    ? await findIdentityByLegacyMalId(db, Number(requestedId)).catch(() => null)
    : await findIdentityByHoshikaId(db, requestedId).catch(() => null);
  if (isLegacyId && (identity?.verified !== 1 || !identity.hoshika_short_id)) {
    return c.json({ success: false, message: 'This legacy anime ID has no verified Hoshika mapping.', source: 'hoshika' }, 404, { 'Cache-Control': 'no-store' });
  }
  const shortId = isLegacyId ? identity!.hoshika_short_id! : requestedId;
  const episodes = await getHoshikaAnimeEpisodesById(shortId, c.env.HOSHIKA_API_KEY);
  if (!episodes) return c.json({ success: false, message: 'Episode data unavailable from Hoshika.', source: 'hoshika' }, 502, { 'Cache-Control': 'no-store' });
  const data = episodes.map((ep) => ({
    mal_id: ep.number, episode: ep.number, title: ep.title,
    aired: ep.aired, filler: ep.filler, recap: ep.recap,
    images: { jpg: { image_url: ep.thumbnail, small_image_url: ep.thumbnail } },
  }));
  return c.json({ success: true, data, pagination: { current_page: 1, last_visible_page: 1, has_next_page: false }, source: 'hoshika' }, 200, { 'Cache-Control': 'no-store' });
});

mobileContentRoutes.get('/api/mobile/profile', async (c) => {
  const { db, auth, session } = await buildCtx(c); if (!auth.check()) return c.json({ success: false, message: 'Not logged in.' }, 401); const userId = session.user_id!; const user = await auth.getCurrentUser(); if (!user) return c.json({ success: false, message: 'User not found.' }, 404);
  const { Badge } = await import('../lib/badges'); const { AnimeTracker } = await import('../lib/tracker'); const { Follow } = await import('../lib/follow');
  const [badges, stats, favorites, followerCount, followingCount] = await Promise.all([Badge.getForUser(db, userId), AnimeTracker.getStats(db, userId), AnimeTracker.getFavorites(db, userId), Follow.followerCount(db, userId), Follow.followingCount(db, userId)]);
  return c.json({ success: true, user: { id: user.id, username: user.username, email: user.email, avatarUrl: user.avatar_url, bio: user.bio, role: user.role, hasGoogle: !!user.google_id, hasDiscord: !!user.discord_id, hasPassword: !!user.password_hash }, stats, badges: badges.map((b) => ({ id: b.id, name: b.name, description: b.description, iconText: b.icon_text, imageUrl: b.image_url, color: b.color })), favorites: favorites.map((f: any) => ({ animeId: f.anime_id, title: f.anime_title, image: f.anime_image })), followerCount, followingCount });
});

mobileContentRoutes.get('/api/mobile/user/:username', async (c) => {
  const { db, auth, session } = await buildCtx(c); const username = c.req.param('username').trim(); if (!username) return c.json({ success: false, message: 'Invalid username.' }, 400);
  const profileUser = await db.fetchOne<any>('SELECT id, username, avatar_url, bio, role, created_at, privacy_hide_followers, privacy_hide_following, privacy_hide_favorites FROM users WHERE username = ? AND is_active = 1', [username]);
  if (!profileUser) return c.json({ success: false, message: 'User not found.' }, 404);
  const { Badge } = await import('../lib/badges'); const { AnimeTracker } = await import('../lib/tracker'); const { Follow } = await import('../lib/follow'); const currentUserId = auth.check() ? session.user_id! : null; const isOwn = currentUserId === profileUser.id;
  const [badges, stats, followerCount, followingCount, isFollowing] = await Promise.all([Badge.getForUser(db, profileUser.id), AnimeTracker.getStats(db, profileUser.id), Follow.followerCount(db, profileUser.id), Follow.followingCount(db, profileUser.id), currentUserId && !isOwn ? Follow.isFollowing(db, currentUserId, profileUser.id) : Promise.resolve(false)]);
  const canViewFavorites = isOwn || !profileUser.privacy_hide_favorites; const favorites = canViewFavorites ? await AnimeTracker.getFavorites(db, profileUser.id) : [];
  return c.json({ success: true, user: { id: profileUser.id, username: profileUser.username, avatarUrl: profileUser.avatar_url, bio: profileUser.bio, role: profileUser.role, joinedAt: profileUser.created_at }, stats, badges: badges.map((b) => ({ id: b.id, name: b.name, description: b.description, iconText: b.icon_text, imageUrl: b.image_url, color: b.color })), favorites: canViewFavorites ? favorites.map((f: any) => ({ animeId: f.anime_id, title: f.anime_title, image: f.anime_image })) : null, followerCount, followingCount, isOwn, isFollowing, canViewFollowers: isOwn || !profileUser.privacy_hide_followers, canViewFollowing: isOwn || !profileUser.privacy_hide_following });
});

mobileContentRoutes.get('/api/mobile/home', async (c) => {
  const { db, auth } = await buildCtx(c);
  // Hoshika currently has no seasonal/top/upcoming listing endpoints. Keep
  // watch-now cards only when the old MAL key has a verified Hoshika mapping.
  let watchNow: any[] = [];
  try {
    const rows = await db.fetchAll<{ anime_id: number }>('SELECT DISTINCT anime_id FROM episode_videos WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 12');
    watchNow = (await Promise.all(rows.map(async (row) => {
      const identity = await findIdentityByLegacyMalId(db, row.anime_id).catch(() => null);
      if (identity?.verified !== 1 || !identity.hoshika_short_id) return null;
      const anime = await getHoshikaAnimeById(identity.hoshika_short_id, c.env.HOSHIKA_API_KEY);
      if (!anime) return null;
      return { id: anime.shortId, shortId: anime.shortId, legacyId: row.anime_id, title: anime.title, image: anime.poster, score: anime.score, type: anime.type, episodes: anime.episodes ?? 0, source: 'hoshika' };
    }))).filter(Boolean);
  } catch { watchNow = []; }
  const currentUser = auth.check() ? await auth.getCurrentUser() : null;
  let continueWatching: any[] = [];
  if (currentUser) {
    try {
      const rows = await db.fetchAll<any>('SELECT anime_id, anime_title, anime_image, episode_num, ep_title, ep_thumb, watched_at, watch_time, episode_duration FROM watch_history WHERE user_id = ? ORDER BY watched_at DESC LIMIT 8', [currentUser.id]);
      continueWatching = rows.map((r) => ({ animeId: r.anime_id, title: r.anime_title, image: r.anime_image, episodeNum: r.episode_num, epTitle: r.ep_title, epThumb: r.ep_thumb, watchTime: r.watch_time, episodeDuration: r.episode_duration }));
    } catch { continueWatching = []; }
  }
  return c.json({
    success: true, source: 'hoshika', seasonal: [], top: [], upcoming: [],
    watchNow, continueWatching,
    message: 'Seasonal, top, and upcoming feeds are waiting for Hoshika-native listing endpoints.',
  }, 200, { 'Cache-Control': 'no-store' });
});

mobileContentRoutes.get('/api/mobile/watch-now', async (c) => {
  const { db } = await buildCtx(c);
  const perPage = 24;
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const offset = (page - 1) * perPage;
  const rows = await db.fetchAll<{ anime_id: number }>('SELECT DISTINCT anime_id FROM episode_videos WHERE is_active = 1 ORDER BY updated_at DESC LIMIT ? OFFSET ?', [perPage, offset]);
  const data = (await Promise.all(rows.map(async (row) => {
    const identity = await findIdentityByLegacyMalId(db, row.anime_id).catch(() => null);
    if (identity?.verified !== 1 || !identity.hoshika_short_id) return null;
    const anime = await getHoshikaAnimeById(identity.hoshika_short_id, c.env.HOSHIKA_API_KEY);
    if (!anime) return null;
    return { id: anime.shortId, shortId: anime.shortId, legacyId: row.anime_id, title: anime.title, image: anime.poster, score: anime.score, type: anime.type, episodes: anime.episodes ?? 0, source: 'hoshika' };
  }))).filter(Boolean);
  return c.json({ success: true, source: 'hoshika', data, page, totalPages: 1 }, 200, { 'Cache-Control': 'no-store' });
});

mobileContentRoutes.get('/api/mobile/history', async (c) => {
  const { db, auth, session } = await buildCtx(c); if (!auth.check()) return c.json({ success: false, message: 'Not logged in.' }, 401); const limit = 24; const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1); const offset = (page - 1) * limit; const userId = session.user_id!;
  const total = await db.count('SELECT COUNT(*) as cnt FROM watch_history WHERE user_id = ?', [userId]); const rows = await db.fetchAll<any>('SELECT anime_id, anime_title, anime_image, episode_num, ep_title, ep_thumb, watched_at, watch_time, episode_duration FROM watch_history WHERE user_id = ? ORDER BY watched_at DESC LIMIT ? OFFSET ?', [userId, limit, offset]);
  return c.json({ success: true, data: rows.map((r) => ({ animeId: r.anime_id, title: r.anime_title, image: r.anime_image, episodeNum: r.episode_num, epTitle: r.ep_title, epThumb: r.ep_thumb, watchedAt: r.watched_at, watchTime: r.watch_time, episodeDuration: r.episode_duration })), page, totalPages: total ? Math.ceil(total / limit) : 1 });
});

mobileContentRoutes.get('/api/mobile/announcements', async (c) => {
  const { db } = await buildCtx(c); const rows = await db.fetchAll<any>('SELECT * FROM announcements WHERE is_active=1 ORDER BY created_at DESC'); return c.json({ success: true, data: rows.map((a) => ({ id: a.id, title: a.title, content: a.content, imageUrl: a.image_url ?? null, createdAt: a.created_at })) });
});

mobileContentRoutes.get('/api/mobile/character/:id', async (c) => c.json({
  success: false, source: 'hoshika',
  message: 'Character catalogue is not available from the current Hoshika API.',
}, 501, { 'Cache-Control': 'no-store' }));

mobileContentRoutes.get('/api/mobile/anime/:id/characters', async (c) => c.json({
  success: false, source: 'hoshika',
  message: 'Anime character data is not available from the current Hoshika API.',
}, 501, { 'Cache-Control': 'no-store' }));

export { mobileContentRoutes as default };
