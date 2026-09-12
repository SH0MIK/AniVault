// Mobile app auth. Deliberately thin: all the real logic (password checks,
// bcrypt, auto-registration, OAuth) already lives in lib/auth.ts and is
// shared with the website's /api/auth_ajax.php. The only thing that differs
// for the app is the transport — no cookie jar, so the session id (our
// existing D1-backed session token) goes back as JSON instead, and the app
// sends it as `Authorization: Bearer <token>` on every request after that.
import { Hono } from 'hono';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import type { Env } from '../index';

export const mobileAuthRoutes = new Hono<{ Bindings: Env }>();

function clientIp(c: any): string { return c.req.header('cf-connecting-ip') ?? 'unknown'; }
function lifetime(c: any): number { return Number(c.env.MOBILE_SESSION_LIFETIME_SECONDS ?? 60 * 60 * 24 * 30); }
async function currentUser(db: Db, userId: number) {
  return db.fetchOne('SELECT id, uid, username, email, avatar_url, bio, role FROM users WHERE id = ?', [userId]);
}

mobileAuthRoutes.post('/api/mobile/login', async (c) => {
  const db = new Db(c.env.DB); const session = await Session.load(c, db, lifetime(c));
  const auth = new Auth(db, session, c.env as any, clientIp(c));
  const body = await c.req.json().catch(() => ({}));
  const username = String(body.username ?? '').trim(); const password = String(body.password ?? '');
  if (!username || !password) return c.json({ success: false, message: 'Username and password are required.' }, 400);
  const result = await auth.login(username, password);
  if (!result.success) return c.json(result, 401);
  await session.persist(lifetime(c));
  const user = await currentUser(db, session.user_id!);
  return c.json({ success: true, token: session.id, expiresIn: lifetime(c), user });
});

mobileAuthRoutes.post('/api/mobile/register', async (c) => {
  const db = new Db(c.env.DB); const session = await Session.load(c, db, lifetime(c));
  const auth = new Auth(db, session, c.env as any, clientIp(c));
  const body = await c.req.json().catch(() => ({}));
  const username = String(body.username ?? '').trim(); const email = String(body.email ?? '').trim(); const password = String(body.password ?? '');
  const result = await auth.register(username, email, password);
  if (!result.success) return c.json(result, 400);
  await session.persist(lifetime(c));
  const user = await currentUser(db, session.user_id!);
  return c.json({ success: true, token: session.id, expiresIn: lifetime(c), user });
});

mobileAuthRoutes.get('/api/mobile/me', async (c) => {
  const db = new Db(c.env.DB); const session = await Session.load(c, db, lifetime(c));
  const auth = new Auth(db, session, c.env as any, clientIp(c));
  if (!auth.check()) return c.json({ success: false, message: 'Not logged in.' }, 401);
  const user = await currentUser(db, session.user_id!);
  return c.json({ success: true, user });
});

mobileAuthRoutes.post('/api/mobile/logout', async (c) => {
  const db = new Db(c.env.DB); const session = await Session.load(c, db, lifetime(c));
  await db.query('DELETE FROM sessions WHERE id = ?', [session.id]);
  return c.json({ success: true });
});

mobileAuthRoutes.get('/mobile-handoff', async (c) => {
  const db = new Db(c.env.DB); const token = c.req.query('token') ?? ''; const redirect = c.req.query('redirect') ?? '/'; const siteUrl = c.env.SITE_URL;
  if (!token) return c.redirect(siteUrl + '/login');
  const row = await db.fetchOne<{ id: string; expires_at: number }>('SELECT id, expires_at FROM sessions WHERE id = ?', [token]);
  if (!row || row.expires_at <= Math.floor(Date.now() / 1000)) return c.redirect(siteUrl + '/login');
  const { setCookie } = await import('hono/cookie');
  setCookie(c, 'av_session', row.id, { path: '/', httpOnly: true, secure: true, sameSite: 'Lax', maxAge: row.expires_at - Math.floor(Date.now() / 1000) });
  return c.redirect(`${siteUrl}${redirect}`);
});

