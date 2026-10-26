// Character details are intentionally unavailable until Hoshika exposes a
// confirmed public character endpoint. Do not fall back to Jikan/MAL.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { Notification } from '../lib/notification';
import { h } from '../lib/helpers';
import { renderHeader, renderFooter, CurrentUser } from '../render/layout';
import { getBannerData } from '../lib/settings';

export const characterRoutes = new Hono<{ Bindings: Env }>();

characterRoutes.get('/character', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  const siteUrl = c.env.SITE_URL;
  const charId = parseInt(c.req.query('id') ?? '0', 10) || 0;
  if (!charId) return c.redirect(siteUrl + '/');

  const currentUser = auth.check() ? await auth.getCurrentUser() : null;
  const unreadCount = currentUser ? await Notification.unreadCount(db, currentUser.id) : 0;
  const layoutUser: CurrentUser | null = currentUser
    ? { id: currentUser.id, username: currentUser.username, avatar_url: currentUser.avatar_url, role: currentUser.role }
    : null;
  const banner = await getBannerData(db);
  let html = renderHeader({
    ...banner, siteUrl, siteName: c.env.SITE_NAME,
    pageTitle: 'Character data unavailable', currentPage: 'character',
    currentUser: layoutUser, unreadCount, requestUrl: c.req.url,
    ogData: {
      title: 'Character data unavailable | AniVault',
      description: 'Character details are not available from the confirmed Hoshika catalog API yet.',
      url: c.req.url, type: 'website',
    },
  });
  html += `
<div class="container section" style="max-width:760px;margin:4rem auto;text-align:center;">
  <h1 style="font-size:1.5rem;margin-bottom:1rem;">Character data isn't available yet</h1>
  <p class="text-muted" style="line-height:1.7;margin-bottom:1.5rem;">
    AniVault is switching its anime catalog to Hoshika. The currently confirmed public Hoshika API
    doesn't provide character profiles, voice actors, or character pictures, so this page won't
    substitute data from MAL/Jikan.
  </p>
  <a class="btn btn-primary" href="${h(siteUrl)}/browse">Search anime</a>
</div>`;
  html += renderFooter({ siteUrl, currentUser: layoutUser });
  await session.save(c, lifetime);
  return c.html(html);
});
