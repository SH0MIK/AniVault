// Ports admin/users.php. The self-healing "ALTER TABLE ADD uid column"
// dance is dropped -- the D1 schema already has `uid` from the Phase 1
// migration and every existing user already has one assigned.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { Logger } from '../../lib/logger';
import { Badge } from '../../lib/badges';
import { OWNER_USER_ID } from '../../lib/auth';
import { h, timeAgo, roleBadge } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';

export const adminUsersRoutes = new Hono<{ Bindings: Env }>();

async function resolveIpCountry(kv: KVNamespace, ip: string): Promise<string> {
  if (!ip || ip === 'unknown') return '';
  const cacheKey = `geo_${ip}`;
  const cached = await kv.get(cacheKey);
  if (cached !== null) return cached;

  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=country,countryCode`);
    if (res.ok) {
      const d: any = await res.json();
      if (d.country) {
        const code = d.countryCode ?? '';
        let flag = '';
        if (code.length === 2) {
          const cp1 = 0x1f1e6 + code.charCodeAt(0) - 65;
          const cp2 = 0x1f1e6 + code.charCodeAt(1) - 65;
          flag = String.fromCodePoint(cp1, cp2);
        }
        const result = `${flag} ${d.country}`.trim();
        await kv.put(cacheKey, result, { expirationTtl: 86400 * 30 });
        return result;
      }
    }
  } catch { /* fall through to raw IP */ }
  return ip;
}

adminUsersRoutes.on(['GET', 'POST'], '/admin/users.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, auth, userId, isOwner, impersonating } = ctx;

  if (c.req.method === 'POST') {
    const body = await c.req.parseBody();
    const action = (body.action as string) ?? '';
    const targetId = parseInt((body.user_id as string) ?? '0', 10) || 0;
    const targetIsOwner = targetId === OWNER_USER_ID;

    if (targetId === userId) {
      session.setFlash('error', 'You cannot modify your own account here.');
    } else if (targetIsOwner) {
      session.setFlash('error', 'The OWNER account is reserved and cannot be modified here.');
    } else if (action === 'rename_user') {
      if (!isOwner) {
        session.setFlash('error', 'Only the Owner can rename users.');
      } else {
        const newUsername = ((body.new_username as string) ?? '').trim();
        if (!/^[a-zA-Z0-9_]{3,30}$/.test(newUsername)) {
          session.setFlash('error', 'Username must be 3–30 characters and contain only letters, numbers, or underscores.');
        } else {
          const conflict = await db.fetchOne('SELECT id FROM users WHERE username = ? AND id != ?', [newUsername, targetId]);
          if (conflict) {
            session.setFlash('error', 'That username is already taken.');
          } else {
            const oldUser = await db.fetchOne<{ username: string }>('SELECT username FROM users WHERE id=?', [targetId]);
            await db.query('UPDATE users SET username=? WHERE id=?', [newUsername, targetId]);
            await Logger.log(db, userId, 'owner_rename_user', `User ${targetId} renamed from '${oldUser?.username}' to '${newUsername}'`);
            session.setFlash('success', `Username updated to "${newUsername}".`);
          }
        }
      }
    } else if (action === 'toggle_role') {
      const user = await db.fetchOne<{ role: string }>('SELECT role FROM users WHERE id=?', [targetId]);
      const newRole = user?.role === 'admin' ? 'user' : 'admin';
      await db.query('UPDATE users SET role=? WHERE id=?', [newRole, targetId]);
      await Logger.log(db, userId, 'admin_role_change', `User ${targetId} role changed to ${newRole}`);
      session.setFlash('success', 'Role updated.');
    } else if (action === 'toggle_active') {
      const user = await db.fetchOne<{ is_active: number }>('SELECT is_active FROM users WHERE id=?', [targetId]);
      const newActive = user?.is_active ? 0 : 1;
      await db.query('UPDATE users SET is_active=? WHERE id=?', [newActive, targetId]);
      await Logger.log(db, userId, 'admin_toggle_user', `User ${targetId} active set to ${newActive}`);
      session.setFlash('success', newActive ? 'User activated.' : 'User deactivated.');
    } else if (action === 'delete') {
      await db.query('DELETE FROM users WHERE id=?', [targetId]);
      await Logger.log(db, userId, 'admin_delete_user', `Deleted user ${targetId}`);
      session.setFlash('success', 'User deleted.');
    }
    await session.save(c, lifetime);
    return c.redirect(`${siteUrl}/admin/users.php`);
  }

  const search = (c.req.query('search') ?? '').trim();
  let role = c.req.query('role') ?? '';
  if (role === 'owner') role = 'owner';
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;

  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  if (search) {
    where += ' AND (username LIKE ? OR email LIKE ? OR uid LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (role === 'owner') {
    where += ' AND id = ?';
    params.push(OWNER_USER_ID);
  } else if (role) {
    where += ' AND role = ?';
    params.push(role);
  }

  const total = await db.count(`SELECT COUNT(*) as cnt FROM users ${where}`, params);
  const users = await db.fetchAll<any>(
    `SELECT u.*,
      (SELECT COUNT(*) FROM anime_list WHERE user_id=u.id) as list_count,
      (SELECT COUNT(*) FROM favorites WHERE user_id=u.id) as fav_count,
      (SELECT ip_address FROM activity_log WHERE user_id=u.id AND ip_address IS NOT NULL AND ip_address != '' ORDER BY created_at DESC LIMIT 1) as last_ip
     FROM users u ${where} ORDER BY u.id DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  const uniqueIps = Array.from(new Set(users.map((u) => u.last_ip).filter(Boolean)));
  const ipCountryMap: Record<string, string> = {};
  for (const ip of uniqueIps) ipCountryMap[ip] = await resolveIpCountry(c.env.API_CACHE, ip);

  const userBadges = await Badge.getForUsers(db, users.map((u) => u.id));
  const pages = Math.ceil(total / limit);

  const flash = session.takeFlash();
  const err = flash?.type === 'error' ? flash.message : null;
  const suc = flash?.type === 'success' ? flash.message : null;

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Manage Users', adminPage: 'users', isOwner, impersonating, queryRole: role });

  html += `
<div class="admin-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;">
  <div><h1>👥 Manage Users</h1><span class="text-muted">${total.toLocaleString('en-US')} users found</span></div>
</div>

${err ? `<div class="alert alert-error mb-2">⚠️ ${h(err)}</div>` : ''}
${suc ? `<div class="alert alert-success mb-2">✅ ${h(suc)}</div>` : ''}

<form method="GET" class="flex gap-1 mb-3" style="flex-wrap:wrap;">
  <input type="text" name="search" class="form-control" placeholder="Search username, email or UID…" value="${h(search)}" style="max-width:280px;">
  <select name="role" class="form-control" style="max-width:160px;">
    <option value="">All Roles</option>
    <option value="user" ${role === 'user' ? 'selected' : ''}>Users</option>
    <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admins</option>
    <option value="owner" ${role === 'owner' ? 'selected' : ''}>Owner</option>
  </select>
  <button type="submit" class="btn btn-primary">Filter</button>
  ${(search || role) ? `<a href="users.php" class="btn btn-ghost">Clear</a>` : ''}
</form>

<div class="card" style="overflow-x:auto;">
  <div class="data-table-wrap"><table class="data-table">
    <thead><tr>
      <th title="Sequential display number">#</th><th title="Permanent unique ID">UID</th><th>User</th><th>Role</th><th>Status</th>
      <th>List</th><th>Favs</th><th>Country</th><th>Joined</th><th>Last Login</th><th>Actions</th>
    </tr></thead>
    <tbody>
      ${users.map((u, i) => renderUserRow(u, total - offset - i, ipCountryMap, userBadges[u.id] ?? [], userId, isOwner, siteUrl)).join('')}
      ${users.length === 0 ? `<tr><td colspan="10" class="text-center text-muted" style="padding:2rem;">No users found.</td></tr>` : ''}
    </tbody>
  </table></div>
</div>

${pages > 1 ? renderUsersPagination(search, role, page, pages) : ''}

${isOwner ? `
<div id="rename-modal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);justify-content:center;align-items:center;">
  <div style="background:var(--bg-card,#1a1b1e);border:1px solid var(--border-color,#2a2b2e);border-radius:12px;padding:2rem;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.5);">
    <h2 style="margin:0 0 0.25rem;font-size:1.1rem;">✏️ Rename Username</h2>
    <p id="rename-subtitle" style="margin:0 0 1.25rem;font-size:0.85rem;color:var(--text-muted,#888);"></p>
    <form method="POST" id="rename-form">
      <input type="hidden" name="action" value="rename_user">
      <input type="hidden" name="user_id" id="rename-user-id">
      <div style="margin-bottom:1rem;">
        <label style="display:block;font-size:0.85rem;margin-bottom:0.4rem;color:var(--text-muted,#aaa);">New Username</label>
        <input type="text" name="new_username" id="rename-input" class="form-control" placeholder="letters, numbers, underscores" maxlength="30" pattern="[a-zA-Z0-9_]{3,30}" style="width:100%;" oninput="validateRenameInput(this)">
        <div id="rename-hint" style="font-size:0.78rem;margin-top:0.35rem;color:var(--text-muted,#888);">3–30 characters · letters, numbers, underscores only</div>
      </div>
      <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
        <button type="button" class="btn btn-ghost" onclick="closeRenameModal()">Cancel</button>
        <button type="submit" id="rename-submit" class="btn btn-primary">Save Username</button>
      </div>
    </form>
  </div>
</div>` : ''}

<div id="uid-toast" style="position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%) translateY(60px);background:var(--bg-card,#1a1b1e);border:1px solid var(--border-color,#333);border-radius:8px;padding:.5rem 1.1rem;font-size:.83rem;box-shadow:0 8px 30px rgba(0,0,0,.4);opacity:0;transition:opacity .2s,transform .25s;pointer-events:none;z-index:99999;white-space:nowrap;">✅ UID copied!</div>

<script>
function copyUid(el, uid) {
  if (!uid) return;
  navigator.clipboard.writeText(uid).then(() => {
    const toast = document.getElementById('uid-toast');
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(window._uidToastTimer);
    window._uidToastTimer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(60px)';
    }, 1800);
  });
}
function openRenameModal(userId, currentUsername) {
  document.getElementById('rename-user-id').value = userId;
  document.getElementById('rename-input').value = currentUsername;
  document.getElementById('rename-subtitle').textContent = 'Current username: ' + currentUsername;
  const modal = document.getElementById('rename-modal');
  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('rename-input').focus(), 50);
}
function closeRenameModal() { document.getElementById('rename-modal').style.display = 'none'; }
function validateRenameInput(input) {
  const hint = document.getElementById('rename-hint');
  const btn  = document.getElementById('rename-submit');
  const valid = /^[a-zA-Z0-9_]{3,30}$/.test(input.value);
  hint.textContent = valid ? '✅ Looks good!' : '3–30 characters · letters, numbers, underscores only';
  hint.style.color = valid ? 'var(--color-success,#4caf50)' : 'var(--text-muted,#888)';
  btn.disabled = !valid;
}
${isOwner ? `document.getElementById('rename-modal').addEventListener('click', function(e) { if (e.target === this) closeRenameModal(); });` : ''}
</script>`;

  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});

