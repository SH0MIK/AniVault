// Legacy episode-cache administration page retained for reference only.
// During the Hoshika migration it is read-only: POST import/clear actions are
// rejected, existing rows are left untouched, and user-facing Hoshika episode
// flows do not read or repopulate the old scraper thumbnail cache.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { icon } from '../../lib/icons';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';

export const adminEpisodeCacheImportRoutes = new Hono<{ Bindings: Env }>();

adminEpisodeCacheImportRoutes.on(['GET', 'POST'], '/admin/episode_cache_import.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating } = ctx;

  if (c.req.method === 'POST') {
    // Cache import/clear is paused during the Hoshika-only migration. Do not
    // mutate shared legacy cache rows until the cache schema is rebuilt from
    // verified Hoshika responses.
    await session.save(c, lifetime);
    return c.json({
      success: false,
      error: 'Episode cache import and clearing are paused during the Hoshika migration. Existing cache rows were left untouched.',
    }, 503);
  }
  // ── Cached anime list ──────────────────────────────────────────────────
  // Reads straight from the same episode_thumb_cache table -- every bulk
  // row is keyed `epthumbs_all_{malId}`, so that prefix alone gives us one
  // row per anime currently cached. No separate tracking table needed.
  const rows = await db.fetchAll<{ cache_key: string; value: string; expires_at: number | null; created_at: number }>(
    `SELECT cache_key, value, expires_at, created_at FROM episode_thumb_cache
     WHERE cache_key LIKE 'epthumbs\\_all\\_%' ESCAPE '\\'
     ORDER BY created_at DESC LIMIT 200`
  );

  const cachedAnime = rows.map((r) => {
    const malId = r.cache_key.replace('epthumbs_all_', '');
    let episodeCount = 0;
    let checkedAt: number | null = null;
    try {
      const parsed = JSON.parse(r.value);
      episodeCount = Object.keys(parsed.episodes ?? parsed ?? {}).length;
      checkedAt = typeof parsed.checkedAt === 'number' ? parsed.checkedAt : null;
    } catch { /* leave defaults */ }
    const permanent = r.expires_at === null;
    return { malId, episodeCount, permanent, checkedAt };
  });

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Episode Cache Import', adminPage: 'episode_cache_import', isOwner, impersonating });
  html += `
<div class="admin-header">
  <div><h1>${icon('database', 'icon-medium')} Episode Cache Import</h1><p class="text-muted" style="font-size:.9rem;">Cache import and clearing are paused during the Hoshika-only migration. Existing cache rows are left untouched.</p></div>
</div>

<div class="card card-body mb-3" style="max-width:760px;">
  <label style="font-size:.85rem;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px;">MAL ID <span style="font-weight:400;">(optional if it's already in the JSON below)</span></label>
  <input id="eci-malid" type="number" class="form-control" placeholder="e.g. 1" style="max-width:200px;">

  <label style="font-size:.85rem;font-weight:600;color:var(--text-muted);display:block;margin:1rem 0 6px;">Airing Status</label>
  <div style="display:flex;gap:1.25rem;">
    <label style="font-size:.9rem;display:flex;align-items:center;gap:.4rem;cursor:pointer;"><input type="radio" name="eci-status" value="ongoing" checked> Ongoing / Not yet aired <span class="text-muted" style="font-size:.8rem;">(checks for a new ep every 6h)</span></label>
    <label style="font-size:.9rem;display:flex;align-items:center;gap:.4rem;cursor:pointer;"><input type="radio" name="eci-status" value="finished"> Finished Airing <span class="text-muted" style="font-size:.8rem;">(never checks again)</span></label>
  </div>

  <label style="font-size:.85rem;font-weight:600;color:var(--text-muted);display:block;margin:1rem 0 6px;">JSON File <span style="font-weight:400;">(optional -- fills in the box below)</span></label>
  <input id="eci-file" type="file" accept="application/json,.json" class="form-control">

  <label style="font-size:.85rem;font-weight:600;color:var(--text-muted);display:block;margin:1rem 0 6px;">Raw JSON</label>
  <textarea id="eci-raw" class="form-control" rows="12" style="font-family:monospace;font-size:.82rem;" placeholder='{"malId": 1, "episodes": [{"episode": 1, "thumbnail": "https://..."}, ...]}'></textarea>

  <div style="margin-top:1rem;display:flex;gap:.6rem;align-items:center;">
    <button class="btn btn-primary" id="eci-save" disabled title="Paused during Hoshika migration">${icon('database', 'icon-small')} Cache Import Paused</button>
    <span id="eci-status" style="font-size:.85rem;color:var(--text-muted);"></span>
  </div>
</div>

<div class="card card-body mb-3" style="max-width:760px;">
  <h2 style="font-size:1rem;margin-bottom:.75rem;">Cached Anime <span class="text-muted" style="font-weight:400;font-size:.85rem;">(${cachedAnime.length}${cachedAnime.length >= 200 ? '+' : ''})</span></h2>
  <div id="eci-list" style="display:flex;flex-direction:column;gap:.5rem;">
    ${cachedAnime.length === 0 ? '<p class="text-muted" style="font-size:.85rem;">Nothing cached yet.</p>' : cachedAnime.map((a) => `
    <div class="eci-row" data-malid="${a.malId}" style="display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.6rem .75rem;border:1px solid var(--border-color,rgba(255,255,255,.08));border-radius:8px;">
      <div style="min-width:0;">
        <a href="https://myanimelist.net/anime/${a.malId}" target="_blank" rel="noopener" style="font-weight:600;">MAL #${a.malId}</a>
        <div class="text-muted" style="font-size:.8rem;">
          ${a.episodeCount} episode(s) cached
          ${a.permanent ? ' · Finished (permanent)' : a.checkedAt ? ` · Ongoing, last checked ${new Date(a.checkedAt).toLocaleString()}` : ' · Ongoing'}
        </div>
      </div>
      <span class="text-muted" style="font-size:.8rem;white-space:nowrap;">Read-only during migration</span>
    </div>`).join('')}
  </div>
</div>

<script>
document.getElementById('eci-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('eci-raw').value = reader.result;
    // Best-effort: auto-fill the MAL ID field from the uploaded JSON if it's empty.
    const malIdEl = document.getElementById('eci-malid');
    if (!malIdEl.value.trim()) {
      try {
        const parsed = JSON.parse(reader.result);
        if (parsed.malId) malIdEl.value = parsed.malId;
      } catch { /* leave for the save handler's own JSON.parse to report */ }
    }
  };
  reader.onerror = () => {
    document.getElementById('eci-status').style.color = '#f87171';
    document.getElementById('eci-status').textContent = 'Could not read that file.';
  };
  reader.readAsText(file);
});

document.getElementById('eci-save').addEventListener('click', async () => {
  const btn = document.getElementById('eci-save');
  const statusEl = document.getElementById('eci-status');
  const malId = document.getElementById('eci-malid').value.trim();
  const status = document.querySelector('input[name="eci-status"]:checked').value;
  const raw = document.getElementById('eci-raw').value.trim();

  if (!raw) { statusEl.textContent = 'Paste or upload the JSON first.'; statusEl.style.color = '#f87171'; return; }

  btn.disabled = true;
  statusEl.style.color = 'var(--text-muted)';
  statusEl.textContent = 'Saving…';

  try {
    const res = await fetch('episode_cache_import.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ malId, status, raw }),
    });
    const data = await res.json();
    if (!data.success) {
      statusEl.style.color = '#f87171';
      statusEl.textContent = data.error || 'Save failed.';
    } else {
      statusEl.style.color = '#22c55e';
      statusEl.textContent = \`✓ Saved malId \${data.malId} — \${data.imported} episode(s) cached\${data.skipped ? \`, \${data.skipped} skipped (no thumbnail)\` : ''} — \${data.permanent ? 'permanent' : '6h check cycle'}. Info cache: \${data.infoCached ? \`✓ \${data.infoCount} episode(s)\` : 'skipped (incomplete title/aired data)'}.\`;
      setTimeout(() => location.reload(), 900);
    }
  } catch (e) {
    statusEl.style.color = '#f87171';
    statusEl.textContent = 'Network error -- try again.';
  } finally {
    btn.disabled = false;
  }
});

async function eciClear(malId, btn) {
  if (!confirm('Clear all cached thumbnails for MAL #' + malId + '?')) return;
  btn.disabled = true;
  try {
    const res = await fetch('episode_cache_import.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear', malId }),
    });
    const data = await res.json();
    if (data.success) {
      document.querySelector('.eci-row[data-malid="' + malId + '"]').remove();
    } else {
      alert(data.error || 'Clear failed.');
      btn.disabled = false;
    }
  } catch (e) {
    alert('Network error -- try again.');
    btn.disabled = false;
  }
}
</script>`;

  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});
