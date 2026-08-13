// Ports admin/cache.php + admin/api_cache.php. The PHP version tracked
// disk cache files (count + byte size, oldest/newest). Workers KV has no
// direct file listing equivalent -- KV's list() gives keys but not byte
// sizes without fetching each value, so cache "size" isn't tracked here
// (shown as "not tracked on this platform" rather than faking a number).
// Count-based auto-delete threshold logic still works the same way.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { Db } from '../../lib/db';
import { Session } from '../../lib/session';
import { Auth } from '../../lib/auth';
import { Settings } from '../../lib/settings';
import { Logger } from '../../lib/logger';
import { h } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';
import { DubStatus, DUB_LANGUAGES } from '../../lib/dub-status';
import { MalAPI } from '../../lib/mal-api';
import { EpisodeAir } from '../../lib/episode-air';

export const adminCacheRoutes = new Hono<{ Bindings: Env }>();

async function listCacheKeys(kv: KVNamespace): Promise<string[]> {
  const keys: string[] = [];
  for (const prefix of ['mal_', 'jikan_', 'tmdb_logo_']) {
    let cursor: string | undefined;
    do {
      const res = await kv.list({ prefix, cursor, limit: 1000 });
      keys.push(...res.keys.map((k) => k.name));
      cursor = res.list_complete ? undefined : res.cursor;
    } while (cursor);
  }
  return keys;
}

async function clearApiCache(kv: KVNamespace): Promise<number> {
  const keys = await listCacheKeys(kv);
  await Promise.all(keys.map((k) => kv.delete(k)));
  return keys.length;
}

