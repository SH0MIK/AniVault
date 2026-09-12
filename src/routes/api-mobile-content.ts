import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { MalAPI } from '../lib/mal-api';
import { buildCardMetaMap } from '../lib/anime-card';
import { getUserAnimeStatuses } from '../lib/user-list';
import { DubStatus } from '../lib/dub-status';
import { EpisodeAir } from '../lib/episode-air';

export const mobileContentRoutes = new Hono<{ Bindings: Env }>();

async function buildCtx(c: any) {
  const db = new Db(c.env.DB); const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  const mal = new MalAPI(c.env as any, c.env.API_CACHE, db); return { db, session, auth, mal };
}

mobileContentRoutes.get('/api/mobile/browse', async (c) => {
  const { db, auth, mal } = await buildCtx(c); const q = (c.req.query('q') ?? '').trim(); const status = c.req.query('status') ?? ''; const type = c.req.query('type') ?? '';
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const genres = c.req.queries('genres[]')?.map((g) => parseInt(g, 10)).filter((n) => !Number.isNaN(n)) ?? [];
  let result: { data: any[]; pagination: any };
  if (q) result = await mal.searchAnime(q, page, type, status); else if (genres.length > 0) result = await mal.getAnimeByGenres(genres, page); else result = await mal.getTopAnime('bypopularity', page);
  const items = result.data ?? []; const cardMeta = await buildCardMetaMap(db, items); const currentUser = auth.check() ? await auth.getCurrentUser() : null; const userStatuses = currentUser ? await getUserAnimeStatuses(db, currentUser.id) : {};
  const data = items.map((a: any) => ({ id: a.mal_id, title: a.title_english && a.title_english !== a.title ? a.title_english : a.title, image: a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url ?? '', score: a.score ?? null, type: a.type ?? '', episodes: a.episodes ?? 0, airedInfo: cardMeta.get(a.mal_id)?.airedInfo ?? null, dubbedLangs: cardMeta.get(a.mal_id)?.dubbedLangs ?? [], userStatus: userStatuses[a.mal_id] ?? null }));
  return c.json({ data, pagination: result.pagination ?? {}, genres: mal.getAnimeGenres().data });
});

mobileContentRoutes.get('/api/mobile/anime/:id', async (c) => {
  const { db, auth, mal } = await buildCtx(c); const id = parseInt(c.req.param('id'), 10) || 0; if (!id) return c.json({ success: false, message: 'Invalid anime id.' }, 400);
  const result = await mal.getAnime(id); const anime = result.data; if (!anime) return c.json({ success: false, message: 'Anime not found.' }, 404);
  const isAiring = anime.status === 'Currently Airing'; let airedInfo = null; if (isAiring) ({ info: airedInfo } = await EpisodeAir.getCachedAny(db, id));
  const totalEps = isAiring ? (airedInfo?.total ?? anime.episodes ?? 0) : (anime.episodes ?? 0); const airedSoFar = isAiring ? (airedInfo?.aired ?? null) : null; const dubbedLangs = (await DubStatus.getForMany(db, [id])).get(id) ?? [];
  const currentUser = auth.check() ? await auth.getCurrentUser() : null; let userEntry = null; let isFavorite = false;
  if (currentUser) { const { AnimeTracker } = await import('../lib/tracker'); userEntry = await AnimeTracker.getUserEntry(db, currentUser.id, id); isFavorite = await AnimeTracker.isFavorite(db, currentUser.id, id); }
  const seriesEntries = (anime.related_anime ?? []).filter((rel: any) => rel).map((rel: any) => ({ id: rel?.entry?.mal_id ?? 0, title: rel?.entry?.title ?? '', type: rel?.relation_type_formatted ?? '' }));
  return c.json({ success: true, anime: { id: anime.mal_id, title: anime.title_english && anime.title_english !== anime.title ? anime.title_english : anime.title, titleJapanese: anime.title_japanese ?? null, image: anime.images?.jpg?.large_image_url ?? '', synopsis: anime.synopsis ?? '', score: anime.score ?? null, status: anime.status ?? '', type: anime.type ?? '', genres: (anime.genres ?? []).map((g: any) => ({ id: g.mal_id, name: g.name })), totalEpisodes: totalEps, airedSoFar, isAiring, dubbedLangs, related: seriesEntries }, userEntry, isFavorite });
});

mobileContentRoutes.get('/api/mobile/anime/:id/episodes', async (c) => {
  const { mal } = await buildCtx(c); const id = parseInt(c.req.param('id'), 10) || 0; const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1); if (!id) return c.json({ success: false, message: 'Invalid anime id.' }, 400);
  const result = await mal.getAnimeEpisodes(id, page); return c.json({ success: true, data: result.data ?? [], pagination: result.pagination ?? {} });
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
  const { db, auth, mal } = await buildCtx(c); const [seasonal, topAnime, upcoming] = await Promise.all([mal.getAniListSeasonNow(), mal.getTopAnime('bypopularity', 1), mal.getSeasonUpcoming()]);
  const toCard = (a: any) => ({ id: a.mal_id, title: a.title_english && a.title_english !== a.title ? a.title_english : a.title, image: a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url ?? '', score: a.score ?? null, type: a.type ?? '', episodes: a.episodes ?? 0 });
  let watchNowList: any[] = []; try { const rows = await db.fetchAll<{ anime_id: number }>('SELECT DISTINCT anime_id FROM episode_videos WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 12'); const results = await Promise.all(rows.map((r) => mal.getAnime(r.anime_id, true))); watchNowList = results.map((r) => r.data).filter(Boolean).map(toCard); } catch { watchNowList = []; }
  const currentUser = auth.check() ? await auth.getCurrentUser() : null; let continueWatching: any[] = [];
  if (currentUser) { try { const rows = await db.fetchAll<any>('SELECT anime_id, anime_title, anime_image, episode_num, ep_title, ep_thumb, watched_at, watch_time, episode_duration FROM watch_history WHERE user_id = ? ORDER BY watched_at DESC LIMIT 8', [currentUser.id]); continueWatching = rows.map((r) => ({ animeId: r.anime_id, title: r.anime_title, image: r.anime_image, episodeNum: r.episode_num, epTitle: r.ep_title, epThumb: r.ep_thumb, watchTime: r.watch_time, episodeDuration: r.episode_duration })); } catch { continueWatching = []; } }
  return c.json({ success: true, seasonal: (seasonal.data ?? []).slice(0, 12).map(toCard), top: (topAnime.data ?? []).slice(0, 12).map(toCard), upcoming: (upcoming.data ?? []).slice(0, 8).map(toCard), watchNow: watchNowList, continueWatching });
});

