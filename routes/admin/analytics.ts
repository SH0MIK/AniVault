// Ports admin/analytics.php. MySQL date functions (DATE_SUB/CURDATE/HOUR/
// DAYOFWEEK) have no direct D1 equivalents -- rewritten using SQLite's
// strftime()/datetime() modifiers instead.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { h } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';

export const adminAnalyticsRoutes = new Hono<{ Bindings: Env }>();

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, h) => (h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`));

adminAnalyticsRoutes.get('/admin/analytics.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating } = ctx;

  const growth = await db.fetchAll<{ day: string; cnt: number }>(
    `SELECT date(created_at) as day, COUNT(*) as cnt FROM users WHERE created_at >= datetime('now', '-30 days') GROUP BY date(created_at) ORDER BY day ASC`
  );
  const heatmapRows = await db.fetchAll<{ hr: number; dow: number; cnt: number }>(
    `SELECT CAST(strftime('%H', created_at) AS INTEGER) as hr, CAST(strftime('%w', created_at) AS INTEGER) + 1 as dow, COUNT(*) as cnt
     FROM activity_log WHERE created_at >= datetime('now', '-60 days') GROUP BY hr, dow`
  );
  const heatMatrix: Record<number, Record<number, number>> = {};
  let heatMax = 1;
  for (const r of heatmapRows) {
    if (!heatMatrix[r.dow]) heatMatrix[r.dow] = {};
    heatMatrix[r.dow][r.hr] = r.cnt;
    if (r.cnt > heatMax) heatMax = r.cnt;
  }

  const topAnime = await db.fetchAll<any>(
    `SELECT anime_title, anime_image, anime_id, COUNT(*) as total,
      SUM(CASE WHEN status='watching' THEN 1 ELSE 0 END) as watching,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status='plan_to_watch' THEN 1 ELSE 0 END) as planning
     FROM anime_list GROUP BY anime_id ORDER BY total DESC LIMIT 15`
  );

  const thisWeek = await db.count(`SELECT COUNT(*) as cnt FROM users WHERE created_at >= datetime('now', '-7 days')`);
  const lastWeek = await db.count(`SELECT COUNT(*) as cnt FROM users WHERE created_at BETWEEN datetime('now', '-14 days') AND datetime('now', '-7 days')`);
  const weekDiff = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : 100;

  const peakHour = await db.fetchOne<{ hr: number; cnt: number }>(
    `SELECT CAST(strftime('%H', created_at) AS INTEGER) as hr, COUNT(*) as cnt FROM activity_log WHERE created_at >= datetime('now', '-30 days') GROUP BY hr ORDER BY cnt DESC LIMIT 1`
  );

  const growthDays: string[] = [];
  const growthCounts: number[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const dayStr = d.toISOString().split('T')[0];
    growthDays.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const found = growth.find((r) => r.day === dayStr);
    growthCounts.push(found ? found.cnt : 0);
  }

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Analytics', adminPage: 'analytics', isOwner, impersonating });

  const topTitle = topAnime[0]?.anime_title ?? '—';
  const topTitleTrunc = topTitle.length > 16 ? topTitle.substring(0, 16) + '…' : topTitle;

  html += `
<div class="admin-header"><h1>📊 Analytics</h1><span class="text-muted">Last 30–60 days of activity</span></div>

<div class="admin-kpi" style="margin-bottom:1.5rem;">
  <div class="kpi-card blue"><div class="kpi-icon">📈</div><div class="kpi-value">${thisWeek.toLocaleString('en-US')}</div><div class="kpi-label">New Users This Week</div>
    <div style="font-size:0.75rem;margin-top:4px;color:${weekDiff >= 0 ? '#4caf50' : '#f44336'}">${weekDiff >= 0 ? '▲' : '▼'} ${Math.abs(weekDiff)}% vs last week</div>
  </div>
  <div class="kpi-card teal"><div class="kpi-icon">⏰</div><div class="kpi-value">${peakHour ? HOURS[peakHour.hr] : '—'}</div><div class="kpi-label">Peak Activity Hour (30d)</div></div>
  <div class="kpi-card gold"><div class="kpi-icon">🏆</div><div class="kpi-value">${h(topTitleTrunc)}</div><div class="kpi-label">Most Tracked Anime</div></div>