adminCacheRoutes.on(['GET', 'POST'], '/admin/cache.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating, userId } = ctx;
  const settings = new Settings(db);
  let message = '';

  if (c.req.method === 'POST') {
    const body = await c.req.parseBody();
    const action = (body.action as string) ?? '';

    if (action === 'clear_cache') {
      const count = await clearApiCache(c.env.API_CACHE);
      await Logger.log(db, userId, 'admin_clear_cache', `Manually cleared ${count} cache entries`);
      message = `✅ Cleared ${count} API cache entries successfully.`;
    } else if (action === 'save_cache_mode') {
      const disabled = body.api_cache_disabled !== undefined ? '1' : '0';
      await settings.set('api_cache_disabled', disabled);
      let cleared = 0;
      if (disabled === '1') cleared = await clearApiCache(c.env.API_CACHE);
      await Logger.log(db, userId, 'admin_api_cache_mode', `API cache: ${disabled === '1' ? 'disabled' : 'enabled'}${cleared ? `, cleared ${cleared} entries` : ''}`);
      message = disabled === '1' ? `API cache disabled. Cleared ${cleared} existing cache entries.` : 'API cache enabled. New API responses can be cached.';
    } else if (action === 'save_auto_cache') {
      const enabled = body.auto_cache_enabled !== undefined ? '1' : '0';
      let threshold = parseInt((body.auto_cache_threshold as string) ?? '10', 10) || 10;
      if (![5, 10, 20, 50, 100].includes(threshold)) threshold = 10;
      await settings.set('auto_cache_enabled', enabled);
      await settings.set('auto_cache_threshold', String(threshold));
      await Logger.log(db, userId, 'admin_auto_cache_settings', `Auto-cache delete: ${enabled ? 'enabled' : 'disabled'}, threshold: ${threshold} entries`);
      message = '✅ Auto-cache settings saved.';
    }
  }

  const cacheKeys = await listCacheKeys(c.env.API_CACHE);
  const apiCacheDisabled = (await settings.get('api_cache_disabled', '1')) === '1';
  const apiCacheEnabled = await settings.isApiCacheEnabled(c.env.API_CACHE_ENABLED === '1');
  const autoEnabled = apiCacheEnabled && (await settings.get('auto_cache_enabled', '0')) === '1';
  const autoThreshold = parseInt((await settings.get('auto_cache_threshold', '10')) ?? '10', 10);

  const autoLogs = await db.fetchAll<any>(`SELECT * FROM activity_log WHERE action = 'auto_cache_delete' ORDER BY created_at DESC LIMIT 20`);

  const dbStats: [string, number][] = [
    ['Users', await db.count('SELECT COUNT(*) as cnt FROM users')],
    ['Anime Entries', await db.count('SELECT COUNT(*) as cnt FROM anime_list')],
    ['Favorites', await db.count('SELECT COUNT(*) as cnt FROM favorites')],
    ['Reviews', await db.count('SELECT COUNT(*) as cnt FROM reviews')],
    ['Activity Logs', await db.count('SELECT COUNT(*) as cnt FROM activity_log')],
    ['Announcements', await db.count('SELECT COUNT(*) as cnt FROM announcements')],
  ];

  const cf = (c.req.raw as any).cf ?? {};
  const systemInfo: [string, string][] = [
    ['Runtime', 'Cloudflare Workers'],
    ['Request Colo', cf.colo ?? 'Unknown'],
    ['Database', 'D1 (SQLite)'],
    ['Cache', 'Workers KV'],
    ['Storage', 'R2'],
    ['AniVault', '1.0 (Workers)'],
  ];

  const dubCounts = await Promise.all(
    Object.keys(DUB_LANGUAGES).map(async (lang) => [DUB_LANGUAGES[lang], await db.count('SELECT COUNT(*) as cnt FROM dub_status WHERE lang = ?', [lang])] as [string, number])
  );
  const epCacheCount = await db.count('SELECT COUNT(*) as cnt FROM episode_air_cache');
  const epCacheOldest = await db.fetchOne<{ updated_at: string }>('SELECT updated_at FROM episode_air_cache ORDER BY updated_at ASC LIMIT 1');
  const lastDubRefreshRaw = await c.env.API_CACHE.get('dub_status_last_refresh');
  const lastDubRefresh = lastDubRefreshRaw ? new Date(parseInt(lastDubRefreshRaw, 10)).toISOString() : null;

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Cache Management', adminPage: 'cache', isOwner, impersonating });
  html += `
<div class="admin-header"><h1>🗑️ Cache & System</h1></div>
${message ? `<div class="alert alert-success mb-2">${h(message)}</div>` : ''}

<div class="grid-2" style="gap:1.5rem;margin-bottom:1.5rem;">
  <div class="card card-body">
    <h2 class="mb-2">🌐 API Cache (MAL/Jikan)</h2>
    <p class="text-muted mb-2" style="font-size:0.9rem;">
      API cache is currently ${apiCacheEnabled ? 'enabled' : 'disabled'}. ${apiCacheEnabled ? `Responses are cached for ${(Number(c.env.API_CACHE_TIME ?? 3600) / 60).toFixed(0)} minutes.` : 'Requests fetch fresh data without writing cache entries.'}
      <br><span class="text-muted" style="font-size:0.78rem;">Cache byte-size isn't tracked on this platform (Workers KV doesn't expose it without extra reads) — entry count is shown instead.</span>
    </p>

    <form method="POST" class="mb-2" style="padding:12px;border:1px solid var(--border);border-radius:8px;background:rgba(255,255,255,0.03);">
      <input type="hidden" name="action" value="save_cache_mode">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
        <div class="toggle-wrap"><input type="checkbox" name="api_cache_disabled" ${apiCacheDisabled ? 'checked' : ''}><span class="toggle-slider"></span></div>
        <span><strong>Completely disable API cache</strong><br><span class="text-muted" style="font-size:0.82rem;">When enabled, MAL/Jikan data is fetched fresh and no API cache entries are stored.</span></span>
      </label>
      <button type="submit" class="btn btn-primary btn-sm mt-2">Save Cache Mode</button>
    </form>

    <div class="grid-2 mb-2" style="gap:12px;">
      <div class="stat-card"><div class="stat-value" id="live-cache-count">${cacheKeys.length}</div><div class="stat-label">Cached Entries</div></div>
      <div class="stat-card"><div class="stat-value" id="live-cache-size">N/A</div><div class="stat-label">Cache Size</div></div>
    </div>

    <button id="live-clear-btn" class="btn btn-danger">🗑️ Clear All Cache</button>

    ${cacheKeys.length > 0 ? `
    <div style="margin-top:1rem;max-height:200px;overflow-y:auto;">
      <p class="text-muted" style="font-size:0.78rem;margin-bottom:6px;">Sample of cached keys:</p>
      ${cacheKeys.slice(0, 20).map((k) => `<div style="font-size:0.75rem;color:var(--text-muted);padding:2px 0;">${h(k)}</div>`).join('')}
    </div>` : ''}
  </div>

  <div class="card card-body">
    <div class="flex-between mb-2"><h2>⚙️ Auto Cache Delete</h2><span class="badge ${apiCacheEnabled && autoEnabled ? 'badge-completed' : 'badge-default'}">${apiCacheEnabled && autoEnabled ? 'Enabled' : 'Disabled'}</span></div>
    <p class="text-muted mb-3" style="font-size:0.9rem;">Automatically clears all cache entries once the count reaches your chosen threshold. This only runs when API caching is enabled.</p>
    <form method="POST">
      <input type="hidden" name="action" value="save_auto_cache">
      <div class="form-group" style="display:flex;align-items:center;gap:12px;margin-bottom:1.25rem;">
        <label class="form-label" style="margin:0;min-width:140px;">Auto Delete</label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <div class="toggle-wrap"><input type="checkbox" name="auto_cache_enabled" id="auto_cache_toggle" ${autoEnabled ? 'checked' : ''} onchange="document.getElementById('threshold-row').style.opacity=this.checked?'1':'0.4'"><span class="toggle-slider"></span></div>
          <span style="font-size:0.9rem;color:var(--text-secondary);">Enable automatic cache cleanup</span>
        </label>
      </div>
      <div class="form-group" id="threshold-row" style="opacity:${autoEnabled ? '1' : '0.4'};transition:opacity 0.2s;">
        <label class="form-label">Delete when entries exceed</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
          ${[5, 10, 20, 50, 100].map((opt) => `<label style="cursor:pointer;"><input type="radio" name="auto_cache_threshold" value="${opt}" ${autoThreshold === opt ? 'checked' : ''} style="display:none;" class="threshold-radio"><span class="threshold-pill ${autoThreshold === opt ? 'active' : ''}">${opt} entries</span></label>`).join('')}
        </div>
        <p class="text-muted mt-1" style="font-size:0.8rem;" id="live-cache-note">
          Currently: <strong>${cacheKeys.length}</strong> entries
          ${autoEnabled && cacheKeys.length >= autoThreshold ? `<span style="color:var(--accent);"> — will clear on next check</span>` : autoEnabled ? ` — clears when reaching <strong>${autoThreshold}</strong>` : ''}
        </p>
      </div>
      <button type="submit" class="btn btn-primary">💾 Save Settings</button>
    </form>
  </div>
</div>

<div class="card card-body mb-3">
  <h2 class="mb-2">📋 Auto Delete Log</h2>
  ${autoLogs.length === 0 ? `<p class="text-muted" style="font-size:0.9rem;">No automatic deletions have run yet.</p>` : `
  <div class="data-table-wrap"><table class="data-table">
    <thead><tr><th>Time</th><th>Details</th><th>Triggered By</th></tr></thead>
    <tbody>
      ${autoLogs.map((log) => {
        const ts = log.created_at ? Math.floor(new Date(log.created_at.replace(' ', 'T') + 'Z').getTime() / 1000) : 0;
        return `<tr><td style="white-space:nowrap;font-size:0.85rem;"><time class="local-ts" data-ts="${ts}" data-full="1">${log.created_at ?? ''}</time></td><td style="font-size:0.85rem;">${h(log.details ?? '')}</td><td><span class="badge badge-default" style="font-size:0.75rem;">System</span></td></tr>`;
      }).join('')}
    </tbody>
  </table></div>`}
</div>

<div class="grid-2" style="gap:1.5rem;margin-bottom:1.5rem;">
  <div class="card card-body">
    <h2 class="mb-2">🗃️ Database Stats</h2>
    <div class="data-table-wrap"><table class="data-table">
      <thead><tr><th>Table</th><th>Records</th></tr></thead>
      <tbody>${dbStats.map(([table, cnt]) => `<tr><td>${h(table)}</td><td style="font-weight:600;color:var(--text-primary);">${cnt.toLocaleString('en-US')}</td></tr>`).join('')}</tbody>
    </table></div>
  </div>
  <div class="card card-body">
    <h2 class="mb-2">⚙️ System Information</h2>
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${systemInfo.map(([k, v]) => `<div style="display:flex;justify-content:space-between;font-size:0.85rem;border-bottom:1px solid var(--border);padding-bottom:6px;"><span class="text-muted">${h(k)}</span><span style="color:var(--text-primary);font-weight:500;">${h(v)}</span></div>`).join('')}
    </div>
  </div>
</div>

<div class="card card-body mb-3">
  <div class="flex-between mb-2"><h2>🎙️ Episode Count & Dub Data</h2></div>
  <p class="text-muted mb-2" style="font-size:0.9rem;">Episode counts refresh hourly from Jikan; dub data refreshes roughly daily from <a href="https://mydublist.com" target="_blank" rel="noopener">MyDubList</a>. Both also run automatically on their own schedule — use these buttons to run one right now instead of waiting.</p>

  <div class="grid-2" style="gap:1.5rem;">
    <div>
      <h3 style="font-size:0.95rem;margin-bottom:8px;">Dub status by language</h3>
      <div class="data-table-wrap"><table class="data-table">
        <thead><tr><th>Language</th><th>Cached rows</th></tr></thead>
        <tbody id="dub-counts-body">
          ${dubCounts.map(([name, cnt]) => `<tr><td>${h(name)}</td><td style="font-weight:600;color:${cnt > 0 ? 'var(--text-primary)' : 'var(--text-muted)'};">${cnt.toLocaleString('en-US')}</td></tr>`).join('')}
        </tbody>
      </table></div>
      <p class="text-muted mt-1" style="font-size:0.78rem;">Last refresh: <span id="dub-last-refresh">${lastDubRefresh ? h(lastDubRefresh) : 'never'}</span></p>
      <button id="dub-refresh-btn" class="btn btn-primary btn-sm mt-2">🔄 Refresh Dub Data Now</button>
      <pre id="dub-refresh-log" style="display:none;margin-top:10px;font-size:0.78rem;background:rgba(255,255,255,0.03);padding:10px;border-radius:8px;white-space:pre-wrap;"></pre>
    </div>
    <div>
      <h3 style="font-size:0.95rem;margin-bottom:8px;">Episode-air cache</h3>
      <div class="stat-card mb-2"><div class="stat-value">${epCacheCount.toLocaleString('en-US')}</div><div class="stat-label">Anime with a cached count</div></div>
      <p class="text-muted" style="font-size:0.85rem;">Oldest cached entry: ${epCacheOldest ? h(epCacheOldest.updated_at) : 'none yet'}</p>
      <button id="ep-refresh-btn" class="btn btn-secondary btn-sm mt-2">🔄 Refresh Stale Episode Counts Now</button>
      <pre id="ep-refresh-log" style="display:none;margin-top:10px;font-size:0.78rem;background:rgba(255,255,255,0.03);padding:10px;border-radius:8px;white-space:pre-wrap;"></pre>
    </div>
  </div>
</div>

<script>
const dubBtn = document.getElementById('dub-refresh-btn');
if (dubBtn) {
  dubBtn.addEventListener('click', async () => {
    dubBtn.disabled = true; dubBtn.textContent = 'Refreshing… (can take ~10-20s)';
    const log = document.getElementById('dub-refresh-log');
    try {
      const res = await fetch('dub_refresh.php', { method: 'POST' });
      const data = await res.json();
      log.style.display = 'block';
      log.textContent = JSON.stringify(data, null, 2);
      if (data.results) setTimeout(() => location.reload(), 2500);
    } catch (e) {
      log.style.display = 'block';
      log.textContent = 'Request failed: ' + e;
    }
    dubBtn.disabled = false; dubBtn.textContent = '🔄 Refresh Dub Data Now';
  });
}
const epBtn = document.getElementById('ep-refresh-btn');
if (epBtn) {
  epBtn.addEventListener('click', async () => {
    epBtn.disabled = true; epBtn.textContent = 'Refreshing…';
    const log = document.getElementById('ep-refresh-log');
    try {
      const res = await fetch('ep_refresh.php', { method: 'POST' });
      const data = await res.json();
      log.style.display = 'block';
      log.textContent = JSON.stringify(data, null, 2);
    } catch (e) {
      log.style.display = 'block';
      log.textContent = 'Request failed: ' + e;
    }
    epBtn.disabled = false; epBtn.textContent = '🔄 Refresh Stale Episode Counts Now';
  });
}
</script>

<style>
.toggle-wrap { position:relative; display:inline-block; width:44px; height:24px; }
.toggle-wrap input { display:none; }
.toggle-slider { position:absolute; inset:0; background:var(--border); border-radius:34px; cursor:pointer; transition:var(--trans); }
.toggle-wrap input:checked + .toggle-slider { background:var(--accent); }
.toggle-slider::before { content:''; position:absolute; width:18px; height:18px; border-radius:50%; left:3px; bottom:3px; background:#fff; transition:var(--trans); }
.toggle-wrap input:checked + .toggle-slider::before { transform:translateX(20px); }
.threshold-pill { display:inline-block; padding:5px 14px; border-radius:20px; font-size:0.85rem; border:1px solid var(--border); color:var(--text-secondary); transition:var(--trans); user-select:none; }
.threshold-radio:checked + .threshold-pill, .threshold-pill.active { background:var(--accent); border-color:var(--accent); color:#fff; font-weight:600; }
</style>

<script>
document.querySelectorAll('.threshold-radio').forEach(radio => {
  radio.addEventListener('change', () => {
    document.querySelectorAll('.threshold-pill').forEach(p => p.classList.remove('active'));
    radio.nextElementSibling.classList.add('active');
  });
});
async function pollCacheStats() {
  try {
    const res  = await fetch('api_cache.php?action=stats');
    const data = await res.json();
    const countEl = document.getElementById('live-cache-count');
    const noteEl  = document.getElementById('live-cache-note');
    if (countEl) countEl.textContent = data.count;
    if (noteEl) {
      if (data.deleted > 0) noteEl.innerHTML = '<span style="color:var(--accent);">✅ Auto-deleted ' + data.deleted + ' entries just now</span>';
      else if (data.enabled && data.count >= data.threshold) noteEl.innerHTML = 'Currently: <strong>' + data.count + '</strong> entries <span style="color:var(--accent);"> — clearing now...</span>';
      else if (data.enabled) noteEl.innerHTML = 'Currently: <strong>' + data.count + '</strong> entries — clears when reaching <strong>' + data.threshold + '</strong>';
      else noteEl.innerHTML = 'Currently: <strong>' + data.count + '</strong> entries';
    }
  } catch(e) {}
}
pollCacheStats();
setInterval(pollCacheStats, 10000);
const clearBtn = document.getElementById('live-clear-btn');
if (clearBtn) {
  clearBtn.addEventListener('click', async () => {
    if (!confirm('Clear all API cache entries?')) return;
    clearBtn.disabled = true; clearBtn.textContent = 'Clearing...';
    const res  = await fetch('api_cache.php?action=clear');
    const data = await res.json();
    clearBtn.disabled = false; clearBtn.textContent = '🗑️ Clear All Cache';
    if (data.success) pollCacheStats();
  });
}
</script>`;
  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});

