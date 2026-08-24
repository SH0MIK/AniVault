// Ports admin/anime_images.php. Uploads go to R2 instead of local disk.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { h } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';
import { Settings } from '../../lib/settings';

export const adminAnimeImagesRoutes = new Hono<{ Bindings: Env }>();

async function saveLocalAnimeImage(db: any, animeId: number, title: string, imageUrl: string, source: string): Promise<void> {
  await db.query(
    `INSERT INTO anime_images (anime_id, anime_title, image_url, source) VALUES (?,?,?,?)
     ON CONFLICT(anime_id) DO UPDATE SET anime_title=excluded.anime_title, image_url=excluded.image_url, source=excluded.source, updated_at=datetime('now')`,
    [animeId, title || null, imageUrl, source]
  );
}

adminAnimeImagesRoutes.on(['GET', 'POST'], '/admin/anime_images.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating } = ctx;

  if (c.req.method === 'POST') {
    const formData = await c.req.formData();
    const action = (formData.get('action') as string) ?? '';
    const animeId = parseInt((formData.get('anime_id') as string) ?? '0', 10) || 0;
    const title = ((formData.get('anime_title') as string) ?? '').trim();

    try {
      if (action === 'save_url') {
        const imageUrl = ((formData.get('image_url') as string) ?? '').trim();
        let valid = false;
        try { const u = new URL(imageUrl); valid = u.protocol === 'http:' || u.protocol === 'https:'; } catch { /* invalid */ }
        if (!animeId || !valid) throw new Error('Enter a valid Anime ID and image URL.');
        await saveLocalAnimeImage(db, animeId, title, imageUrl, 'url');
        session.setFlash('success', 'Image URL saved.');
      } else if (action === 'upload') {
        const file = formData.get('image_file') as File | null;
        if (!animeId || !file || file.size === 0) throw new Error('Choose an image file and enter a valid Anime ID.');
        if (file.size > 2 * 1024 * 1024) throw new Error('Image is too large. Use 2 MB or less.');
        const allowed: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
        const ext = allowed[file.type];
        if (!ext) throw new Error('Upload JPG, PNG, or WebP only.');

        const filename = `anime-${animeId}-${Date.now()}.${ext}`;
        const buf = await file.arrayBuffer();
        await c.env.AVATARS.put(`anime-library/${filename}`, buf, { httpMetadata: { contentType: file.type } });
        const imageUrl = `${siteUrl}/assets/img/anime-library/${filename}`;
        await saveLocalAnimeImage(db, animeId, title, imageUrl, 'upload');
        session.setFlash('success', 'Image uploaded and saved.');
      } else if (action === 'delete') {
        if (!animeId) throw new Error('Missing Anime ID.');
        const row = await db.fetchOne<{ image_url: string }>('SELECT image_url FROM anime_images WHERE anime_id=?', [animeId]);
        if (row?.image_url?.includes('/assets/img/anime-library/')) {
          const filename = row.image_url.split('/assets/img/anime-library/')[1];
          try { await c.env.AVATARS.delete(`anime-library/${filename}`); } catch { /* best-effort */ }
        }
        await db.query('DELETE FROM anime_images WHERE anime_id=?', [animeId]);
        session.setFlash('success', 'Image removed from library.');
      } else if (action === 'set_priority') {
        // Global switch (not per-anime) — see MalAPI.getImagePriority(),
        // which every poster/cover/logo lookup site-wide reads from. Only
        // controls which of the two sources is *preferred*; the other one
        // still acts as a fallback when the preferred one is empty.
        const priority = (formData.get('priority') as string) === 'api' ? 'api' : 'saved';
        await new Settings(db).set('image_source_priority', priority);
        session.setFlash('success', `Image priority set to "${priority === 'api' ? 'API first' : 'Saved first'}".`);
      }
    } catch (e: any) {
      session.setFlash('error', e.message ?? 'An error occurred.');
    }
    await session.save(c, lifetime);
    return c.redirect(`${siteUrl}/admin/anime_images.php`);
  }

  const q = (c.req.query('q') ?? '').trim();
  let where = '';
  const params: unknown[] = [];
  if (q) {
    if (/^\d+$/.test(q)) { where = 'WHERE anime_id = ? OR anime_title LIKE ?'; params.push(parseInt(q, 10), `%${q}%`); }
    else { where = 'WHERE anime_title LIKE ?'; params.push(`%${q}%`); }
  }
  const images = await db.fetchAll<any>(`SELECT * FROM anime_images ${where} ORDER BY updated_at DESC LIMIT 80`, params);
  const total = await db.count('SELECT COUNT(*) as cnt FROM anime_images');
  const priority = await new Settings(db).get('image_source_priority', 'saved');

  const flash = session.takeFlash();
  const err = flash?.type === 'error' ? flash.message : null;
  const suc = flash?.type === 'success' ? flash.message : null;

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Anime Image Library', adminPage: 'anime_images', isOwner, impersonating });
  html += `
<style>
.image-admin-grid { display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:1.5rem; }
.image-library-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:12px; }
.image-library-card { background:var(--bg-card); border:1px solid var(--border); border-radius:8px; overflow:hidden; }
.image-library-card img { width:100%; aspect-ratio:2/3; object-fit:cover; background:var(--bg-base); }
.image-library-body { padding:10px; }
.image-library-title { font-weight:700; color:var(--text-primary); font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.image-library-meta { color:var(--text-muted); font-size:0.78rem; margin-top:2px; }
@media (max-width: 900px) { .image-admin-grid { grid-template-columns:1fr; } }
</style>

<div class="admin-header">
  <div><h1>Anime Image Library</h1><p class="text-muted" style="font-size:0.9rem;">Saved poster overrides, blended site-wide with the live scraper API per the priority setting below.</p></div>
  <span class="badge badge-default">${total.toLocaleString('en-US')} images</span>
</div>

${suc ? `<div class="alert alert-success mb-2">${h(suc)}</div>` : ''}
${err ? `<div class="alert alert-error mb-2">${h(err)}</div>` : ''}

<div class="card card-body mb-3">
  <h2 class="mb-2">Image Source Priority</h2>
  <p class="text-muted" style="font-size:0.85rem;margin-top:-4px;margin-bottom:12px;">
    Applies site-wide to every poster, cover, and logo. Whichever source you pick here is tried first;
    the other one is still used as a fallback if it's empty for a given title. Use this to compare
    which source loads faster for your site.
  </p>
  <form method="POST" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
    <input type="hidden" name="action" value="set_priority">
    <label class="form-control" style="display:flex;align-items:center;gap:6px;width:auto;cursor:pointer;">
      <input type="radio" name="priority" value="saved" ${priority !== 'api' ? 'checked' : ''}> Saved images first (API as fallback)
    </label>
    <label class="form-control" style="display:flex;align-items:center;gap:6px;width:auto;cursor:pointer;">
      <input type="radio" name="priority" value="api" ${priority === 'api' ? 'checked' : ''}> API first (saved images as fallback)
    </label>
    <button class="btn btn-primary btn-sm" type="submit">Save Priority</button>
  </form>
</div>

<div class="image-admin-grid">
  <div class="card card-body">
    <h2 class="mb-2">Upload Image</h2>
    <form method="POST" enctype="multipart/form-data">
      <input type="hidden" name="action" value="upload">
      <div class="form-group"><label class="form-label">Anime ID</label><input class="form-control" type="number" name="anime_id" required placeholder="16498"></div>
      <div class="form-group"><label class="form-label">Title</label><input class="form-control" name="anime_title" placeholder="Optional, for searching"></div>
      <div class="form-group"><label class="form-label">Image File</label><input class="form-control" type="file" name="image_file" accept="image/jpeg,image/png,image/webp" required></div>
      <button class="btn btn-primary" type="submit">Upload Image</button>
    </form>
  </div>
  <div class="card card-body">
    <h2 class="mb-2">Save Image URL</h2>
    <form method="POST">
      <input type="hidden" name="action" value="save_url">
      <div class="form-group"><label class="form-label">Anime ID</label><input class="form-control" type="number" name="anime_id" required placeholder="16498"></div>
      <div class="form-group"><label class="form-label">Title</label><input class="form-control" name="anime_title" placeholder="Optional, for searching"></div>
      <div class="form-group"><label class="form-label">Image URL</label><input class="form-control" type="url" name="image_url" required placeholder="https://..."></div>
      <button class="btn btn-primary" type="submit">Save URL</button>
    </form>
  </div>
</div>

<div class="card card-body mb-3">
  <form method="GET" style="display:flex;gap:8px;flex-wrap:wrap;">
    <input class="form-control" name="q" value="${h(q)}" placeholder="Search by title or Anime ID" style="max-width:320px;">
    <button class="btn btn-primary" type="submit">Search</button>
    ${q ? `<a class="btn btn-ghost" href="anime_images.php">Clear</a>` : ''}
  </form>
</div>

${images.length === 0 ? `<div class="card card-body text-center text-muted">No saved anime images yet.</div>` : `
<div class="image-library-grid">
  ${images.map((img: any) => `
  <div class="image-library-card">
    <img src="${h(img.image_url)}" alt="">
    <div class="image-library-body">
      <div class="image-library-title">${h(img.anime_title || 'Untitled')}</div>
      <div class="image-library-meta">#${img.anime_id} · ${h(img.source)}</div>
      <form method="POST" onsubmit="return confirm('Remove this image from the library?')" style="margin-top:8px;">
        <input type="hidden" name="action" value="delete"><input type="hidden" name="anime_id" value="${img.anime_id}">
        <button class="btn btn-danger btn-sm" type="submit">Delete</button>
      </form>
    </div>
  </div>`).join('')}
</div>`}`;

  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});

adminAnimeImagesRoutes.get('/assets/img/anime-library/:filename', async (c) => {
  const filename = c.req.param('filename');
  const obj = await c.env.AVATARS.get(`anime-library/${filename}`);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: { 'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
});
