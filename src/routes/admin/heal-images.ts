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
    const action = String(body.action ?? '');

    if (action === 'flag_missing') {
      if (!animeId) {
        await session.save(c, lifetime);
        return c.json({ success: false, error: 'Invalid anime id' }, 400);
      }
      const reason = String(body.reason ?? 'No Hoshika coverImage found').slice(0, 500);
      await db.query(
        `INSERT INTO hoshika_cover_flags (anime_id, anime_title, reason, status, created_at, updated_at)
         VALUES (?, ?, ?, 'missing', datetime('now'), datetime('now'))
         ON CONFLICT(anime_id) DO UPDATE SET anime_title=excluded.anime_title, reason=excluded.reason,
           status='missing', updated_at=datetime('now')`,
        [animeId, title, reason]
      );
      await session.save(c, lifetime);
      return c.json({ success: true, flagged: true });
    }

    if (action === 'resolve_flag') {
      if (!animeId) {
        await session.save(c, lifetime);
        return c.json({ success: false, error: 'Invalid anime id' }, 400);
      }
      await db.query(
        `UPDATE hoshika_cover_flags SET status='resolved', updated_at=datetime('now') WHERE anime_id=?`,
        [animeId]
      );
      await session.save(c, lifetime);
      return c.json({ success: true, resolved: true });
    }

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
  const afterId = Math.max(0, parseInt(c.req.query('after') ?? '0', 10) || 0);
  const missing = await db.fetchAll<{ anime_id: number; anime_title: string | null; anime_image: string | null }>(
    `SELECT anime_id, MIN(NULLIF(anime_title, '')) AS anime_title, MAX(NULLIF(anime_image, '')) AS anime_image
     FROM anime_list WHERE anime_id > ? GROUP BY anime_id ORDER BY anime_id LIMIT ${limit}`,
    [afterId]
  );
  const remaining = await db.count('SELECT COUNT(DISTINCT anime_id) as cnt FROM anime_list');
  const flagged = await db.fetchAll<{ anime_id: number; anime_title: string; reason: string; updated_at: string }>(
    `SELECT anime_id, anime_title, reason, updated_at FROM hoshika_cover_flags
     WHERE status='missing' ORDER BY updated_at DESC LIMIT 100`
  );

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Hoshika Cover Audit', adminPage: 'heal_images', isOwner, impersonating });
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

<div class="admin-header"><div><h1>${icon('heal', 'icon-medium')} Hoshika Cover Audit</h1><p class="text-muted">Scans tracked anime against Hoshika only. Missing covers are marked in red for review; no fallback source is used.</p></div></div>

<div class="card card-body mb-4">
  <h2 class="mb-2">Flagged Missing Hoshika Covers (${flagged.length})</h2>
  <p class="text-muted" style="font-size:.84rem;">These flags stay here until you mark them resolved.</p>
  ${flagged.length ? flagged.map((flag) => `
    <div class="flex-between" style="gap:1rem;padding:.65rem 0;border-bottom:1px solid var(--border);">
      <div style="min-width:0;flex:1;">
        <strong>${h(flag.anime_title || 'Unknown title')}</strong>
        <div class="text-muted" style="font-size:.78rem;">#${flag.anime_id} · ${h(flag.reason)}</div>
      </div>
      <button class="btn btn-ghost btn-sm resolve-hoshika-flag" data-anime-id="${flag.anime_id}">Mark resolved</button>
    </div>`).join('') : '<p class="text-muted" style="font-size:.85rem;">No missing Hoshika covers have been flagged.</p>'}
</div>

<div class="heal-stats">
  <div class="heal-stat"><div class="heal-stat-val">${remaining.toLocaleString('en-US')}</div><div class="heal-stat-lbl">Tracked Anime</div></div>
  <div class="heal-stat"><div class="heal-stat-val">${missing.length}</div><div class="heal-stat-lbl">In This Batch</div></div>
  ${afterId ? `<div class="heal-stat"><div class="heal-stat-val">${afterId.toLocaleString('en-US')}</div><div class="heal-stat-lbl">After Anime ID</div></div>` : ''}
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
  ${icon('check', 'icon-medium')}<p style="margin-top:.5rem;">No more anime in this batch. Use Auto-continue to scan further batches, or clear the skipped IDs to rescan.</p>
