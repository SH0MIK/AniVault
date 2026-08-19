// admin/episode_scanner.php — dedicated page for keeping episode_air_cache
// fresh on *currently airing* shows specifically (see src/lib/episode-air.ts
// for the candidate-selection + scan logic). Two moving parts:
//   1. A settings form (auto_enabled + interval) read by scheduled.ts's cron.
//   2. A "Scan Now" button that runs the same scan synchronously, for when
//      you don't want to wait for the next cron tick.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { Db } from '../../lib/db';
import { Session } from '../../lib/session';
import { Auth } from '../../lib/auth';
import { Settings } from '../../lib/settings';
import { Logger } from '../../lib/logger';
import { MalAPI } from '../../lib/mal-api';
import { EpisodeAir } from '../../lib/episode-air';
import { h } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';

export const adminEpisodeScannerRoutes = new Hono<{ Bindings: Env }>();

const INTERVAL_OPTIONS = [
  { value: '30', label: '30 min' },
  { value: '60', label: '1 hour' },
  { value: '180', label: '3 hours' },
  { value: '360', label: '6 hours' },
  { value: '720', label: '12 hours' },
];
export const SCANNER_LAST_RUN_KV_KEY = 'episode_scanner_last_run';

adminEpisodeScannerRoutes.on(['GET', 'POST'], '/admin/episode_scanner.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating, userId } = ctx;
  const settings = new Settings(db);
  let message = '';

  if (c.req.method === 'POST') {
    const body = await c.req.parseBody();
    const enabled = body.auto_enabled !== undefined ? '1' : '0';
    let interval = String(body.interval_minutes ?? '60');
    if (!INTERVAL_OPTIONS.some((o) => o.value === interval)) interval = '60';
    await settings.set('episode_scanner_auto_enabled', enabled);
    await settings.set('episode_scanner_interval_minutes', interval);
    await Logger.log(db, userId, 'admin_episode_scanner_settings', `Episode scanner: auto-run ${enabled === '1' ? 'enabled' : 'disabled'}, interval ${interval}m`);
    message = '✅ Scanner settings saved.';
  }

  const autoEnabled = (await settings.get('episode_scanner_auto_enabled', '1')) === '1';
  const intervalMinutes = (await settings.get('episode_scanner_interval_minutes', '60')) ?? '60';
  const lastRunRaw = await c.env.API_CACHE.get(SCANNER_LAST_RUN_KV_KEY);
  const lastRun = lastRunRaw ? new Date(parseInt(lastRunRaw, 10)).toISOString() : null;

  const mal = new MalAPI(c.env, c.env.API_CACHE, db);
  const candidates = await EpisodeAir.getScanCandidates(db, mal);
  const inSeasonCount = candidates.filter((cand) => cand.inSeason).length;

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Episode Scanner', adminPage: 'episode_scanner', isOwner, impersonating });
  html += `
<div class="admin-header"><div><h1>📡 Episode Count Scanner</h1><p class="text-muted" style="font-size:0.9rem;">Keeps episode_air_cache fresh for currently-airing anime specifically, instead of chasing whatever's oldest.</p></div></div>
${message ? `<div class="alert alert-success mb-2">${h(message)}</div>` : ''}

<div class="grid-2" style="gap:1.5rem;margin-bottom:1.5rem;">
  <div class="card card-body">
    <h2 class="mb-2">⚙️ Auto-Run Settings</h2>
    <p class="text-muted mb-2" style="font-size:0.9rem;">When enabled, the hourly cron checks this interval and runs a scan on its own — no need to visit this page.</p>
    <form method="POST">
      <div class="form-group" style="display:flex;align-items:center;gap:12px;margin-bottom:1.25rem;">
        <label class="form-label" style="margin:0;min-width:100px;">Auto-Run</label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <div class="toggle-wrap"><input type="checkbox" name="auto_enabled" ${autoEnabled ? 'checked' : ''}><span class="toggle-slider"></span></div>
          <span style="font-size:0.9rem;color:var(--text-secondary);">Enable automatic scanning</span>
        </label>
      </div>
      <div class="form-group" style="margin-bottom:1.25rem;">
        <label class="form-label">Scan interval</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
          ${INTERVAL_OPTIONS.map((opt) => `<label style="cursor:pointer;"><input type="radio" name="interval_minutes" value="${opt.value}" ${intervalMinutes === opt.value ? 'checked' : ''} style="display:none;" class="interval-radio"><span class="interval-pill ${intervalMinutes === opt.value ? 'active' : ''}">${opt.label}</span></label>`).join('')}
        </div>
      </div>
      <button type="submit" class="btn btn-primary">💾 Save Settings</button>
    </form>
    <p class="text-muted mt-2" style="font-size:0.8rem;">Last auto/manual run: <strong>${lastRun ? h(lastRun) : 'never'}</strong></p>
  </div>

  <div class="card card-body">
    <h2 class="mb-2">🔍 Manual Scan</h2>
    <p class="text-muted mb-2" style="font-size:0.9rem;">Runs the scan right now, regardless of the auto-run setting or interval.</p>
    <div class="grid-2 mb-2" style="gap:12px;">
      <div class="stat-card"><div class="stat-value">${inSeasonCount}</div><div class="stat-label">In current season</div></div>
      <div class="stat-card"><div class="stat-value">${candidates.length}</div><div class="stat-label">Total candidates</div></div>
    </div>
    <button id="scan-now-btn" class="btn btn-secondary">🔄 Scan Now (up to 40)</button>
    <pre id="scan-log" style="display:none;margin-top:10px;font-size:0.78rem;background:rgba(255,255,255,0.03);padding:10px;border-radius:8px;white-space:pre-wrap;"></pre>
  </div>
</div>

<div class="card" style="overflow:auto;">
  <div class="card-body" style="padding-bottom:0;"><h2>📋 Candidates</h2><p class="text-muted" style="font-size:0.85rem;">Current season (AniList) ∪ anything already cached. In-season titles are scanned first.</p></div>
  <table class="data-table">
    <thead><tr><th></th><th>Title</th><th>MAL ID</th><th>Source</th><th>Cached Count</th><th>Last Updated</th></tr></thead>
    <tbody>
      ${candidates.length === 0 ? `<tr><td colspan="6" class="text-center text-muted">No candidates found.</td></tr>` : candidates.map((cand) => `
      <tr>
        <td>${cand.image ? `<img src="${h(cand.image)}" style="width:36px;height:50px;object-fit:cover;border-radius:4px;">` : ''}</td>
        <td><a href="${siteUrl}/pages/anime.php?id=${cand.id}" target="_blank" style="color:var(--text-primary);">${h(cand.title)}</a></td>
        <td>${cand.id}</td>
        <td>${cand.inSeason ? '<span class="badge badge-completed">Airing</span>' : '<span class="badge badge-default">Cached</span>'}</td>
        <td>${cand.cached ? `${cand.cached.aired}${cand.cached.total ? ' / ' + cand.cached.total : ''}` : '<span class="text-muted">—</span>'}</td>
        <td style="font-size:0.8rem;color:var(--text-muted);">${cand.cached ? h(cand.cached.updatedAt) : '<span class="text-muted">never</span>'}</td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>

<style>
.toggle-wrap { position:relative; display:inline-block; width:44px; height:24px; }
.toggle-wrap input { display:none; }
.toggle-slider { position:absolute; inset:0; background:var(--border); border-radius:34px; cursor:pointer; transition:var(--trans); }
.toggle-wrap input:checked + .toggle-slider { background:var(--accent); }
.toggle-slider::before { content:''; position:absolute; width:18px; height:18px; border-radius:50%; left:3px; bottom:3px; background:#fff; transition:var(--trans); }
.toggle-wrap input:checked + .toggle-slider::before { transform:translateX(20px); }
.interval-pill { display:inline-block; padding:5px 14px; border-radius:20px; font-size:0.85rem; border:1px solid var(--border); color:var(--text-secondary); transition:var(--trans); user-select:none; }
.interval-radio:checked + .interval-pill, .interval-pill.active { background:var(--accent); border-color:var(--accent); color:#fff; font-weight:600; }
</style>

<script>
document.querySelectorAll('.interval-radio').forEach(radio => {
  radio.addEventListener('change', () => {
    document.querySelectorAll('.interval-pill').forEach(p => p.classList.remove('active'));
    radio.nextElementSibling.classList.add('active');
  });
});
const scanBtn = document.getElementById('scan-now-btn');
scanBtn.addEventListener('click', async () => {
  scanBtn.disabled = true; scanBtn.textContent = 'Scanning… (can take up to a minute)';
  const log = document.getElementById('scan-log');
  try {
    const res = await fetch('episode_scanner_run.php', { method: 'POST' });
    const data = await res.json();
    log.style.display = 'block';
    log.textContent = JSON.stringify(data, null, 2);
    if (data.success) setTimeout(() => location.reload(), 2000);
  } catch (e) {
    log.style.display = 'block';
    log.textContent = 'Request failed: ' + e;
  }
  scanBtn.disabled = false; scanBtn.textContent = '🔄 Scan Now (up to 40)';
});
</script>`;

  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});

adminEpisodeScannerRoutes.post('/admin/episode_scanner_run.php', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  if (!auth.isAdmin()) { await session.save(c, lifetime); return c.json({ error: 'Forbidden' }, 403); }

  const mal = new MalAPI(c.env, c.env.API_CACHE, db);
  const result = await EpisodeAir.scanCurrentlyAiring(db, c.env, mal, 40);
  await c.env.API_CACHE.put(SCANNER_LAST_RUN_KV_KEY, String(Date.now()));
  await Logger.log(db, session.user_id ?? 0, 'admin_episode_scanner_run',
    `Manual scan: ${result.updated}/${result.scanned} updated (of ${result.candidates} candidates)`);
  await session.save(c, lifetime);
  return c.json({ success: true, ...result });
});