function renderUserRow(u: any, displayNum: number, ipCountryMap: Record<string, string>, badges: any[], currentUserId: number, isOwner: boolean, siteUrl: string): string {
  const isTargetOwner = u.id === OWNER_USER_ID;
  const isSelf = u.id === currentUserId;
  const ts = u.created_at ? Math.floor(new Date(u.created_at.replace(' ', 'T') + 'Z').getTime() / 1000) : 0;

  let actionsHtml: string;
  if (isTargetOwner) {
    actionsHtml = `<span class="text-muted" style="font-size:0.8rem;">Reserved</span>`;
  } else if (!isSelf) {
    actionsHtml = `
    <div class="flex gap-1" style="gap:4px;flex-wrap:wrap;">
      ${isOwner ? `
      <a href="impersonate.php?action=start&user_id=${u.id}" class="btn btn-ghost btn-sm" title="View site as this user" onclick="return confirm('Impersonate ${h(u.username)}? You will see the site exactly as them.')">👁️</a>
      <button type="button" class="btn btn-ghost btn-sm" title="Rename username" onclick="openRenameModal(${u.id}, '${h(u.username)}')">✏️</button>` : ''}
      <form method="POST" style="display:inline;"><input type="hidden" name="user_id" value="${u.id}"><input type="hidden" name="action" value="toggle_role"><button type="submit" class="btn btn-ghost btn-sm" title="Toggle role">${u.role === 'admin' ? '→ User' : '→ Admin'}</button></form>
      <form method="POST" style="display:inline;"><input type="hidden" name="user_id" value="${u.id}"><input type="hidden" name="action" value="toggle_active"><button type="submit" class="btn btn-ghost btn-sm" title="${u.is_active ? 'Ban' : 'Unban'}">${u.is_active ? '🚫' : '✅'}</button></form>
      <form method="POST" style="display:inline;" onsubmit="return confirm('Permanently delete ${h(u.username)}?')"><input type="hidden" name="user_id" value="${u.id}"><input type="hidden" name="action" value="delete"><button type="submit" class="btn btn-danger btn-sm">🗑️</button></form>
    </div>`;
  } else {
    actionsHtml = `<span class="text-muted" style="font-size:0.8rem;">You</span>`;
  }

  const ip = u.last_ip ?? '';
  const countryCell = ip ? `<span title="${h(ip)}">${h(ipCountryMap[ip] ?? ip)}</span>` : `<span class="text-muted">—</span>`;

  return `
<tr>
  <td class="text-muted" style="font-size:0.82rem;font-weight:600;">${displayNum}</td>
  <td><span class="uid-badge" style="font-family:monospace;font-size:0.78rem;background:var(--bg-hover,rgba(255,255,255,.06));padding:2px 7px;border-radius:6px;cursor:pointer;user-select:all;letter-spacing:.03em;" onclick="copyUid(this,'${h(u.uid ?? '')}')" title="Click to copy">${h(u.uid ?? '—')}</span></td>
  <td><div class="flex" style="gap:10px;align-items:center;">
    <div class="nav-avatar" style="width:32px;height:32px;font-size:0.8rem;flex-shrink:0;">${u.avatar_url ? `<img src="${h(u.avatar_url)}" alt="">` : h(u.username.charAt(0).toUpperCase())}</div>
    <div><span class="username-with-badges"><a href="${siteUrl}/pages/user.php?u=${h(u.username)}" style="font-weight:500;color:var(--text-primary);">${h(u.username)}</a>${Badge.renderList(badges)}</span><div style="font-size:0.78rem;color:var(--text-muted);">${h(u.email)}</div></div>
  </div></td>
  <td>${roleBadge(u.role, u.id)}</td>
  <td>${u.is_active ? `<span class="badge badge-completed">Active</span>` : `<span class="badge badge-dropped">Banned</span>`}</td>
  <td>${(u.list_count ?? 0).toLocaleString('en-US')}</td>
  <td>${(u.fav_count ?? 0).toLocaleString('en-US')}</td>
  <td style="font-size:0.82rem;">${countryCell}</td>
  <td class="text-muted" style="font-size:0.8rem;"><time class="local-ts" data-ts="${ts}" data-full="1">${u.created_at ? new Date(u.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''}</time></td>
  <td class="text-muted" style="font-size:0.8rem;">${u.last_login ? timeAgo(u.last_login) : 'Never'}</td>
  <td>${actionsHtml}</td>
</tr>`;
}

function renderUsersPagination(search: string, role: string, page: number, pages: number): string {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (role) params.set('role', role);
  const baseUrl = `users.php?${params.toString()}${params.toString() ? '&' : ''}page=`;
  let out = '<div class="pagination">';
  for (let i = 1; i <= pages; i++) out += `<a href="${baseUrl}${i}" class="${i === page ? 'current' : ''}">${i}</a>`;
  out += '</div>';
  return out;
}
