// Profile banner upload — new feature (Anivexa-style redesign). Mirrors
// avatar.ts's R2-backed upload flow but keeps things simpler: a banner is a
// wide crop-agnostic image (CSS handles the framing with background-size:
// cover, same as the anime info-hero), so there's no client-side cropper —
// just validate + store + point users.banner_url at it.
// Reuses the AVATARS R2 bucket under a banners/ prefix rather than adding a
// new binding, so no wrangler.toml changes are needed to ship this.
//
// Requires a `banner_url TEXT` column on `users` — see migrations/add-banner-url.sql.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { Logger } from '../lib/logger';

export const bannerRoutes = new Hono<{ Bindings: Env }>();

async function buildCtx(c: any) {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  return { db, session, lifetime, auth };
}

async function deleteOldBannerFile(env: Env, db: Db, userId: number): Promise<void> {
  const row = await db.fetchOne<{ banner_url: string | null }>('SELECT banner_url FROM users WHERE id=?', [userId]);
  const url = row?.banner_url ?? '';
  if (url.includes('/assets/img/banners/')) {
    const key = 'banners/' + url.split('/assets/img/banners/')[1];
    try { await env.AVATARS.delete(key); } catch { /* best-effort */ }
  }
}

bannerRoutes.post('/api/upload_banner.php', async (c) => {
  const { db, session, lifetime, auth } = await buildCtx(c);
  if (!auth.check()) {
    await session.save(c, lifetime);
    return c.json({ success: false, message: 'Not logged in.' }, 401);
  }
  const userId = session.user_id!;
  const siteUrl = c.env.SITE_URL;

  const contentType = c.req.header('content-type') ?? '';
  let body: Record<string, any> = {};
  let file: File | null = null;

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    for (const [key, val] of formData.entries()) {
      if (key === 'banner' && (val as any) instanceof File) file = val as unknown as File;
      else body[key] = val;
    }
  } else {
    body = await c.req.parseBody();
  }

  if (body.action === 'delete_banner') {
    await deleteOldBannerFile(c.env, db, userId);
    await db.query('UPDATE users SET banner_url = NULL WHERE id = ?', [userId]);
    await Logger.log(db, userId, 'banner_upload', 'Removed profile banner');
    await session.save(c, lifetime);
    return c.json({ success: true, message: 'Banner removed.' });
  }

  if (!file) {
    await session.save(c, lifetime);
    return c.json({ success: false, message: 'No file uploaded.' });
  }
  if (file.size > 20 * 1024 * 1024) {
    await session.save(c, lifetime);
    return c.json({ success: false, message: 'File too large. Max 20MB.' });
  }
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowed.includes(file.type)) {
    await session.save(c, lifetime);
    return c.json({ success: false, message: 'Only JPG, PNG, GIF, WEBP allowed.' });
  }

  const buf = await file.arrayBuffer();
  const ext = file.type === 'image/gif' ? 'gif' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';

  await deleteOldBannerFile(c.env, db, userId);
  const filename = `banner_${userId}_${Date.now()}.${ext}`;
  await c.env.AVATARS.put(`banners/${filename}`, buf, { httpMetadata: { contentType: file.type } });

  const bannerUrl = `${siteUrl}/assets/img/banners/${filename}`;
  await db.query('UPDATE users SET banner_url=? WHERE id=?', [bannerUrl, userId]);
  await Logger.log(db, userId, 'banner_upload', 'Updated profile banner');
  await session.save(c, lifetime);
  return c.json({ success: true, banner_url: bannerUrl, message: 'Banner saved!' });
});

// ── Serves banners out of R2, same pattern as avatar.ts ──────────────────
bannerRoutes.get('/assets/img/banners/:filename', async (c) => {
  const filename = c.req.param('filename');
  const obj = await c.env.AVATARS.get(`banners/${filename}`);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});
