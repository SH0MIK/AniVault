import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { MalAPI, NormalisedAnime } from '../lib/mal-api';
import { buildCardMetaMap } from '../lib/anime-card';
import { getUserAnimeStatuses } from '../lib/user-list';

export const mobileDiscoverRoutes = new Hono<{ Bindings: Env }>();

async function ctx(c: any) {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  const mal = new MalAPI(c.env as any, c.env.API_CACHE, db);
  const currentUser = auth.check() ? await auth.getCurrentUser() : null;
  const userStatuses = currentUser ? await getUserAnimeStatuses(db, currentUser.id) : {};
  return { db, mal, userStatuses };
}

function card(a: any, userStatus: string | null = null) {
  return {
    id: a.mal_id,
    title: a.title_english && a.title_english !== a.title ? a.title_english : a.title,
    image: a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url ?? '',
    score: a.score ?? null,
    type: a.type ?? '',
    episodes: a.episodes ?? 0,
    status: a.status ?? '',
    rank: a.rank ?? null,
    members: a.members ?? 0,
    userStatus,
  };
}

mobileDiscoverRoutes.get('/api/mobile/seasonal', async (c) => {
  const { mal, userStatuses, db } = await ctx(c);
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const season = c.req.query('season') === 'upcoming' ? 'upcoming' : 'now';
  const result = season === 'upcoming' ? await mal.getSeasonUpcoming() : await mal.getSeasonNow(page);
  const items = result.data ?? [];
  const meta = await buildCardMetaMap(db, items);
  return c.json({
    success: true,
    season,
    seasonName: mal.currentSeasonPublic(),
    year: new Date().getUTCFullYear(),
    data: items.map((a: NormalisedAnime) => ({ ...card(a, userStatuses[a.mal_id] ?? null), airedInfo: meta.get(a.mal_id)?.airedInfo ?? null, dubbedLangs: meta.get(a.mal_id)?.dubbedLangs ?? [] })),
    pagination: result.pagination ?? {},
  });
});

const TOP_FILTERS = new Set(['bypopularity', 'favorite', 'airing', 'upcoming', 'byrank']);
mobileDiscoverRoutes.get('/api/mobile/top', async (c) => {
  const { mal, userStatuses, db } = await ctx(c);
  const filter = TOP_FILTERS.has(c.req.query('filter') ?? '') ? c.req.query('filter')! : 'bypopularity';
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const result = await mal.getTopAnime(filter, page);
  const items = result.data ?? [];
  const meta = await buildCardMetaMap(db, items);
  return c.json({
    success: true,
    filter,
    data: items.map((a: NormalisedAnime, i: number) => ({ ...card(a, userStatuses[a.mal_id] ?? null), rank: a.rank ?? ((page - 1) * 25 + i + 1), airedInfo: meta.get(a.mal_id)?.airedInfo ?? null, dubbedLangs: meta.get(a.mal_id)?.dubbedLangs ?? [] })),
    pagination: result.pagination ?? {},
  });
});

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
mobileDiscoverRoutes.get('/api/mobile/schedule', async (c) => {
  const { mal, userStatuses, db } = await ctx(c);
  const todayIdx = new Date().getUTCDay();
  const today = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][todayIdx];
  const requested = (c.req.query('day') ?? today).toLowerCase();
  const day = DAYS.includes(requested) ? requested : today;
  const result = await mal.getSchedule(day);
  const items = result.data ?? [];
  const meta = await buildCardMetaMap(db, items);
  return c.json({
    success: true,
    day,
    data: items.map((a: NormalisedAnime) => ({
      ...card(a, userStatuses[a.mal_id] ?? null),
      broadcast: a.broadcast ?? { day: null, time: null },
      airedInfo: meta.get(a.mal_id)?.airedInfo ?? null,
      dubbedLangs: meta.get(a.mal_id)?.dubbedLangs ?? [],
    })),
  });
});

export default mobileDiscoverRoutes;
