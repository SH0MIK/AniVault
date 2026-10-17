// Ports admin/heal_images.php + includes/anime_images.php's
// saveRemoteAnimeImageFile(). Downloads go through fetch() instead of
// file_get_contents(), and saved files go to R2 instead of local disk.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { h } from '../../lib/helpers';
import { icon } from '../../lib/icons';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';

export const adminHealImagesRoutes = new Hono<{ Bindings: Env }>();

const ALLOWED_MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

adminHealImagesRoutes.on(['GET', 'POST'], '/admin/heal_images.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating } = ctx;

  if (c.req.method === 'POST') {
    const body: any = await c.req.json().catch(() => ({}));
    const animeId = parseInt(body.anime_id ?? '0', 10) || 0;
    const title = String(body.anime_title ?? '').trim();
    const imageUrl = String(body.image_url ?? '').trim();

    let valid = false;
    try { const u = new URL(imageUrl); valid = u.protocol === 'http:' || u.protocol === 'https:'; } catch { /* invalid */ }
    if (!animeId || !valid) {
      await session.save(c, lifetime);
      return c.json({ success: false, error: 'Invalid anime id or image URL' });
    }

    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(imageUrl, {
        headers: { 'User-Agent': 'AniVault/1.0', Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' },
        signal: controller.signal,
      });
      clearTimeout(t);
      if (!res.ok) throw new Error('Could not download image.');

      const buf = await res.arrayBuffer();
      if (buf.byteLength === 0) throw new Error('Could not download image.');
      if (buf.byteLength > 2 * 1024 * 1024) throw new Error('Downloaded image is larger than 2 MB.');

      const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      const ext = ALLOWED_MIME[contentType];
      if (!ext) throw new Error('Remote file is not a supported image.');

      const filename = `anime-${animeId}.${ext}`;
      // Remove any previously saved file for this anime under a different extension.
      for (const oldExt of Object.values(ALLOWED_MIME)) {
        if (oldExt !== ext) { try { await c.env.AVATARS.delete(`anime-library/anime-${animeId}.${oldExt}`); } catch { /* ignore */ } }
      }
      await c.env.AVATARS.put(`anime-library/${filename}`, buf, { httpMetadata: { contentType } });

      const localUrl = `${siteUrl}/assets/img/anime-library/${filename}`;
      await db.query(
        `INSERT INTO anime_images (anime_id, anime_title, image_url, source) VALUES (?,?,?,'healer-file')
         ON CONFLICT(anime_id) DO UPDATE SET anime_title=excluded.anime_title, image_url=excluded.image_url, source='healer-file', updated_at=datetime('now')`,
        [animeId, title || null, localUrl]
      );

      await session.save(c, lifetime);
      return c.json({ success: true, image_url: localUrl });
    } catch (e: any) {
      await session.save(c, lifetime);
      return c.json({ success: false, error: e.message ?? 'Failed to save image.' });
    }
  }

  const limit = Math.min(25, Math.max(1, parseInt(c.req.query('limit') ?? '10', 10) || 10));
  const auto = c.req.query('auto') === '1';
  const skipIds = (c.req.query('skip') ?? '')
    .split(',').map((s) => parseInt(s, 10)).filter((n) => n > 0).slice(0, 300);

  const skipSql = skipIds.length ? ` AND anime_id NOT IN (${skipIds.map(() => '?').join(',')})` : '';
  const missing = await db.fetchAll<{ anime_id: number; anime_title: string | null }>(
    `SELECT anime_id, MIN(NULLIF(anime_title, '')) AS anime_title FROM anime_list
     WHERE (anime_image IS NULL OR anime_image = '') ${skipSql} GROUP BY anime_id ORDER BY anime_id LIMIT ${limit}`,
    skipIds
  );
  const remaining = await db.count(`SELECT COUNT(DISTINCT anime_id) as cnt FROM anime_list WHERE anime_image IS NULL OR anime_image = ''`);

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Heal Images', adminPage: 'heal_images', isOwner, impersonating });
  html += `
<style>
.heal-row { display:grid; grid-template-columns:52px 1fr 160px 54px; gap:1rem; align-items:center; padding:.75rem 1rem; background:var(--bg-card); border:1px solid var(--border); border-radius:10px; transition:border-color .15s; }
.heal-row:hover { border-color:rgba(255,255,255,.12); }
.heal-row img { width:42px; height:58px; object-fit:cover; border-radius:6px; border:1px solid var(--border); }
.heal-anime-id { font-size:.72rem; font-weight:700; color:var(--text-muted); }
.heal-anime-name { font-size:.88rem; font-weight:600; color:var(--text-primary); }
.heal-status { font-size:.8rem; color:var(--text-muted); }
.heal-status.ok { color:#22c55e; font-weight:700; }
.heal-status.fail { color:#f87171; font-weight:700; }
.heal-preview img { width:42px; height:58px; object-fit:cover; border-radius:6px; }
.heal-batch-btns { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; }
.heal-auto-label { display:inline-flex; align-items:center; gap:.4rem; font-size:.84rem; color:var(--text-muted); cursor:pointer; margin-left:.25rem; }
.heal-stats { display:flex; gap:1.5rem; flex-wrap:wrap; margin-bottom:1.5rem; }
.heal-stat { background:var(--bg-card); border:1px solid var(--border); border-radius:10px; padding:.75rem 1.25rem; }
.heal-stat-val { font-size:1.5rem; font-weight:800; color:var(--text-primary); font-family:var(--font-display); }
.heal-stat-lbl { font-size:.72rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:.07em; margin-top:.1rem; }
@media (max-width:600px) { .heal-row { grid-template-columns:42px 1fr; } .heal-status, .heal-preview { grid-column:2; } }
</style>

<div class="admin-header"><div><h1>${icon('heal', 'icon-medium')} Heal Images</h1><p class="text-muted">Browser fetches missing anime images from Jikan, then the server saves them.</p></div></div>

<div class="heal-stats">
  <div class="heal-stat"><div class="heal-stat-val">${remaining.toLocaleString('en-US')}</div><div class="heal-stat-lbl">Missing Images</div></div>
  <div class="heal-stat"><div class="heal-stat-val">${missing.length}</div><div class="heal-stat-lbl">In This Batch</div></div>
  ${skipIds.length ? `<div class="heal-stat"><div class="heal-stat-val">${skipIds.length.toLocaleString('en-US')}</div><div class="heal-stat-lbl">Skipped (Failed)</div></div>` : ''}
</div>

<div class="card card-body mb-4">
  <div class="heal-batch-btns">
    <button id="start-heal" class="btn btn-primary" ${missing.length === 0 ? 'disabled' : ''}>${icon('heal', 'icon-small')} Start Batch</button>
    <span class="text-muted" style="font-size:.82rem;">Batch size:</span>
    ${[5, 10, 20, 25].map((n) => `<a class="btn btn-ghost btn-sm ${limit === n ? 'active' : ''}" href="heal_images.php?limit=${n}">${n}</a>`).join('')}
    <label class="heal-auto-label"><input type="checkbox" id="auto-continue" ${auto ? 'checked' : ''}> Auto-continue</label>
  </div>
</div>

${missing.length === 0 ? `
<div class="card card-body" style="text-align:center; padding:2.5rem; color:var(--text-muted); margin-top:10px;">
  ${icon('check', 'icon-medium')}<p style="margin-top:.5rem;">All anime images are present. Nothing to heal!</p>
</div>` : `
<div style="display:flex; flex-direction:column; gap:.5rem;" id="heal-log">
  ${missing.map((entry) => `
  <div class="heal-row" data-anime-id="${entry.anime_id}" data-anime-title="${h(entry.anime_title ?? '')}">
    <span class="heal-preview"></span>
    <div><div class="heal-anime-id">#${entry.anime_id}</div><div class="heal-anime-name">${h(entry.anime_title || 'Unknown title')}</div></div>
    <span class="heal-status">Waiting…</span>
    <span></span>
  </div>`).join('')}
</div>`}

<script>
const rows       = Array.from(document.querySelectorAll('.heal-row'));
const batchLimit = ${limit};
const autoStart  = ${auto ? 'true' : 'false'};
const sleep      = ms => new Promise(r => setTimeout(r, ms));

async function saveImage(animeId, animeTitle, imageUrl) {
  const res = await fetch('heal_images.php', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ anime_id: animeId, anime_title: animeTitle, image_url: imageUrl })
  });
  return res.json();
}
function bestImage(images) {
  return images?.jpg?.large_image_url || images?.jpg?.image_url || images?.webp?.large_image_url || images?.webp?.image_url || '';
}
async function jikan(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(\`Jikan HTTP \${res.status}\`);
  return res.json();
}
async function healRow(row) {
  const animeId    = row.dataset.animeId;
  const animeTitle = row.dataset.animeTitle;
  const status  = row.querySelector('.heal-status');
  const preview = row.querySelector('.heal-preview');
  status.textContent = 'Fetching…';
  status.className   = 'heal-status';
  let imageUrl = '';
  try {
    const data = await jikan(\`https://api.jikan.moe/v4/anime/\${animeId}/pictures\`);
    imageUrl = bestImage(data?.data?.[0]);
  } catch (_) {}
  if (!imageUrl) {
    status.textContent = 'Trying fallback…';
    const data = await jikan(\`https://api.jikan.moe/v4/anime/\${animeId}\`);
    imageUrl = bestImage(data?.data?.images);
  }
  if (!imageUrl) throw new Error('No image found');
  status.textContent = 'Saving…';
  const saved = await saveImage(animeId, animeTitle, imageUrl);
  if (!saved.success) throw new Error(saved.error || 'Save failed');
  status.textContent = '✓ Healed';
  status.classList.add('ok');
  const localUrl = saved.image_url || imageUrl;
  preview.innerHTML = \`<img src="\${localUrl.replaceAll('"', '&quot;')}" alt="">\`;
}
function nextBatchUrl(failedIds) {
  const params  = new URLSearchParams(window.location.search);
  const skipped = new Set((params.get('skip') || '').split(',').filter(Boolean));
  failedIds.forEach(id => skipped.add(String(id)));
  params.set('limit', String(batchLimit));
  params.set('auto', '1');
  params.delete('mode');
  skipped.size ? params.set('skip', Array.from(skipped).slice(-300).join(',')) : params.delete('skip');
  return \`\${window.location.pathname}?\${params.toString()}\`;
}
document.getElementById('start-heal')?.addEventListener('click', async function () {
  if (this.dataset.running === '1') return;
  this.dataset.running = '1';
  this.disabled = true;
  this.textContent = 'Healing…';
  const failedIds = [];
  for (const row of rows) {
    const status = row.querySelector('.heal-status');
    try { await healRow(row); } catch (err) { status.textContent = err.message; status.classList.add('fail'); failedIds.push(row.dataset.animeId); }
    await sleep(900);
  }
  this.textContent = 'Batch Complete';
  if (document.getElementById('auto-continue')?.checked) {
    this.textContent = 'Loading next batch…';
    await sleep(1500);
    window.location.href = nextBatchUrl(failedIds);
  }
});
if (autoStart && rows.length) { setTimeout(() => document.getElementById('start-heal')?.click(), 600); }
</script>`;

  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});
