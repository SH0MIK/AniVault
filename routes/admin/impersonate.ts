// Ports admin/impersonate.php -- owner-only, view the site as any user.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { Logger } from '../../lib/logger';
import { OWNER_USER_ID } from '../../lib/auth';

export const impersonateRoutes = new Hono<{ Bindings: Env }>();

impersonateRoutes.get('/admin/impersonate.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner } = ctx;

  if (!isOwner) {
    session.setFlash('error', 'Only the Owner can use impersonation.');
    await session.save(c, lifetime);
    return c.redirect(`${siteUrl}/admin/users.php`);
  }

  const action = c.req.query('action') ?? '';
  const targetId = parseInt(c.req.query('user_id') ?? '0', 10) || 0;

  if (action === 'start' && targetId) {
    if (targetId === OWNER_USER_ID) {
      session.setFlash('error', 'Cannot impersonate the Owner account.');
      await session.save(c, lifetime);
      return c.redirect(`${siteUrl}/admin/users.php`);
    }
    const user = await db.fetchOne<{ id: number; username: string; role: string }>(
      'SELECT * FROM users WHERE id=? AND is_active=1', [targetId]
    );
    if (!user) {
      session.setFlash('error', 'User not found or inactive.');
      await session.save(c, lifetime);
      return c.redirect(`${siteUrl}/admin/users.php`);
    }
    const realUserId = session.user_id!;
    session.data.impersonate_owner = { user_id: realUserId, username: session.data.username ?? '', role: session.data.role ?? '' };
    session.setUser(user.id, user.username, user.role);
    await Logger.log(db, realUserId, 'owner_impersonate_start', `Impersonating user #${user.id} (${user.username})`);
    await session.save(c, lifetime);
    return c.redirect(siteUrl + '/');
  }

  if (action === 'stop') {
    const real = session.data.impersonate_owner;
    if (real) {
      await Logger.log(db, real.user_id, 'owner_impersonate_stop', `Stopped impersonating user #${session.user_id} (${session.data.username})`);
      session.setUser(real.user_id, real.username, real.role);
      delete session.data.impersonate_owner;
    }
    await session.save(c, lifetime);
    return c.redirect(`${siteUrl}/admin/users.php`);
  }

  await session.save(c, lifetime);
  return c.redirect(`${siteUrl}/admin/users.php`);
});
