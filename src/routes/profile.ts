// Ports pages/profile.php.
// One deliberate change: the Discord connect/disconnect UI was entirely
// commented out in the original with a note "temporarily disabled (curl
// blocked on free hosting)". That limitation doesn't exist on Workers
// (native fetch, no curl restrictions), so it's re-enabled here.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { AnimeTracker } from '../lib/tracker';
import { Badge } from '../lib/badges';
import { Notification } from '../lib/notification';
import { h } from '../lib/helpers';
import { icon } from '../lib/icons';
import { renderHeader, renderFooter, CurrentUser } from '../render/layout';
import { PROFILE_CSS } from '../render/profile-css';
import { PROFILE_SCRIPT } from '../render/profile-script';
import { getBannerData } from '../lib/settings';

export const profileRoutes = new Hono<{ Bindings: Env }>();

async function buildAuth(c: any): Promise<{ auth: Auth; session: Session; db: Db; lifetime: number }> {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  return { auth, session, db, lifetime };
}

// ── api/check_username.php — live availability check for the edit-username
//    popup, called on a debounce while the person types.
profileRoutes.get('/api/check_username.php', async (c) => {
  const { auth, session, lifetime } = await buildAuth(c);
  await session.save(c, lifetime);
  if (!auth.check()) return c.json({ available: false, message: 'Not logged in' }, 401);

  const username = (c.req.query('username') ?? '').trim();
  const result = await auth.checkUsernameAvailable(username, session.user_id!);
  return c.json(result);
});

// ── api/update_username.php ───────────────────────────────────────────────
profileRoutes.post('/api/update_username.php', async (c) => {
  const { auth, session, lifetime } = await buildAuth(c);
  await session.save(c, lifetime);
  if (!auth.check()) return c.json({ success: false, message: 'Not logged in' }, 401);

  const body = await c.req.parseBody();
  const username = ((body.username as string) ?? '').trim();
  const result = await auth.updateProfile(session.user_id!, { username });
  return c.json(result);
});

// ── api/update_email.php — no OTP/verification step, saves directly ──────
profileRoutes.post('/api/update_email.php', async (c) => {
  const { auth, session, lifetime } = await buildAuth(c);
  await session.save(c, lifetime);
  if (!auth.check()) return c.json({ success: false, message: 'Not logged in' }, 401);

  const body = await c.req.parseBody();
  const email = ((body.email as string) ?? '').trim();
  const result = await auth.updateProfile(session.user_id!, { email });
  return c.json(result);
});

profileRoutes.on(['GET', 'POST'], '/profile', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  const siteUrl = c.env.SITE_URL;

  if (!auth.check()) return c.redirect(siteUrl + '/');
  let user = await auth.getCurrentUser();
  if (!user) return c.redirect(siteUrl + '/');

  // Redirect to OAuth before any HTML output, same as the PHP version
  if (c.req.method === 'POST') {
    const body = await c.req.parseBody();
    if (body.social_action === 'connect') {
      const provider = body.provider === 'google' || body.provider === 'discord' ? body.provider : null;
      if (provider === 'google') {
        session.data.oauth_redirect = `${siteUrl}/profile`;
        const url = auth.getGoogleAuthUrl();
        await session.save(c, lifetime);
        return c.redirect(url);
      }
      if (provider === 'discord') {
        session.data.oauth_redirect = `${siteUrl}/profile`;
        const url = auth.getDiscordAuthUrl();
        await session.save(c, lifetime);
        return c.redirect(url);
      }
    }

    let error: string | null = null;
    let success: string | null = null;

    if (body.social_action === 'disconnect') {
      const provider = body.provider === 'google' || body.provider === 'discord' ? body.provider : null;
      if (provider) {
        const result = await auth.disconnectSocial(user.id, provider);
        if (result.success) success = result.message ?? null; else error = result.message ?? null;
        user = await auth.getCurrentUser();
      }
    } else if (!body.social_action) {
      const data: Record<string, any> = {};
      if (body.bio !== undefined) data.bio = body.bio;
      if (body.new_password) data.new_password = body.new_password;
      const result = await auth.updateProfile(user!.id, data);
      if (result.success) { success = 'Profile updated!'; user = await auth.getCurrentUser(); }
      else { error = result.message ?? null; }
    }

    if (success) session.setFlash('success', success);
    if (error) session.setFlash('error', error);
    await session.save(c, lifetime);
    // Re-render inline (no redirect) so the just-updated $user reflects immediately,
    // matching the PHP version's same-request re-render.
    return renderProfilePage(c, db, session, lifetime, auth, user!, error, success);
  }

  const flash = session.takeFlash();
  const error = flash?.type === 'error' ? flash.message : null;
  const success = flash?.type === 'success' ? flash.message : null;
  return renderProfilePage(c, db, session, lifetime, auth, user, error, success);
});