// ── admin/api_cache.php (polling endpoint) ─────────────────────────────────
adminCacheRoutes.on(['GET', 'POST'], '/admin/api_cache.php', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  if (!auth.isAdmin()) { await session.save(c, lifetime); return c.json({ error: 'Forbidden' }, 403); }

  const settings = new Settings(db);
  const action = c.req.query('action') ?? 'stats';

  if (action === 'stats') {
    const keys = await listCacheKeys(c.env.API_CACHE);
    const cacheOn = await settings.isApiCacheEnabled(c.env.API_CACHE_ENABLED === '1');
    const enabled = cacheOn && (await settings.get('auto_cache_enabled', '0')) === '1';
    const threshold = parseInt((await settings.get('auto_cache_threshold', '10')) ?? '10', 10);
    let deleted = 0;
    if (enabled && keys.length >= threshold) {
      deleted = await clearApiCache(c.env.API_CACHE);
      await Logger.log(db, session.user_id ?? 0, 'auto_cache_delete', `Auto-deleted ${deleted} cache entries (threshold: ${threshold})`);
    }
    await session.save(c, lifetime);
    return c.json({ count: keys.length, size: 0, threshold, enabled, cache_on: cacheOn, deleted });
  }

  if (action === 'clear') {
    const deleted = await clearApiCache(c.env.API_CACHE);
    await Logger.log(db, session.user_id ?? 0, 'admin_clear_cache', `Manually cleared ${deleted} cache entries`);
    await session.save(c, lifetime);
    return c.json({ success: true, deleted });
  }

  await session.save(c, lifetime);
  return c.json({ error: 'Unknown action' }, 400);
});

