// Mirrors admin/anime-images.ts, but for wide banner art instead of covers.
// Lets you manually curate a nicer banner per title (same idea as Anivexa's
// anikuro.to banner collection) instead of relying on AniList's often
// mediocre, community-submitted bannerImage.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { h } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';

export const adminAnimeBannersRoutes = new Hono<{ Bindings: Env }>();

async function saveLocalAnimeBanner(db: any, animeId: number, title: string, imageUrl: string, source: string): Promise<void> {
  await db.query(
    `INSERT INTO anime_banners (anime_id, anime_title, image_url, source) VALUES (?,?,?,?)
     ON CONFLICT(anime_id) DO UPDATE SET anime_title=excluded.anime_title, image_url=excluded.image_url, source=excluded.source, updated_at=datetime('now')`,
    [animeId, title || null, imageUrl, source]
  );
}

async function saveLocalAnimeLogo(db: any, animeId: number, title: string, imageUrl: string, source: string): Promise<void> {
  await db.query(
    `INSERT INTO anime_logos (anime_id, anime_title, image_url, source) VALUES (?,?,?,?)
     ON CONFLICT(anime_id) DO UPDATE SET anime_title=excluded.anime_title, image_url=excluded.image_url, source=excluded.source, updated_at=datetime('now')`,
    [animeId, title || null, imageUrl, source]
  );
}

