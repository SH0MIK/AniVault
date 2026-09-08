// Ports admin/watch_stats.php. MySQL's CONCAT() has no SQLite equivalent --
// rewritten using the || concatenation operator. Schema self-healing
// (guest_id column/index) isn't needed -- D1 already has it from Phase 1.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { h } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';
import { Logger } from '../../lib/logger';

export const adminWatchStatsRoutes = new Hono<{ Bindings: Env }>();

function fmtTime(secs: number): string {
  if (secs <= 0) return '—';
  const hrs = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

// Matches the save_progress write-gate in api-lists.ts, which now only
// skips writing when episode_duration is unknown (null/0) -- so "null"
// here means the same: no duration or no watch_time recorded. Rows with
// real (even small) progress are left alone.

adminWatchStatsRoutes.on(['GET', 'POST'], '/admin/watch_stats.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating, userId } = ctx;

  if (c.req.method === 'POST') {
    const body = await c.req.parseBody();
    const action = (body.action as string) ?? '';
    if (action === 'purge_null_watch') {
      const result = await db.query(
        `DELETE FROM watch_history
         WHERE watch_time IS NULL OR watch_time = 0
            OR episode_duration IS NULL OR episode_duration = 0`
      );
      const removed = result.meta?.changes ?? 0;
      await Logger.log(db, userId, 'admin_purge_watch_history', `Purged ${removed} null watch_history rows`);
      session.setFlash('success', `✅ Removed ${removed} null watch log entries.`);
    }
    await session.save(c, lifetime);
    return c.redirect(`${siteUrl}/admin/watch_stats.php`);
  }

  const search = (c.req.query('search') ?? '').trim();
  const animeQ = (c.req.query('anime') ?? '').trim();
  const dateFrom = (c.req.query('from') ?? '').trim();
  const dateTo = (c.req.query('to') ?? '').trim();
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const limit = 25;
  const offset = (page - 1) * limit;

  const VIEWER_KEY = `CASE WHEN user_id IS NOT NULL THEN 'u:' || user_id ELSE guest_id END`;

  const totalWatches = await db.count('SELECT COUNT(*) as cnt FROM watch_history');
  const totalViewers = await db.count(`SELECT COUNT(DISTINCT ${VIEWER_KEY}) as cnt FROM watch_history WHERE user_id IS NOT NULL OR guest_id IS NOT NULL`);
  const guestViews = await db.count('SELECT COUNT(*) as cnt FROM watch_history WHERE user_id IS NULL AND guest_id IS NOT NULL');
  const totalSecsRow = await db.fetchOne<{ s: number }>('SELECT COALESCE(SUM(watch_time),0) as s FROM watch_history');
  const totalSecs = totalSecsRow?.s ?? 0;
  const activeToday = await db.count(`SELECT COUNT(DISTINCT ${VIEWER_KEY}) as cnt FROM watch_history WHERE watched_at >= date('now') AND (user_id IS NOT NULL OR guest_id IS NOT NULL)`);
  const activeThisWeek = await db.count(`SELECT COUNT(DISTINCT ${VIEWER_KEY}) as cnt FROM watch_history WHERE watched_at >= datetime('now', '-7 days') AND (user_id IS NOT NULL OR guest_id IS NOT NULL)`);

  const topAnime = await db.fetchAll<any>(
    `SELECT anime_id, anime_title, anime_image, COUNT(*) as watch_count,
      COUNT(DISTINCT ${VIEWER_KEY}) as viewer_count, COALESCE(SUM(watch_time),0) as total_seconds
     FROM watch_history GROUP BY anime_id, anime_title, anime_image ORDER BY watch_count DESC LIMIT 10`
  );

  const dailyActivity = await db.fetchAll<{ day: string; cnt: number; viewers: number }>(
    `SELECT date(watched_at) as day, COUNT(*) as cnt, COUNT(DISTINCT ${VIEWER_KEY}) as viewers
     FROM watch_history WHERE watched_at >= datetime('now', '-13 days') GROUP BY date(watched_at) ORDER BY day ASC`
  );

  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  if (search) { where += ' AND (u.username LIKE ? OR wh.guest_id LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (animeQ) { where += ' AND wh.anime_title LIKE ?'; params.push(`%${animeQ}%`); }
  if (dateFrom) { where += ' AND date(wh.watched_at) >= ?'; params.push(dateFrom); }
  if (dateTo) { where += ' AND date(wh.watched_at) <= ?'; params.push(dateTo); }

  const totalRows = await db.count(`SELECT COUNT(*) as cnt FROM watch_history wh LEFT JOIN users u ON wh.user_id = u.id ${where}`, params);
  const totalPages = Math.max(1, Math.ceil(totalRows / limit));
  const rows = await db.fetchAll<any>(
    `SELECT wh.*, u.username FROM watch_history wh LEFT JOIN users u ON wh.user_id = u.id ${where} ORDER BY wh.watched_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  const topWatchers = await db.fetchAll<any>(
    `SELECT u.username, u.id, COUNT(*) as ep_count, COUNT(DISTINCT wh.anime_id) as anime_count, COALESCE(SUM(wh.watch_time),0) as total_seconds
     FROM watch_history wh INNER JOIN users u ON wh.user_id = u.id
     WHERE wh.user_id IS NOT NULL GROUP BY wh.user_id, u.username, u.id ORDER BY ep_count DESC LIMIT 8`
  );

  const dayMap: Record<string, { cnt: number; viewers: number }> = {};
  for (const d of dailyActivity) dayMap[d.day] = { cnt: d.cnt, viewers: d.viewers };
  const days: { label: string; cnt: number; viewers: number }[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = d.toISOString().split('T')[0];
    days.push({ label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), cnt: dayMap[key]?.cnt ?? 0, viewers: dayMap[key]?.viewers ?? 0 });
  }
  const maxCnt = Math.max(1, ...days.map((d) => d.cnt));

  const flash = session.takeFlash();
  const suc = flash?.type === 'success' ? flash.message : null;

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Watch Stats', adminPage: 'watch_stats', isOwner, impersonating });
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  html += `
<div class="admin-header"><div><h1>📺 Watch Stats</h1><p class="text-muted" style="font-size:0.9rem;">What your users are watching</p></div><span class="text-muted" style="font-size:0.85rem;">${dateLabel}</span></div>
${suc ? `<div class="alert alert-success mb-2">${h(suc)}</div>` : ''}

<div class="admin-kpi" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:1.5rem;">
  <div class="kpi-card blue"><div class="kpi-icon">▶</div><div class="kpi-value">${totalWatches.toLocaleString('en-US')}</div><div class="kpi-label">Total Episode Views</div></div>
  <div class="kpi-card teal"><div class="kpi-icon">👥</div><div class="kpi-value">${totalViewers.toLocaleString('en-US')}</div><div class="kpi-label">Unique Viewers</div></div>
  <div class="kpi-card gold"><div class="kpi-icon">⏱</div><div class="kpi-value">${fmtTime(totalSecs)}</div><div class="kpi-label">Total Watch Time</div></div>
  <div class="kpi-card accent"><div class="kpi-icon">🟢</div><div class="kpi-value">${activeToday.toLocaleString('en-US')}</div><div class="kpi-label">Active Today</div></div>
  <div class="kpi-card purple"><div class="kpi-icon">📅</div><div class="kpi-value">${activeThisWeek.toLocaleString('en-US')}</div><div class="kpi-label">Active This Week</div></div>
  <div class="kpi-card" style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid rgba(255,255,255,.08);"><div class="kpi-icon">👁</div><div class="kpi-value">${guestViews.toLocaleString('en-US')}</div><div class="kpi-label">Guest Views</div></div>
</div>

<div class="grid-2" style="gap:1.5rem;margin-bottom:1.5rem;">
  <div class="card card-body">
    <h2 class="mb-2">📈 Daily Views (Last 14 Days)</h2>
    <div style="display:flex;align-items:flex-end;gap:4px;height:120px;margin-top:8px;">
      ${days.map((d) => {
        const barH = Math.max(2, Math.round((d.cnt / maxCnt) * 110));
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;" title="${d.label}: ${d.cnt} views, ${d.viewers} viewers">
          <div style="width:100%;background:var(--accent,#e00);border-radius:3px 3px 0 0;height:${barH}px;opacity:0.85;transition:opacity .15s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.85"></div>
          <span style="font-size:0.6rem;color:var(--text-muted);writing-mode:vertical-lr;transform:rotate(180deg);height:28px;">${d.label}</span>
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;gap:1rem;margin-top:8px;font-size:0.78rem;color:var(--text-muted);"><span>■ <span style="color:var(--accent);">Bar height</span> = episode views</span><span>Hover for details</span></div>
  </div>

  <div class="card card-body">
    <h2 class="mb-2">🏆 Top Watchers</h2>
    <div class="data-table-wrap"><table class="data-table">
      <thead><tr><th>#</th><th>User</th><th>Episodes</th><th>Anime</th><th>Watch Time</th></tr></thead>
      <tbody>
        ${topWatchers.map((w, i) => `
        <tr>
          <td style="color:var(--text-muted);font-size:0.8rem;">${i + 1}</td>
          <td><a href="users.php?search=${h(w.username)}" style="font-weight:500;">${h(w.username ?? 'Unknown')}</a></td>
          <td><span class="badge badge-watching">${w.ep_count.toLocaleString('en-US')}</span></td>
          <td style="color:var(--text-muted);font-size:0.85rem;">${w.anime_count.toLocaleString('en-US')}</td>
          <td style="font-size:0.83rem;color:var(--text-secondary);">${fmtTime(w.total_seconds)}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>
</div>

<div class="card card-body" style="margin-bottom:1.5rem;">
  <h2 class="mb-2">🔥 Most Watched Anime</h2>
  <div class="data-table-wrap"><table class="data-table">
    <thead><tr><th>#</th><th>Anime</th><th>Episode Views</th><th>Unique Viewers</th><th>Total Watch Time</th></tr></thead>
    <tbody>
      ${topAnime.map((a, i) => `
      <tr>
        <td style="color:var(--text-muted);font-size:0.8rem;">${i + 1}</td>
        <td><div class="flex" style="gap:8px;align-items:center;">${a.anime_image ? `<img src="${h(a.anime_image)}" style="width:28px;height:40px;object-fit:cover;border-radius:3px;flex-shrink:0;">` : ''}<a href="${siteUrl}/pages/anime.php?id=${a.anime_id}" target="_blank" style="font-size:0.88rem;">${h(a.anime_title)}</a></div></td>
        <td><span class="badge badge-watching">${a.watch_count.toLocaleString('en-US')}</span></td>
        <td style="color:var(--text-muted);font-size:0.85rem;">${a.viewer_count.toLocaleString('en-US')} users</td>
        <td style="font-size:0.83rem;color:var(--text-secondary);">${fmtTime(a.total_seconds)}</td>
      </tr>`).join('')}
    </tbody>
  </table></div>
</div>

<div class="card card-body">
  <div class="flex-between mb-2"><h2>🗂 Watch Log</h2><span class="text-muted" style="font-size:0.85rem;">${totalRows.toLocaleString('en-US')} entries</span></div>
  <form method="POST" class="mb-3" onsubmit="return confirm('Permanently delete all watch_history rows with null/zero watch time or duration? This cannot be undone.');">
    <input type="hidden" name="action" value="purge_null_watch">
    <button type="submit" class="btn btn-ghost" style="border-color:var(--accent,#e00);color:var(--accent,#e00);">🗑 Purge null watch logs</button>
  </form>
  <form method="GET" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:1rem;">
    <input type="text" name="search" class="form-control" placeholder="Username..." value="${h(search)}" style="max-width:180px;">
    <input type="text" name="anime" class="form-control" placeholder="Anime title..." value="${h(animeQ)}" style="max-width:200px;">
    <input type="date" name="from" class="form-control" value="${h(dateFrom)}" style="max-width:150px;">
    <input type="date" name="to" class="form-control" value="${h(dateTo)}" style="max-width:150px;">
    <button type="submit" class="btn btn-primary">Filter</button>
    ${(search || animeQ || dateFrom || dateTo) ? `<a href="watch_stats.php" class="btn btn-ghost">Clear</a>` : ''}
  </form>

  <div class="data-table-wrap"><table class="data-table">
    <thead><tr><th>When</th><th>User</th><th>Anime</th><th>Episode</th><th>Watch Time</th><th>Progress</th></tr></thead>
    <tbody>
      ${rows.length === 0 ? `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem;">No records found.</td></tr>` : rows.map((r) => {
        const watchTime = r.watch_time ?? 0;
        const duration = r.episode_duration ?? 0;
        const pct = duration > 0 && watchTime > 0 ? Math.min(100, Math.round((watchTime / duration) * 100)) : 0;
        const ts = r.watched_at ? Math.floor(new Date(r.watched_at.replace(' ', 'T') + 'Z').getTime() / 1000) : 0;
        const dateStr = r.watched_at ? new Date(r.watched_at.replace(' ', 'T') + 'Z').toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '';
        return `
      <tr>
        <td style="white-space:nowrap;font-size:0.8rem;color:var(--text-muted);"><time class="local-ts" data-ts="${ts}" data-full="1">${dateStr}</time></td>
        <td>${r.username ? `<a href="users.php?search=${h(r.username)}" style="font-weight:500;">${h(r.username)}</a>` : `<span style="display:inline-flex;align-items:center;gap:5px;"><span style="font-size:.72rem;background:rgba(255,255,255,.08);color:var(--text-muted);padding:1px 6px;border-radius:4px;font-weight:600;letter-spacing:.03em;">GUEST</span><span style="font-size:.75rem;color:var(--text-muted);font-family:monospace;">${h((r.guest_id ?? '').substring(0, 10))}</span></span>`}</td>
        <td style="font-size:0.85rem;"><a href="${siteUrl}/pages/anime.php?id=${r.anime_id}" target="_blank">${h(r.anime_title || `Anime #${r.anime_id}`)}</a></td>
        <td style="font-size:0.85rem;color:var(--text-muted);">Ep ${r.episode_num}</td>
        <td style="font-size:0.83rem;">${fmtTime(watchTime)}</td>
        <td style="min-width:100px;">${pct > 0 ? `<div style="display:flex;align-items:center;gap:6px;"><div class="progress-bar" style="flex:1;height:6px;"><div class="progress-fill" style="width:${pct}%;background:${pct >= 85 ? 'var(--success,#22c55e)' : 'var(--accent,#e00)'};"></div></div><span style="font-size:0.75rem;color:var(--text-muted);width:32px;">${pct}%</span></div>` : `<span style="color:var(--text-muted);font-size:0.8rem;">—</span>`}</td>
      </tr>`;
      }).join('')}
    </tbody>
  </table></div>

  ${totalPages > 1 ? (() => {
    const qp = new URLSearchParams();
    if (search) qp.set('search', search); if (animeQ) qp.set('anime', animeQ); if (dateFrom) qp.set('from', dateFrom); if (dateTo) qp.set('to', dateTo);
    const qs = qp.toString() ? '&' + qp.toString() : '';
    const start = Math.max(1, page - 2), end = Math.min(totalPages, page + 2);
    let out = `<div style="display:flex;gap:6px;margin-top:1rem;flex-wrap:wrap;align-items:center;">`;
    if (page > 1) out += `<a href="?page=${page - 1}${qs}" class="btn btn-ghost btn-sm">← Prev</a>`;
    for (let i = start; i <= end; i++) out += `<a href="?page=${i}${qs}" class="btn btn-ghost btn-sm ${i === page ? 'active' : ''}">${i}</a>`;
    if (page < totalPages) out += `<a href="?page=${page + 1}${qs}" class="btn btn-ghost btn-sm">Next →</a>`;
    out += `<span class="text-muted" style="font-size:0.8rem;margin-left:4px;">Page ${page} of ${totalPages}</span></div>`;
    return out;
  })() : ''}
</div>`;

  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});