// ── Manual dub-data / episode-air refresh (see admin/cache.php buttons) ────
adminCacheRoutes.post('/admin/dub_refresh.php', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  if (!auth.isAdmin()) { await session.save(c, lifetime); return c.json({ error: 'Forbidden' }, 403); }

  const results = await DubStatus.refresh(db);
  await c.env.API_CACHE.put('dub_status_last_refresh', String(Date.now()));
  const failed = results.filter((r) => !r.ok);
  await Logger.log(db, session.user_id ?? 0, 'admin_dub_refresh',
    `Manually refreshed dub data: ${results.map((r) => `${r.lang}=${r.ok ? r.count : 'FAILED'}`).join(', ')}`);
  await session.save(c, lifetime);
  return c.json({ success: failed.length === 0, results, note: failed.length ? `${failed.length} language(s) failed to fetch — check that raw.githubusercontent.com is reachable and the language keys still match MyDubList's file names.` : undefined });
});

adminCacheRoutes.post('/admin/ep_refresh.php', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  if (!auth.isAdmin()) { await session.save(c, lifetime); return c.json({ error: 'Forbidden' }, 403); }

  const mal = new MalAPI(c.env, c.env.API_CACHE, db);
  const refreshed = await EpisodeAir.refreshStale(db, mal, 20);
  await Logger.log(db, session.user_id ?? 0, 'admin_ep_refresh', `Manually refreshed ${refreshed} stale episode-air cache entries`);
  await session.save(c, lifetime);
  return c.json({ success: true, refreshed });
});