adminAnimeBannersRoutes.on(['GET', 'POST'], '/admin/anime_banners.php', async (c) => {
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
        await saveLocalAnimeBanner(db, animeId, title, imageUrl, 'url');
        session.setFlash('success', 'Banner URL saved.');
      } else if (action === 'upload') {
        const file = formData.get('image_file') as File | null;
        if (!animeId || !file || file.size === 0) throw new Error('Choose an image file and enter a valid Anime ID.');
        if (file.size > 3 * 1024 * 1024) throw new Error('Image is too large. Use 3 MB or less.');
        const allowed: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
        const ext = allowed[file.type];
        if (!ext) throw new Error('Upload JPG, PNG, or WebP only.');

        const filename = `anime-${animeId}-${Date.now()}.${ext}`;
        const buf = await file.arrayBuffer();
        await c.env.AVATARS.put(`anime-banner-library/${filename}`, buf, { httpMetadata: { contentType: file.type } });
        const imageUrl = `${siteUrl}/assets/img/anime-banner-library/${filename}`;
        await saveLocalAnimeBanner(db, animeId, title, imageUrl, 'upload');
        session.setFlash('success', 'Banner uploaded and saved.');
      } else if (action === 'delete') {
        if (!animeId) throw new Error('Missing Anime ID.');
        const row = await db.fetchOne<{ image_url: string }>('SELECT image_url FROM anime_banners WHERE anime_id=?', [animeId]);
        if (row?.image_url?.includes('/assets/img/anime-banner-library/')) {
          const filename = row.image_url.split('/assets/img/anime-banner-library/')[1];
          try { await c.env.AVATARS.delete(`anime-banner-library/${filename}`); } catch { /* best-effort */ }
        }
        await db.query('DELETE FROM anime_banners WHERE anime_id=?', [animeId]);
        session.setFlash('success', 'Banner removed from library.');
      } else if (action === 'save_logo_url') {
        const imageUrl = ((formData.get('image_url') as string) ?? '').trim();
        let valid = false;
        try { const u = new URL(imageUrl); valid = u.protocol === 'http:' || u.protocol === 'https:'; } catch { /* invalid */ }
        if (!animeId || !valid) throw new Error('Enter a valid Anime ID and image URL.');
        await saveLocalAnimeLogo(db, animeId, title, imageUrl, 'url');
        session.setFlash('success', 'Logo URL saved.');
      } else if (action === 'upload_logo') {
        const file = formData.get('image_file') as File | null;
        if (!animeId || !file || file.size === 0) throw new Error('Choose an image file and enter a valid Anime ID.');
        if (file.size > 3 * 1024 * 1024) throw new Error('Image is too large. Use 3 MB or less.');
        const allowed: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
        const ext = allowed[file.type];
        if (!ext) throw new Error('Upload JPG, PNG, or WebP only.');

        const filename = `anime-${animeId}-${Date.now()}.${ext}`;
        const buf = await file.arrayBuffer();
        await c.env.AVATARS.put(`anime-logo-library/${filename}`, buf, { httpMetadata: { contentType: file.type } });
        const imageUrl = `${siteUrl}/assets/img/anime-logo-library/${filename}`;
        await saveLocalAnimeLogo(db, animeId, title, imageUrl, 'upload');
        session.setFlash('success', 'Logo uploaded and saved.');
      } else if (action === 'delete_logo') {
        if (!animeId) throw new Error('Missing Anime ID.');
        const row = await db.fetchOne<{ image_url: string }>('SELECT image_url FROM anime_logos WHERE anime_id=?', [animeId]);
        if (row?.image_url?.includes('/assets/img/anime-logo-library/')) {
          const filename = row.image_url.split('/assets/img/anime-logo-library/')[1];
          try { await c.env.AVATARS.delete(`anime-logo-library/${filename}`); } catch { /* best-effort */ }
        }
        await db.query('DELETE FROM anime_logos WHERE anime_id=?', [animeId]);
        session.setFlash('success', 'Logo removed from library.');
      }
    } catch (e: any) {
      session.setFlash('error', e.message ?? 'An error occurred.');
    }
    await session.save(c, lifetime);
    return c.redirect(`${siteUrl}/admin/anime_banners.php`);
  }

  const q = (c.req.query('q') ?? '').trim();
  let where = '';
  const params: unknown[] = [];
  if (q) {
    if (/^\d+$/.test(q)) { where = 'WHERE anime_id = ? OR anime_title LIKE ?'; params.push(parseInt(q, 10), `%${q}%`); }
    else { where = 'WHERE anime_title LIKE ?'; params.push(`%${q}%`); }
  }
  const banners = await db.fetchAll<any>(`SELECT * FROM anime_banners ${where} ORDER BY updated_at DESC LIMIT 80`, params);
  const logos = await db.fetchAll<any>(`SELECT * FROM anime_logos ${where} ORDER BY updated_at DESC LIMIT 80`, params);

  // Titles curated via the Homepage Hero Carousel (home_hero_banners) also
  // count as "saved" here — they're a different admin page, but the same
  // underlying banner/logo art, so this library shouldn't claim they don't
  // exist. Excludes anime_ids already covered above to avoid duplicates;
  // these rows are read-only here (managed on the carousel page instead).
  const bannerIds = new Set(banners.map((b: any) => b.anime_id));
  const logoIds = new Set(logos.map((l: any) => l.anime_id));
  const heroRows = await db.fetchAll<any>(
    `SELECT anime_id, anime_title, banner_image_url, logo_image_url FROM home_hero_banners ${where} ORDER BY display_order ASC`,
    params
  );
  const heroBanners = heroRows.filter((r: any) => r.banner_image_url && !bannerIds.has(r.anime_id));
  const heroLogos = heroRows.filter((r: any) => r.logo_image_url && !logoIds.has(r.anime_id));

  const total = banners.length + heroBanners.length;
  const totalLogos = logos.length + heroLogos.length;

  const flash = session.takeFlash();
  const err = flash?.type === 'error' ? flash.message : null;
  const suc = flash?.type === 'success' ? flash.message : null;

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Anime Banner & Logo Library', adminPage: 'anime_banners', isOwner, impersonating });
  html += `
<style>
.image-admin-grid { display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:1.5rem; }
.banner-library-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:12px; }
.banner-library-card { background:var(--bg-card); border:1px solid var(--border); border-radius:8px; overflow:hidden; }
.banner-library-card img { width:100%; aspect-ratio:2.5/1; object-fit:cover; background:var(--bg-base); }
.banner-library-body { padding:10px; }
.banner-library-title { font-weight:700; color:var(--text-primary); font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.banner-library-meta { color:var(--text-muted); font-size:0.78rem; margin-top:2px; }
@media (max-width: 900px) { .image-admin-grid { grid-template-columns:1fr; } }
</style>

<div class="admin-header">
  <div><h1>Anime Banner & Logo Library</h1><p class="text-muted" style="font-size:0.9rem;">Local wide banner art for the home page hero, and transparent title-logo art for anime detail pages — both take priority over their automatic sources (AniList's community bannerImage, TMDB's clear logo search). Also includes titles curated via the Homepage Hero Carousel, shown read-only below.</p></div>
  <span class="badge badge-default">${total.toLocaleString('en-US')} banners</span>
  <span class="badge badge-default">${totalLogos.toLocaleString('en-US')} logos</span>
</div>

${suc ? `<div class="alert alert-success mb-2">${h(suc)}</div>` : ''}
${err ? `<div class="alert alert-error mb-2">${h(err)}</div>` : ''}

<div class="image-admin-grid">
  <div class="card card-body">
    <h2 class="mb-2">Upload Banner</h2>
    <form method="POST" enctype="multipart/form-data">
      <input type="hidden" name="action" value="upload">
      <div class="form-group"><label class="form-label">Anime ID (MAL ID)</label><input class="form-control" type="number" name="anime_id" required placeholder="16498"></div>
      <div class="form-group"><label class="form-label">Title</label><input class="form-control" name="anime_title" placeholder="Optional, for searching"></div>
      <div class="form-group"><label class="form-label">Banner File (wide, ~1900x758)</label><input class="form-control" type="file" name="image_file" accept="image/jpeg,image/png,image/webp" required></div>
      <button class="btn btn-primary" type="submit">Upload Banner</button>
    </form>
  </div>
  <div class="card card-body">
    <h2 class="mb-2">Save Banner URL</h2>
    <form method="POST">
      <input type="hidden" name="action" value="save_url">
      <div class="form-group"><label class="form-label">Anime ID (MAL ID)</label><input class="form-control" type="number" name="anime_id" required placeholder="16498"></div>
      <div class="form-group"><label class="form-label">Title</label><input class="form-control" name="anime_title" placeholder="Optional, for searching"></div>
      <div class="form-group"><label class="form-label">Banner URL</label><input class="form-control" type="url" name="image_url" required placeholder="https://..."></div>
      <button class="btn btn-primary" type="submit">Save URL</button>
    </form>
  </div>
</div>

<div class="image-admin-grid">
  <div class="card card-body">
    <h2 class="mb-2">Upload Logo</h2>
    <form method="POST" enctype="multipart/form-data">
      <input type="hidden" name="action" value="upload_logo">
      <div class="form-group"><label class="form-label">Anime ID (MAL ID)</label><input class="form-control" type="number" name="anime_id" required placeholder="16498"></div>
      <div class="form-group"><label class="form-label">Title</label><input class="form-control" name="anime_title" placeholder="Optional, for searching"></div>
      <div class="form-group"><label class="form-label">Logo File (transparent PNG/WebP)</label><input class="form-control" type="file" name="image_file" accept="image/jpeg,image/png,image/webp" required></div>
      <button class="btn btn-primary" type="submit">Upload Logo</button>
    </form>
  </div>
  <div class="card card-body">
    <h2 class="mb-2">Save Logo URL</h2>
    <form method="POST">
      <input type="hidden" name="action" value="save_logo_url">
      <div class="form-group"><label class="form-label">Anime ID (MAL ID)</label><input class="form-control" type="number" name="anime_id" required placeholder="16498"></div>
      <div class="form-group"><label class="form-label">Title</label><input class="form-control" name="anime_title" placeholder="Optional, for searching"></div>
      <div class="form-group"><label class="form-label">Logo URL</label><input class="form-control" type="url" name="image_url" required placeholder="https://..."></div>
      <button class="btn btn-primary" type="submit">Save URL</button>
    </form>
  </div>
</div>

<div class="card card-body mb-3">
  <form method="GET" style="display:flex;gap:8px;flex-wrap:wrap;">
    <input class="form-control" name="q" value="${h(q)}" placeholder="Search by title or Anime ID" style="max-width:320px;">
    <button class="btn btn-primary" type="submit">Search</button>
    ${q ? `<a class="btn btn-ghost" href="anime_banners.php">Clear</a>` : ''}
  </form>
</div>

<h2 class="mb-2">Banners</h2>
${(banners.length === 0 && heroBanners.length === 0) ? `<div class="card card-body text-center text-muted mb-3">No saved banners yet.</div>` : `
<div class="banner-library-grid mb-3">
  ${banners.map((b: any) => `
  <div class="banner-library-card">
    <img src="${h(b.image_url)}" alt="">
    <div class="banner-library-body">
      <div class="banner-library-title">${h(b.anime_title || 'Untitled')}</div>
      <div class="banner-library-meta">#${b.anime_id} · ${h(b.source)}</div>
      <form method="POST" onsubmit="return confirm('Remove this banner from the library?')" style="margin-top:8px;">
        <input type="hidden" name="action" value="delete"><input type="hidden" name="anime_id" value="${b.anime_id}">
        <button class="btn btn-danger btn-sm" type="submit">Delete</button>
      </form>
    </div>
  </div>`).join('')}
  ${heroBanners.map((r: any) => `
  <div class="banner-library-card">
    <img src="${h(r.banner_image_url)}" alt="">
    <div class="banner-library-body">
      <div class="banner-library-title">${h(r.anime_title || 'Untitled')}</div>
      <div class="banner-library-meta">#${r.anime_id} · from Homepage Hero Carousel</div>
      <a class="btn btn-ghost btn-sm" style="margin-top:8px;" href="home_banners.php">Manage there</a>
    </div>
  </div>`).join('')}
