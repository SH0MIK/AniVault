// Routes are kept at the SAME paths as the old PHP site
// (/api/auth_ajax.php, /pages/oauth_google.php, etc.) on purpose:
//   1. Your existing frontend JS (app.js) calls these paths already — zero JS changes needed.
//   2. Your Google/Discord OAuth apps have these exact redirect URIs registered —
//      changing the path would mean updating both consoles.
import { Hono } from 'hono';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth, OWNER_USER_ID, AUTO_SESSION_LIFETIME_SECONDS } from '../lib/auth';
import type { Env } from '../index';

export const authRoutes = new Hono<{ Bindings: Env }>();

function clientIp(c: any): string {
  return c.req.header('cf-connecting-ip') ?? 'unknown';
}

async function buildAuth(c: any): Promise<{ auth: Auth; session: Session; db: Db }> {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, clientIp(c));
  return { auth, session, db };
}

// ── api/auth_ajax.php — login/register from the popup modal ──────────────
authRoutes.post('/api/auth_ajax.php', async (c) => {
  const { auth, session } = await buildAuth(c);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);

  if (auth.check()) {
    await session.save(c, lifetime);
    return c.json({ success: true });
  }

  const body = await c.req.parseBody();
  const action = (body.action as string) ?? 'login';

  let result;
  if (action === 'register') {
    const username = String(body.username ?? '').trim();
    const email = String(body.email ?? '').trim();
    const password = String(body.password ?? '');
    result = await auth.register(username, email, password);
  } else {
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '');
    result = await auth.login(username, password);
  }

  await session.save(c, lifetime);
  return c.json(result);
});

authRoutes.post('/api/auto_auth.php', async (c) => {
  const { auth, session } = await buildAuth(c);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  if (auth.check()) {
    await session.save(c, lifetime);
    return c.json({ success: true, alreadyLoggedIn: true });
  }
  const result = await auth.autoRegister();
  await session.save(c, result.success ? AUTO_SESSION_LIFETIME_SECONDS : lifetime);
  return c.json(result);
});

authRoutes.get('/api/auth_google_url.php', async (c) => {
  const { auth, session } = await buildAuth(c);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const redirect = c.req.query('redirect');
  if (redirect) session.data.oauth_redirect = redirect;
  const url = auth.getGoogleAuthUrl();
  await session.save(c, lifetime);
  return c.json({ url });
});

authRoutes.get('/api/auth_discord_url.php', async (c) => {
  const { auth, session } = await buildAuth(c);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const redirect = c.req.query('redirect');
  if (redirect) session.data.oauth_redirect = redirect;
  const url = auth.getDiscordAuthUrl();
  await session.save(c, lifetime);
  return c.json({ url });
});

function mobileOAuthRedirect(redirect: string, token: string): string {
  if (!redirect.startsWith('anivault://oauth-callback')) return redirect;
  const separator = redirect.includes('?') ? '&' : '?';
  return `${redirect}${separator}token=${encodeURIComponent(token)}`;
}

// ── pages/oauth_google.php — Google redirects back here ──────────────────
authRoutes.get('/pages/oauth_google.php', async (c) => {
  const { auth, session } = await buildAuth(c);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const siteUrl = c.env.SITE_URL;
  const code = c.req.query('code') ?? '';
  const state = c.req.query('state') ?? '';
  const error = c.req.query('error') ?? '';

  if (error || !code) {
    session.setFlash('error', 'Google login was cancelled.');
    await session.save(c, lifetime);
    return c.redirect(`${siteUrl}/login`);
  }

  const isConnecting = auth.check();
  const redirect = isConnecting
    ? `${siteUrl}/profile`
    : (session.data.oauth_redirect as string) ?? `${siteUrl}/`;
  const result = await auth.loginWithGoogle(code, state);

  if (result.success) {
    if (isConnecting) {
      session.setFlash('success', 'Google account connected!');
    } else {
      session.data.post_setup_redirect = redirect;
    }
    await session.save(c, lifetime);
    return c.redirect(mobileOAuthRedirect(redirect, session.id));
  }

  if (result.message !== 'Invalid OAuth state.') {
    session.setFlash('error', result.message ?? 'Google login failed.');
  }
  await session.save(c, lifetime);
  return c.redirect(isConnecting ? `${siteUrl}/profile` : `${siteUrl}/login`);
});

