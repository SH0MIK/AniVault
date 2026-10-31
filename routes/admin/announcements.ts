// Ports admin/announcements.php. Images move to R2 (same bucket as avatars,
// different key prefix) since Workers can't write to local disk.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { Logger } from '../../lib/logger';
import { Notification } from '../../lib/notification';
import { h, timeAgo } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';

export const adminAnnouncementsRoutes = new Hono<{ Bindings: Env }>();

adminAnnouncementsRoutes.on(['GET', 'POST'], '/admin/announcements.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating, userId } = ctx;

  if (c.req.method === 'POST') {
    const formData = await c.req.formData();
    const action = (formData.get('action') as string) ?? '';

    if (action === 'create') {
      const title = ((formData.get('title') as string) ?? '').trim();
      const content = ((formData.get('content') as string) ?? '').trim();
      if (title && content) {
        let imageUrl: string | null = null;
        const file = formData.get('image') as File | null;
        if (file && file.size > 0) {
          const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
          if (allowed.includes(file.type) && file.size <= 5 * 1024 * 1024) {
            const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' }[file.type];
            const filename = `ann_${Date.now()}_${Math.random().toString(16).slice(2, 10)}.${ext}`;
            const buf = await file.arrayBuffer();
            await c.env.AVATARS.put(`announcements/${filename}`, buf, { httpMetadata: { contentType: file.type } });
            imageUrl = `${siteUrl}/assets/img/announcements/${filename}`;
          } else {
            session.setFlash('error', 'Image must be JPG/PNG/GIF/WEBP and under 5MB.');
            await session.save(c, lifetime);
            return c.redirect(`${siteUrl}/admin/announcements.php`);
          }
        }

        const announcementId = await db.insert('INSERT INTO announcements (title, content, image_url, created_by) VALUES (?,?,?,?)', [title, content, imageUrl, userId]);
        await Notification.broadcast(db, announcementId, userId, title);
        await Logger.log(db, userId, 'admin_announcement', `Created: ${title}`);
        session.setFlash('success', 'Announcement created and all users notified!');
      } else {
        session.setFlash('error', 'Title and content are required.');
      }
    } else if (action === 'toggle') {
      const id = parseInt((formData.get('id') as string) ?? '0', 10) || 0;
      const ann = await db.fetchOne<{ is_active: number }>('SELECT is_active FROM announcements WHERE id=?', [id]);
      if (ann) {
        await db.query('UPDATE announcements SET is_active=? WHERE id=?', [ann.is_active ? 0 : 1, id]);
        session.setFlash('success', 'Announcement updated.');
      }
    } else if (action === 'delete') {
      const id = parseInt((formData.get('id') as string) ?? '0', 10) || 0;
      const ann = await db.fetchOne<{ image_url: string | null }>('SELECT image_url FROM announcements WHERE id=?', [id]);
      if (ann?.image_url?.includes('/assets/img/announcements/')) {
        const filename = ann.image_url.split('/assets/img/announcements/')[1];
        try { await c.env.AVATARS.delete(`announcements/${filename}`); } catch { /* best-effort */ }
      }
      await db.query('DELETE FROM announcements WHERE id=?', [id]);
      await db.query("DELETE FROM notifications WHERE type='announcement' AND entity_id=?", [id]);
      session.setFlash('success', 'Announcement deleted.');
    }
    await session.save(c, lifetime);
    return c.redirect(`${siteUrl}/admin/announcements.php`);
  }

  const announcements = await db.fetchAll<any>(
    'SELECT a.*, u.username FROM announcements a JOIN users u ON a.created_by = u.id ORDER BY a.created_at DESC'
  );
  const flash = session.takeFlash();
  const err = flash?.type === 'error' ? flash.message : null;
  const suc = flash?.type === 'success' ? flash.message : null;

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Announcements', adminPage: 'announcements', isOwner, impersonating });
  html += `
<div class="admin-header"><h1>📢 Announcements</h1><button class="btn btn-primary" onclick="openModal('create-modal')">+ New Announcement</button></div>
${err ? `<div class="alert alert-error mb-2">⚠️ ${h(err)}</div>` : ''}
${suc ? `<div class="alert alert-success mb-2">✅ ${h(suc)}</div>` : ''}

${announcements.length === 0 ? `
<div class="flex-center" style="padding:4rem;flex-direction:column;gap:1rem;"><span style="font-size:3rem;">📢</span><p class="text-muted">No announcements yet.</p></div>` : `
<div style="display:flex;flex-direction:column;gap:1rem;">
  ${announcements.map((ann) => `
  <div class="card card-body" style="${!ann.is_active ? 'opacity:0.6' : ''}">
    <div class="flex-between mb-1">
      <div class="flex gap-1" style="align-items:center;gap:10px;"><h3>${h(ann.title)}</h3>${ann.is_active ? `<span class="badge badge-completed">Active</span>` : `<span class="badge badge-default">Inactive</span>`}</div>
      <div class="flex gap-1" style="gap:6px;">
        <form method="POST" style="display:inline;"><input type="hidden" name="action" value="toggle"><input type="hidden" name="id" value="${ann.id}"><button type="submit" class="btn btn-ghost btn-sm">${ann.is_active ? 'Deactivate' : 'Activate'}</button></form>
        <form method="POST" style="display:inline;" onsubmit="return confirm('Delete this announcement?')"><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="${ann.id}"><button type="submit" class="btn btn-danger btn-sm">🗑️</button></form>
      </div>
    </div>
    ${ann.image_url ? `<img src="${h(ann.image_url)}" alt="" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;margin-bottom:8px;">` : ''}
    <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:8px;">${h(ann.content).replace(/\n/g, '<br>')}</p>
    <span class="text-muted" style="font-size:0.78rem;">By ${h(ann.username)} · ${timeAgo(ann.created_at)}</span>
  </div>`).join('')}
</div>`}

<div class="modal-overlay" id="create-modal">
  <div class="modal">
    <div class="modal-header"><h3>New Announcement</h3><button class="modal-close">✕</button></div>
    <div class="modal-body">
      <form method="POST" enctype="multipart/form-data">
        <input type="hidden" name="action" value="create">
        <div class="form-group"><label class="form-label">Title</label><input type="text" name="title" class="form-control" required placeholder="Announcement title"></div>
        <div class="form-group"><label class="form-label">Content</label><textarea name="content" class="form-control" rows="5" required placeholder="Write your announcement..."></textarea></div>
        <div class="form-group">
          <label class="form-label">Image <span class="text-muted">(optional, max 5MB)</span></label>
          <input type="file" name="image" class="form-control" accept="image/jpeg,image/png,image/gif,image/webp" onchange="previewImage(this)">
          <div id="img-preview" style="display:none;margin-top:8px;"><img id="img-preview-el" src="" alt="preview" style="width:100%;max-height:160px;object-fit:cover;border-radius:8px;"></div>
        </div>
        <p class="text-muted" style="font-size:0.8rem;margin-bottom:1rem;">📢 This will send a notification to <strong>all users</strong>.</p>
        <div class="flex gap-1"><button type="submit" class="btn btn-primary" style="flex:1">Publish & Notify All</button><button type="button" class="btn btn-ghost" onclick="closeModal('create-modal')">Cancel</button></div>
      </form>
    </div>
  </div>
</div>

<script>
function previewImage(input) {
  const preview = document.getElementById('img-preview');
  const img     = document.getElementById('img-preview-el');
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; preview.style.display = 'block'; };
    reader.readAsDataURL(input.files[0]);
  } else {
    preview.style.display = 'none';
  }
}
</script>`;
  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});

// ── Serves announcement images out of R2 ───────────────────────────────────
adminAnnouncementsRoutes.get('/assets/img/announcements/:filename', async (c) => {
  const filename = c.req.param('filename');
  const obj = await c.env.AVATARS.get(`announcements/${filename}`);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: { 'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
});
