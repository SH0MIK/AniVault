// Ports admin/anime_images.php, admin/merge_users.php,
// admin/merge_users_search.php, admin/username_fixer.php.
//
// One portability note: the original username_fixer.php used MySQL's
// REGEXP operator directly in SQL to find bad usernames. SQLite/D1 has no
// REGEXP operator, so that check runs in application code here instead
// (fetch all users, filter with the same regex) -- functionally identical,
// just done client-side-of-the-query rather than in SQL.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { Logger } from '../../lib/logger';
import { OWNER_USER_ID } from '../../lib/auth';
import { h, timeAgo } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';

export const adminUserToolsRoutes = new Hono<{ Bindings: Env }>();

// ── admin/anime_images.php ─────────────────────────────────────────────────
adminUserToolsRoutes.on(['GET', 'POST'], '/admin/anime_images.php', async (c) => {
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
        await db.query(
          `INSERT INTO anime_images (anime_id, anime_title, image_url, source) VALUES (?,?,?,'url')
           ON CONFLICT(anime_id) DO UPDATE SET anime_title=excluded.anime_title, image_url=excluded.image_url, source=excluded.source`,
          [animeId, title || null, imageUrl]
        );
        session.setFlash('success', 'Image URL saved.');
      } else if (action === 'upload') {
        const file = formData.get('image_file') as File | null;
        if (!animeId || !file || file.size === 0) throw new Error('Choose an image file and enter a valid Anime ID.');
        if (file.size > 2 * 1024 * 1024) throw new Error('Image is too large. Use 2 MB or less.');
        const allowed: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
        if (!allowed[file.type]) throw new Error('Upload JPG, PNG, or WebP only.');
        const filename = `anime-${animeId}-${Date.now()}.${allowed[file.type]}`;
        const buf = await file.arrayBuffer();
        await c.env.AVATARS.put(`anime-images/${filename}`, buf, { httpMetadata: { contentType: file.type } });
        const imageUrl = `${siteUrl}/assets/img/anime-images/${filename}`;
        await db.query(
          `INSERT INTO anime_images (anime_id, anime_title, image_url, source) VALUES (?,?,?,'upload')
           ON CONFLICT(anime_id) DO UPDATE SET anime_title=excluded.anime_title, image_url=excluded.image_url, source=excluded.source`,
          [animeId, title || null, imageUrl]
        );
        session.setFlash('success', 'Image uploaded and saved.');
      } else if (action === 'delete') {
        if (!animeId) throw new Error('Missing Anime ID.');
        await db.query('DELETE FROM anime_images WHERE anime_id=?', [animeId]);
        session.setFlash('success', 'Image removed from library.');
      }
    } catch (e: any) {
      session.setFlash('error', e.message ?? 'Unknown error.');
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

  const flash = session.takeFlash();
  const message = flash?.type === 'success' ? flash.message : null;
  const error = flash?.type === 'error' ? flash.message : null;

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
  <div><h1>Anime Image Library</h1><p class="text-muted" style="font-size:0.9rem;">Local image source used during XML/JSON imports before any API fallback.</p></div>
  <span class="badge badge-default">${total.toLocaleString('en-US')} images</span>
</div>

${message ? `<div class="alert alert-success mb-2">${h(message)}</div>` : ''}
${error ? `<div class="alert alert-error mb-2">${h(error)}</div>` : ''}

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
  ${images.map((img) => `
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

adminUserToolsRoutes.get('/assets/img/anime-images/:filename', async (c) => {
  const obj = await c.env.AVATARS.get(`anime-images/${c.req.param('filename')}`);
  if (!obj) return c.notFound();
  return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' } });
});

// ── admin/merge_users.php + merge_users_search.php ─────────────────────────
adminUserToolsRoutes.get('/admin/merge_users_search.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  if (!ctx) return c.json([], 403);
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 2) return c.json([]);
  const users = await ctx.db.fetchAll('SELECT id, username, email FROM users WHERE username LIKE ? OR email LIKE ? LIMIT 8', [`%${q}%`, `%${q}%`]);
  return c.json(users);
});

adminUserToolsRoutes.on(['GET', 'POST'], '/admin/merge_users.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating, userId } = ctx;

  if (!isOwner) {
    session.setFlash('error', 'Only the Owner can merge accounts.');
    await session.save(c, lifetime);
    return c.redirect(`${siteUrl}/admin/users.php`);
  }

  if (c.req.method === 'POST') {
    const body = await c.req.parseBody();
    const keepId = parseInt((body.keep_id as string) ?? '0', 10) || 0;
    const mergeId = parseInt((body.merge_id as string) ?? '0', 10) || 0;

    if (!keepId || !mergeId) { session.setFlash('error', 'Both users must be selected.'); }
    else if (keepId === mergeId) { session.setFlash('error', 'Cannot merge a user with themselves.'); }
    else if (mergeId === OWNER_USER_ID) { session.setFlash('error', 'Cannot merge the Owner account away.'); }
    else {
      const keepUser = await db.fetchOne<{ username: string }>('SELECT * FROM users WHERE id=?', [keepId]);
      const mergeUser = await db.fetchOne<{ username: string }>('SELECT * FROM users WHERE id=?', [mergeId]);
      if (!keepUser || !mergeUser) {
        session.setFlash('error', 'One or both users not found.');
      } else {
        const uniqueTables: Record<string, string> = { anime_list: 'anime_id', favorites: 'anime_id' };
        for (const [table, col] of [['anime_list', 'user_id'], ['favorites', 'user_id'], ['activity_log', 'user_id']] as const) {
          if (uniqueTables[table]) {
            const uniqueCol = uniqueTables[table];
            const existing = await db.fetchAll<any>(`SELECT ${uniqueCol} FROM ${table} WHERE ${col}=?`, [keepId]);
            const existingIds = new Set(existing.map((r) => r[uniqueCol]));
            const rows = await db.fetchAll<any>(`SELECT * FROM ${table} WHERE ${col}=?`, [mergeId]);
            for (const row of rows) {
              if (!existingIds.has(row[uniqueCol])) {
                await db.query(`UPDATE ${table} SET ${col}=? WHERE ${col}=? AND ${uniqueCol}=?`, [keepId, mergeId, row[uniqueCol]]);
              }
            }
            await db.query(`DELETE FROM ${table} WHERE ${col}=?`, [mergeId]);
          } else {
            await db.query(`UPDATE ${table} SET ${col}=? WHERE ${col}=?`, [keepId, mergeId]);
          }
        }
        await db.query('DELETE FROM users WHERE id=?', [mergeId]);
        await Logger.log(db, userId, 'owner_merge_users', `Merged user #${mergeId} (${mergeUser.username}) into #${keepId} (${keepUser.username})`);
        session.setFlash('success', `Merged "${mergeUser.username}" into "${keepUser.username}" successfully. The merged account has been deleted.`);
      }
    }
    await session.save(c, lifetime);
    return c.redirect(`${siteUrl}/admin/merge_users.php`);
  }

  const flash = session.takeFlash();
  const err = flash?.type === 'error' ? flash.message : null;
  const suc = flash?.type === 'success' ? flash.message : null;

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Merge Accounts', adminPage: 'merge_users', isOwner, impersonating });
  html += `
<div class="admin-header"><h1>🔀 Merge Accounts</h1><span class="text-muted">Owner only — combine two accounts into one</span></div>
${err ? `<div class="alert alert-error mb-2">⚠️ ${h(err)}</div>` : ''}
${suc ? `<div class="alert alert-success mb-2">✅ ${h(suc)}</div>` : ''}

<div class="alert alert-error mb-3">⚠️ <strong>Warning:</strong> Merging is permanent. The "merge from" account will be <strong>deleted</strong>. Anime lists and favorites that don't conflict will be moved to the "keep" account.</div>

<div class="card card-body">
  <form method="POST" id="merge-form" onsubmit="return confirmMerge()">
    <div class="grid-2" style="gap:1.5rem;margin-bottom:1.5rem;">
      <div>
        <h3 style="margin-bottom:0.75rem;color:var(--color-success,#4caf50);">✅ Keep This Account</h3>
        <input type="text" class="form-control mb-1" placeholder="Search by username or email..." oninput="searchUser(this.value, 'keep')" style="width:100%;">
        <div id="keep-results" style="margin-bottom:0.75rem;"></div>
        <div id="keep-preview" style="display:none;background:rgba(76,175,80,0.08);border:1px solid rgba(76,175,80,0.3);border-radius:8px;padding:1rem;">
          <strong>Keeping:</strong> <span id="keep-name"></span><div class="text-muted" style="font-size:0.82rem;" id="keep-email"></div>
        </div>
        <input type="hidden" name="keep_id" id="keep-id-input">
      </div>
      <div>
        <h3 style="margin-bottom:0.75rem;color:#f44336;">🗑️ Merge &amp; Delete This Account</h3>
        <input type="text" class="form-control mb-1" placeholder="Search by username or email..." oninput="searchUser(this.value, 'merge')" style="width:100%;">
        <div id="merge-results" style="margin-bottom:0.75rem;"></div>
        <div id="merge-preview" style="display:none;background:rgba(244,67,54,0.08);border:1px solid rgba(244,67,54,0.3);border-radius:8px;padding:1rem;">
          <strong>Deleting:</strong> <span id="merge-name"></span><div class="text-muted" style="font-size:0.82rem;" id="merge-email"></div>
        </div>
        <input type="hidden" name="merge_id" id="merge-id-input">
      </div>
    </div>
    <div style="text-align:center;"><button type="submit" class="btn btn-danger" id="merge-submit-btn" disabled style="min-width:200px;">🔀 Merge Accounts</button></div>
  </form>
</div>

<script>
const users = { keep: { id: null, name: null, email: null }, merge: { id: null, name: null, email: null } };
let searchTimers = {};
function searchUser(q, side) {
  clearTimeout(searchTimers[side]);
  if (q.length < 2) { document.getElementById(side+'-results').innerHTML = ''; return; }
  searchTimers[side] = setTimeout(async () => {
    const r = await fetch('merge_users_search.php?q='+encodeURIComponent(q));
    if (!r.ok) return;
    const data = await r.json();
    const el = document.getElementById(side+'-results');
    el.innerHTML = data.map(u =>
      \`<div onclick="selectUser('\${side}',\${u.id},'\${u.username.replace(/'/g,"\\\\'")}','\${u.email.replace(/'/g,"\\\\'")}' )"
            style="padding:8px 10px;cursor:pointer;border-radius:6px;margin-bottom:2px;background:var(--bg-elevated,#1e1f23);border:1px solid var(--border-color,#2a2b2e);"
            onmouseover="this.style.background='var(--bg-hover,#252629)'" onmouseout="this.style.background='var(--bg-elevated,#1e1f23)'">
        <strong>\${u.username}</strong> <span style="color:var(--text-muted);font-size:0.8rem;">\${u.email}</span>
      </div>\`
    ).join('');
  }, 300);
}
function selectUser(side, id, name, email) {
  users[side] = { id, name, email };
  document.getElementById(side+'-id-input').value = id;
  document.getElementById(side+'-name').textContent = name;
  document.getElementById(side+'-email').textContent = email;
  document.getElementById(side+'-preview').style.display = 'block';
  document.getElementById(side+'-results').innerHTML = '';
  checkReady();
}
function checkReady() {
  const ok = users.keep.id && users.merge.id && users.keep.id !== users.merge.id;
  document.getElementById('merge-submit-btn').disabled = !ok;
}
function confirmMerge() {
  if (!users.keep.id || !users.merge.id) return false;
  return confirm(\`Are you SURE you want to merge "\${users.merge.name}" INTO "\${users.keep.name}"?\\n\\nThe "\${users.merge.name}" account will be permanently DELETED. This cannot be undone.\`);
}
</script>`;
  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});