async function renderProfilePage(c: any, db: Db, session: Session, lifetime: number, auth: Auth, user: any, error: string | null, success: string | null) {
  const siteUrl = c.env.SITE_URL;
  const userBadges = await Badge.getForUser(db, user.id);
  const stats = await AnimeTracker.getStats(db, user.id);
  const favs = await AnimeTracker.getFavorites(db, user.id);

  const hasGoogle = !!user.google_id;
  const hasDiscord = !!user.discord_id;
  const hasPassword = !!user.password_hash;

  const unreadCount = await Notification.unreadCount(db, user.id);
  const layoutUser: CurrentUser = { id: user.id, username: user.username, avatar_url: user.avatar_url, role: user.role };

  const __banner = await getBannerData(db);
  let html = renderHeader({ ...__banner, siteUrl, siteName: c.env.SITE_NAME, pageTitle: 'My Profile', currentPage: 'profile', currentUser: layoutUser, unreadCount, requestUrl: c.req.url });  html += `<style>${PROFILE_CSS}</style>`;

  const quickStats: [string, string | number, string, string][] = [
    ['Total', stats.total, 'text-primary', 'list'],
    ['Watching', stats.watching, 'blue', 'watching'],
    ['Completed', stats.completed, 'teal', 'completed'],
    ['Avg Score', stats.avg_score || '—', 'gold', 'star'],
  ];

  const isOwner = user.role === 'owner' || auth.isOwnerUserId(user.id);
  const memberSince = user.created_at ? new Date(user.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
  // Auto-created accounts get a synthetic "<username>@guest.invalid"-style
  // placeholder so the NOT NULL email column doesn't break — that's an
  // implementation detail, not something the user actually set, so treat it
  // (and a genuinely blank email) the same: show "+ Add email" instead.
  const isPlaceholderEmail = !user.email || /@(guest|discord|google)\.invalid$/i.test(user.email);

  html += renderCropperModal();
  html += renderUsernameModal();
  html += renderEmailModal(isPlaceholderEmail);

  html += `
<div class="container section">
  <div class="layout-sidebar">
    <aside>
      <div class="sidebar">
        <div style="padding:1.5rem;text-align:center;border-bottom:1px solid var(--border);">
          <div style="position:relative;width:90px;height:90px;margin:0 auto 1rem;cursor:pointer;" onclick="document.getElementById('avatar-file-input').click()" title="Click to change avatar">
            <div class="nav-avatar" id="sidebar-avatar-wrap" style="width:90px;height:90px;font-size:2.2rem;">
              ${user.avatar_url
                ? `<img src="${h(user.avatar_url)}" id="sidebar-avatar-img" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                : `<span id="sidebar-avatar-initials">${h(user.username.charAt(0).toUpperCase())}</span><img id="sidebar-avatar-img" src="" alt="" style="display:none;width:100%;height:100%;object-fit:cover;border-radius:50%;">`}
            </div>
            <div style="position:absolute;inset:0;border-radius:50%;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:2px;opacity:0;transition:opacity 0.2s;font-size:0.65rem;color:white;line-height:1.2;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0">
              ${icon('camera', 'icon-small')}<br>Change
            </div>
          </div>
          <input type="file" id="avatar-file-input" accept="image/jpeg,image/png,image/gif,image/webp" style="display:none" onchange="handleAvatarFile(this)">
          <div id="avatar-status" style="font-size:0.78rem;min-height:16px;color:var(--text-muted);"></div>
          <h2 class="username-with-badges" style="font-size:1.2rem;margin-top:8px;justify-content:center;gap:6px;">
            <span id="profile-username-display">${h(user.username)}</span>${Badge.renderList(userBadges)}
            <button type="button" onclick="openUsernameModal()" title="Edit username" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px;display:inline-flex;">${icon('edit', 'icon-small')}</button>
          </h2>
          <p class="text-muted" id="profile-email-display" style="font-size:0.85rem;">
            ${isPlaceholderEmail
              ? `<a href="javascript:void(0)" onclick="openEmailModal()" style="color:var(--accent);text-decoration:underline;">${icon('plus', 'icon-small')} Add email</a>`
              : `${h(user.email)} <button type="button" onclick="openEmailModal()" title="Edit email" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0;vertical-align:middle;">${icon('edit', 'icon-small')}</button>`}
          </p>
          ${isOwner ? `<span class="badge" style="background:rgba(232,69,60,0.2);color:var(--accent);margin-top:6px;">${icon('shield', 'icon-small')} OWNER</span>`
            : user.role === 'admin' ? `<span class="badge" style="background:rgba(232,69,60,0.2);color:var(--accent);margin-top:6px;">${icon('shield', 'icon-small')} Admin</span>` : ''}
          <p class="text-muted" style="font-size:0.8rem;margin-top:6px;">Member since ${memberSince}</p>
        </div>

        ${quickStats.map(([l, v, cl, ic]) => `
        <div style="padding:10px 18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;">
          <span class="text-muted" style="font-size:0.85rem;">${icon(ic, 'icon-small')} ${l}</span>
          <span style="color:var(--${cl});font-weight:600;">${v}</span>
        </div>`).join('')}

        <div style="padding:1rem;display:flex;flex-direction:column;gap:6px;">
          <a href="${siteUrl}/mylist" class="btn btn-ghost btn-block btn-sm">${icon('list', 'icon-small')} My List</a>
          <a href="${siteUrl}/importexport" class="btn btn-ghost btn-block btn-sm">${icon('box', 'icon-small')} Import / Export</a>
        </div>
      </div>
    </aside>

    <div>
      ${error ? `<div class="alert alert-error mb-2">${icon('alert', 'icon-small')} ${h(error)}</div>` : ''}
      ${success ? `<div class="alert alert-success mb-2">${icon('check', 'icon-small')} ${h(success)}</div>` : ''}

      <div class="card card-body mb-2">
        <div class="flex-between mb-2">
          <div>
            <h2>${icon('camera', 'icon-medium')} Profile Picture</h2>
            <p class="text-muted" style="font-size:0.85rem;margin-top:4px;">Upload any image — a cropper will open so you can pick exactly what to show.</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-primary" onclick="document.getElementById('avatar-file-input').click()">${icon('camera', 'icon-small')} Upload Image</button>
            ${user.avatar_url ? `<button type="button" class="btn btn-danger btn-sm" id="delete-avatar-btn" onclick="deleteAvatar()" title="Remove your current avatar">${icon('trash', 'icon-small')} Remove Avatar</button>` : ''}
          </div>
        </div>
        <p class="text-muted" style="font-size:0.8rem;">Supported: JPG, PNG, GIF, WEBP · Max 20MB · Output: 300×300px</p>
      </div>

      <div class="card card-body mb-2">
        <h2 class="mb-2">${icon('edit', 'icon-medium')} Edit Profile</h2>
        <form method="POST">
          <div class="form-group">
            <label class="form-label">${icon('message', 'icon-small')} Bio</label>
            <textarea name="bio" class="form-control" rows="3" placeholder="Tell others about yourself...">${h(user.bio ?? '')}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">${icon('lock', 'icon-small')} New Password <span class="text-muted">(leave blank to keep current)</span></label>
            <input type="password" name="new_password" class="form-control" placeholder="Min. 6 characters" minlength="6">
          </div>
          <button type="submit" class="btn btn-primary">${icon('check', 'icon-small')} Save Changes</button>
        </form>
      </div>

      <div class="card card-body mb-2">
        <h2 class="mb-1">🔗 Connected Accounts</h2>
        <p class="text-muted" style="font-size:0.88rem;margin-bottom:1.1rem;">Link Google or Discord for one-click sign-in.</p>

        <div style="display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:12px;">
            <svg width="26" height="26" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
            <div><div style="font-weight:600;">Google</div><div style="font-size:0.8rem;color:var(--text-secondary);">${hasGoogle ? '<span style="color:var(--teal);">✓ Connected</span>' : 'Not connected'}</div></div>
          </div>
          <form method="POST">
            <input type="hidden" name="social_action" value="${hasGoogle ? 'disconnect' : 'connect'}">
            <input type="hidden" name="provider" value="google">
            ${hasGoogle
              ? `<button type="submit" class="btn btn-ghost btn-sm" ${(!hasPassword && !hasDiscord) ? `disabled title="Set a password before disconnecting your only login method."` : ''}>Disconnect</button>`
              : `<button type="submit" class="btn btn-ghost btn-sm">Connect</button>`}
          </form>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;padding:13px 0;">
          <div style="display:flex;align-items:center;gap:12px;">
            <svg width="26" height="26" viewBox="0 0 127.14 96.36" fill="#5865F2"><path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15zM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69z"/></svg>
            <div><div style="font-weight:600;">Discord</div><div style="font-size:0.8rem;color:var(--text-secondary);">${hasDiscord ? '<span style="color:var(--teal);">✓ Connected</span>' : 'Not connected'}</div></div>
          </div>
          <form method="POST">
            <input type="hidden" name="social_action" value="${hasDiscord ? 'disconnect' : 'connect'}">
            <input type="hidden" name="provider" value="discord">
            ${hasDiscord
              ? `<button type="submit" class="btn btn-ghost btn-sm" ${(!hasPassword && !hasGoogle) ? `disabled title="Set a password before disconnecting your only login method."` : ''}>Disconnect</button>`
              : `<button type="submit" class="btn btn-ghost btn-sm">Connect</button>`}
          </form>
        </div>
      </div>

      ${user.bio ? `<div class="card card-body mb-2"><h3>${icon('message', 'icon-medium')} About</h3><p style="color:var(--text-secondary);margin-top:8px;line-height:1.8;">${h(user.bio).replace(/\n/g, '<br>')}</p></div>` : ''}

      ${favs.length > 0 ? `
      <div class="mb-2">
        <div class="section-title">${icon('heart', 'icon-small')} Favorites</div>
        <div class="anime-grid">
          ${favs.slice(0, 8).map((fav: any) => `
          <div class="anime-card" onclick="window.location.href='${siteUrl}/anime?id=${fav.anime_id}'">
            <div class="anime-card-poster">${fav.anime_image ? `<img src="${h(fav.anime_image)}" alt="${h(fav.anime_title)}" loading="lazy">` : icon('user', 'icon-xl')}</div>
            <div class="anime-card-info"><div class="anime-card-title">${h(fav.anime_title)}</div></div>
          </div>`).join('')}
        </div>
      </div>` : ''}
    </div>
  </div>
</div>

<script>${PROFILE_SCRIPT}</script>`;

  html += renderFooter({ siteUrl, currentUser: layoutUser });
  await session.save(c, lifetime);
  return c.html(html);
}

function renderUsernameModal(): string {
  return `
<div class="modal-overlay" id="edit-username-modal">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div><h3>${icon('edit', 'icon-medium')} Edit Username</h3></div>
      <button class="modal-close" onclick="closeModal('edit-username-modal')">${icon('x', 'icon-medium')}</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Username</label>
        <input type="text" id="username-input" class="form-control" maxlength="30" oninput="checkUsernameAvailability(this.value)">
        <div id="username-check-msg" style="font-size:0.8rem;margin-top:6px;min-height:16px;"></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:1rem;">
        <button type="button" class="btn btn-ghost" onclick="closeModal('edit-username-modal')">${icon('x', 'icon-small')} Cancel</button>
        <button type="button" class="btn btn-primary" id="save-username-btn" onclick="saveUsername()">${icon('check', 'icon-small')} Save</button>
      </div>
    </div>
  </div>
</div>`;
}

function renderEmailModal(isPlaceholderEmail: boolean): string {
  return `
<div class="modal-overlay" id="edit-email-modal">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div><h3>${icon('edit', 'icon-medium')} ${isPlaceholderEmail ? 'Add Email' : 'Edit Email'}</h3></div>
      <button class="modal-close" onclick="closeModal('edit-email-modal')">${icon('x', 'icon-medium')}</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Email address</label>
        <input type="email" id="email-input" class="form-control" placeholder="you@example.com">
        <div id="email-check-msg" style="font-size:0.8rem;margin-top:6px;min-height:16px;"></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:1rem;">
        <button type="button" class="btn btn-ghost" onclick="closeModal('edit-email-modal')">${icon('x', 'icon-small')} Cancel</button>
        <button type="button" class="btn btn-primary" id="save-email-btn" onclick="saveEmail()">${icon('check', 'icon-small')} Save</button>
      </div>
    </div>
  </div>
</div>`;
}

function renderCropperModal(): string {
  return `
<div class="modal-overlay" id="cropper-modal" data-static="1" style="z-index:99999;" onclick="if(event.target===this){event.preventDefault();event.stopPropagation();return false;}">
  <div class="modal avatar-cropper-modal" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div><h3>${icon('camera', 'icon-medium')} Edit Profile Picture</h3><p class="text-muted" style="margin:4px 0 0;font-size:0.9rem;">Drag and zoom before saving.</p></div>
      <button class="modal-close" onclick="closeCropper()">${icon('x', 'icon-medium')}</button>
    </div>
    <div class="modal-body">
      <div class="avatar-crop-stage" id="crop-stage">
        <img id="crop-img" src="" alt="" style="display:block;max-width:100%;max-height:260px;margin:0 auto;user-select:none;-webkit-user-drag:none;">
        <div id="crop-box" style="position:absolute;border:2px solid #fff;box-shadow:0 0 0 9999px rgba(0,0,0,0.55);cursor:move;touch-action:none;">
          <div class="crop-handle" data-corner="nw" style="top:-5px;left:-5px;cursor:nw-resize;"></div>
          <div class="crop-handle" data-corner="ne" style="top:-5px;right:-5px;cursor:ne-resize;"></div>
          <div class="crop-handle" data-corner="sw" style="bottom:-5px;left:-5px;cursor:sw-resize;"></div>
          <div class="crop-handle" data-corner="se" style="bottom:-5px;right:-5px;cursor:se-resize;"></div>
          <div style="position:absolute;top:50%;left:0;right:0;height:1px;background:rgba(255,255,255,0.4);pointer-events:none;"></div>
          <div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:rgba(255,255,255,0.4);pointer-events:none;"></div>
        </div>
      </div>
      <div class="avatar-crop-controls">
        <div class="avatar-crop-zoom"><label class="form-label" style="font-size:0.75rem;">Zoom</label><input type="range" id="zoom-slider" min="1" max="3" step="0.05" value="1" style="width:100%;" oninput="applyZoom(this.value)"></div>
        <div class="avatar-crop-shape">
          <label class="form-label" style="font-size:0.75rem;">Shape</label>
          <div class="flex gap-1" style="gap:6px;">
            <button type="button" class="btn btn-ghost btn-sm" id="shape-circle" onclick="setShape('circle')" style="border-color:var(--accent);">${icon('circle', 'icon-small')} Circle</button>
            <button type="button" class="btn btn-ghost btn-sm" id="shape-square" onclick="setShape('square')">${icon('square', 'icon-small')} Square</button>
          </div>
        </div>
      </div>
      <div class="avatar-crop-footer">
        <div>
          <div class="form-label" style="font-size:0.72rem;">Preview</div>
          <div class="avatar-crop-previews">
            <canvas id="crop-preview" width="72" height="72" style="border-radius:50%;border:2px solid var(--border);display:block;"></canvas>
            <canvas id="crop-preview-sq" width="72" height="72" style="border-radius:8px;border:2px solid var(--border);display:block;"></canvas>
          </div>
        </div>
        <p class="text-muted" style="font-size:0.82rem;">Drag the box to reposition.<br>Drag corners to resize as a locked square.<br>Output will be 300×300px.</p>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:1rem;">
        <button type="button" class="btn btn-ghost" onclick="closeCropper()">${icon('x', 'icon-small')} Cancel</button>
        <button type="button" class="btn btn-primary" id="crop-save-btn" onclick="saveCroppedAvatar()">${icon('check', 'icon-small')} Save Avatar</button>
      </div>
    </div>
  </div>
</div>`;
}
