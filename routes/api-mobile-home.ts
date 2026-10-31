import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { getHoshikaAnimeById, getHoshikaSeason } from '../lib/hoshika-api';
import { findIdentityByLegacyMalId } from '../lib/anime-identity';
import { getUserAnimeStatuses } from '../lib/user-list';

export const mobileHomeRoutes = new Hono<{ Bindings: Env }>();

async function buildCtx(c: any) {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  return { db, session, auth };
}

function toCard(a: any, userStatus: string | null) {
  return {
    id: a.id,
    title: a.title,
    image: a.image || '',
    score: a.score ?? null,
    type: a.type ?? '',
    episodes: a.episodes ?? 0,
    airedInfo: null,
    dubbedLangs: [],
    userStatus,
  };
}

async function hoshikaForLegacyId(db: Db, legacyId: number, apiKey?: string) {
  const identity = await findIdentityByLegacyMalId(db, legacyId).catch(() => null);
  if (!identity || identity.verified !== 1 || !identity.hoshika_short_id) return null;
  const anime = await getHoshikaAnimeById(identity.hoshika_short_id, apiKey);
  if (!anime) return null;
  return {
    id: legacyId,
    shortId: anime.shortId,
    title: anime.titleEnglish && anime.titleEnglish !== anime.title ? anime.titleEnglish : anime.title,
    image: anime.poster || '',
    banner: anime.cover || '',
    synopsis: anime.synopsis || '',
    score: anime.score,
    type: anime.type,
    episodes: anime.episodes ?? 0,
    genres: anime.genres.slice(0, 3),
  };
}

mobileHomeRoutes.get('/api/mobile/home-v2', async (c) => {
  const { db, auth } = await buildCtx(c);
  const currentUser = auth.check() ? await auth.getCurrentUser() : null;
  const userStatuses = currentUser ? await getUserAnimeStatuses(db, currentUser.id) : {};

  // Seasonal cards use Hoshika's dedicated season feed; other listing sections
  // remain empty until Hoshika provides native endpoints for them.
  const seasonFeed = await getHoshikaSeason(c.env.HOSHIKA_API_KEY);
  const seasonal: any[] = seasonFeed.items.map((a) => ({
    id: a.shortId, shortId: a.shortId, title: a.title, image: a.poster,
    score: a.score, type: a.type, episodes: a.episodes ?? 0,
    status: a.status, year: a.year, source: 'hoshika',
  }));
  const topAnime: any[] = [];
  const upcoming: any[] = [];

  let watchNowList: any[] = [];
  try {
    const rows = await db.fetchAll<{ anime_id: number }>(
      'SELECT anime_id, MAX(updated_at) AS updated_at FROM episode_videos WHERE is_active = 1 GROUP BY anime_id ORDER BY MAX(updated_at) DESC LIMIT 12'
    );
    const resolved = await Promise.all(rows.map((row) => hoshikaForLegacyId(db, Number(row.anime_id), c.env.HOSHIKA_API_KEY)));
    watchNowList = resolved.filter(Boolean) as any[];
  } catch {
    watchNowList = [];
  }

  let continueWatching: any[] = [];
  if (currentUser) {
    try {
      const rows = await db.fetchAll<any>(
        'SELECT anime_id, anime_title, anime_image, episode_num, ep_title, ep_thumb, watched_at, watch_time, episode_duration FROM watch_history WHERE user_id = ? ORDER BY watched_at DESC LIMIT 8',
        [currentUser.id]
      );
      continueWatching = rows.map((r) => ({
        animeId: r.anime_id,
        title: r.anime_title,
        image: r.anime_image,
        episodeNum: r.episode_num,
        epTitle: r.ep_title,
        epThumb: r.ep_thumb,
        watchTime: r.watch_time,
        episodeDuration: r.episode_duration,
      }));
    } catch {
      continueWatching = [];
    }
  }

  const hero: any[] = [];
  try {
    const curatedRows = await db.fetchAll<any>(
      'SELECT anime_id, banner_image_url, logo_image_url FROM home_hero_banners ORDER BY display_order ASC LIMIT 8'
    );
    const curated = await Promise.all(curatedRows.map((row) => hoshikaForLegacyId(db, Number(row.anime_id), c.env.HOSHIKA_API_KEY)));
    for (let i = 0; i < curatedRows.length; i++) {
      const anime = curated[i];
      if (!anime) continue;
      hero.push({
        id: anime.id,
        title: anime.title,
        image: anime.image,
        banner: curatedRows[i].banner_image_url || anime.banner,
        logo: '',
        synopsis: anime.synopsis,
        score: anime.score,
        type: anime.type,
        episodes: anime.episodes,
        genres: anime.genres,
      });
    }
  } catch {
    // Curated hero slides are optional; no legacy catalog fallback.
  }

  return c.json({
    success: true,
    hero,
    genres: [],
    catalogMessage: 'Seasonal anime is provided by Hoshika; other catalogue listing feeds are not available yet.',
    seasonal: seasonal.map((a: any) => toCard(a, userStatuses[a.id] ?? null)),
    top: topAnime.map((a: any) => toCard(a, userStatuses[a.id] ?? null)),
    upcoming: upcoming.map((a: any) => toCard(a, userStatuses[a.id] ?? null)),
    watchNow: watchNowList.map((a: any) => toCard(a, userStatuses[a.id] ?? null)),
    continueWatching,
  });
});
