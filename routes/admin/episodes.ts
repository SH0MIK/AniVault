// Ports admin/episodes.php. Schema self-healing (ensureEpisodeOverrideSchema)
// isn't needed -- D1 already has the right shape from the Phase 1 migration.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { h } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';

export const adminEpisodesRoutes = new Hono<{ Bindings: Env }>();

const SERVICES: Record<string, { label: string; color: string }> = {
  crunchyroll: { label: 'Crunchyroll', color: '#f47521' },
  netflix: { label: 'Netflix', color: '#e50914' },
  hidive: { label: 'HIDIVE', color: '#00aeef' },
  funimation: { label: 'Funimation', color: '#400080' },
  amazon: { label: 'Prime Video', color: '#00a8e0' },
  hulu: { label: 'Hulu', color: '#1ce783' },
  apple: { label: 'Apple TV+', color: '#555555' },
  disney: { label: 'Disney+', color: '#113ccf' },
  youtube: { label: 'YouTube', color: '#ff0000' },
  bilibili: { label: 'Bilibili', color: '#00aeec' },
};

adminEpisodesRoutes.get('/admin/episodes.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating } = ctx;

  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  const search = (c.req.query('q') ?? '').trim();

  const where = search ? `WHERE anime_id = ${parseInt(search, 10) || 0} OR episode_num = ${parseInt(search, 10) || 0}` : '';
  const total = await db.count(`SELECT COUNT(*) as cnt FROM episode_overrides ${where}`);
  const rows = await db.fetchAll<any>(`SELECT * FROM episode_overrides ${where} ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${offset}`);
  const pages = Math.max(1, Math.ceil(total / limit));

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Episode Overrides', adminPage: 'episodes', isOwner, impersonating });

  html += `
<div class="admin-header"><div><h1>🎬 Episode Overrides</h1><p class="text-muted" style="font-size:0.9rem;">Custom episode images, synopses, and watch links</p></div></div>

<div class="card card-body mb-3">
  <form method="get" style="display:flex;gap:0.5rem;align-items:center;">
    <input type="number" name="q" value="${h(search)}" placeholder="Filter by Anime ID or Episode #" class="form-control" style="max-width:300px;">
    <button type="submit" class="btn btn-primary">Search</button>
    ${search ? `<a href="episodes.php" class="btn btn-secondary">Clear</a>` : ''}
  </form>
</div>

${rows.length === 0 ? `<div class="card card-body text-center text-muted">No episode overrides yet.</div>` : `
<div class="card" style="overflow:auto;">
  <table class="data-table">
    <thead><tr><th>Anime ID</th><th>Episode</th><th>Image</th><th>Synopsis</th><th>Watch Links</th><th>Updated</th><th>Actions</th></tr></thead>
    <tbody>
      ${rows.map((row) => renderOverrideRow(row, siteUrl)).join('')}
    </tbody>
  </table>
</div>

${pages > 1 ? `<div class="pagination" style="margin-top:1rem;">${Array.from({ length: pages }, (_, i) => i + 1).map((i) => `<a href="?page=${i}${search ? '&q=' + encodeURIComponent(search) : ''}" class="${i === page ? 'active' : ''}">${i}</a>`).join('')}</div>` : ''}`}

<div class="modal-overlay" id="admin-ep-modal">
  <div class="modal" style="max-width:600px;width:100%;">
    <div class="modal-header" style="padding:1rem 1.25rem;display:flex;justify-content:space-between;align-items:center;">
      <h3 style="margin:0;" id="admin-ep-modal-heading">Edit Episode</h3>
      <button class="modal-close" onclick="closeModal('admin-ep-modal')">✕</button>
    </div>
    <div class="modal-body">
      <input type="hidden" id="aem-anime-id"><input type="hidden" id="aem-ep-num">
      <div class="form-group" style="margin-bottom:1rem;">
        <label style="font-size:0.85rem;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Episode Thumbnail URL</label>
        <input type="url" id="aem-image" class="form-control" placeholder="https://... (paste any image URL)">
        <div id="aem-image-preview" style="margin-top:8px;display:none;"><img id="aem-img-tag" src="" style="width:100%;max-height:200px;object-fit:cover;border-radius:6px;"></div>
      </div>
      <div class="form-group" style="margin-bottom:1rem;">
        <label style="font-size:0.85rem;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Synopsis</label>
        <textarea id="aem-synopsis" class="form-control" rows="4" placeholder="Episode synopsis…" style="resize:vertical;"></textarea>
      </div>
      <div class="form-group" style="margin-bottom:1rem;">
        <label style="font-size:0.85rem;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px;">Watch Links</label>
        <div id="aem-links-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px;"></div>
        <div style="display:flex;gap:8px;align-items:center;">
          <select id="aem-new-service" class="form-control" style="flex:1;">
            <option value="">— Select service —</option>
            ${Object.entries(SERVICES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
          </select>
          <input type="url" id="aem-new-url" class="form-control" placeholder="https://..." style="flex:2;">
          <button class="btn btn-secondary" onclick="aemAddLink()" style="white-space:nowrap;">+ Add</button>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:1.25rem;">
        <button class="btn btn-secondary" onclick="closeModal('admin-ep-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="aemSave()">Save Changes</button>
      </div>
    </div>
  </div>
</div>

<script>
const SERVICE_LABELS = ${JSON.stringify(Object.fromEntries(Object.entries(SERVICES).map(([k, v]) => [k, v.label])))};
const SERVICE_COLORS = ${JSON.stringify(Object.fromEntries(Object.entries(SERVICES).map(([k, v]) => [k, v.color])))};
let _aemLinks = [];

function adminEditEp(animeId, epNum, data) {
  document.getElementById('aem-anime-id').value = animeId;
  document.getElementById('aem-ep-num').value   = epNum;
  document.getElementById('admin-ep-modal-heading').textContent = \`Edit — Anime #\${animeId} · Episode \${epNum}\`;
  document.getElementById('aem-image').value    = data.image_url || '';
  document.getElementById('aem-synopsis').value = data.synopsis  || '';
  _aemLinks = data.watch_links || [];
  aemRenderLinks();
  aemPreviewImage(data.image_url);
  openModal('admin-ep-modal');
}
document.getElementById('aem-image').addEventListener('input', function() { aemPreviewImage(this.value.trim()); });
function aemPreviewImage(url) {
  const wrap = document.getElementById('aem-image-preview');
  const img  = document.getElementById('aem-img-tag');
  if (url) { img.src = url; wrap.style.display = 'block'; } else { wrap.style.display = 'none'; }
}
function aemRenderLinks() {
  const list = document.getElementById('aem-links-list');
  list.innerHTML = _aemLinks.map((l, i) => \`
    <div style="display:flex;align-items:center;gap:8px;" data-link-index="\${i}">
      <span style="min-width:100px;font-size:0.82rem;font-weight:600;color:\${SERVICE_COLORS[l.service]||'#888'}">\${SERVICE_LABELS[l.service]||l.service}</span>
      <input type="url" value="\${l.url}" class="form-control" style="flex:1;" data-link-url="\${i}">
      <button class="btn btn-sm btn-danger" onclick="_aemLinks.splice(\${i},1);aemRenderLinks()">✕</button>
    </div>\`).join('');
}
function aemCollectLinks() {
  document.querySelectorAll('#aem-links-list [data-link-url]').forEach(input => {
    const i = parseInt(input.getAttribute('data-link-url'));
    if (_aemLinks[i]) _aemLinks[i].url = input.value.trim();
  });
}
function aemAddLink() {
  aemCollectLinks();
  const svc = document.getElementById('aem-new-service').value;
  const url = document.getElementById('aem-new-url').value.trim();
  if (!svc || !url) return alert('Select a service and enter a URL.');
  if (_aemLinks.find(l => l.service === svc)) return alert('That service is already added.');
  _aemLinks.push({ service: svc, url });
  document.getElementById('aem-new-service').value = '';
  document.getElementById('aem-new-url').value = '';
  aemRenderLinks();
}
async function aemSave() {
  aemCollectLinks();
  const animeId  = parseInt(document.getElementById('aem-anime-id').value);
  const epNum    = parseInt(document.getElementById('aem-ep-num').value);
  const imageUrl = document.getElementById('aem-image').value.trim();
  const synopsis = document.getElementById('aem-synopsis').value.trim();
  const links    = _aemLinks.filter(l => l.url);
  const saveBtn = document.querySelector('#admin-ep-modal .btn-primary');
  saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
  try {
    const res  = await fetch('${siteUrl}/api/episode_override.php', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ anime_id: animeId, episode_num: epNum, image_url: imageUrl, synopsis, watch_links: links })
    });
    const data = await res.json();
    if (!data.success) { alert('Error: ' + (data.error || 'Unknown')); return; }
    if (links.length > 0) {
      const doAll = confirm('Apply these watch links to ALL episodes of this anime?');
      if (doAll) {
        const allRes  = await fetch('${siteUrl}/api/episode_override.php?anime_id=' + animeId + '&all=1');
        const allData = await allRes.json();
        const existing = allData.overrides || [];
        const totalEps = allData.total_eps || 0;
        const existingMap = {};
        existing.forEach(r => { existingMap[parseInt(r.episode_num)] = r; });
        let allEpNums;
        if (totalEps > 0) { allEpNums = Array.from({ length: totalEps }, (_, i) => i + 1).filter(n => n !== epNum); }
        else { allEpNums = existing.map(r => parseInt(r.episode_num)).filter(n => n !== epNum); }
        await Promise.all(allEpNums.map(n => {
          const row = existingMap[n] || {};
          return fetch('${siteUrl}/api/episode_override.php', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ anime_id: animeId, episode_num: n, image_url: row.image_url || '', synopsis: row.synopsis || '', watch_links: links })
          });
        }));
        showToast('Watch links applied to ' + allEpNums.length + ' episodes!', 'success');
      }
    }
    closeModal('admin-ep-modal');
    location.reload();
  } catch(e) { alert('Network error: ' + e.message); }
  finally { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
}
async function deleteEpOverride(id, animeId, epNum, btn) {
  if (!confirm('Delete all custom info for this episode? This cannot be undone.')) return;
  btn.disabled = true; btn.textContent = '…';
  try {
    const url = new URL('${siteUrl}/api/episode_override.php');
    url.searchParams.set('action', 'delete');
    if (id) { url.searchParams.set('id', id); }
    else { url.searchParams.set('anime_id', animeId); url.searchParams.set('ep', epNum); }
    const res  = await fetch(url.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const data = await res.json();
    if (data.success) {
      const row = btn.closest('tr');
      row.style.transition = 'opacity 0.3s'; row.style.opacity = '0';
      setTimeout(() => row.remove(), 300);
    } else { alert('Delete failed: ' + (data.error || 'Unknown error')); btn.disabled = false; btn.textContent = 'Delete'; }
  } catch(e) { alert('Network error: ' + e.message); btn.disabled = false; btn.textContent = 'Delete'; }
}
</script>`;

  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});

