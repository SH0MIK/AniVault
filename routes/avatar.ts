// Ports api/upload_avatar.php using R2 instead of local disk.
// Static image cropping (jpg/png/webp) works at full fidelity -- the crop
// already happens client-side on <canvas> before it's sent here, so no
// GD/Imagick equivalent is even needed for that path.
// Animated GIF cropping (frame-by-frame via Imagick/FFmpeg in the PHP
// version) has NO equivalent on Workers -- there's no server-side image
// library and no shell_exec. Rather than silently drop the feature, this
// uploads the GIF unmodified (skips the crop) so at least the upload still
// works; a real fix would need an external image-processing service
// (Cloudflare Images, a Durable Object + WASM gif library, etc.) which is
// out of scope for a like-for-like port.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { Logger } from '../lib/logger';

export const avatarRoutes = new Hono<{ Bindings: Env }>();

async function buildCtx(c: any) {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  return { db, session, lifetime, auth };
}

async function deleteOldAvatarFile(env: Env, db: Db, userId: number): Promise<void> {
  const row = await db.fetchOne<{ avatar_url: string | null }>('SELECT avatar_url FROM users WHERE id=?', [userId]);
  const url = row?.avatar_url ?? '';
  if (url.includes('/assets/img/avatars/')) {
    const key = 'avatars/' + url.split('/assets/img/avatars/')[1];
    try { await env.AVATARS.delete(key); } catch { /* best-effort */ }
  }
}

avatarRoutes.post('/api/upload_avatar.php', async (c) => {
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
      if (key === 'avatar' && (val as any) instanceof File) file = val as unknown as File;
      else body[key] = val;
    }
  } else {
    body = await c.req.parseBody();
  }

  // ── Delete avatar ──────────────────────────────────────────────────────
  if (body.action === 'delete_avatar') {
    await deleteOldAvatarFile(c.env, db, userId);
    await db.query('UPDATE users SET avatar_url = NULL WHERE id = ?', [userId]);
    await session.save(c, lifetime);
    return c.json({ success: true, message: 'Avatar removed.' });
  }

  // ── Save cropped base64 from canvas cropper (static images) ────────────
  if (body.cropped_data) {
    const dataUrl = String(body.cropped_data);
    const match = dataUrl.match(/^data:image\/(jpeg|png|webp);base64,/);
    if (!match) {
      await session.save(c, lifetime);
      return c.json({ success: false, message: 'Invalid image data.' });
    }
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const binary = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
    if (binary.length < 100) {
      await session.save(c, lifetime);
      return c.json({ success: false, message: 'Image data is corrupt.' });
    }
    if (binary.length > 8 * 1024 * 1024) {
      await session.save(c, lifetime);
      return c.json({ success: false, message: 'Cropped image too large.' });
    }

    await deleteOldAvatarFile(c.env, db, userId);
    const filename = `avatar_${userId}_${Date.now()}.jpg`;
    await c.env.AVATARS.put(`avatars/${filename}`, binary, { httpMetadata: { contentType: 'image/jpeg' } });

    const avatarUrl = `${siteUrl}/assets/img/avatars/${filename}`;
    await db.query('UPDATE users SET avatar_url=? WHERE id=?', [avatarUrl, userId]);
    await Logger.log(db, userId, 'avatar_upload', 'Updated profile picture via cropper');
    await session.save(c, lifetime);
    return c.json({ success: true, avatar_url: avatarUrl, message: 'Avatar saved!' });
  }

  // ── Initial upload → return base64 for cropper UI ──────────────────────
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

  if (file.type === 'image/gif') {
    // No frame-by-frame crop available -- upload the GIF unmodified.
    await deleteOldAvatarFile(c.env, db, userId);
    const filename = `avatar_${userId}_${Date.now()}.gif`;
    await c.env.AVATARS.put(`avatars/${filename}`, buf, { httpMetadata: { contentType: 'image/gif' } });
    const avatarUrl = `${siteUrl}/assets/img/avatars/${filename}`;
    await db.query('UPDATE users SET avatar_url=? WHERE id=?', [avatarUrl, userId]);
    await Logger.log(db, userId, 'avatar_upload', 'Updated animated profile picture (uncropped -- no server-side GIF processing on Workers)');
    await session.save(c, lifetime);
    return c.json({ success: true, avatar_url: avatarUrl, mode: 'direct', message: 'Animated avatar saved (cropping not available for GIFs on this platform).' });
  }

  const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  await session.save(c, lifetime);
  return c.json({ success: true, mode: 'crop', image_data: `data:${file.type};base64,${base64}` });
});

// ── Serves avatars out of R2 at the same URL path the PHP version used ───
avatarRoutes.get('/assets/img/avatars/:filename', async (c) => {
  const filename = c.req.param('filename');
  const obj = await c.env.AVATARS.get(`avatars/${filename}`);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});
