// Ports admin/anime_images.php. Uploads go to R2 instead of local disk.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { h } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';
import { Settings } from '../../lib/settings';
import { MalAPI } from '../../lib/mal-api';
import { warmArtCache } from '../../scheduled';

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
      } else if (action === 'refresh_art') {
        // Manual escape hatch for a stuck cache entry — e.g. the scraper
        // timed out once (cold start, etc.), that empty result got cached,
        // and the title now shows no art until the negative-cache TTL
        // (5 min) or the KV entry (up to a week) expires on its own. This
        // deletes it immediately so the next page load re-fetches fresh.
        if (!animeId) throw new Error('Enter a valid Anime ID to refresh.');
        const mal = new MalAPI(c.env, c.env.API_CACHE, db);
        await mal.clearScraperArtCache(animeId);
        session.setFlash('success', `Art cache cleared for Anime ID ${animeId} — it'll re-fetch from the API on next load.`);
      } else if (action === 'reset_all_art') {
        // Bulk version of refresh_art — batched (see resetAllScraperArtCache)
        // so one click can't stack up enough KV deletes to hit the Worker's
        // subrequest limit on a large library. Resumes from the cursor the
        // previous batch left off at, carried through as a hidden field.
        const mal = new MalAPI(c.env, c.env.API_CACHE, db);
        const cursor = ((formData.get('cursor') as string) || undefined) || undefined;
        const priorProgress = parseInt((formData.get('progress') as string) ?? '0', 10) || 0;
        const result = await mal.resetAllScraperArtCache(40, cursor);
        const totalProgress = priorProgress + result.deleted;
        if (result.done) {
          session.setFlash('success', `Art cache fully reset (${totalProgress.toLocaleString('en-US')} entr${totalProgress === 1 ? 'y' : 'ies'} cleared total). Every title re-fetches from the API on next load.`);
        } else {
          await session.save(c, lifetime);
          return c.redirect(`${siteUrl}/admin/anime_images.php?reset_cursor=${encodeURIComponent(result.cursor ?? '')}&reset_progress=${totalProgress}`);
        }
      } else if (action === 'warm_now') {
        // On-demand version of the cron warmer (see warmArtCache in
        // scheduled.ts) -- lets an admin force cache entries to fill in
        // right away instead of waiting on the next 15-min tick. Safe to
        // click repeatedly: it skips anything already warm and only
        // live-fetches up to `limit` genuinely-missing titles per click.
        const mal = new MalAPI(c.env, c.env.API_CACHE, db);
        const warmed = await warmArtCache(db, mal, c.env, 30);
        session.setFlash('success', warmed > 0
          ? `Warmed ${warmed} art cache entr${warmed === 1 ? 'y' : 'ies'}. Click again if the home page still looks incomplete.`
          : 'Nothing to warm right now — the seasonal/top/upcoming/watch-now titles this checks are all already cached.');
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
  const resetCursor = c.req.query('reset_cursor') ?? '';
  const resetProgress = parseInt(c.req.query('reset_progress') ?? '0', 10) || 0;

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
  <form method="POST" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px;padding-top:12px;border-top:1px solid var(--border,#333);">
    <input type="hidden" name="action" value="refresh_art">
    <label style="font-size:0.85rem;color:var(--text-muted,#999);">Art stuck/wrong for a title?</label>
    <input class="form-control" style="width:140px;" type="number" name="anime_id" placeholder="Anime ID" required>
    <button class="btn btn-secondary btn-sm" type="submit">Refresh Art Cache</button>
  </form>
  <form method="POST" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px;padding-top:12px;border-top:1px solid var(--border,#333);">
    <input type="hidden" name="action" value="warm_now">
    <label style="font-size:0.85rem;color:var(--text-muted,#999);">Home page missing art right now?</label>
    <button class="btn btn-secondary btn-sm" type="submit">Warm Art Cache Now</button>
  </form>
  <form method="POST" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px;padding-top:12px;border-top:1px solid var(--border,#333);"
        ${resetCursor ? '' : `onsubmit="return confirm('Clear the ENTIRE art cache? Every poster/cover/logo site-wide re-fetches from the API on next load — could mean a lot of blank art for a bit until pages are visited again or the cron warmer catches up.')"`}>
    <input type="hidden" name="action" value="reset_all_art">
    <input type="hidden" name="cursor" value="${h(resetCursor)}">
    <input type="hidden" name="progress" value="${resetProgress}">
    <label style="font-size:0.85rem;color:var(--text-muted,#999);">${resetCursor ? `Cleared ${resetProgress.toLocaleString('en-US')} so far —` : 'Nuclear option:'}</label>
    <button class="btn btn-danger btn-sm" type="submit">${resetCursor ? 'Continue Reset' : 'Reset All Art Cache'}</button>
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
