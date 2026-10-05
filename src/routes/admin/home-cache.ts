import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { h } from '../../lib/helpers';
import { Logger } from '../../lib/logger';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';
import { getHomepageRefreshMinutes, getHomepageSnapshot, refreshHomepageSnapshot } from '../../lib/home-cache';
import { MalAPI } from '../../lib/mal-api';

export const adminHomepageCacheRoutes = new Hono<{ Bindings: Env }>();

adminHomepageCacheRoutes.on(['GET', 'POST'], '/admin/home-cache.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');

  const { db, session, lifetime, isOwner, impersonating, userId } = ctx;
  let message = '';
  let error = '';

  if (c.req.method === 'POST') {
    try {
      const body = await c.req.parseBody();
      const action = String(body.action ?? '');

      if (action === 'save_interval') {
        const minutes = Number(body.refresh_minutes ?? 360);
        const allowed = [60, 120, 180, 360, 720, 1440, 2880, 4320, 10080, 43200];
        const value = allowed.includes(minutes) ? minutes : 360;
        await db.query(
          "INSERT INTO settings (key, value) VALUES ('homepage_cache_refresh_minutes', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          [String(value)]
        );
        await Logger.log(db, userId, 'homepage_cache_settings', 'Homepage cache auto-refresh set to ' + value + ' minutes');
        message = 'Auto-refresh interval saved.';
      } else if (action === 'refresh_now') {
        const mal = new MalAPI(c.env, c.env.API_CACHE, db);
        const snapshot = await refreshHomepageSnapshot(db, mal);
        if (!snapshot) throw new Error('Homepage cache refresh returned no data.');
        await Logger.log(db, userId, 'homepage_cache_refresh', 'Manually refreshed Trending, Most Popular and Coming Soon homepage data');
        message = 'Homepage data refreshed successfully.';
      }
    } catch (e: any) {
      error = e?.message ?? 'Homepage cache action failed.';
    }
    await session.save(c, lifetime);
  }

  const snapshot = await getHomepageSnapshot(db);
  const refreshMinutes = await getHomepageRefreshMinutes(db);
  const labels: Record<number, string> = {
    60: '1 hour', 120: '2 hours', 180: '3 hours', 360: '6 hours', 720: '12 hours',
    1440: '1 day', 2880: '2 days', 4320: '3 days', 10080: '7 days', 43200: '30 days',
  };
  const updated = snapshot?.updatedAt ? new Date(snapshot.updatedAt * 1000).toISOString() : 'Never';

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Homepage Cache', adminPage: 'home_cache', isOwner, impersonating });
  html += `
<div class="admin-header">
  <div><h1>Homepage Data Cache</h1><p class="text-muted" style="font-size:.9rem;">D1-backed snapshots for the homepage's external API sections.</p></div>
</div>

${message ? \\`<div class="alert alert-success mb-2">${h(message)}</div>\\` : ''}
${error ? \\`<div class="alert alert-error mb-2">${h(error)}</div>\\` : ''}

<div class="grid-2" style="gap:1.5rem;margin-bottom:1.5rem;">
  <div class="card card-body">
    <h2 class="mb-2">⚡ Cache Status</h2>
    <div class="data-table-wrap"><table class="data-table"><tbody>
      <tr><td>Last successful refresh</td><td><strong>${h(updated)}</strong></td></tr>
      <tr><td>Trending Now</td><td>${snapshot?.trending.length ?? 0} cards</td></tr>
      <tr><td>Most Popular</td><td>${snapshot?.popular.length ?? 0} cards</td></tr>
      <tr><td>Coming Soon</td><td>${snapshot?.upcoming.length ?? 0} cards</td></tr>
    </tbody></table></div>
    <form method="POST" style="margin-top:1rem;">
      <input type="hidden" name="action" value="refresh_now">
      <button class="btn btn-primary" type="submit">🔄 Refresh Homepage Data Now</button>
    </form>
  </div>

  <div class="card card-body">
    <h2 class="mb-2">⏱️ Automatic Refresh</h2>
    <p class="text-muted" style="font-size:.85rem;">The Worker checks this setting on its scheduled tick. Visitors never need to wait for the refresh.</p>
    <form method="POST">
      <input type="hidden" name="action" value="save_interval">
      <select class="form-control" name="refresh_minutes" style="max-width:240px;margin-bottom:12px;">
        ${Object.entries(labels).map(([value, label]) => \\`<option value="${value}" ${Number(value) === refreshMinutes ? 'selected' : ''}>${label}</option>\\`).join('')}
      </select>
      <button class="btn btn-secondary" type="submit">💾 Save Refresh Interval</button>
    </form>
  </div>
</div>

<div class="card card-body">
  <h2 class="mb-2">What is cached?</h2>
  <p class="text-muted" style="font-size:.88rem;line-height:1.6;">
    Complete normalized card data is stored in D1, including titles, scores, episode counts,
    genres, descriptions, and the resolved TMDB poster/cover/logo. The public homepage reads
    these snapshots instead of calling AniList/MAL for these rows.
  </p>
  <p class="text-muted" style="font-size:.8rem;margin-bottom:0;">
    Default: 6 hours. Available: 1 hour → 30 days. Manual refresh always replaces the snapshot immediately.
  </p>
</div>
`;
  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});
