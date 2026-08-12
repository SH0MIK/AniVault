// Ports admin/badges.php. Uploads go to R2 instead of local disk.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { Logger } from '../../lib/logger';
import { Badge } from '../../lib/badges';
import { h, timeAgo } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';

export const adminBadgesRoutes = new Hono<{ Bindings: Env }>();

adminBadgesRoutes.on(['GET', 'POST'], '/admin/badges.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating, userId } = ctx;

  if (c.req.method === 'POST') {
    const formData = await c.req.formData();
    const action = (formData.get('action') as string) ?? '';

    if (action === 'create_badge') {
      const name = ((formData.get('name') as string) ?? '').trim();
      const description = ((formData.get('description') as string) ?? '').trim();
      const iconText = ((formData.get('icon_text') as string) ?? '').trim();
      let imageUrl = ((formData.get('image_url') as string) ?? '').trim();

      const file = formData.get('badge_image') as File | null;
      if (file && file.size > 0) {
        const allowed: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
        const ext = allowed[file.type];
        if (!ext) {
          session.setFlash('error', 'Badge image must be PNG, JPG, WEBP, or GIF.');
          await session.save(c, lifetime);
          return c.redirect(`${siteUrl}/admin/badges.php`);
        }
        if (file.size > 2 * 1024 * 1024) {
          session.setFlash('error', 'Badge image must be 2MB or smaller.');
          await session.save(c, lifetime);
          return c.redirect(`${siteUrl}/admin/badges.php`);
        }
        const filename = `badge_${Date.now()}_${Math.random().toString(16).slice(2, 10)}.${ext}`;
        const buf = await file.arrayBuffer();
        await c.env.AVATARS.put(`badges/${filename}`, buf, { httpMetadata: { contentType: file.type } });
        imageUrl = `${siteUrl}/assets/img/badges/${filename}`;
      }

      let color = ((formData.get('color') as string) ?? '#7c3aed').trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) color = '#7c3aed';
      const sortOrder = parseInt((formData.get('sort_order') as string) ?? '0', 10) || 0;
      const isAnimated = formData.get('is_animated') ? 1 : 0;

      if (!name) {
        session.setFlash('error', 'Badge name is required.');
      } else if (!imageUrl && !iconText) {
        session.setFlash('error', 'Add either an image URL/upload or short badge text.');
      } else {
        await db.insert(
          'INSERT INTO badges (name, description, icon_text, image_url, color, is_animated, sort_order) VALUES (?,?,?,?,?,?,?)',
          [name, description || null, iconText || null, imageUrl || null, color, isAnimated, sortOrder]
        );
        await Logger.log(db, userId, 'admin_badge_create', `Created badge ${name}`);
        session.setFlash('success', 'Badge created.');
      }
    } else if (action === 'assign_badge') {
      const targetUserId = parseInt((formData.get('user_id') as string) ?? '0', 10) || 0;
      const badgeId = parseInt((formData.get('badge_id') as string) ?? '0', 10) || 0;
      const exists = await db.fetchOne('SELECT id FROM users WHERE id=?', [targetUserId]);
      const badge = await db.fetchOne<{ name: string }>('SELECT name FROM badges WHERE id=?', [badgeId]);
      if (!exists || !badge) {
        session.setFlash('error', 'Choose a valid user and badge.');
      } else {
        await db.query('INSERT OR IGNORE INTO user_badges (user_id, badge_id, assigned_by) VALUES (?,?,?)', [targetUserId, badgeId, userId]);
        await Logger.log(db, userId, 'admin_badge_assign', `Assigned badge ${badge.name} to user ${targetUserId}`);
        session.setFlash('success', 'Badge assigned.');
      }
    } else if (action === 'remove_badge') {
      const targetUserId = parseInt((formData.get('user_id') as string) ?? '0', 10) || 0;
      const badgeId = parseInt((formData.get('badge_id') as string) ?? '0', 10) || 0;
      await db.query('DELETE FROM user_badges WHERE user_id=? AND badge_id=?', [targetUserId, badgeId]);
      await Logger.log(db, userId, 'admin_badge_remove', `Removed badge ${badgeId} from user ${targetUserId}`);
      session.setFlash('success', 'Badge removed.');
    } else if (action === 'delete_badge') {
      const badgeId = parseInt((formData.get('badge_id') as string) ?? '0', 10) || 0;
      await db.query('DELETE FROM user_badges WHERE badge_id=?', [badgeId]);
      await db.query('DELETE FROM badges WHERE id=?', [badgeId]);
      await Logger.log(db, userId, 'admin_badge_delete', `Deleted badge ${badgeId}`);
      session.setFlash('success', 'Badge deleted.');
    }
    await session.save(c, lifetime);
    return c.redirect(`${siteUrl}/admin/badges.php`);
  }

  const badges = await Badge.all(db);
  const users = await db.fetchAll<any>('SELECT id, username, email, avatar_url FROM users ORDER BY username ASC');
  const assigned = await db.fetchAll<any>(
    `SELECT ub.user_id, ub.badge_id, ub.assigned_at, u.username, u.avatar_url, b.name, b.icon_text, b.image_url, b.color, b.is_animated
     FROM user_badges ub JOIN users u ON u.id = ub.user_id JOIN badges b ON b.id = ub.badge_id
     ORDER BY u.username ASC, b.sort_order ASC, b.name ASC`
  );

  const flash = session.takeFlash();
  const err = flash?.type === 'error' ? flash.message : null;
  const suc = flash?.type === 'success' ? flash.message : null;

  let html = renderAdminHeader({ siteUrl, pageTitle: 'User Badges', adminPage: 'badges', isOwner, impersonating });
  html += `
<div class="admin-header"><div><h1>User Badges</h1><p class="text-muted" style="font-size:0.9rem;">Create Discord-style badges and assign them to users.</p></div></div>
${err ? `<div class="alert alert-error mb-2">${h(err)}</div>` : ''}
${suc ? `<div class="alert alert-success mb-2">${h(suc)}</div>` : ''}

<div class="grid-2" style="gap:1.5rem;align-items:start;">
  <div class="card card-body">
    <h2 class="mb-2">Create Badge</h2>
    <form method="POST" enctype="multipart/form-data">
      <input type="hidden" name="action" value="create_badge">
      <div class="form-group"><label class="form-label">Name</label><input class="form-control" name="name" maxlength="80" required placeholder="Founder, Artist, VIP"></div>
      <div class="form-group"><label class="form-label">Description</label><input class="form-control" name="description" maxlength="255" placeholder="Shown as tooltip context later"></div>
      <div class="form-group"><label class="form-label">Short text fallback</label><input class="form-control" name="icon_text" maxlength="16" placeholder="F, VIP, ★"></div>
      <div class="form-group"><label class="form-label">Image URL</label><input class="form-control" name="image_url" maxlength="1000" placeholder="https://.../badge.gif"></div>
      <div class="form-group">
        <label class="form-label">Upload image</label>
        <input class="form-control" type="file" name="badge_image" accept="image/png,image/jpeg,image/webp,image/gif">
        <p class="text-muted" style="font-size:0.78rem;margin-top:4px;">PNG, JPG, WEBP, or GIF up to 2MB. GIF/animated WEBP work as animated badges.</p>
      </div>
      <div class="flex gap-1" style="align-items:end;flex-wrap:wrap;">
        <div class="form-group" style="margin-bottom:0;"><label class="form-label">Color</label><input class="form-control" type="color" name="color" value="#7c3aed" style="width:80px;padding:4px;"></div>
        <div class="form-group" style="margin-bottom:0;"><label class="form-label">Sort</label><input class="form-control" type="number" name="sort_order" value="0" style="width:90px;"></div>
        <label class="flex" style="gap:8px;align-items:center;margin-bottom:8px;"><input type="checkbox" name="is_animated" value="1"> Animated</label>
      </div>
      <button class="btn btn-primary mt-2" type="submit">Create Badge</button>
    </form>
  </div>

  <div class="card card-body">
    <h2 class="mb-2">Assign Badge</h2>
    <form method="POST" class="mb-2">
      <input type="hidden" name="action" value="assign_badge">
      <div class="form-group"><label class="form-label">User</label>
        <select class="form-control" name="user_id" required>
          <option value="">Choose user...</option>
          ${users.map((u) => `<option value="${u.id}">#${u.id} ${h(u.username)} (${h(u.email)})</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Badge</label>
        <select class="form-control" name="badge_id" required>
          <option value="">Choose badge...</option>
          ${badges.map((b) => `<option value="${b.id}">${h(b.name)}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary" type="submit">Assign Badge</button>
    </form>
  </div>
</div>

<div class="card card-body mt-3">
  <h2 class="mb-2">Available Badges</h2>
  <div class="data-table-wrap"><table class="data-table">
    <thead><tr><th>Preview</th><th>Name</th><th>Type</th><th>Sort</th><th>Actions</th></tr></thead>
    <tbody>
      ${badges.map((badge) => `
      <tr>
        <td>${Badge.renderList([badge])}</td>
        <td><strong>${h(badge.name)}</strong>${badge.description ? `<br><span class="text-muted" style="font-size:0.78rem;">${h(badge.description)}</span>` : ''}</td>
        <td>${badge.image_url ? 'Image' : 'Text'}${badge.is_animated ? ' / animated' : ''}</td>
        <td>${badge.sort_order}</td>
        <td><form method="POST" onsubmit="return confirm('Delete this badge from everyone?')" style="display:inline;"><input type="hidden" name="action" value="delete_badge"><input type="hidden" name="badge_id" value="${badge.id}"><button class="btn btn-danger btn-sm" type="submit">Delete</button></form></td>
      </tr>`).join('')}
      ${badges.length === 0 ? `<tr><td colspan="5" class="text-center text-muted" style="padding:2rem;">No badges yet.</td></tr>` : ''}
    </tbody>
  </table></div>
</div>

<div class="card card-body mt-3">
  <h2 class="mb-2">Assigned Badges</h2>
  <div class="data-table-wrap"><table class="data-table">
    <thead><tr><th>User</th><th>Badge</th><th>Assigned</th><th>Actions</th></tr></thead>
    <tbody>
      ${assigned.map((row) => `
      <tr>
        <td><a href="users.php?search=${h(row.username)}">${h(row.username)}</a></td>
        <td>${Badge.renderList([row])} ${h(row.name)}</td>
        <td>${timeAgo(row.assigned_at)}</td>
        <td><form method="POST" style="display:inline;"><input type="hidden" name="action" value="remove_badge"><input type="hidden" name="user_id" value="${row.user_id}"><input type="hidden" name="badge_id" value="${row.badge_id}"><button class="btn btn-ghost btn-sm" type="submit">Remove</button></form></td>
      </tr>`).join('')}
      ${assigned.length === 0 ? `<tr><td colspan="4" class="text-center text-muted" style="padding:2rem;">No assigned badges yet.</td></tr>` : ''}
    </tbody>
  </table></div>
</div>`;
  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});

adminBadgesRoutes.get('/assets/img/badges/:filename', async (c) => {
  const filename = c.req.param('filename');
  const obj = await c.env.AVATARS.get(`badges/${filename}`);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: { 'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
});
