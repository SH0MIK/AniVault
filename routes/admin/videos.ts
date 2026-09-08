// Ports admin/videos.php.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { h } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';
import { VIDEOS_CSS } from '../../render/videos-css';
import { videosScript } from '../../render/videos-script';

export const adminVideosRoutes = new Hono<{ Bindings: Env }>();

adminVideosRoutes.get('/admin/videos.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating } = ctx;

  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  const search = (c.req.query('q') ?? '').trim();

  let total: number;
  let rows: any[];
  if (search) {
    const like = `%${search}%`;
    if (/^\d+$/.test(search)) {
      total = await db.count('SELECT COUNT(*) as cnt FROM episode_videos WHERE anime_title LIKE ? OR anime_id = ?', [like, parseInt(search, 10)]);
      rows = await db.fetchAll(`SELECT * FROM episode_videos WHERE anime_title LIKE ? OR anime_id = ? ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${offset}`, [like, parseInt(search, 10)]);
    } else {
      total = await db.count('SELECT COUNT(*) as cnt FROM episode_videos WHERE anime_title LIKE ?', [like]);
      rows = await db.fetchAll(`SELECT * FROM episode_videos WHERE anime_title LIKE ? ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${offset}`, [like]);
    }
  } else {
    total = await db.count('SELECT COUNT(*) as cnt FROM episode_videos');
    rows = await db.fetchAll(`SELECT * FROM episode_videos ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${offset}`);
  }
  const pages = Math.max(1, Math.ceil(total / limit));

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Episode Videos', adminPage: 'videos', isOwner, impersonating });
  html += `<style>${VIDEOS_CSS}</style>`;

  html += `
<div class="admin-header">
  <div><h1>🎬 Episode Videos</h1><p class="text-muted" style="font-size:.9rem;">Embed videos from YouTube, Kwik, Facebook, or any site onto episode pages</p></div>
  <button class="btn btn-primary" onclick="openVideoModal()">+ Add Video</button>
</div>

<div class="card card-body mb-3">
  <form method="get" style="display:flex;gap:.5rem;align-items:center;">
    <input type="text" name="q" value="${h(search)}" placeholder="Search by anime title or anime ID…" class="form-control" style="max-width:360px;">
    <button type="submit" class="btn btn-primary">Search</button>
    ${search ? `<a href="videos.php" class="btn btn-secondary">Clear</a>` : ''}
  </form>
</div>

${rows.length === 0 ? `
<div class="card card-body text-center text-muted" style="padding:2.5rem;">
  <p style="font-size:2rem;margin-bottom:.5rem;">🎬</p>
  <p>No episode videos yet. Click <strong>+ Add Video</strong> to get started.</p>
</div>` : `
<div class="card" style="overflow:auto;">
  <table class="data-table">
    <thead><tr><th>Anime</th><th>Episode</th><th>Title</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
    <tbody>
      ${rows.map((row) => renderVideoRow(row, siteUrl)).join('')}
    </tbody>
  </table>
</div>
${pages > 1 ? `<div class="pagination" style="margin-top:1rem;">${Array.from({ length: pages }, (_, i) => i + 1).map((i) => `<a href="?page=${i}${search ? '&q=' + encodeURIComponent(search) : ''}" class="${i === page ? 'active' : ''}">${i}</a>`).join('')}</div>` : ''}`}

<div class="modal-overlay" id="video-modal">
  <div class="modal" style="max-width:680px;width:100%;">
    <div class="modal-header" style="padding:1rem 1.25rem;display:flex;justify-content:space-between;align-items:center;">
      <h3 id="vm-heading" style="margin:0;font-size:1rem;">Add Episode Video</h3>
      <button class="modal-close" onclick="closeModal('video-modal')">✕</button>
    </div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:1.1rem;">
      <input type="hidden" id="vm-id"><input type="hidden" id="vm-title"><input type="hidden" id="vm-description">

      <div>
        <label class="ep-editor-label">Anime <span style="color:var(--accent);">*</span>
          <span style="font-weight:400;color:var(--text-muted);font-size:.8rem;">— type name or paste MAL ID directly</span>
        </label>
        <div style="position:relative;">
          <input type="text" id="vm-anime-search" class="form-control" placeholder="Type anime name or paste MAL ID (e.g. 21)…" autocomplete="off">
          <div id="anime-search-dropdown"></div>
        </div>
        <input type="hidden" id="vm-anime-id">
        <div id="vm-anime-selected" style="display:none;margin-top:6px;font-size:.83rem;color:var(--accent);font-weight:600;"></div>
      </div>

      <div><label class="ep-editor-label">Episode Number <span style="color:var(--accent);">*</span></label>
        <input type="number" id="vm-ep-num" class="form-control" min="1" placeholder="e.g. 1"></div>

      <div>
        <label class="ep-editor-label">Video Sources <span style="color:var(--accent);">*</span>
          <span style="font-weight:400;color:var(--text-muted);font-size:.8rem;">— Dub is optional</span>
        </label>
        <div class="sd-tabs">
          <button type="button" class="sd-tab active" id="sdtab-sub" onclick="switchAudioTab('sub')">🎌 Sub</button>
          <button type="button" class="sd-tab" id="sdtab-dub" onclick="switchAudioTab('dub')">🔊 Dub <span id="dub-badge" style="display:none;" class="dub-count-badge">0</span></button>
        </div>
        <div id="vm-quality-list-sub" class="quality-track"></div>
        <button type="button" class="btn btn-secondary btn-sm" id="add-btn-sub" onclick="addQualityRow('sub')" style="margin-top:.5rem;">+ Add Sub Quality</button>
        <div id="vm-quality-list-dub" class="quality-track" style="display:none;"></div>
        <button type="button" class="btn btn-secondary btn-sm" id="add-btn-dub" onclick="addQualityRow('dub')" style="display:none;margin-top:.5rem;">+ Add Dub Quality</button>
        <div id="vm-embed-preview" class="embed-preview-empty" style="margin-top:.75rem;">Preview will appear here</div>
      </div>

      <div style="display:flex;align-items:center;gap:.75rem;">
        <input type="checkbox" id="vm-is-active" checked style="width:16px;height:16px;cursor:pointer;">
        <label for="vm-is-active" style="cursor:pointer;font-size:.88rem;font-weight:600;">Visible to users (active)</label>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:.75rem;padding-top:.5rem;border-top:1px solid var(--border);">
        <button class="btn btn-secondary" onclick="closeModal('video-modal')">Cancel</button>
        <button class="btn btn-primary" id="vm-save-btn" onclick="saveVideo()">Save Video</button>
        <button class="btn btn-primary" id="vm-next-btn" onclick="saveAndNextEpisode()" style="background:var(--accent-2,#7c3aed);border-color:var(--accent-2,#7c3aed);" title="Save this episode and immediately open the next one">Save &amp; Next ▶</button>
      </div>
    </div>
  </div>
</div>

${videosScript(siteUrl)}`;

  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});