// ── admin/username_fixer.php ────────────────────────────────────────────────
export function isBadUsername(username: string): boolean {
  return !/^[a-zA-Z0-9_]{3,30}$/.test(username);
}

export function suggestClean(existingUsernames: Set<string>, name: string, id: number): string {
  let clean = name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  clean = (clean || 'user').substring(0, 30);
  if (clean.length < 3) clean = `user_${id}`;
  let final = clean;
  let i = 2;
  while (existingUsernames.has(final)) final = clean + i++;
  return final;
}

adminUserToolsRoutes.on(['GET', 'POST'], '/admin/username_fixer.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating, userId } = ctx;

  if (c.req.method === 'POST' && isOwner) {
    const body = await c.req.parseBody();
    const action = (body.action as string) ?? '';

    if (action === 'fix_one') {
      const uid = parseInt((body.user_id as string) ?? '0', 10) || 0;
      const newName = ((body.new_username as string) ?? '').trim();
      if (uid && /^[a-zA-Z0-9_]{3,30}$/.test(newName)) {
        const conflict = await db.fetchOne('SELECT id FROM users WHERE username=? AND id!=?', [newName, uid]);
        if (conflict) {
          session.setFlash('error', `"${newName}" is already taken — pick another.`);
        } else {
          const old = await db.fetchOne<{ username: string }>('SELECT username FROM users WHERE id=?', [uid]);
          await db.query('UPDATE users SET username=? WHERE id=?', [newName, uid]);
          await Logger.log(db, userId, 'owner_fix_username', `Fixed user ${uid}: '${old?.username}' → '${newName}'`);
          session.setFlash('success', `Fixed: "${old?.username}" → "${newName}"`);
        }
      } else {
        session.setFlash('error', 'Invalid username. Use 3–30 chars, letters/numbers/underscores only.');
      }
    } else if (action === 'auto_fix_all') {
      const allUsers = await db.fetchAll<{ id: number; username: string }>('SELECT id, username FROM users');
      const bad = allUsers.filter((u) => isBadUsername(u.username));
      const existingUsernames = new Set(allUsers.map((u) => u.username));
      let fixed = 0;
      for (const u of bad) {
        const final = suggestClean(existingUsernames, u.username, u.id);
        existingUsernames.add(final);
        await db.query('UPDATE users SET username=? WHERE id=?', [final, u.id]);
        await Logger.log(db, userId, 'owner_fix_username', `Auto-fixed user ${u.id}: '${u.username}' → '${final}'`);
        fixed++;
      }
      session.setFlash('success', `Auto-fixed ${fixed} username(s).`);
    }
    await session.save(c, lifetime);
    return c.redirect(`${siteUrl}/admin/username_fixer.php`);
  }

  const allUsers = await db.fetchAll<any>('SELECT id, username, email, created_at, last_login FROM users ORDER BY created_at DESC');
  const badUsers = allUsers.filter((u) => isBadUsername(u.username));
  const existingUsernames = new Set(allUsers.map((u) => u.username));

  const flash = session.takeFlash();
  const err = flash?.type === 'error' ? flash.message : null;
  const suc = flash?.type === 'success' ? flash.message : null;

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Username Fixer', adminPage: 'username_fixer', isOwner, impersonating });
  html += `
<div class="admin-header"><h1>🔧 Username Fixer</h1><span class="text-muted">Scan and fix invalid usernames</span></div>
${err ? `<div class="alert alert-error mb-2">⚠️ ${h(err)}</div>` : ''}
${suc ? `<div class="alert alert-success mb-2">✅ ${h(suc)}</div>` : ''}

${badUsers.length === 0 ? `
<div class="card card-body text-center" style="padding:3rem;"><div style="font-size:3rem;margin-bottom:1rem;">✅</div><h2>All usernames look clean!</h2><p class="text-muted">No accounts with spaces or invalid characters were found.</p></div>` : `
<div class="alert alert-error mb-3" style="display:flex;align-items:center;gap:1rem;justify-content:space-between;flex-wrap:wrap;">
  <span>⚠️ Found <strong>${badUsers.length}</strong> account(s) with invalid usernames (spaces or special characters).</span>
  ${isOwner ? `<form method="POST" onsubmit="return confirm('Auto-fix all ${badUsers.length} bad usernames? This replaces spaces/symbols with underscores.')"><input type="hidden" name="action" value="auto_fix_all"><button type="submit" class="btn btn-primary btn-sm">⚡ Auto-Fix All</button></form>` : ''}
</div>

<div class="card" style="overflow-x:auto;">
  <div class="data-table-wrap"><table class="data-table">
    <thead><tr><th>ID</th><th>Current Username</th><th>Email</th><th>Joined</th>${isOwner ? '<th>Suggested Fix</th><th>Action</th>' : ''}</tr></thead>
    <tbody>
      ${badUsers.map((u) => {
        const suggested = isOwner ? suggestClean(existingUsernames, u.username, u.id) : '';
        if (isOwner) existingUsernames.add(suggested);
        return `
      <tr>
        <td class="text-muted">#${u.id}</td>
        <td><code style="background:rgba(255,42,42,0.12);color:#ff6b6b;padding:2px 6px;border-radius:4px;font-size:0.9rem;">${h(u.username)}</code></td>
        <td class="text-muted" style="font-size:0.82rem;">${h(u.email)}</td>
        <td class="text-muted" style="font-size:0.82rem;">${timeAgo(u.created_at)}</td>
        ${isOwner ? `
        <td><code style="background:rgba(76,175,80,0.12);color:#81c784;padding:2px 6px;border-radius:4px;font-size:0.9rem;">${h(suggested)}</code></td>
        <td><button class="btn btn-ghost btn-sm" onclick="openFixModal(${u.id}, '${h(u.username)}', '${h(suggested)}')">✏️ Fix</button></td>` : ''}
      </tr>`;
      }).join('')}
    </tbody>
  </table></div>
</div>`}

${!isOwner ? `<div class="alert alert-error mt-3">🔒 Only the Owner can fix usernames. Contact the site owner to resolve these accounts.</div>` : ''}

${isOwner ? `
<div id="fix-modal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);justify-content:center;align-items:center;">
  <div style="background:var(--bg-card,#1a1b1e);border:1px solid var(--border-color,#2a2b2e);border-radius:12px;padding:2rem;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.5);">
    <h2 style="margin:0 0 0.25rem;font-size:1.1rem;">✏️ Fix Username</h2>
    <p id="fix-subtitle" style="margin:0 0 1.25rem;font-size:0.85rem;color:var(--text-muted,#888);"></p>
    <form method="POST" id="fix-form">
      <input type="hidden" name="action" value="fix_one"><input type="hidden" name="user_id" id="fix-user-id">
      <div style="margin-bottom:1rem;">
        <label style="display:block;font-size:0.85rem;margin-bottom:0.4rem;color:var(--text-muted,#aaa);">New Username</label>
        <input type="text" name="new_username" id="fix-input" class="form-control" maxlength="30" pattern="[a-zA-Z0-9_]{3,30}" style="width:100%;" oninput="validateFixInput(this)">
        <div id="fix-hint" style="font-size:0.78rem;margin-top:0.35rem;color:var(--text-muted,#888);">3–30 characters · letters, numbers, underscores only</div>
      </div>
      <div style="display:flex;gap:0.5rem;justify-content:flex-end;"><button type="button" class="btn btn-ghost" onclick="closeFixModal()">Cancel</button><button type="submit" id="fix-submit" class="btn btn-primary">Save</button></div>
    </form>
  </div>
</div>
<script>
function openFixModal(id, current, suggested) {
  document.getElementById('fix-user-id').value = id;
  document.getElementById('fix-input').value = suggested;
  document.getElementById('fix-subtitle').textContent = 'Current: ' + current;
  const m = document.getElementById('fix-modal');
  m.style.display = 'flex';
  setTimeout(() => document.getElementById('fix-input').focus(), 50);
  validateFixInput(document.getElementById('fix-input'));
}
function closeFixModal() { document.getElementById('fix-modal').style.display = 'none'; }
function validateFixInput(el) {
  const ok = /^[a-zA-Z0-9_]{3,30}$/.test(el.value);
  const hint = document.getElementById('fix-hint');
  hint.textContent = ok ? '✅ Looks good!' : '3–30 characters · letters, numbers, underscores only';
  hint.style.color = ok ? 'var(--color-success,#4caf50)' : 'var(--text-muted,#888)';
  document.getElementById('fix-submit').disabled = !ok;
}
document.getElementById('fix-modal').addEventListener('click', function(e) { if (e.target === this) closeFixModal(); });
</script>` : ''}`;
  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});