</div>` : `
<div style="display:flex; flex-direction:column; gap:.5rem;" id="heal-log">
  ${missing.map((entry) => `
  <div class="heal-row" data-anime-id="${entry.anime_id}" data-anime-title="${h(entry.anime_title ?? '')}" data-has-image="${entry.anime_image ? '1' : '0'}">
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
function normTitle(value) {
  return String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\\s+/g, ' ');
}
async function hoshikaJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(\`Hoshika HTTP \${res.status}\`);
  const json = await res.json();
  if (json?.ok === false) throw new Error('Hoshika returned an API error');
  return json;
}
async function hoshikaCover(title) {
  const searchUrl = new URL('https://hoshika.app/api/v1/search');
  searchUrl.searchParams.set('q', title);
  const search = await hoshikaJson(searchUrl.toString());
  const records = Array.isArray(search?.anime) ? search.anime : [];
  const wanted = normTitle(title);
  const match = records.map(item => {
    const variants = [item.titleEnglish, item.titleRomaji, item.titleLocalized, item.titleJapanese, item.title, item.slug].map(normTitle).filter(Boolean);
    const score = variants.some(v => v === wanted) ? 100 : variants.some(v => v.startsWith(wanted) || wanted.startsWith(v)) ? 80 : 0;
    return { item, score };
  }).filter(x => x.score >= 80).sort((a, b) => b.score - a.score)[0]?.item;
  if (!match) throw new Error('MISSING HOSHIKA COVER — no matching catalog entry; flagged for review');
  const shortId = match.shortId ?? match.short_id;
  if (!shortId) throw new Error('MISSING HOSHIKA COVER — catalog entry has no shortId; flagged for review');
  let imageUrl = typeof match.coverImage === 'string' ? match.coverImage : '';
  if (!imageUrl) {
    const detail = await hoshikaJson(\`https://hoshika.app/api/v1/anime/\${encodeURIComponent(shortId)}\`);
    const anime = detail?.anime ?? detail?.data?.anime ?? detail?.data ?? detail;
    imageUrl = typeof anime?.coverImage === 'string' ? anime.coverImage : '';
  }
  if (!/^https?:\\/\\//i.test(imageUrl)) {
    throw new Error('MISSING HOSHIKA COVER — no coverImage available; flagged for review');
  }
  return imageUrl;
}
async function healRow(row) {
  const animeId    = row.dataset.animeId;
  const animeTitle = row.dataset.animeTitle;
  const status  = row.querySelector('.heal-status');
  const preview = row.querySelector('.heal-preview');
  status.textContent = 'Checking Hoshika…';
  status.className   = 'heal-status';
  let imageUrl = '';
  try {
    imageUrl = await hoshikaCover(animeTitle);
  } catch (err) {
    const message = String(err?.message || 'Hoshika lookup failed');
    status.textContent = message;
    status.classList.add('fail');
    if (message.includes('MISSING HOSHIKA COVER')) {
      try {
        const response = await fetch('heal_images.php', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'flag_missing', anime_id: animeId, anime_title: animeTitle, reason: message })
        });
        const result = await response.json();
        if (result.success) status.textContent = message + ' — flag saved';
      } catch (_) { /* keep the visible warning if flag storage is unavailable */ }
    }
    return;
  }
  status.textContent = '✓ Hoshika cover found';
  status.classList.add('ok');
  preview.innerHTML = \`<img src="\${imageUrl.replaceAll('"', '&quot;')}" alt="">\`;
}
function nextBatchUrl(processedIds) {
  const params = new URLSearchParams(window.location.search);
  const lastId = processedIds.length ? processedIds[processedIds.length - 1] : params.get('after') || '0';
  params.set('limit', String(batchLimit));
  params.set('after', String(lastId));
  params.set('auto', '1');
  params.delete('skip');
  params.delete('mode');
  return \`\${window.location.pathname}?\${params.toString()}\`;
}
document.querySelectorAll('.resolve-hoshika-flag').forEach(button => {
  button.addEventListener('click', async function () {
    const animeId = this.dataset.animeId;
    this.disabled = true;
    const response = await fetch('heal_images.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve_flag', anime_id: animeId })
    });
    const result = await response.json();
    if (result.success) this.closest('.flex-between')?.remove();
    else { this.disabled = false; alert(result.error || 'Could not resolve flag'); }
  });
});

document.getElementById('start-heal')?.addEventListener('click', async function () {
  if (this.dataset.running === '1') return;
  this.dataset.running = '1';
  this.disabled = true;
  this.textContent = 'Healing…';
  const processedIds = [];
  for (const row of rows) {
    const status = row.querySelector('.heal-status');
    try { await healRow(row); } catch (err) { status.textContent = err.message; status.classList.add('fail'); }
    processedIds.push(row.dataset.animeId);
    await sleep(900);
  }
  this.textContent = 'Batch Complete';
  if (document.getElementById('auto-continue')?.checked) {
    this.textContent = 'Loading next batch…';
    await sleep(1500);
    window.location.href = nextBatchUrl(processedIds);
  }
});
if (autoStart && rows.length) { setTimeout(() => document.getElementById('start-heal')?.click(), 600); }
</script>`;

  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});