mobileAuthRoutes.post('/api/mobile/push-token', async (c) => {
  const db = new Db(c.env.DB); const session = await Session.load(c, db, lifetime(c));
  const auth = new Auth(db, session, c.env as any, clientIp(c));
  if (!auth.check()) return c.json({ success: false, message: 'Not logged in.' }, 401);
  const body = await c.req.json().catch(() => ({})); const token = String(body.token ?? '').trim(); const platform = String(body.platform ?? '').trim();
  if (!token) return c.json({ success: false, message: 'Token is required.' }, 400);
  try {
    await db.query('INSERT INTO push_tokens (user_id, token, platform) VALUES (?, ?, ?) ON CONFLICT(user_id, token) DO UPDATE SET platform = excluded.platform', [session.user_id, token, platform]);
    return c.json({ success: true });
  } catch {
    return c.json({ success: false, message: 'push_tokens table not migrated yet.' }, 500);
  }
});

mobileAuthRoutes.delete('/api/mobile/push-token', async (c) => {
  const db = new Db(c.env.DB); const session = await Session.load(c, db, lifetime(c));
  const body = await c.req.json().catch(() => ({})); const token = String(body.token ?? '').trim();
  if (token) await db.query('DELETE FROM push_tokens WHERE token = ?', [token]).catch(() => {});
  return c.json({ success: true });
});

mobileAuthRoutes.post('/api/mobile/settings', async (c) => {
  const db = new Db(c.env.DB); const session = await Session.load(c, db, lifetime(c)); const auth = new Auth(db, session, c.env as any, clientIp(c));
  if (!auth.check()) return c.json({ success: false, message: 'Not logged in.' }, 401);
  const body = await c.req.json().catch(() => ({})); const data: { bio?: string; new_password?: string } = {};
  if (typeof body.bio === 'string') data.bio = body.bio;
  if (typeof body.new_password === 'string' && body.new_password) data.new_password = body.new_password;
  return c.json(await auth.updateProfile(session.user_id!, data));
});

mobileAuthRoutes.get('/api/mobile/list-sync/status', async (c) => {
  const db = new Db(c.env.DB); const session = await Session.load(c, db, lifetime(c)); const auth = new Auth(db, session, c.env as any, clientIp(c));
  if (!auth.check()) return c.json({ success: false, message: 'Not logged in.' }, 401);
  const row = await db.fetchOne<any>('SELECT mal_sync_username, mal_sync_access_token, anilist_sync_username, anilist_sync_access_token FROM users WHERE id = ?', [session.user_id]);
  return c.json({ success: true, mal: { connected: !!row?.mal_sync_access_token, username: row?.mal_sync_username ?? null }, anilist: { connected: !!row?.anilist_sync_access_token, username: row?.anilist_sync_username ?? null } });
});

mobileAuthRoutes.post('/api/mobile/list-sync/action', async (c) => {
  const db = new Db(c.env.DB); const session = await Session.load(c, db, lifetime(c)); const auth = new Auth(db, session, c.env as any, clientIp(c));
  if (!auth.check()) return c.json({ success: false, message: 'Not logged in.' }, 401);
  const body = await c.req.json().catch(() => ({})); const action = String(body.action ?? ''); const userId = session.user_id!;
  const { MalSync, AniListSync } = await import('../lib/list-sync');
  switch (action) {
    case 'mal_sync_now': { const r = await MalSync.pullMerge(c.env as any, db, userId); return c.json(r.error ? { success: false, message: r.error } : { success: true, message: r.added ? `Imported ${r.added} new anime from MAL.` : 'Already up to date.' }); }
    case 'mal_disconnect': await MalSync.disconnect(db, userId); return c.json({ success: true, message: 'Disconnected from MyAnimeList.' });
    case 'anilist_sync_now': return c.json(await AniListSync.requestPull(db, userId));
    case 'anilist_disconnect': await AniListSync.disconnect(db, userId); return c.json({ success: true, message: 'Disconnected from AniList.' });
    default: return c.json({ success: false, message: 'Unknown action.' }, 400);
  }
});

mobileAuthRoutes.get('/api/mobile/oauth-start', async (c) => {
  const db = new Db(c.env.DB); const session = await Session.load(c, db, lifetime(c)); const auth = new Auth(db, session, c.env as any, clientIp(c));
  const provider = c.req.query('provider'); session.data.oauth_redirect = 'anivault://oauth-callback';
  const url = provider === 'discord' ? auth.getDiscordAuthUrl() : provider === 'google' ? auth.getGoogleAuthUrl() : null;
  await session.save(c, lifetime(c)); if (!url) return c.text('Unknown provider.', 400); return c.redirect(url);
});

export { mobileAuthRoutes as default };