function renderOverrideRow(row: any, siteUrl: string): string {
  let links: any[] = [];
  try { links = JSON.parse(row.watch_links ?? '[]'); } catch { /* ignore */ }
  const updated = row.updated_at ? new Date(row.updated_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';
  const dataPayload = JSON.stringify({ image_url: row.image_url, synopsis: row.synopsis, watch_links: links }).replace(/"/g, '&quot;');

  return `
<tr>
  <td><a href="${siteUrl}/pages/anime.php?id=${row.anime_id}" target="_blank" style="color:var(--accent);">#${row.anime_id}</a></td>
  <td>Ep ${row.episode_num}</td>
  <td>${row.image_url ? `<img src="${h(row.image_url)}" style="width:80px;height:45px;object-fit:cover;border-radius:4px;">` : `<span class="text-muted">—</span>`}</td>
  <td style="max-width:200px;">${row.synopsis ? `<span style="font-size:0.82rem;color:var(--text-secondary);">${h(row.synopsis.substring(0, 80))}…</span>` : `<span class="text-muted">—</span>`}</td>
  <td>
    ${links.map((l) => {
      const svc = SERVICES[l.service] ?? { label: l.service, color: '#888' };
      return `<a href="${h(l.url)}" target="_blank" style="display:inline-block;margin:2px;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;border:1px solid ${svc.color}40;color:${svc.color};text-decoration:none;">${h(svc.label)}</a>`;
    }).join('')}
    ${links.length === 0 ? `<span class="text-muted">—</span>` : ''}
  </td>
  <td style="font-size:0.8rem;color:var(--text-muted);">${updated}</td>
  <td>
    <button class="btn btn-sm btn-secondary" onclick="adminEditEp(${row.anime_id}, ${row.episode_num}, ${dataPayload})">Edit</button>
    <button class="btn btn-sm btn-danger" onclick="deleteEpOverride(${row.id ?? 0}, ${row.anime_id}, ${row.episode_num}, this)">Delete</button>
  </td>
</tr>`;
}
