// Admin page for bulk-importing episode thumbnails straight into the D1
// cache (episode_thumb_cache -- see lib/episode-thumb.ts) from raw JSON,
// instead of waiting on a live scraper lookup per episode. Paste (or upload
// a .json file containing) the exact shape the scraper's own
// GET /api/episode?malId=X returns:
//
//   { "malId": 1, "episodes": [ { "episode": 1, "thumbnail": "https://…" }, … ] }
//
// (extra fields like title/aired/filler are ignored -- only episode +
// thumbnail are used). The uploaded file isn't stored anywhere separately --
// it's just read client-side and dropped into the same raw-JSON field the
// paste box uses, so it goes through the exact same save path and the exact
// same episode_thumb_cache table as a manual paste. Pick Finished/Ongoing
// and it writes both cache shapes (the bulk `epthumbs_all_X` row and a
// per-episode `epthumb_X_N` row for each one), both permanent -- see
// importAnimeEpisodeThumbnails in lib/episode-thumb.ts for what Finished vs
// Ongoing actually changes (whether the site ever checks for a new episode
// past what was imported).
// Every page that reads through getEpisodeThumbnail/getAnimeEpisodeThumbnails
// (anime detail, watch, home, lists, embed) picks this up immediately.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { icon } from '../../lib/icons';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';
import { importAnimeEpisodeThumbnails } from '../../lib/episode-thumb';

export const adminEpisodeCacheImportRoutes = new Hono<{ Bindings: Env }>();

adminEpisodeCacheImportRoutes.on(['GET', 'POST'], '/admin/episode_cache_import.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating } = ctx;

  if (c.req.method === 'POST') {
    const body: any = await c.req.json().catch(() => ({}));

    // Clearing an already-cached anime's entries -- same table, just a
    // delete instead of a write. Removes the bulk row plus every
    // per-episode row for that malId.
    if (body.action === 'clear') {
      const malId = parseInt(body.malId ?? '0', 10) || 0;
      if (!malId) {
        await session.save(c, lifetime);
        return c.json({ success: false, error: 'Missing malId.' });
      }
      try {
        await db.query(
          `DELETE FROM episode_thumb_cache WHERE cache_key = ? OR cache_key LIKE ? ESCAPE '\\'`,
          [`epthumbs_all_${malId}`, `epthumb\\_${malId}\\_%`]
        );
        await session.save(c, lifetime);
        return c.json({ success: true, malId });
      } catch (e: any) {
        await session.save(c, lifetime);
        return c.json({ success: false, error: e?.message ?? 'Clear failed.' });
      }
    }

    // Default action: import.
    const status = body.status === 'finished' ? 'finished' : 'ongoing';
    const permanent = status === 'finished';

    let raw: any;
    try {
      raw = typeof body.raw === 'string' ? JSON.parse(body.raw) : body.raw;
    } catch {
      await session.save(c, lifetime);
      return c.json({ success: false, error: 'That\'s not valid JSON -- paste or upload the raw response as-is.' });
    }

    const malId = parseInt(body.malId ?? raw?.malId ?? '0', 10) || 0;
    const episodes = Array.isArray(raw?.episodes) ? raw.episodes : null;

    if (!malId) {
      await session.save(c, lifetime);
      return c.json({ success: false, error: 'Missing malId (either in the form field or the JSON\'s "malId" key).' });
    }
    if (!episodes) {
      await session.save(c, lifetime);
      return c.json({ success: false, error: 'JSON needs an "episodes" array -- use the scraper\'s full /api/episode response.' });
    }

    try {
      const result = await importAnimeEpisodeThumbnails(db, malId, episodes, permanent);
      await session.save(c, lifetime);
      return c.json({ success: true, ...result });
    } catch (e: any) {
      await session.save(c, lifetime);
      return c.json({ success: false, error: e?.message ?? 'Import failed.' });
    }
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
  <div><h1>${icon('database', 'icon-medium')} Episode Cache Import</h1><p class="text-muted" style="font-size:.9rem;">Paste or upload the scraper's raw <code>/api/episode?malId=…</code> JSON to save it straight into the site's episode thumbnail cache -- no per-episode scraper calls needed after this.</p></div>
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
    <button class="btn btn-primary" id="eci-save">${icon('database', 'icon-small')} Save to Cache</button>
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
      <button class="btn btn-sm" style="color:#f87171;white-space:nowrap;" onclick="eciClear(${a.malId}, this)">${icon('x', 'icon-small')} Clear</button>
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
      statusEl.textContent = \`✓ Saved malId \${data.malId} — \${data.imported} episode(s) cached\${data.skipped ? \`, \${data.skipped} skipped (no thumbnail)\` : ''} — \${data.permanent ? 'permanent' : '6h check cycle'}.\`;
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
