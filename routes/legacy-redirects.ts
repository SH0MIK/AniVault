// Backward-compatibility redirects for the old /pages/*.php URLs (and the
// bare /*.php form). Anything that was bookmarked, shared, or indexed by
// search engines under the old PHP-style paths gets 301'd to the new clean
// URL instead of 404ing. Mounted LAST in index.ts so real routes always win.
//
// NOTE: /pages/oauth_google.php and /pages/oauth_discord.php are NOT in this
// list on purpose -- those are registered as fixed redirect URIs in the
// Google Cloud Console / Discord Developer Portal, so they have to keep
// their exact original path or login will break. /pages/import_ajax.php is
// also excluded since it's only ever called from JS (fetch), never typed
// into a browser, so there's nothing to redirect.

import { Hono } from 'hono';
import type { Env } from '../index';

export const legacyRedirectRoutes = new Hono<{ Bindings: Env }>();

// simple 1:1 page renames
const SIMPLE_MAP: Record<string, string> = {
  '/pages/anime.php': '/anime',
  '/pages/character.php': '/character',
  '/pages/browse.php': '/browse',
  '/pages/search.php': '/search',
  '/pages/seasonal.php': '/seasonal',
  '/pages/top.php': '/top',
  '/pages/schedule.php': '/schedule',
  '/pages/watch.php': '/watch',
  '/pages/watch-now.php': '/watch-now',
  '/pages/favorites.php': '/favorites',
  '/pages/history.php': '/history',
  '/pages/mylist.php': '/mylist',
  '/pages/notifications.php': '/notifications',
  '/pages/announcements.php': '/announcements',
  '/pages/profile.php': '/profile',
  '/pages/importexport.php': '/importexport',
  '/pages/privacy.php': '/privacy',
  '/pages/terms.php': '/terms',
  '/pages/register.php': '/register',
  '/pages/login.php': '/login',
};

for (const [from, to] of Object.entries(SIMPLE_MAP)) {
  legacyRedirectRoutes.get(from, (c) => {
    const siteUrl = c.env.SITE_URL;
    const qs = c.req.query();
    const search = Object.keys(qs).length ? '?' + new URLSearchParams(qs).toString() : '';
    return c.redirect(`${siteUrl}${to}${search}`, 301);
  });
  // also catch the mylist-style POST forms if any old form still targets the .php path
  legacyRedirectRoutes.post(from, (c) => {
    const siteUrl = c.env.SITE_URL;
    return c.redirect(`${siteUrl}${to}`, 307);
  });
}

// /pages/user.php?u=NAME -> /u/NAME
legacyRedirectRoutes.get('/pages/user.php', (c) => {
  const siteUrl = c.env.SITE_URL;
  const username = (c.req.query('u') ?? '').trim();
  if (!username) return c.redirect(`${siteUrl}/`, 301);
  const rest = { ...c.req.query() };
  delete rest.u;
  const search = Object.keys(rest).length ? '?' + new URLSearchParams(rest).toString() : '';
  return c.redirect(`${siteUrl}/u/${encodeURIComponent(username)}${search}`, 301);
});