</div>`}

<h2 class="mb-2">Logos</h2>
${(logos.length === 0 && heroLogos.length === 0) ? `<div class="card card-body text-center text-muted">No saved logos yet.</div>` : `
<div class="banner-library-grid">
  ${logos.map((l: any) => `
  <div class="banner-library-card">
    <img src="${h(l.image_url)}" alt="" style="aspect-ratio:2.5/1; object-fit:contain; background:#111;">
    <div class="banner-library-body">
      <div class="banner-library-title">${h(l.anime_title || 'Untitled')}</div>
      <div class="banner-library-meta">#${l.anime_id} · ${h(l.source)}</div>
      <form method="POST" onsubmit="return confirm('Remove this logo from the library?')" style="margin-top:8px;">
        <input type="hidden" name="action" value="delete_logo"><input type="hidden" name="anime_id" value="${l.anime_id}">
        <button class="btn btn-danger btn-sm" type="submit">Delete</button>
      </form>
    </div>
  </div>`).join('')}
  ${heroLogos.map((r: any) => `
  <div class="banner-library-card">
    <img src="${h(r.logo_image_url)}" alt="" style="aspect-ratio:2.5/1; object-fit:contain; background:#111;">
    <div class="banner-library-body">
      <div class="banner-library-title">${h(r.anime_title || 'Untitled')}</div>
      <div class="banner-library-meta">#${r.anime_id} · from Homepage Hero Carousel</div>
      <a class="btn btn-ghost btn-sm" style="margin-top:8px;" href="home_banners.php">Manage there</a>
    </div>
  </div>`).join('')}
</div>`}`;

  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});

adminAnimeBannersRoutes.get('/assets/img/anime-banner-library/:filename', async (c) => {
  const filename = c.req.param('filename');
  const obj = await c.env.AVATARS.get(`anime-banner-library/${filename}`);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: { 'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
});

adminAnimeBannersRoutes.get('/assets/img/anime-logo-library/:filename', async (c) => {
  const filename = c.req.param('filename');
  const obj = await c.env.AVATARS.get(`anime-logo-library/${filename}`);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: { 'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
});
