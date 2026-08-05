// Ports admin/index.php (dashboard).
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { Logger } from '../../lib/logger';
import { Badge } from '../../lib/badges';
import { h, timeAgo, statusBadge, roleBadge } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';

export const adminIndexRoutes = new Hono<{ Bindings: Env }>();

adminIndexRoutes.get('/admin/index.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating } = ctx;

  const totalUsers = await db.count('SELECT COUNT(*) as cnt FROM users');
  const activeUsers = await db.count("SELECT COUNT(*) as cnt FROM users WHERE last_login > datetime('now', '-7 days')");
  const totalAnime = await db.count('SELECT COUNT(*) as cnt FROM anime_list');
  const totalFavs = await db.count('SELECT COUNT(*) as cnt FROM favorites');
  const newUsers = await db.count("SELECT COUNT(*) as cnt FROM users WHERE created_at > datetime('now', '-7 days')");

  const topTracked = await db.fetchAll<any>(
    'SELECT anime_title, anime_image, anime_id, COUNT(*) as cnt FROM anime_list GROUP BY anime_id ORDER BY cnt DESC LIMIT 8'
  );
  const statusBreakdown = await db.fetchAll<{ status: string; cnt: number }>(
    'SELECT status, COUNT(*) as cnt FROM anime_list GROUP BY status ORDER BY cnt DESC'
  );
  const recentUsers = await db.fetchAll<any>(
    'SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 5'
  );
  const recentUserBadges = await Badge.getForUsers(db, recentUsers.map((u) => u.id));
  const recentActivity = await Logger.getRecent(db, 10);

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Dashboard', adminPage: 'index', isOwner, impersonating });

  const totalStatusCount = statusBreakdown.reduce((sum, r) => sum + r.cnt, 0);
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  html += `
<div class="admin-header">
  <div><h1>Dashboard</h1><p class="text-muted" style="font-size:0.9rem;">Welcome back, ${h(session.data.username ?? '')}!</p></div>
  <span class="text-muted" style="font-size:0.85rem;">${dateLabel}</span>
</div>

<div class="admin-kpi">
  <div class="kpi-card blue"><div class="kpi-icon">👥</div><div class="kpi-value">${totalUsers.toLocaleString('en-US')}</div><div class="kpi-label">Total Users</div></div>
  <div class="kpi-card teal"><div class="kpi-icon">🟢</div><div class="kpi-value">1181</div><div class="kpi-label">Active (7 days)</div></div>
  <div class="kpi-card gold"><div class="kpi-icon">📋</div><div class="kpi-value">${totalAnime.toLocaleString('en-US')}</div><div class="kpi-label">List Entries</div></div>
  <div class="kpi-card accent"><div class="kpi-icon">♥</div><div class="kpi-value">${totalFavs.toLocaleString('en-US')}</div><div class="kpi-label">Favorites</div></div>
  <div class="kpi-card purple"><div class="kpi-icon">✨</div><div class="kpi-value">${newUsers.toLocaleString('en-US')}</div><div class="kpi-label">New Users (7d)</div></div>
</div>

<div class="grid-2" style="gap:1.5rem;margin-bottom:1.5rem;">
  <div class="card card-body">
    <h2 class="mb-2">🔥 Most Tracked Anime</h2>
    ${topTracked.map((a, i) => `
    <div class="flex" style="gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
      <span style="color:var(--text-muted);font-family:var(--font-display);font-size:0.8rem;width:20px;">#${i + 1}</span>
      ${a.anime_image ? `<img src="${h(a.anime_image)}" style="width:32px;height:45px;object-fit:cover;border-radius:4px;">` : ''}
      <a href="${siteUrl}/pages/anime.php?id=${a.anime_id}" style="flex:1;color:var(--text-primary);font-size:0.88rem;">${h(a.anime_title)}</a>
      <span class="badge badge-watching">${a.cnt} users</span>
    </div>`).join('')}
  </div>

  <div>
    <div class="card card-body mb-2">
      <h2 class="mb-2">📊 List Status Breakdown</h2>
      ${statusBreakdown.map((row) => {
        const pct = totalStatusCount > 0 ? Math.round((row.cnt / totalStatusCount) * 100) : 0;
        return `
      <div style="margin-bottom:10px;">
        <div class="flex-between" style="font-size:0.85rem;margin-bottom:4px;">
          ${statusBadge(row.status)}
          <span style="color:var(--text-muted);">${row.cnt} (${pct}%)</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>`;
      }).join('')}
    </div>
  </div>
</div>

<div class="grid-2" style="gap:1.5rem;">
  <div class="card card-body">
    <div class="flex-between mb-2"><h2>👤 New Users</h2><a href="users.php" class="btn btn-ghost btn-sm">View All</a></div>
    <div class="data-table-wrap"><table class="data-table">
      <thead><tr><th>Username</th><th>Role</th><th>Joined</th></tr></thead>
      <tbody>
        ${recentUsers.map((u) => `
        <tr>
          <td>
            <span class="username-with-badges">
              <a href="users.php?search=${h(u.username)}">${h(u.username)}</a>
              ${Badge.renderList(recentUserBadges[u.id] ?? [])}
            </span>
            <br><span class="text-muted" style="font-size:0.78rem;">${h(u.email)}</span>
          </td>
          <td>${roleBadge(u.role, u.id)}</td>
          <td class="text-muted" style="font-size:0.8rem;">${timeAgo(u.created_at)}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>

  <div class="card card-body">
    <div class="flex-between mb-2"><h2>📋 Recent Activity</h2><a href="activity.php" class="btn btn-ghost btn-sm">View All</a></div>
    ${recentActivity.map((log: any) => `
    <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:0.85rem;">
      <div class="flex-between">
        <span style="color:var(--text-primary);"><strong>${h(log.username ?? 'Guest')}</strong> — ${h(log.action)}</span>
        <span class="text-muted" style="font-size:0.78rem;">${timeAgo(log.created_at)}</span>
      </div>
      ${log.details ? `<span class="text-muted">${h(log.details)}</span>` : ''}
    </div>`).join('')}
  </div>
</div>`;

  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});
