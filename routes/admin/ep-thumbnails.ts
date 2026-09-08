// Ports admin/ep_thumbnails.php. Entirely client-driven (search anime, load
// episodes, auto-search thumbnails from multiple sources, save via
// api/episode_override.php) -- this route just serves the page shell.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';
import { EP_THUMBNAILS_CSS } from '../../render/ep-thumbnails-css';
import { epThumbnailsScript } from '../../render/ep-thumbnails-script';

export const adminEpThumbnailsRoutes = new Hono<{ Bindings: Env }>();

adminEpThumbnailsRoutes.get('/admin/ep_thumbnails.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { session, lifetime, isOwner, impersonating } = ctx;

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Episode Thumbnails', adminPage: 'ep_thumbnails', isOwner, impersonating });
  html += `<style>${EP_THUMBNAILS_CSS}</style>`;

  html += `
<div class="admin-header">
  <div><h1>🖼️ Episode Thumbnails</h1><p class="text-muted" style="font-size:.9rem;">Search an anime, auto-fetch missing episode thumbnails, and save them in bulk</p></div>
</div>

<div class="card card-body mb-3">
  <label style="font-size:.85rem;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px;">Select Anime</label>
  <div id="thumb-anime-wrap" style="max-width:420px;">
    <input id="thumb-anime-search" type="text" class="form-control" placeholder="Search anime by name…" autocomplete="off">
    <div id="thumb-anime-dropdown"></div>
  </div>
  <div id="thumb-anime-selected" style="display:none;margin-top:.5rem;font-size:.85rem;color:var(--accent);font-weight:600;"></div>
  <input type="hidden" id="thumb-anime-id"><input type="hidden" id="thumb-anime-title-val">

  <div style="margin-top:1rem;display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;">
    <button class="btn btn-secondary" id="btn-load-eps" onclick="loadEpisodes()" disabled>📋 Load Episodes</button>
    <button class="btn btn-primary" id="btn-auto-search" onclick="autoSearchAll()" disabled>🔍 Auto Search Thumbnails</button>
    <button class="btn btn-primary" id="btn-save-all" onclick="saveAllFound()" style="display:none;">💾 Save All Found</button>
    <button class="btn btn-secondary" id="btn-debug" onclick="runDebug()" disabled style="font-size:.78rem;padding:4px 10px;opacity:.7;" title="Test episode 1 and show exactly what each source returns">🐛 Debug</button>
    <span id="thumb-stats" style="font-size:.82rem;color:var(--text-muted);"></span>
  </div>
  <pre id="debug-out" style="display:none;background:var(--bg-base);border:1px solid var(--border);border-radius:8px;padding:1rem;font-size:.75rem;margin-top:.75rem;overflow-x:auto;color:var(--text-secondary);max-height:320px;overflow-y:auto;"></pre>

  <div id="progress-wrap">
    <div id="progress-bar-track"><div id="progress-bar-fill"></div></div>
    <div id="progress-label">Searching…</div>
  </div>
</div>

<div id="ep-grid-wrap" style="display:none;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;flex-wrap:wrap;gap:.5rem;">
    <div style="font-weight:600;font-size:.95rem;" id="ep-grid-heading"></div>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
      <label style="font-size:.82rem;display:flex;align-items:center;gap:.3rem;cursor:pointer;"><input type="checkbox" id="filter-missing" onchange="renderGrid()"> Show missing only</label>
      <label style="font-size:.82rem;display:flex;align-items:center;gap:.3rem;cursor:pointer;"><input type="checkbox" id="filter-found" onchange="renderGrid()"> Show found only</label>
    </div>
  </div>
  <div id="ep-grid"></div>
</div>

<div class="modal-overlay" id="thumb-pick-modal">
  <div class="modal" style="max-width:640px;width:100%;">
    <div class="modal-header" style="padding:1rem 1.25rem;display:flex;justify-content:space-between;align-items:center;">
      <h3 style="margin:0;" id="tpm-heading">Choose Thumbnail</h3>
      <button class="modal-close" onclick="closeModal('thumb-pick-modal')">✕</button>
    </div>
    <div class="modal-body">
      <div id="tpm-loading" style="text-align:center;padding:2rem;color:var(--text-muted);">Searching…</div>
      <div class="thumb-grid" id="tpm-grid" style="display:none;"></div>
      <div id="tpm-custom" style="margin-top:1rem;">
        <label style="font-size:.82rem;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Or paste a custom URL</label>
        <div style="display:flex;gap:.5rem;"><input type="url" id="tpm-custom-url" class="form-control" placeholder="https://…"><button class="btn btn-secondary" onclick="tpmSelectCustom()">Use</button></div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:.5rem;margin-top:1.25rem;">
        <button class="btn btn-secondary" onclick="closeModal('thumb-pick-modal')">Cancel</button>
        <button class="btn btn-primary" id="tpm-save-btn" onclick="tpmSave()">Save Thumbnail</button>
      </div>
    </div>
  </div>
</div>

${epThumbnailsScript(siteUrl, c.env.TMDB_API_KEY ?? '')}`;

  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});
