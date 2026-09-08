// Admin panel for the homepage hero carousel. Separate from anime-banners.ts
// (which only overrides the wide banner shown on a single anime's own page).
// This table drives which titles appear in the hero slider on the homepage
// itself — ONLY these titles, in this exact admin-chosen order. home.ts no
// longer mixes in the auto-generated seasonal pool once any row exists here.
//
// Flow: search/add the anime first (no image required yet) → each row then
// gets its own "Banner" / "Logo" buttons to add or replace that slide's
// images inline, without re-entering the Anime ID.
//
// Table expected (create once via wrangler d1 execute):
//   CREATE TABLE home_hero_banners (
//     id INTEGER PRIMARY KEY AUTOINCREMENT,
//     anime_id INTEGER NOT NULL,
//     anime_title TEXT,
//     banner_image_url TEXT,
//     logo_image_url TEXT,
//     display_order INTEGER NOT NULL DEFAULT 0,
//     source TEXT NOT NULL DEFAULT 'url',
//     created_at TEXT NOT NULL DEFAULT (datetime('now')),
//     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
//   );
//   CREATE INDEX idx_home_hero_banners_order ON home_hero_banners(display_order);
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { h } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';
import { MalAPI } from '../../lib/mal-api';

export const adminHomeBannersRoutes = new Hono<{ Bindings: Env }>();

const R2_PREFIX = 'home-banner-library/';
const ALLOWED_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 3 * 1024 * 1024;

function isValidUrl(u: string): boolean {
  try { const parsed = new URL(u); return parsed.protocol === 'http:' || parsed.protocol === 'https:'; } catch { return false; }
}

async function nextDisplayOrder(db: any): Promise<number> {
  const row = await db.fetchOne<{ mx: number | null }>('SELECT MAX(display_order) as mx FROM home_hero_banners');
  return (row?.mx ?? 0) + 1;
}

async function uploadToLibrary(env: Env, file: File, prefix: string): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error('Image is too large. Use 3 MB or less.');
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) throw new Error('Upload JPG, PNG, or WebP only.');
  const filename = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buf = await file.arrayBuffer();
  await env.AVATARS.put(`${R2_PREFIX}${filename}`, buf, { httpMetadata: { contentType: file.type } });
  return `${env.SITE_URL}/assets/img/home-banner-library/${filename}`;
}

async function deleteFromLibraryIfLocal(env: Env, url: string | null | undefined): Promise<void> {
  if (!url || !url.includes('/assets/img/home-banner-library/')) return;
  const filename = url.split('/assets/img/home-banner-library/')[1];
  try { await env.AVATARS.delete(`${R2_PREFIX}${filename}`); } catch { /* best-effort */ }
}

/** Resolves an image from either an uploaded file or a pasted URL. Throws if neither is usable. */
async function resolveImage(env: Env, formData: FormData, prefix: string): Promise<{ url: string; source: string }> {
  const file = formData.get('image_file') as File | null;
  const urlInput = ((formData.get('image_url') as string) ?? '').trim();
  if (file && file.size > 0) {
    return { url: await uploadToLibrary(env, file, prefix), source: 'upload' };
  }
  if (urlInput) {
    if (!isValidUrl(urlInput)) throw new Error('Enter a valid image URL.');
    return { url: urlInput, source: 'url' };
  }
  throw new Error('Choose a file or paste an image URL.');
}