// ── pages/oauth_discord.php — Discord redirects back here ────────────────
authRoutes.get('/pages/oauth_discord.php', async (c) => {
  const { auth, session } = await buildAuth(c);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const siteUrl = c.env.SITE_URL;
  const code = c.req.query('code') ?? '';
  const state = c.req.query('state') ?? '';
  const error = c.req.query('error') ?? '';

  if (error || !code) {
    session.setFlash('error', 'Discord login was cancelled.');
    await session.save(c, lifetime);
    return c.redirect(`${siteUrl}/login`);
  }

  const isConnecting = auth.check();
  const redirect = isConnecting
    ? `${siteUrl}/profile`
    : (session.data.oauth_redirect as string) ?? `${siteUrl}/`;
  const result = await auth.loginWithDiscord(code, state);

  if (result.success) {
    if (isConnecting) {
      session.setFlash('success', 'Discord account connected!');
    } else {
      session.data.post_setup_redirect = redirect;
    }
    await session.save(c, lifetime);
    return c.redirect(mobileOAuthRedirect(redirect, session.id));
  }

  if (result.message !== 'Invalid OAuth state.') {
    session.setFlash('error', result.message ?? 'Discord login failed.');
  }
  await session.save(c, lifetime);
  return c.redirect(isConnecting ? `${siteUrl}/profile` : `${siteUrl}/login`);
});

// ── MAL/AniList list-sync connect callbacks ──────────────────────────────
authRoutes.get('/pages/oauth_mal_sync.php', async (c) => {
  const { auth, session, db } = await buildAuth(c);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const siteUrl = c.env.SITE_URL;
  if (!auth.check()) { await session.save(c, lifetime); return c.redirect(`${siteUrl}/login`); }
  const code = c.req.query('code') ?? '';
  const state = c.req.query('state') ?? '';
  const error = c.req.query('error') ?? '';
  if (error || !code) {
    session.setFlash('error', 'MyAnimeList connection was cancelled.');
    await session.save(c, lifetime);
    return c.redirect(`${siteUrl}/profile?tab=connections`);
  }
  const { MalSync } = await import('../lib/list-sync');
  const result = await MalSync.handleCallback(c.env as any, db, session, session.user_id!, code, state);
  if (result.success) {
    const pull = await MalSync.pullMerge(c.env as any, db, session.user_id!);
    session.setFlash('success', pull.added ? `${result.message} Imported ${pull.added} new anime from your MAL list.` : result.message);
  } else session.setFlash('error', result.message);
  await session.save(c, lifetime);
  return c.redirect(`${siteUrl}/profile?tab=connections`);
});

authRoutes.get('/pages/oauth_anilist_sync.php', async (c) => {
  const { auth, session, db } = await buildAuth(c);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const siteUrl = c.env.SITE_URL;
  if (!auth.check()) { await session.save(c, lifetime); return c.redirect(`${siteUrl}/login`); }
  const code = c.req.query('code') ?? '';
  const error = c.req.query('error') ?? '';
  if (error || !code) {
    session.setFlash('error', 'AniList connection was cancelled.');
    await session.save(c, lifetime);
    return c.redirect(`${siteUrl}/profile?tab=connections`);
  }
  const { AniListSync } = await import('../lib/list-sync');
  const result = await AniListSync.handleCallback(c.env as any, db, session, session.user_id!, code);
  session.setFlash(result.success ? 'success' : 'error', result.message);
  await session.save(c, lifetime);
  return c.redirect(`${siteUrl}/profile?tab=connections`);
});

authRoutes.get('/logout', async (c) => {
  const { session, db } = await buildAuth(c);
  if (session.user_id) {
    const { Logger } = await import('../lib/logger');
    await Logger.log(db, session.user_id, 'logout', 'User logged out', clientIp(c));
  }
  await session.destroy(c);
  return c.redirect(c.env.SITE_URL + '/');
});

authRoutes.post('/api/auth_social.php', async (c) => {
  const { auth, session } = await buildAuth(c);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  if (!auth.check()) return c.json({ success: false, message: 'Not logged in.' }, 401);
  const body = await c.req.parseBody();
  const provider = String(body.provider ?? '') as 'google' | 'discord';
  const action = String(body.action ?? 'disconnect');
  if (provider !== 'google' && provider !== 'discord') return c.json({ success: false, message: 'Unknown provider.' }, 400);
  const result = action === 'disconnect'
    ? await auth.disconnectSocial(session.user_id!, provider)
    : { success: false, message: 'Use the OAuth URL endpoint to connect.' };
  await session.save(c, lifetime);
  return c.json(result);
});

export { buildAuth, OWNER_USER_ID };