mobileContentRoutes.get('/api/mobile/watch-now', async (c) => {
  const { db, mal } = await buildCtx(c); const perPage = 24; const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1); const offset = (page - 1) * perPage;
  const total = await db.count('SELECT COUNT(DISTINCT anime_id) as cnt FROM episode_videos WHERE is_active = 1'); const rows = await db.fetchAll<{ anime_id: number }>('SELECT DISTINCT anime_id FROM episode_videos WHERE is_active = 1 ORDER BY updated_at DESC LIMIT ? OFFSET ?', [perPage, offset]); const results = await Promise.all(rows.map((r) => mal.getAnime(r.anime_id, true))); const animeList = results.map((r) => r.data).filter(Boolean) as any[];
  return c.json({ success: true, data: animeList.map((a) => ({ id: a.mal_id, title: a.title_english && a.title_english !== a.title ? a.title_english : a.title, image: a.images?.jpg?.large_image_url ?? '', score: a.score ?? null, type: a.type ?? '', episodes: a.episodes ?? 0 })), page, totalPages: total > 0 ? Math.ceil(total / perPage) : 1 });
});

mobileContentRoutes.get('/api/mobile/history', async (c) => {
  const { db, auth, session } = await buildCtx(c); if (!auth.check()) return c.json({ success: false, message: 'Not logged in.' }, 401); const limit = 24; const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1); const offset = (page - 1) * limit; const userId = session.user_id!;
  const total = await db.count('SELECT COUNT(*) as cnt FROM watch_history WHERE user_id = ?', [userId]); const rows = await db.fetchAll<any>('SELECT anime_id, anime_title, anime_image, episode_num, ep_title, ep_thumb, watched_at, watch_time, episode_duration FROM watch_history WHERE user_id = ? ORDER BY watched_at DESC LIMIT ? OFFSET ?', [userId, limit, offset]);
  return c.json({ success: true, data: rows.map((r) => ({ animeId: r.anime_id, title: r.anime_title, image: r.anime_image, episodeNum: r.episode_num, epTitle: r.ep_title, epThumb: r.ep_thumb, watchedAt: r.watched_at, watchTime: r.watch_time, episodeDuration: r.episode_duration })), page, totalPages: total ? Math.ceil(total / limit) : 1 });
});

mobileContentRoutes.get('/api/mobile/announcements', async (c) => {
  const { db } = await buildCtx(c); const rows = await db.fetchAll<any>('SELECT * FROM announcements WHERE is_active=1 ORDER BY created_at DESC'); return c.json({ success: true, data: rows.map((a) => ({ id: a.id, title: a.title, content: a.content, imageUrl: a.image_url ?? null, createdAt: a.created_at })) });
});

mobileContentRoutes.get('/api/mobile/character/:id', async (c) => {
  const { mal } = await buildCtx(c); const charId = parseInt(c.req.param('id'), 10) || 0; if (!charId) return c.json({ success: false, message: 'Invalid character id.' }, 400);
  const { character: charData, animeography: charAnimeData, voices: charVoicesData } = await mal.getCharacterFull(charId); const char = charData?.data; if (!char) return c.json({ success: false, message: 'Character not found.' }, 404);
  return c.json({ success: true, character: { id: charId, name: char.name ?? 'Unknown Character', nameKanji: char.name_kanji ?? null, nicknames: char.nicknames ?? [], about: char.about ?? null, favorites: char.favorites ?? 0, image: char.images?.jpg?.image_url ?? '' }, animeography: (charAnimeData?.data ?? []).slice(0, 12).map((a: any) => ({ animeId: a.anime?.mal_id, title: a.anime?.title, image: a.anime?.images?.jpg?.image_url, role: a.role })), voices: (charVoicesData?.data ?? []).map((v: any) => ({ name: v.person?.name, image: v.person?.image_url, language: v.language })) });
});

mobileContentRoutes.get('/api/mobile/anime/:id/characters', async (c) => {
  const { mal } = await buildCtx(c); const id = parseInt(c.req.param('id'), 10) || 0; if (!id) return c.json({ success: false, message: 'Invalid anime id.' }, 400); const result = await mal.getAnimeCharacters(id); const data = (result?.data ?? []).slice(0, 20).map((r: any) => ({ id: r.character?.mal_id, name: r.character?.name, image: r.character?.images?.jpg?.image_url, role: r.role })); return c.json({ success: true, data });
});

export { mobileContentRoutes as default };