adminHomeBannersRoutes.on(['GET', 'POST'], '/admin/home_banners.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating } = ctx;

  if (c.req.method === 'POST') {
    const formData = await c.req.formData();
    const action = (formData.get('action') as string) ?? '';

    try {
      if (action === 'add_anime') {
        // Step 1: add the anime to the carousel, no image required yet —
        // it lands at the bottom of the order with placeholder slots for
        // Banner/Logo to be filled in on the row itself. Title and logo
        // are auto-filled if left blank: title from the MAL API, logo from
        // getAnimeArt() (scraper clear-logo, same source home.ts's auto
        // pool uses).
        const animeId = parseInt((formData.get('anime_id') as string) ?? '0', 10) || 0;
        let title = ((formData.get('anime_title') as string) ?? '').trim();
        if (!animeId) throw new Error('Enter a valid Anime ID.');

        const existing = await db.fetchOne<any>('SELECT id FROM home_hero_banners WHERE anime_id=?', [animeId]);
        if (existing) throw new Error('That anime is already in the hero carousel.');

        const mal = new MalAPI(c.env, c.env.API_CACHE, db);
        const fetched = await mal.getAnime(animeId);
        if (!fetched.data) throw new Error(`No anime found for ID ${animeId}.`);
        if (!title) title = fetched.data.title_english || fetched.data.title || '';
        const logoUrl = fetched.data.logo_image || '';

        const order = await nextDisplayOrder(db);
        await db.query(
          `INSERT INTO home_hero_banners (anime_id, anime_title, logo_image_url, display_order, source) VALUES (?,?,?,?,?)`,
          [animeId, title || null, logoUrl || null, order, 'url']
        );
        session.setFlash('success', 'Anime added — now add its banner below (logo auto-filled from TMDB if available).');
      } else if (action === 'set_banner' || action === 'set_logo') {
        // Step 2: add or replace the banner/logo for a specific row. Keyed
        // by row id, so no need to re-enter the Anime ID.
        const id = parseInt((formData.get('id') as string) ?? '0', 10) || 0;
        if (!id) throw new Error('Missing row id.');
        const row = await db.fetchOne<any>('SELECT * FROM home_hero_banners WHERE id=?', [id]);
        if (!row) throw new Error('That slide no longer exists.');

        const field = action === 'set_banner' ? 'banner_image_url' : 'logo_image_url';
        const prefix = action === 'set_banner' ? `banner-${row.anime_id}` : `logo-${row.anime_id}`;
        const { url } = await resolveImage(c.env, formData, prefix);

        await deleteFromLibraryIfLocal(c.env, row[field]);
        await db.query(`UPDATE home_hero_banners SET ${field}=?, updated_at=datetime('now') WHERE id=?`, [url, id]);
        session.setFlash('success', action === 'set_banner' ? 'Banner saved.' : 'Logo saved.');
      } else if (action === 'move_up' || action === 'move_down') {
        const id = parseInt((formData.get('id') as string) ?? '0', 10) || 0;
        const current = await db.fetchOne<any>('SELECT id, display_order FROM home_hero_banners WHERE id=?', [id]);
        if (current) {
          const neighbor = action === 'move_up'
            ? await db.fetchOne<any>('SELECT id, display_order FROM home_hero_banners WHERE display_order < ? ORDER BY display_order DESC LIMIT 1', [current.display_order])
            : await db.fetchOne<any>('SELECT id, display_order FROM home_hero_banners WHERE display_order > ? ORDER BY display_order ASC LIMIT 1', [current.display_order]);
          if (neighbor) {
            await db.query('UPDATE home_hero_banners SET display_order=? WHERE id=?', [neighbor.display_order, current.id]);
            await db.query('UPDATE home_hero_banners SET display_order=? WHERE id=?', [current.display_order, neighbor.id]);
          }
        }
      } else if (action === 'delete') {
        const id = parseInt((formData.get('id') as string) ?? '0', 10) || 0;
        if (!id) throw new Error('Missing row id.');
        const row = await db.fetchOne<any>('SELECT banner_image_url, logo_image_url FROM home_hero_banners WHERE id=?', [id]);
        if (row) {
          await deleteFromLibraryIfLocal(c.env, row.banner_image_url);
          await deleteFromLibraryIfLocal(c.env, row.logo_image_url);
        }
        await db.query('DELETE FROM home_hero_banners WHERE id=?', [id]);
        session.setFlash('success', 'Removed from the hero carousel.');
      }
    } catch (e: any) {
      session.setFlash('error', e.message ?? 'An error occurred.');
    }
    await session.save(c, lifetime);
    return c.redirect(`${siteUrl}/admin/home_banners.php`);
  }

  const q = (c.req.query('q') ?? '').trim();
  let where = '';
  const params: unknown[] = [];
  if (q) {
    if (/^\d+$/.test(q)) { where = 'WHERE anime_id = ? OR anime_title LIKE ?'; params.push(parseInt(q, 10), `%${q}%`); }
    else { where = 'WHERE anime_title LIKE ?'; params.push(`%${q}%`); }
  }
  const slides = await db.fetchAll<any>(`SELECT * FROM home_hero_banners ${where} ORDER BY display_order ASC`, params);
  const total = await db.count('SELECT COUNT(*) as cnt FROM home_hero_banners');

  const flash = session.takeFlash();
  const err = flash?.type === 'error' ? flash.message : null;
  const suc = flash?.type === 'success' ? flash.message : null;

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Homepage Hero Carousel', adminPage: 'home_banners', isOwner, impersonating });
  html += `
<style>
.hero-slide-list { display:flex; flex-direction:column; gap:10px; }
.hero-slide-row { display:flex; align-items:flex-start; gap:14px; background:var(--bg-card); border:1px solid var(--border); border-radius:8px; padding:12px 14px; flex-wrap:wrap; }
.hero-slide-order { font-family:var(--font-display); font-size:1.1rem; color:var(--text-muted); width:28px; text-align:center; flex-shrink:0; padding-top:6px; }
.hero-slide-order-btns { display:flex; flex-direction:column; gap:2px; flex-shrink:0; padding-top:6px; }
.hero-slide-order-btns button { background:none; border:1px solid var(--border); color:var(--text-muted); border-radius:4px; width:22px; height:20px; line-height:1; cursor:pointer; font-size:0.7rem; }
.hero-slide-order-btns button:hover { background:var(--bg-hover); color:var(--text-primary); }
.hero-slide-thumb { width:120px; aspect-ratio:2.5/1; object-fit:cover; border-radius:6px; background:var(--bg-base); flex-shrink:0; }
.hero-slide-thumb-empty { width:120px; aspect-ratio:2.5/1; border:1px dashed var(--border); border-radius:6px; flex-shrink:0; display:flex; align-items:center; justify-content:center; color:var(--text-muted); font-size:0.72rem; }
.hero-slide-logo { width:70px; height:44px; object-fit:contain; background:var(--bg-base); border-radius:6px; flex-shrink:0; padding:4px; }
.hero-slide-logo-empty { width:70px; height:44px; border:1px dashed var(--border); border-radius:6px; flex-shrink:0; display:flex; align-items:center; justify-content:center; color:var(--text-muted); font-size:0.7rem; text-align:center; }
.hero-slide-info { flex:1; min-width:160px; padding-top:6px; }
.hero-slide-title { font-weight:700; color:var(--text-primary); font-size:0.92rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.hero-slide-meta { color:var(--text-muted); font-size:0.78rem; margin-top:2px; }
.hero-slide-actions { display:flex; gap:8px; flex-shrink:0; padding-top:6px; }
.hero-slide-media { display:flex; gap:10px; align-items:flex-start; flex-wrap:wrap; }
.hero-slide-media-col { display:flex; flex-direction:column; gap:4px; align-items:center; }
.hero-slide-media-col span { font-size:0.68rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.03em; }
.hero-upload-panel { flex-basis:100%; margin-top:8px; padding-top:10px; border-top:1px dashed var(--border); }
.hero-upload-panel form { display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; }
.hero-upload-panel .form-group { margin-bottom:0; }
.hero-upload-panel input[type="file"], .hero-upload-panel input[type="url"] { max-width:220px; }
details.hero-upload-toggle summary { cursor:pointer; list-style:none; }
details.hero-upload-toggle summary::-webkit-details-marker { display:none; }
@media (max-width: 900px) { .hero-slide-row { flex-wrap:wrap; } }
</style>

<div class="admin-header">
  <div><h1>Homepage Hero Carousel</h1><p class="text-muted" style="font-size:0.9rem;">Only titles added here appear in the homepage hero, in this exact order. Add the anime first, then set its banner and logo on the row below.</p></div>
  <span class="badge badge-default">${total.toLocaleString('en-US')} slides</span>
</div>

${suc ? `<div class="alert alert-success mb-2">${h(suc)}</div>` : ''}
${err ? `<div class="alert alert-error mb-2">${h(err)}</div>` : ''}

<div class="card card-body mb-3">
  <h2 class="mb-2">🔍 Search &amp; Add Anime</h2>
  <p class="text-muted" style="font-size:0.82rem;margin-top:-6px;margin-bottom:10px;">Adds the anime to the end of the order below — no image needed yet, use the Banner/Logo buttons on its row next.</p>
  <form method="POST" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
    <input type="hidden" name="action" value="add_anime">
    <div class="form-group" style="margin-bottom:0;"><label class="form-label">Anime ID (MAL ID)</label><input class="form-control" type="number" name="anime_id" required placeholder="16498"></div>
    <div class="form-group" style="margin-bottom:0;"><label class="form-label">Title</label><input class="form-control" name="anime_title" placeholder="Optional, for searching"></div>
    <button class="btn btn-primary" type="submit">Add Anime</button>
  </form>
</div>

<div class="card card-body mb-3">
  <form method="GET" style="display:flex;gap:8px;flex-wrap:wrap;">
    <input class="form-control" name="q" value="${h(q)}" placeholder="Search added anime by title or Anime ID" style="max-width:320px;">
    <button class="btn btn-primary" type="submit">Search</button>
    ${q ? `<a class="btn btn-ghost" href="home_banners.php">Clear</a>` : ''}
  </form>
</div>

${slides.length === 0 ? `<div class="card card-body text-center text-muted">No hero slides yet — add an anime above to get started.</div>` : `
<div class="hero-slide-list">
  ${slides.map((s: any, i: number) => `
  <div class="hero-slide-row">
    <div class="hero-slide-order">${i + 1}</div>
    <div class="hero-slide-order-btns">
      <form method="POST"><input type="hidden" name="action" value="move_up"><input type="hidden" name="id" value="${s.id}"><button type="submit" ${i === 0 ? 'disabled' : ''} title="Move up">▲</button></form>
      <form method="POST"><input type="hidden" name="action" value="move_down"><input type="hidden" name="id" value="${s.id}"><button type="submit" ${i === slides.length - 1 ? 'disabled' : ''} title="Move down">▼</button></form>
    </div>

    <div class="hero-slide-media">
      <div class="hero-slide-media-col">
        <span>Banner</span>
        ${s.banner_image_url ? `<img class="hero-slide-thumb" src="${h(s.banner_image_url)}" alt="">` : `<div class="hero-slide-thumb-empty">No banner</div>`}
      </div>
      <div class="hero-slide-media-col">
        <span>Logo</span>
        ${s.logo_image_url ? `<img class="hero-slide-logo" src="${h(s.logo_image_url)}" alt="">` : `<div class="hero-slide-logo-empty">No logo</div>`}
      </div>
    </div>

    <div class="hero-slide-info">
      <div class="hero-slide-title">${h(s.anime_title || 'Untitled')}</div>
      <div class="hero-slide-meta">#${s.anime_id}</div>
    </div>

    <div class="hero-slide-actions">
      <details class="hero-upload-toggle"><summary class="btn btn-ghost btn-sm">${s.banner_image_url ? 'Replace Banner' : 'Add Banner'}</summary>
        <div class="hero-upload-panel">
          <form method="POST" enctype="multipart/form-data">
            <input type="hidden" name="action" value="set_banner"><input type="hidden" name="id" value="${s.id}">
            <div class="form-group"><label class="form-label">File</label><input class="form-control" type="file" name="image_file" accept="image/jpeg,image/png,image/webp"></div>
            <div class="form-group"><label class="form-label">…or URL</label><input class="form-control" type="url" name="image_url" placeholder="https://..."></div>
            <button class="btn btn-primary btn-sm" type="submit">Save Banner</button>
          </form>
        </div>
      </details>
      <details class="hero-upload-toggle"><summary class="btn btn-ghost btn-sm">${s.logo_image_url ? 'Replace Logo' : 'Add Logo'}</summary>
        <div class="hero-upload-panel">
          <form method="POST" enctype="multipart/form-data">
            <input type="hidden" name="action" value="set_logo"><input type="hidden" name="id" value="${s.id}">
            <div class="form-group"><label class="form-label">File</label><input class="form-control" type="file" name="image_file" accept="image/jpeg,image/png,image/webp"></div>
            <div class="form-group"><label class="form-label">…or URL</label><input class="form-control" type="url" name="image_url" placeholder="https://..."></div>
            <button class="btn btn-primary btn-sm" type="submit">Save Logo</button>
          </form>
        </div>
      </details>
      <form method="POST" onsubmit="return confirm('Remove this slide from the hero carousel?')">
        <input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="${s.id}">
        <button class="btn btn-danger btn-sm" type="submit">Delete</button>
      </form>
    </div>
  </div>`).join('')}
</div>`}`;

  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});

adminHomeBannersRoutes.get('/assets/img/home-banner-library/:filename', async (c) => {
  const filename = c.req.param('filename');
  const obj = await c.env.AVATARS.get(`${R2_PREFIX}${filename}`);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: { 'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
});
