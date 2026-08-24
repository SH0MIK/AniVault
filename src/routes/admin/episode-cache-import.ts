// Admin page for bulk-importing episode thumbnails straight into the D1
// cache (episode_thumb_cache -- see lib/episode-thumb.ts) from raw JSON,
// instead of waiting on a live scraper lookup per episode. Paste the exact
// shape the scraper's own GET /api/episode?malId=X returns:
//
//   { "malId": 1, "episodes": [ { "episode": 1, "thumbnail": "https://…" }, … ] }
//
// (extra fields like title/aired/filler are ignored -- only episode +
// thumbnail are used). Pick Finished/Ongoing and it writes both cache
// shapes (the bulk `epthumbs_all_X` row and a per-episode `epthumb_X_N` row
// for each one) with the matching TTL -- permanent for Finished, the normal
// 6h TTL for Ongoing so newly aired episodes still get picked up live.
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
    const status = body.status === 'finished' ? 'finished' : 'ongoing';
    const permanent = status === 'finished';

    let raw: any;
    try {
      raw = typeof body.raw === 'string' ? JSON.parse(body.raw) : body.raw;
    } catch {
      await session.save(c, lifetime);
      return c.json({ success: false, error: 'That\'s not valid JSON -- paste the raw response as-is.' });
    }

    const malId = parseInt(body.malId ?? raw?.malId ?? '0', 10) || 0;
    const episodes = Array.isArray(raw?.episodes) ? raw.episodes : null;

    if (!malId) {
      await session.save(c, lifetime);
      return c.json({ success: false, error: 'Missing malId (either in the form field or the pasted JSON\'s "malId" key).' });
    }
    if (!episodes) {
      await session.save(c, lifetime);
      return c.json({ success: false, error: 'JSON needs an "episodes" array -- paste the scraper\'s full /api/episode response.' });
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

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Episode Cache Import', adminPage: 'episode_cache_import', isOwner, impersonating });
  html += `
<div class="admin-header">
  <div><h1>${icon('database', 'icon-medium')} Episode Cache Import</h1><p class="text-muted" style="font-size:.9rem;">Paste the scraper's raw <code>/api/episode?malId=…</code> JSON to save it straight into the site's episode thumbnail cache -- no per-episode scraper calls needed after this.</p></div>
</div>

<div class="card card-body mb-3" style="max-width:760px;">
  <label style="font-size:.85rem;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px;">MAL ID <span style="font-weight:400;">(optional if it's already in the JSON below)</span></label>
  <input id="eci-malid" type="number" class="form-control" placeholder="e.g. 1" style="max-width:200px;">

  <label style="font-size:.85rem;font-weight:600;color:var(--text-muted);display:block;margin:1rem 0 6px;">Airing Status</label>
  <div style="display:flex;gap:1.25rem;">
    <label style="font-size:.9rem;display:flex;align-items:center;gap:.4rem;cursor:pointer;"><input type="radio" name="eci-status" value="ongoing" checked> Ongoing / Not yet aired <span class="text-muted" style="font-size:.8rem;">(6h refresh)</span></label>
    <label style="font-size:.9rem;display:flex;align-items:center;gap:.4rem;cursor:pointer;"><input type="radio" name="eci-status" value="finished"> Finished Airing <span class="text-muted" style="font-size:.8rem;">(cached forever)</span></label>
  </div>

  <label style="font-size:.85rem;font-weight:600;color:var(--text-muted);display:block;margin:1rem 0 6px;">Raw JSON</label>
  <textarea id="eci-raw" class="form-control" rows="12" style="font-family:monospace;font-size:.82rem;" placeholder='{"malId": 1, "episodes": [{"episode": 1, "thumbnail": "https://..."}, ...]}'></textarea>

  <div style="margin-top:1rem;display:flex;gap:.6rem;align-items:center;">
    <button class="btn btn-primary" id="eci-save">${icon('database', 'icon-small')} Save to Cache</button>
    <span id="eci-status" style="font-size:.85rem;color:var(--text-muted);"></span>
  </div>
</div>

<script>
document.getElementById('eci-save').addEventListener('click', async () => {
  const btn = document.getElementById('eci-save');
  const statusEl = document.getElementById('eci-status');
  const malId = document.getElementById('eci-malid').value.trim();
  const status = document.querySelector('input[name="eci-status"]:checked').value;
  const raw = document.getElementById('eci-raw').value.trim();

  if (!raw) { statusEl.textContent = 'Paste the JSON first.'; statusEl.style.color = '#f87171'; return; }

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
      statusEl.textContent = \`✓ Saved malId \${data.malId} — \${data.imported} episode(s) cached\${data.skipped ? \`, \${data.skipped} skipped (no thumbnail)\` : ''} — \${data.permanent ? 'permanent' : '6h TTL'}.\`;
    }
  } catch (e) {
    statusEl.style.color = '#f87171';
    statusEl.textContent = 'Network error -- try again.';
  } finally {
    btn.disabled = false;
  }
});
</script>`;

  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});
