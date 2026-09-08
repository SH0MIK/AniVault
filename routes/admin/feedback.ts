// Ports admin/feedback.php.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { Settings } from '../../lib/settings';
import { Logger } from '../../lib/logger';
import { h } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';

export const adminFeedbackRoutes = new Hono<{ Bindings: Env }>();

adminFeedbackRoutes.on(['GET', 'POST'], '/admin/feedback.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating, userId } = ctx;
  const settings = new Settings(db);

  if (c.req.method === 'POST') {
    const body = await c.req.parseBody();
    const action = (body.action as string) ?? '';

    if (action === 'save_settings') {
      const enabled = body.feedback_popup_enabled !== undefined ? '1' : '0';
      const cooldown = Math.max(1, Math.min(365, parseInt((body.feedback_cooldown_days as string) ?? '30', 10) || 30));
      const delay = Math.max(0, Math.min(60, parseInt((body.feedback_popup_delay as string) ?? '5', 10) || 5));
      const title = ((body.feedback_popup_title as string) ?? '').trim() || 'How are we doing?';
      const subtitle = ((body.feedback_popup_subtitle as string) ?? '').trim() || 'Your feedback helps us improve!';
      await settings.set('feedback_popup_enabled', enabled);
      await settings.set('feedback_cooldown_days', String(cooldown));
      await settings.set('feedback_popup_delay', String(delay));
      await settings.set('feedback_popup_title', title);
      await settings.set('feedback_popup_subtitle', subtitle);
      await Logger.log(db, userId, 'admin_feedback_settings', `Feedback popup ${enabled === '1' ? 'enabled' : 'disabled'}`);
      session.setFlash('success', 'Settings saved.');
    } else if (action === 'delete') {
      const id = parseInt((body.id as string) ?? '0', 10) || 0;
      if (id > 0) { await db.query('DELETE FROM site_feedback WHERE id=?', [id]); session.setFlash('success', 'Entry deleted.'); }
    } else if (action === 'delete_all') {
      await db.query('DELETE FROM site_feedback');
      session.setFlash('success', 'All feedback cleared.');
    }
    await session.save(c, lifetime);
    return c.redirect(`${siteUrl}/admin/feedback.php`);
  }

  const enabled = (await settings.get('feedback_popup_enabled', '0')) === '1';
  const cooldown = parseInt((await settings.get('feedback_cooldown_days', '30')) ?? '30', 10);
  const delay = parseInt((await settings.get('feedback_popup_delay', '5')) ?? '5', 10);
  const popTitle = (await settings.get('feedback_popup_title', 'How are we doing?')) ?? 'How are we doing?';
  const popSub = (await settings.get('feedback_popup_subtitle', 'Your feedback helps us improve!')) ?? 'Your feedback helps us improve!';

  const perPage = 20;
  const page = Math.max(1, parseInt(c.req.query('p') ?? '1', 10) || 1);
  const offset = (page - 1) * perPage;
  const filter = parseInt(c.req.query('stars') ?? '0', 10) || 0;
  const where = filter >= 1 && filter <= 5 ? `WHERE f.rating = ${filter}` : '';

  const total = await db.count(`SELECT COUNT(*) as cnt FROM site_feedback f ${where}`);
  const pages = Math.max(1, Math.ceil(total / perPage));
  const rows = await db.fetchAll<any>(
    `SELECT f.*, u.username FROM site_feedback f LEFT JOIN users u ON u.id = f.user_id ${where} ORDER BY f.created_at DESC LIMIT ${perPage} OFFSET ${offset}`
  );
  const stats = await db.fetchOne<any>(
    `SELECT COUNT(*) as total, AVG(rating) as avg_rating,
      SUM(rating=5) as five, SUM(rating=4) as four, SUM(rating=3) as three, SUM(rating=2) as two, SUM(rating=1) as one
     FROM site_feedback`
  );

  const flash = session.takeFlash();
  const err = flash?.type === 'error' ? flash.message : null;
  const suc = flash?.type === 'success' ? flash.message : null;

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Feedback & Ratings', adminPage: 'feedback', isOwner, impersonating });
  html += `
<style>
.star-display { color: #f59e0b; letter-spacing: 2px; font-size: 1rem; }
.star-bar { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
.star-bar-fill { height:8px; background:linear-gradient(90deg,#f59e0b,#fcd34d); border-radius:4px; }
.star-bar-bg   { flex:1; background:var(--bg-surface); border-radius:4px; height:8px; overflow:hidden; }
.fb-comment    { font-size:0.84rem; color:var(--text-secondary); font-style:italic; margin-top:4px; max-width:420px; }
.fb-meta       { font-size:0.75rem; color:var(--text-muted); }
.badge-on      { background:#16a34a22; color:#4ade80; border:1px solid #16a34a55; padding:2px 10px; border-radius:20px; font-size:0.78rem; }
.badge-off     { background:#ef444422; color:#f87171; border:1px solid #ef444455; padding:2px 10px; border-radius:20px; font-size:0.78rem; }
</style>

<div class="admin-header"><h1>💬 Feedback &amp; Ratings</h1><span class="text-muted">User feedback collected via the site popup</span></div>
${err ? `<div class="alert alert-error mb-2">⚠️ ${h(err)}</div>` : ''}
${suc ? `<div class="alert alert-success mb-2">✅ ${h(suc)}</div>` : ''}

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin-bottom:1.5rem;">
  <div class="card card-body" style="text-align:center;"><div style="font-size:2rem;font-weight:700;">${(stats?.total ?? 0).toLocaleString('en-US')}</div><div class="text-muted" style="font-size:0.82rem;">Total Responses</div></div>
  <div class="card card-body" style="text-align:center;"><div style="font-size:2rem;font-weight:700;color:#f59e0b;">${stats?.avg_rating ? Number(stats.avg_rating).toFixed(1) : '—'}</div><div class="text-muted" style="font-size:0.82rem;">Avg Rating</div></div>
  <div class="card card-body" style="padding:1rem 1.25rem;">
    <div style="font-size:0.78rem;font-weight:600;color:var(--text-muted);margin-bottom:8px;">RATING BREAKDOWN</div>
    ${[5, 4, 3, 2, 1].map((s) => {
      const key = s === 5 ? 'five' : s === 4 ? 'four' : s === 3 ? 'three' : s === 2 ? 'two' : 'one';
      const cnt = stats?.[key] ?? 0;
      const pct = stats?.total > 0 ? Math.round((cnt / stats.total) * 100) : 0;
      return `<div class="star-bar"><span style="font-size:0.75rem;width:14px;text-align:right;">${s}</span><span style="font-size:0.7rem;">★</span><div class="star-bar-bg"><div class="star-bar-fill" style="width:${pct}%;"></div></div><span style="font-size:0.75rem;width:28px;text-align:right;">${cnt}</span></div>`;
    }).join('')}
  </div>
  <div class="card card-body" style="text-align:center;"><div style="font-size:1.5rem;margin-bottom:4px;"><span class="${enabled ? 'badge-on' : 'badge-off'}">${enabled ? '● Active' : '● Disabled'}</span></div><div class="text-muted" style="font-size:0.82rem;">Popup Status</div></div>
</div>

<div class="card card-body mb-3">
  <h3 style="margin-bottom:1rem;">⚙️ Popup Settings</h3>
  <form method="POST">
    <input type="hidden" name="action" value="save_settings">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin-bottom:1rem;">
      <div><label style="display:block;font-size:0.83rem;margin-bottom:4px;color:var(--text-muted);">Popup Title</label><input type="text" name="feedback_popup_title" class="form-control" value="${h(popTitle)}" maxlength="80" style="width:100%;"></div>
      <div><label style="display:block;font-size:0.83rem;margin-bottom:4px;color:var(--text-muted);">Popup Subtitle</label><input type="text" name="feedback_popup_subtitle" class="form-control" value="${h(popSub)}" maxlength="120" style="width:100%;"></div>
      <div><label style="display:block;font-size:0.83rem;margin-bottom:4px;color:var(--text-muted);">Delay before showing (seconds)</label><input type="number" name="feedback_popup_delay" class="form-control" value="${delay}" min="0" max="60" style="width:100%;"></div>
      <div><label style="display:block;font-size:0.83rem;margin-bottom:4px;color:var(--text-muted);">Cooldown after submit (days)</label><input type="number" name="feedback_cooldown_days" class="form-control" value="${cooldown}" min="1" max="365" style="width:100%;"><div class="text-muted" style="font-size:0.75rem;margin-top:3px;">Won't show again for this many days after a user submits</div></div>
    </div>
    <div style="margin-bottom:1rem;"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;"><input type="checkbox" name="feedback_popup_enabled" value="1" ${enabled ? 'checked' : ''}><span>Enable feedback popup sitewide</span></label></div>
    <button type="submit" class="btn btn-primary">💾 Save Settings</button>
  </form>
</div>

<div class="card">
  <div style="padding:1rem 1.25rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;border-bottom:1px solid var(--border);">
    <h3 style="margin:0;">📋 Responses (${total.toLocaleString('en-US')})</h3>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
      ${[0, 5, 4, 3, 2, 1].map((s) => `<a href="?stars=${s}" class="btn btn-sm ${filter === s ? 'btn-primary' : ''}" style="font-size:0.78rem;">${s === 0 ? 'All' : s + '★'}</a>`).join('')}
      ${total > 0 ? `<form method="POST" onsubmit="return confirm('Delete ALL feedback? This cannot be undone.');" style="margin:0;"><input type="hidden" name="action" value="delete_all"><button type="submit" class="btn btn-sm btn-danger">🗑 Clear All</button></form>` : ''}
    </div>
  </div>

  ${rows.length === 0 ? `<div style="padding:2rem;text-align:center;color:var(--text-muted);">No feedback yet.</div>` : `
  <div style="overflow-x:auto;">
  <table class="admin-table">
    <thead><tr><th>#</th><th>User</th><th>Rating</th><th>Comment</th><th>Page</th><th>Date</th><th></th></tr></thead>
    <tbody>
    ${rows.map((r) => {
      const ts = r.created_at ? Math.floor(new Date(r.created_at.replace(' ', 'T') + 'Z').getTime() / 1000) : 0;
      return `
    <tr>
      <td class="text-muted" style="font-size:0.78rem;">${r.id}</td>
      <td>${r.username ? `<a href="users.php?search=${encodeURIComponent(r.username)}">${h(r.username)}</a>` : `<span class="text-muted" style="font-size:0.78rem;">${h((r.ip_address ?? '?').substring(0, 15))} <em>(guest)</em></span>`}</td>
      <td>${r.rating ? `<span class="star-display">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>` : '—'}</td>
      <td>${r.comment ? `<div class="fb-comment">"${h(r.comment)}"</div>` : `<span class="text-muted">—</span>`}</td>
      <td class="fb-meta">${r.page ? h(r.page) : '—'}</td>
      <td class="fb-meta"><time class="local-ts" data-ts="${ts}">${h(r.created_at ?? '')}</time></td>
      <td><form method="POST" onsubmit="return confirm('Delete this entry?');" style="margin:0;"><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="${r.id}"><button type="submit" class="btn btn-sm btn-danger">✕</button></form></td>
    </tr>`;
    }).join('')}
    </tbody>
  </table>
  </div>
  ${pages > 1 ? `<div style="padding:1rem;display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">${Array.from({ length: pages }, (_, i) => i + 1).map((i) => `<a href="?p=${i}&stars=${filter}" class="btn btn-sm ${i === page ? 'btn-primary' : ''}">${i}</a>`).join('')}</div>` : ''}`}
</div>`;
  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});
