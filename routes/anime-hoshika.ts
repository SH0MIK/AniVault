import { Hono } from 'hono';
import type { Env } from '../index';

export const hoshikaAnimeRoutes = new Hono<{ Bindings: Env }>();

// Keep old beta links working, but render only the original /anime detail template.
hoshikaAnimeRoutes.get('/anime/hoshika', (c) => {
  const id = (c.req.query('id') ?? '').trim();
  if (!id) return c.redirect((c.env.SITE_URL || '') + '/browse');
  return c.redirect((c.env.SITE_URL || '') + '/anime?id=' + encodeURIComponent(id), 302);
});
