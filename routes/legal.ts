// Ports pages/privacy.php + pages/terms.php -- static legal content pages.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { Notification } from '../lib/notification';
import { getBannerData } from '../lib/settings';
import { renderHeader, renderFooter, CurrentUser } from '../render/layout';
import { privacyBody } from '../render/privacy-body';
import { termsBody } from '../render/terms-body';

export const legalRoutes = new Hono<{ Bindings: Env }>();

async function commonLayoutData(c: any) {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  const currentUser = auth.check() ? await auth.getCurrentUser() : null;
  const unreadCount = currentUser ? await Notification.unreadCount(db, currentUser.id) : 0;
  const layoutUser: CurrentUser | null = currentUser
    ? { id: currentUser.id, username: currentUser.username, avatar_url: currentUser.avatar_url, role: currentUser.role }
    : null;
  return { db, session, lifetime, layoutUser, unreadCount };
}

const lastUpdated = () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

legalRoutes.get('/privacy', async (c) => {
  const siteUrl = c.env.SITE_URL;
  const { db, session, lifetime, layoutUser, unreadCount } = await commonLayoutData(c);
  const __banner = await getBannerData(db);
  let html = renderHeader({ ...__banner, siteUrl, siteName: c.env.SITE_NAME, pageTitle: 'Privacy Policy', currentPage: 'privacy', currentUser: layoutUser, unreadCount, requestUrl: c.req.url });
  html += privacyBody(siteUrl, lastUpdated());
  html += renderFooter({ siteUrl, currentUser: layoutUser });
  await session.save(c, lifetime);
  return c.html(html);
});

legalRoutes.get('/terms', async (c) => {
  const siteUrl = c.env.SITE_URL;
  const { db, session, lifetime, layoutUser, unreadCount } = await commonLayoutData(c);
  const __banner = await getBannerData(db);
  let html = renderHeader({ ...__banner, siteUrl, siteName: c.env.SITE_NAME, pageTitle: 'Terms of Use', currentPage: 'terms', currentUser: layoutUser, unreadCount, requestUrl: c.req.url });
  html += termsBody(siteUrl, lastUpdated());
  html += renderFooter({ siteUrl, currentUser: layoutUser });
  await session.save(c, lifetime);
  return c.html(html);
});