function renderVideoRow(row: any, siteUrl: string): string {
  const updated = row.updated_at ? new Date(row.updated_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';
  const editPayload = JSON.stringify({
    id: row.id, anime_id: row.anime_id, anime_title: row.anime_title, episode_num: row.episode_num,
    title: row.title, embed_code: row.embed_code, qualities: row.qualities ?? null, description: row.description, is_active: row.is_active,
  }).replace(/"/g, '&quot;');

  return `
<tr>
  <td>
    <a href="${siteUrl}/pages/anime.php?id=${row.anime_id}" target="_blank" style="color:var(--accent);font-size:.85rem;">${h(row.anime_title || '#' + row.anime_id)}</a>
    <div style="font-size:.73rem;color:var(--text-muted);">ID: ${row.anime_id}</div>
  </td>
  <td><a href="${siteUrl}/pages/watch.php?anime=${row.anime_id}&ep=${row.episode_num}" target="_blank" style="color:var(--text-secondary);font-weight:600;">Ep ${row.episode_num}</a></td>
  <td style="max-width:220px;font-size:.83rem;color:var(--text-secondary);">${row.title ? h(String(row.title).substring(0, 60)) : `<span class="text-muted">—</span>`}</td>
  <td>${row.is_active ? `<span class="badge badge-watching">Active</span>` : `<span class="badge badge-dropped">Hidden</span>`}</td>
  <td style="font-size:.8rem;color:var(--text-muted);">${updated}</td>
  <td style="white-space:nowrap;">
    <button class="btn btn-sm btn-secondary" onclick="editVideo(${editPayload})">Edit</button>
    <a href="${siteUrl}/pages/watch.php?anime=${row.anime_id}&ep=${row.episode_num}" target="_blank" class="btn btn-sm btn-ghost">View</a>
    <button class="btn btn-sm btn-danger" onclick="deleteVideo(${row.id}, this)">Delete</button>
  </td>
</tr>`;
}
