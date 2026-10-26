import { Hono } from 'hono';
import type { Env } from '../index';
import { searchHoshikaAnime, getHoshikaSeason } from '../lib/hoshika-api';

export const mobileDiscoverRoutes = new Hono<{ Bindings: Env }>();

// Seasonal data comes from Hoshika's native season endpoint. Top rankings remain
// unavailable and never fall back to MAL/Jikan/AniList.
function unavailable(c: any, view: string) {
  return c.json({
    success: true,
    source: 'hoshika',
    view,
    data: [],
    pagination: { current_page: 1, last_visible_page: 1 },
    message: 'This catalogue view is awaiting a Hoshika-native endpoint. Use title search in the meantime.',
  }, 200, { 'Cache-Control': 'no-store' });
}

mobileDiscoverRoutes.get('/api/mobile/seasonal', async (c) => {
  const q = (c.req.query('q') ?? '').trim().toLowerCase();
  const feed = await getHoshikaSeason(c.env.HOSHIKA_API_KEY);
  const items = q ? feed.items.filter((a) => [a.title, a.titleEnglish, a.titleRomaji, a.slug].some((value) => value.toLowerCase().includes(q))) : feed.items;
  return c.json({
    success: true, source: 'hoshika', season: feed.season, year: feed.year,
    data: items.map((a) => ({
      id: a.shortId, shortId: a.shortId, slug: a.slug, title: a.title,
      image: a.poster, cover: a.cover, score: a.score, type: a.type,
      episodes: a.episodes ?? 0, status: a.status, year: a.year, genres: a.genres,
    })),
    pagination: { current_page: 1, last_visible_page: 1, has_next_page: false },
  }, 200, { 'Cache-Control': 'public, max-age=300, s-maxage=300' });
});
mobileDiscoverRoutes.get('/api/mobile/top', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (!q) return unavailable(c, 'top');
  const data = await searchHoshikaAnime(q, 50, c.env.HOSHIKA_API_KEY);
  return c.json({
    success: true, source: 'hoshika', filter: c.req.query('filter') ?? 'bypopularity',
    data: data.map((a) => ({
      id: a.shortId, shortId: a.shortId, title: a.title, image: a.poster,
      score: a.score, type: a.type, episodes: a.episodes ?? 0,
      status: a.status, year: a.year, genres: a.genres,
    })),
    pagination: { current_page: 1, last_visible_page: 1, has_next_page: false },
  }, 200, { 'Cache-Control': 'no-store' });
});

mobileDiscoverRoutes.get('/api/mobile/schedule', async (c) => {
  const url = new URL('https://hoshika.app/api/v1/schedule');
  const year = Number.parseInt(c.req.query('year') ?? '', 10);
  const week = Number.parseInt(c.req.query('week') ?? '', 10);
  if (Number.isInteger(year) && year >= 1900 && year <= 2200) url.searchParams.set('year', String(year));
  if (Number.isInteger(week) && week >= 1 && week <= 53) url.searchParams.set('week', String(week));
  try {
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json', ...(c.env.HOSHIKA_API_KEY ? { 'X-Hoshika-Key': c.env.HOSHIKA_API_KEY } : {}) } });
    if (!response.ok) {
      return c.json({ success: false, source: 'hoshika', view: 'schedule', message: 'Hoshika schedule is temporarily unavailable.', data: [] }, 502, { 'Cache-Control': 'no-store' });
    }
    const payload: any = await response.json();
    if (payload?.ok === false) {
      return c.json({ success: false, source: 'hoshika', view: 'schedule', message: 'Hoshika could not return the schedule.', data: [] }, 502, { 'Cache-Control': 'no-store' });
    }
    return c.json({
      success: true,
      source: 'hoshika',
      view: 'schedule',
      week: payload?.week ?? null,
      data: Array.isArray(payload?.items) ? payload.items : [],
    }, 200, { 'Cache-Control': 'public, max-age=300, s-maxage=300' });
  } catch (error) {
    console.warn('[mobile-schedule] Hoshika request failed:', String(error));
    return c.json({ success: false, source: 'hoshika', view: 'schedule', message: 'Hoshika schedule is temporarily unavailable.', data: [] }, 502, { 'Cache-Control': 'no-store' });
  }
});

export default mobileDiscoverRoutes;