</div>

<div class="card card-body mb-3">
  <h2 class="mb-2">👥 New User Registrations (Last 30 Days)</h2>
  <canvas id="growthChart" height="90"></canvas>
</div>

<div class="card card-body mb-3">
  <h2 class="mb-2">🔥 Activity Heatmap — When Users Are Most Active (Last 60 Days)</h2>
  <p class="text-muted" style="font-size:0.82rem;margin-bottom:1rem;">Darker = more activity. Rows = day of week, Columns = hour of day.</p>
  <div style="overflow-x:auto;">
    <table style="border-collapse:collapse;min-width:700px;width:100%;font-size:0.72rem;">
      <thead><tr><th style="width:40px;"></th>${HOURS.map((hLabel) => `<th style="padding:2px 0;text-align:center;color:var(--text-muted);font-weight:400;min-width:26px;">${hLabel}</th>`).join('')}</tr></thead>
      <tbody>
        ${Array.from({ length: 7 }, (_, i) => i + 1).map((dow) => `
        <tr>
          <td style="padding:3px 8px 3px 0;color:var(--text-muted);white-space:nowrap;">${DAYS[dow - 1]}</td>
          ${Array.from({ length: 24 }, (_, hr) => {
            const cnt = heatMatrix[dow]?.[hr] ?? 0;
            const intensity = cnt / heatMax;
            const alpha = Math.round((intensity * 0.85 + (cnt > 0 ? 0.08 : 0)) * 100) / 100;
            return `<td style="padding:2px;"><div title="${DAYS[dow - 1]} ${HOURS[hr]}: ${cnt} events" style="width:22px;height:18px;border-radius:3px;background:rgba(255,42,42,${alpha});border:1px solid rgba(255,255,255,0.04);"></div></td>`;
          }).join('')}
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
  <div style="display:flex;align-items:center;gap:6px;margin-top:12px;font-size:0.78rem;color:var(--text-muted);">
    <span>Less</span>
    ${[0.05, 0.2, 0.4, 0.6, 0.85].map((a) => `<div style="width:16px;height:16px;border-radius:3px;background:rgba(255,42,42,${a});border:1px solid rgba(255,255,255,0.06);"></div>`).join('')}
    <span>More</span>
  </div>
</div>

<div class="card card-body mb-3">
  <h2 class="mb-2">🎌 Top Tracked Anime on AniVault</h2>
  <div class="data-table-wrap"><table class="data-table">
    <thead><tr><th>#</th><th>Anime</th><th>Total</th><th>Watching</th><th>Completed</th><th>Planning</th></tr></thead>
    <tbody>
      ${topAnime.map((a, i) => `
      <tr>
        <td class="text-muted">${i + 1}</td>
        <td><div class="flex" style="gap:10px;align-items:center;">
          ${a.anime_image ? `<img src="${h(a.anime_image)}" style="width:28px;height:40px;object-fit:cover;border-radius:3px;">` : ''}
          <a href="${siteUrl}/pages/anime.php?id=${a.anime_id}" style="color:var(--text-primary);">${h(a.anime_title)}</a>
        </div></td>
        <td><strong>${a.total.toLocaleString('en-US')}</strong></td>
        <td><span class="badge badge-watching">${a.watching}</span></td>
        <td><span class="badge badge-completed">${a.completed}</span></td>
        <td><span class="badge badge-ptw">${a.planning}</span></td>
      </tr>`).join('')}
    </tbody>
  </table></div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<script>
const ctx = document.getElementById('growthChart').getContext('2d');
new Chart(ctx, {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(growthDays)},
    datasets: [{ label: 'New Users', data: ${JSON.stringify(growthCounts)}, backgroundColor: 'rgba(255,42,42,0.5)', borderColor: 'rgba(255,42,42,0.9)', borderWidth: 1, borderRadius: 4 }]
  },
  options: {
    responsive: true,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.y + ' new users' } } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888', maxTicksLimit: 10 } },
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888', precision: 0 }, beginAtZero: true }
    }
  }
});
</script>`;

  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});
