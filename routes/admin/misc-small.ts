// Ports admin/activity.php, admin/reviews.php, admin/banner.php, admin/ip_country.php.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { Db } from '../../lib/db';
import { Session } from '../../lib/session';
import { Auth } from '../../lib/auth';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { Logger } from '../../lib/logger';
import { Settings } from '../../lib/settings';
import { h, timeAgo } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';

export const adminMiscSmallRoutes = new Hono<{ Bindings: Env }>();

// ── admin/activity.php ─────────────────────────────────────────────────────
const ACTION_COLORS: Record<string, string> = {
  login: 'badge-completed', logout: 'badge-default', register: 'badge-ptw',
  anime_update: 'badge-watching', admin_role_change: 'badge-dropped',
  admin_delete_user: 'badge-dropped', admin_toggle_user: 'badge-onhold',
};

adminMiscSmallRoutes.on(['GET', 'POST'], '/admin/activity.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating, userId } = ctx;

  if (c.req.method === 'POST') {
    const body = await c.req.parseBody();
    const action = (body.action as string) ?? '';
    if (action === 'purge_auto_registered') {
      const result = await db.query(
        `DELETE FROM activity_log WHERE action = 'register' AND details LIKE 'Auto-created account%'`
      );
      const removed = result.meta?.changes ?? 0;
      await Logger.log(db, userId, 'admin_purge_activity_log', `Purged ${removed} auto-registered-account entries from activity_log`);
      session.setFlash('success', `✅ Removed ${removed} auto-registered-account log entries.`);
    }
    await session.save(c, lifetime);
    return c.redirect(`${siteUrl}/admin/activity.php`);
  }

  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const limit = 50;
  const offset = (page - 1) * limit;
  const action = (c.req.query('action') ?? '').trim();
  const user = (c.req.query('user') ?? '').trim();

  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  if (action) { where += ' AND l.action LIKE ?'; params.push(`%${action}%`); }
  if (user) { where += ' AND u.username LIKE ?'; params.push(`%${user}%`); }

  const logs = await db.fetchAll<any>(
    `SELECT l.*, u.username FROM activity_log l LEFT JOIN users u ON l.user_id = u.id ${where} ORDER BY l.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  const total = await db.count(`SELECT COUNT(*) as cnt FROM activity_log l LEFT JOIN users u ON l.user_id=u.id ${where}`, params);
  const pages = Math.ceil(total / limit);

  const flash = session.takeFlash();
  const suc = flash?.type === 'success' ? flash.message : null;

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Activity Log', adminPage: 'activity', isOwner, impersonating });
  html += `
<div class="admin-header"><h1>📋 Activity Log</h1><span class="text-muted">${total.toLocaleString('en-US')} entries</span></div>
${suc ? `<div class="alert alert-success mb-2">${h(suc)}</div>` : ''}

<form method="GET" class="flex gap-1 mb-3" style="flex-wrap:wrap;">
  <input type="text" name="user" class="form-control" placeholder="Filter by username..." value="${h(user)}" style="max-width:220px;">
  <input type="text" name="action" class="form-control" placeholder="Filter by action..." value="${h(action)}" style="max-width:220px;">
  <button type="submit" class="btn btn-primary">Filter</button>
  ${(user || action) ? `<a href="activity.php" class="btn btn-ghost">Clear</a>` : ''}
</form>

<form method="POST" class="mb-3" onsubmit="return confirm('Permanently delete all auto-registered-account entries from the activity log? This cannot be undone.');">
  <input type="hidden" name="action" value="purge_auto_registered">
  <button type="submit" class="btn btn-ghost" style="border-color:var(--accent,#e00);color:var(--accent,#e00);">🗑 Purge old auto-registered-account logs</button>
</form>

<div class="card" style="overflow-x:auto;">
  <div class="data-table-wrap"><table class="data-table">
    <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Details</th><th>IP</th></tr></thead>
    <tbody>
      ${logs.map((log) => {
        const ts = log.created_at ? Math.floor(new Date(log.created_at.replace(' ', 'T') + 'Z').getTime() / 1000) : 0;
        return `
      <tr>
        <td style="white-space:nowrap;font-size:0.8rem;color:var(--text-muted);"><time class="local-ts" data-ts="${ts}" data-full="1">${log.created_at ? new Date(log.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : ''}</time></td>
        <td>${log.username ? `<a href="users.php?search=${h(log.username)}" style="font-weight:500;">${h(log.username)}</a>` : `<span class="text-muted">Guest</span>`}</td>
        <td><span class="badge ${ACTION_COLORS[log.action] ?? 'badge-default'}">${h(log.action)}</span></td>
        <td style="font-size:0.85rem;color:var(--text-secondary);">${h(log.details ?? '')}</td>
        <td style="font-size:0.78rem;color:var(--text-muted);">${h(log.ip_address ?? '')}</td>
      </tr>`;
      }).join('')}
      ${logs.length === 0 ? `<tr><td colspan="5" class="text-center text-muted" style="padding:2rem;">No logs found.</td></tr>` : ''}
    </tbody>
  </table></div>
</div>

${pages > 1 ? `<div class="pagination">${(() => {
  const qp = new URLSearchParams(); if (user) qp.set('user', user); if (action) qp.set('action', action);
  const baseUrl = `activity.php?${qp.toString()}${qp.toString() ? '&' : ''}page=`;
  return Array.from({ length: pages }, (_, i) => i + 1).map((i) => `<a href="${baseUrl}${i}" class="${i === page ? 'current' : ''}">${i}</a>`).join('');
})()}</div>` : ''}`;
  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});

// ── admin/reviews.php ───────────────────────────────────────────────────────
adminMiscSmallRoutes.on(['GET', 'POST'], '/admin/reviews.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating } = ctx;

  if (c.req.method === 'POST') {
    const body = await c.req.parseBody();
    const action = (body.action as string) ?? '';
    const id = parseInt((body.id as string) ?? '0', 10) || 0;
    if (action === 'toggle_visible') {
      const r = await db.fetchOne<{ is_visible: number }>('SELECT is_visible FROM reviews WHERE id=?', [id]);
      if (r) await db.query('UPDATE reviews SET is_visible=? WHERE id=?', [r.is_visible ? 0 : 1, id]);
      session.setFlash('success', 'Review visibility updated.');
    } else if (action === 'delete') {
      await db.query('DELETE FROM reviews WHERE id=?', [id]);
      session.setFlash('success', 'Review deleted.');
    }
    await session.save(c, lifetime);
    return c.redirect(`${siteUrl}/admin/reviews.php`);
  }

  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  const total = await db.count('SELECT COUNT(*) as cnt FROM reviews');
  const pages = Math.ceil(total / limit);
  const reviews = await db.fetchAll<any>(
    `SELECT r.*, u.username FROM reviews r JOIN users u ON r.user_id=u.id ORDER BY r.created_at DESC LIMIT ${limit} OFFSET ${offset}`
  );

  const flash = session.takeFlash();
  const err = flash?.type === 'error' ? flash.message : null;
  const suc = flash?.type === 'success' ? flash.message : null;

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Reviews', adminPage: 'reviews', isOwner, impersonating });
  html += `
<div class="admin-header"><h1>💬 User Reviews</h1><span class="text-muted">${total.toLocaleString('en-US')} total reviews</span></div>
${err ? `<div class="alert alert-error mb-2">⚠️ ${h(err)}</div>` : ''}
${suc ? `<div class="alert alert-success mb-2">✅ ${h(suc)}</div>` : ''}

${reviews.length === 0 ? `
<div class="flex-center" style="padding:4rem;flex-direction:column;gap:1rem;"><span style="font-size:3rem;">💬</span><p class="text-muted">No reviews yet.</p></div>` : `
<div class="card" style="overflow-x:auto;">
  <div class="data-table-wrap"><table class="data-table">
    <thead><tr><th>User</th><th>Anime</th><th>Score</th><th>Review</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
    <tbody>
      ${reviews.map((r) => `
      <tr style="${!r.is_visible ? 'opacity:0.5' : ''}">
        <td><a href="users.php?search=${h(r.username)}">${h(r.username)}</a></td>
        <td style="font-size:0.85rem;max-width:180px;"><a href="${siteUrl}/pages/anime.php?id=${r.anime_id}" style="color:var(--text-primary);">${h(r.anime_title)}</a></td>
        <td><span style="color:var(--gold);font-weight:600;">⭐ ${r.score}</span></td>
        <td style="font-size:0.82rem;max-width:260px;color:var(--text-secondary);">${h(String(r.review_text).substring(0, 120))}${String(r.review_text).length > 120 ? '…' : ''}</td>
        <td>${r.is_visible ? `<span class="badge badge-completed">Visible</span>` : `<span class="badge badge-default">Hidden</span>`}</td>
        <td style="font-size:0.78rem;color:var(--text-muted);">${timeAgo(r.created_at)}</td>
        <td><div class="flex gap-1" style="gap:4px;">
          <form method="POST" style="display:inline;"><input type="hidden" name="action" value="toggle_visible"><input type="hidden" name="id" value="${r.id}"><button type="submit" class="btn btn-ghost btn-sm">${r.is_visible ? 'Hide' : 'Show'}</button></form>
          <form method="POST" style="display:inline;" onsubmit="return confirm('Delete this review?')"><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="${r.id}"><button type="submit" class="btn btn-danger btn-sm">🗑️</button></form>
        </div></td>
      </tr>`).join('')}
    </tbody>
  </table></div>
</div>
${pages > 1 ? `<div class="pagination">${Array.from({ length: pages }, (_, i) => i + 1).map((i) => `<a href="reviews.php?page=${i}" class="${i === page ? 'current' : ''}">${i}</a>`).join('')}</div>` : ''}`}`;
  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});

// ── admin/banner.php ─────────────────────────────────────────────────────────
adminMiscSmallRoutes.on(['GET', 'POST'], '/admin/banner.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating, userId } = ctx;
  const settings = new Settings(db);

  if (c.req.method === 'POST') {
    const body = await c.req.parseBody();
    const action = (body.action as string) ?? '';
    if (action === 'save') {
      const msg = ((body.banner_message as string) ?? '').trim();
      const type = ['info', 'success', 'warning', 'error'].includes(body.banner_type as string) ? (body.banner_type as string) : 'info';
      const enabled = body.banner_enabled !== undefined ? '1' : '0';
      await settings.set('banner_message', msg);
      await settings.set('banner_type', type);
      await settings.set('banner_enabled', enabled);
      await Logger.log(db, userId, 'admin_banner_update', enabled === '1' ? `Banner enabled: ${msg}` : 'Banner disabled');
      session.setFlash('success', 'Banner updated.');
    } else if (action === 'dismiss') {
      await settings.set('banner_enabled', '0');
      session.setFlash('success', 'Banner hidden sitewide.');
    }
    await session.save(c, lifetime);
    return c.redirect(`${siteUrl}/admin/banner.php`);
  }

  const bannerMsg = (await settings.get('banner_message', '')) ?? '';
  const bannerType = (await settings.get('banner_type', 'info')) ?? 'info';
  const bannerEnabled = (await settings.get('banner_enabled', '0')) === '1';

  const flash = session.takeFlash();
  const err = flash?.type === 'error' ? flash.message : null;
  const suc = flash?.type === 'success' ? flash.message : null;

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Sitewide Banner', adminPage: 'banner', isOwner, impersonating });
  html += `
<div class="admin-header"><h1>📢 Sitewide Banner</h1><span class="text-muted">Show a notice to all visitors</span></div>
${err ? `<div class="alert alert-error mb-2">⚠️ ${h(err)}</div>` : ''}
${suc ? `<div class="alert alert-success mb-2">✅ ${h(suc)}</div>` : ''}

<div class="card card-body mb-3">
  <h3 style="margin-bottom:0.75rem;">👁️ Live Preview</h3>
  <div id="banner-preview" style="border-radius:8px;padding:12px 16px;font-size:0.9rem;display:flex;align-items:center;gap:10px;background:rgba(33,150,243,0.15);border:1px solid rgba(33,150,243,0.4);color:var(--text-primary);">
    <span id="preview-icon">ℹ️</span><span id="preview-text">${h(bannerMsg || 'Your banner message will appear here…')}</span>
  </div>
</div>

<div class="card card-body">
  <form method="POST">
    <input type="hidden" name="action" value="save">
    <div style="margin-bottom:1.25rem;">
      <label style="display:block;font-size:0.85rem;margin-bottom:0.4rem;color:var(--text-muted);">Message</label>
      <input type="text" name="banner_message" class="form-control" maxlength="300" value="${h(bannerMsg)}" placeholder="e.g. We're doing maintenance tonight at 2 AM UTC."
             oninput="document.getElementById('preview-text').textContent = this.value || 'Your banner message will appear here…'" style="width:100%;">
      <div class="text-muted" style="font-size:0.78rem;margin-top:4px;">Max 300 characters</div>
    </div>
    <div style="margin-bottom:1.25rem;">
      <label style="display:block;font-size:0.85rem;margin-bottom:0.4rem;color:var(--text-muted);">Type</label>
      <select name="banner_type" class="form-control" onchange="updatePreview(this.value)" style="max-width:220px;">
        <option value="info" ${bannerType === 'info' ? 'selected' : ''}>ℹ️ Info (blue)</option>
        <option value="success" ${bannerType === 'success' ? 'selected' : ''}>✅ Success (green)</option>
        <option value="warning" ${bannerType === 'warning' ? 'selected' : ''}>⚠️ Warning (yellow)</option>
        <option value="error" ${bannerType === 'error' ? 'selected' : ''}>🚨 Error (red)</option>
      </select>
    </div>
    <div style="margin-bottom:1.5rem;">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" name="banner_enabled" value="1" ${bannerEnabled ? 'checked' : ''}><span>Enable banner (show to all visitors)</span></label>
    </div>
    <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
      <button type="submit" class="btn btn-primary">💾 Save Banner</button>
      ${bannerEnabled ? `<form method="POST" style="display:inline;"><input type="hidden" name="action" value="dismiss"><button type="submit" class="btn btn-ghost">🙈 Hide Banner Now</button></form>` : ''}
    </div>
  </form>
</div>

<script>
const previewStyles = {
  info:    { bg: 'rgba(33,150,243,0.15)', border: 'rgba(33,150,243,0.4)', icon: 'ℹ️' },
  success: { bg: 'rgba(76,175,80,0.15)',  border: 'rgba(76,175,80,0.4)',  icon: '✅' },
  warning: { bg: 'rgba(255,193,7,0.15)',  border: 'rgba(255,193,7,0.4)',  icon: '⚠️' },
  error:   { bg: 'rgba(244,67,54,0.15)',  border: 'rgba(244,67,54,0.4)',  icon: '🚨' },
};
function updatePreview(type) {
  const s = previewStyles[type] || previewStyles.info;
  const el = document.getElementById('banner-preview');
  el.style.background = s.bg;
  el.style.borderColor = s.border;
  document.getElementById('preview-icon').textContent = s.icon;
}
updatePreview(${JSON.stringify(bannerType)});
</script>`;
  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});

// ── admin/ip_country.php ──────────────────────────────────────────────────────
adminMiscSmallRoutes.post('/admin/ip_country.php', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  if (!auth.isAdmin()) { await session.save(c, lifetime); return c.json({}, 403); }

  const body: any = await c.req.json().catch(() => null);
  if (!Array.isArray(body) || body.length === 0) { await session.save(c, lifetime); return c.json([]); }

  const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/;
  const ips = body.slice(0, 100).filter((ip: string) => ipRegex.test(ip));
  if (ips.length === 0) { await session.save(c, lifetime); return c.json([]); }

  try {
    const res = await fetch('http://ip-api.com/batch?fields=query,country,countryCode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ips.map((ip: string) => ({ query: ip }))),
    });
    const result = res.ok ? await res.json() : [];
    await session.save(c, lifetime);
    return c.json(result);
  } catch {
    await session.save(c, lifetime);
    return c.json([]);
  }
});
