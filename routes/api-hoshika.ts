import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { findIdentityByHoshikaId, findIdentityByLegacyMalId } from '../lib/anime-identity';
import {
  getHoshikaAnimeById,
  getHoshikaAnimeEpisodesById,
  searchHoshikaAnime,
} from '../lib/hoshika-api';

export const hoshikaApiRoutes = new Hono<{ Bindings: Env }>();

// Migration endpoints intentionally proxy only Hoshika. They do not consult
// KV, legacy MAL/Jikan endpoints, or old catalog caches.
hoshikaApiRoutes.get('/api/hoshika/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (!q) return c.json({ ok: true, data: [], total: 0 }, 200, { 'Cache-Control': 'no-store' });
  const requestedLimit = Number.parseInt(c.req.query('limit') ?? '20', 10);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(50, requestedLimit)) : 20;
  const data = await searchHoshikaAnime(q, limit, c.env.HOSHIKA_API_KEY);
  return c.json({ ok: true, data, total: data.length, source: 'hoshika' }, 200, { 'Cache-Control': 'no-store' });
});

hoshikaApiRoutes.get('/api/hoshika/anime/:id/episodes', async (c) => {
  const id = (c.req.param('id') ?? '').trim();
  if (!id) return c.json({ ok: false, error: 'Missing Hoshika anime ID.' }, 400, { 'Cache-Control': 'no-store' });
  const data = await getHoshikaAnimeEpisodesById(id, c.env.HOSHIKA_API_KEY);
  if (!data) return c.json({ ok: false, error: 'Hoshika episodes unavailable.', source: 'hoshika' }, 502, { 'Cache-Control': 'no-store' });
  return c.json({ ok: true, data, total: data.length, source: 'hoshika' }, 200, { 'Cache-Control': 'no-store' });
});

hoshikaApiRoutes.get('/api/hoshika/anime/:id', async (c) => {
  const id = (c.req.param('id') ?? '').trim();
  if (!id) return c.json({ ok: false, error: 'Missing Hoshika anime ID.' }, 400);
  const anime = await getHoshikaAnimeById(id, c.env.HOSHIKA_API_KEY);
  if (!anime) return c.json({ ok: false, error: 'Hoshika anime not found.', source: 'hoshika' }, 404, { 'Cache-Control': 'no-store' });
  return c.json({ ok: true, data: anime, source: 'hoshika' }, 200, { 'Cache-Control': 'no-store' });
});

// Legacy-ID bridge is read-only and returns a Hoshika ID only for verified
// mappings. Numeric IDs are never treated as interchangeable across systems.
hoshikaApiRoutes.get('/api/hoshika/identity-by-legacy/:id', async (c) => {
  const id = Number.parseInt(c.req.param('id') ?? '', 10);
  if (!Number.isSafeInteger(id) || id <= 0) return c.json({ ok: false, error: 'Invalid legacy anime ID.' }, 400, { 'Cache-Control': 'no-store' });
  const identity = await findIdentityByLegacyMalId(new Db(c.env.DB), id).catch(() => null);
  if (!identity || identity.verified !== 1 || !identity.hoshika_short_id) {
    return c.json({ ok: false, mapped: false, source: 'hoshika' }, 404, { 'Cache-Control': 'no-store' });
  }
  return c.json({ ok: true, mapped: true, data: { shortId: identity.hoshika_short_id, title: identity.title }, source: 'hoshika' }, 200, { 'Cache-Control': 'no-store' });
});

hoshikaApiRoutes.get('/api/hoshika/identity/:id', async (c) => {
  const id = (c.req.param('id') ?? '').trim();
  if (!id) return c.json({ ok: false, error: 'Missing Hoshika anime ID.' }, 400, { 'Cache-Control': 'no-store' });
  const identity = await findIdentityByHoshikaId(new Db(c.env.DB), id).catch(() => null);
  if (!identity) return c.json({ ok: true, mapped: false, source: 'hoshika' }, 200, { 'Cache-Control': 'no-store' });
  return c.json({ ok: true, mapped: identity.verified === 1 && identity.legacy_mal_id !== null, data: identity.verified === 1 && identity.legacy_mal_id !== null ? { legacyMalId: identity.legacy_mal_id } : null, source: 'hoshika' }, 200, { 'Cache-Control': 'no-store' });
});
