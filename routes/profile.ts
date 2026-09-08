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
import { buildSocialLinks, platformColor } from '../lib/social';

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

// ── api/delete_account.php — soft delete (is_active=0), password-gated
//    when the account has a password set. Kills the session on success so
//    the client can redirect to a logged-out state.
profileRoutes.post('/api/delete_account.php', async (c) => {
  const { auth, session, lifetime } = await buildAuth(c);
  if (!auth.check()) {
    await session.save(c, lifetime);
    return c.json({ success: false, message: 'Not logged in' }, 401);
  }
  const userId = session.user_id!;
  const body = await c.req.parseBody();
  const password = (body.password as string) ?? '';
  const result = await auth.deleteAccount(userId, password);
  if (!result.success) {
    await session.save(c, lifetime);
    return c.json(result);
  }
  await session.destroy(c);
  return c.json({ success: true, message: 'Account deleted.' });
});

// ── api/list_sync_connect.php — kicks off the MAL/AniList OAuth flow ─────
profileRoutes.get('/api/list_sync_connect.php', async (c) => {
  const { auth, session, lifetime } = await buildAuth(c);
  const siteUrl = c.env.SITE_URL;
  if (!auth.check()) { await session.save(c, lifetime); return c.redirect(`${siteUrl}/login`); }

  const provider = c.req.query('provider');
  if (provider === 'mal') {
    const { MalSync } = await import('../lib/list-sync');
    const url = MalSync.getAuthUrl(c.env as any, session);
    await session.save(c, lifetime);
    return c.redirect(url);
  }
  if (provider === 'anilist') {
    const { AniListSync } = await import('../lib/list-sync');
    const url = AniListSync.getAuthUrl(c.env as any, session);
    await session.save(c, lifetime);
    return c.redirect(url);
  }
  await session.save(c, lifetime);
  return c.redirect(`${siteUrl}/profile?tab=connections`);
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
    } else if (body.list_sync_action) {
      const { MalSync, AniListSync } = await import('../lib/list-sync');
      const action = body.list_sync_action as string;
      if (action === 'mal_sync_now') {
        const r = await MalSync.pullMerge(c.env as any, db, user.id);
        if (r.error) error = r.error; else success = r.added ? `Imported ${r.added} new anime from MAL.` : 'Already up to date — nothing new to import.';
      } else if (action === 'mal_disconnect') {
        await MalSync.disconnect(db, user.id);
        success = 'Disconnected from MyAnimeList.';
        user = await auth.getCurrentUser();
      } else if (action === 'anilist_sync_now') {
        const r = await AniListSync.requestPull(db, user.id);
        if (r.success) success = r.message; else error = r.message;
        user = await auth.getCurrentUser();
      } else if (action === 'anilist_disconnect') {
        await AniListSync.disconnect(db, user.id);
        success = 'Disconnected from AniList.';
        user = await auth.getCurrentUser();
      }
    } else if (!body.social_action) {
      const data: Record<string, any> = {};
      if (body.bio !== undefined) data.bio = body.bio;
      if (body.pronouns !== undefined) data.pronouns = body.pronouns;
      if (body.tagline !== undefined) data.tagline = body.tagline;
      if (body.social_twitter !== undefined) data.social_twitter = body.social_twitter;
      if (body.social_mal !== undefined) data.social_mal = body.social_mal;
      if (body.social_website !== undefined) data.social_website = body.social_website;
      if (body.social_facebook !== undefined) data.social_facebook = body.social_facebook;
      if (body.social_instagram !== undefined) data.social_instagram = body.social_instagram;
      if (body.social_anilist !== undefined) data.social_anilist = body.social_anilist;
      if (body.social_youtube !== undefined) data.social_youtube = body.social_youtube;
      if (body.social_reddit !== undefined) data.social_reddit = body.social_reddit;
      if (!user.discord_id) {
        if (body.social_discord_id !== undefined) data.social_discord_id = body.social_discord_id;
      }
      if (body.social_discord_label !== undefined) data.social_discord_label = body.social_discord_label;
      if (body.privacy_form === '1') {
        data.privacy_hide_followers = body.privacy_hide_followers === '1';
        data.privacy_hide_following = body.privacy_hide_following === '1';
        data.privacy_hide_favorites = body.privacy_hide_favorites === '1';
      }
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
  // Overview tab is parked for now — flip to true to bring it back.
  const ENABLE_OVERVIEW_TAB = false;
  // Tagline field is parked for now — flip to true to bring it back.
  const ENABLE_TAGLINE = false;
  // AniList sync doesn't work yet (graphql.anilist.co relay isn't
  // reliable) — flip to true to bring the Connect button back once fixed.
  const ENABLE_ANILIST_SYNC = false;
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
  html += renderDeleteAccountModal(hasPassword, siteUrl);

  const socialLinks = buildSocialLinks(user);

  html += `
<div class="u-hero">
  <div class="u-banner${user.banner_url ? '' : ' u-banner-fallback'}"${user.banner_url ? ` style="background-image:url('${h(user.banner_url)}')"` : ''} id="profile-banner-el"></div>
  <button type="button" class="u-banner-edit-btn" onclick="document.getElementById('banner-file-input').click()">${icon('camera', 'icon-small')} ${user.banner_url ? 'Change Banner' : 'Add Banner'}</button>
  ${user.banner_url ? `<button type="button" class="u-banner-remove-btn" onclick="removeBanner()" title="Remove banner">${icon('trash', 'icon-small')}</button>` : ''}
  <input type="file" id="banner-file-input" accept="image/jpeg,image/png,image/gif,image/webp" style="display:none" onchange="handleProfileBannerFile(this)">
  <div id="banner-status" class="u-banner-status"></div>
</div>

<div class="container section" style="padding-top:0;">
  <div class="u-header">
    <div class="u-avatar-wrap profile-avatar-wrap" onclick="document.getElementById('avatar-file-input').click()" title="Click to change avatar">
      <div class="nav-avatar u-avatar" id="sidebar-avatar-wrap">
        ${user.avatar_url
          ? `<img src="${h(user.avatar_url)}" id="sidebar-avatar-img" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
          : `<span id="sidebar-avatar-initials">${h(user.username.charAt(0).toUpperCase())}</span><img id="sidebar-avatar-img" src="" alt="" style="display:none;width:100%;height:100%;object-fit:cover;border-radius:50%;">`}
      </div>
      <div class="profile-avatar-edit-overlay">${icon('camera', 'icon-small')}<br>Change</div>
      ${isOwner ? `<span class="u-role-badge">OWNER</span>` : user.role === 'admin' ? `<span class="u-role-badge">ADMIN</span>` : ''}
    </div>
    <input type="file" id="avatar-file-input" accept="image/jpeg,image/png,image/gif,image/webp" style="display:none" onchange="handleAvatarFile(this)">

    <div class="u-name-block">
      <h1 class="u-username">
        <span id="profile-username-display">${h(user.username)}</span>${Badge.renderList(userBadges)}
        <button type="button" onclick="openUsernameModal()" title="Edit username">${icon('edit', 'icon-small')}</button>
        ${user.pronouns ? `<span class="u-pronouns">${h(user.pronouns)}</span>` : ''}
      </h1>
      <!-- Tagline disabled for now — flip ENABLE_TAGLINE below to bring it back. -->
      ${ENABLE_TAGLINE && user.tagline
        ? `<p class="u-tagline">${h(user.tagline)}</p>`
        : ENABLE_TAGLINE ? `<p class="u-tagline u-tagline-empty"><a href="javascript:void(0)" onclick="showProfileTab('account')">${icon('plus', 'icon-small')} Add a tagline</a></p>` : ''}
      <p class="u-joined text-muted">Member since ${memberSince}</p>
    </div>
  </div>

  <div class="u-header-meta">
    <p class="profile-hero-email" id="profile-email-display">
      ${isPlaceholderEmail
        ? `<a href="javascript:void(0)" onclick="openEmailModal()" style="color:var(--accent-2);text-decoration:underline;">${icon('plus', 'icon-small')} Add email</a>`
        : `${h(user.email)} <button type="button" onclick="openEmailModal()" title="Edit email" style="background:none;border:none;cursor:pointer;color:rgba(255,255,255,.6);padding:0;vertical-align:middle;">${icon('edit', 'icon-small')}</button>`}
    </p>
    ${socialLinks.length ? `
    <div class="u-social-links">
      ${socialLinks.map(([ic, url, label]) => `<a href="${h(url)}" target="_blank" rel="noopener noreferrer nofollow" class="u-social-link" style="--platform-color:${platformColor(ic)}" title="${h(label)}">${icon(ic, 'icon-small')}<span>${h(label)}</span></a>`).join('')}
    </div>` : ''}
    <div id="avatar-status" style="font-size:0.78rem;min-height:16px;color:rgba(255,255,255,.6);"></div>
  </div>
</div>

<div class="profile-stat-strip">
  ${quickStats.map(([l, v, cl, ic]) => `
  <div class="profile-stat-box">
    <span class="profile-stat-val" style="color:var(--${cl});">${v}</span>
    <span class="profile-stat-label">${icon(ic, 'icon-small')} ${l}</span>
  </div>`).join('')}
</div>

<div class="container section">
  ${error ? `<div class="alert alert-error mb-2">${icon('alert', 'icon-small')} ${h(error)}</div>` : ''}
  ${success ? `<div class="alert alert-success mb-2">${icon('check', 'icon-small')} ${h(success)}</div>` : ''}

  <div class="profile-tabs">
    <!-- Overview tab disabled for now — flip ENABLE_OVERVIEW_TAB below to bring it back -->
    ${ENABLE_OVERVIEW_TAB ? `<button type="button" class="profile-tab-btn active" data-tab="overview" onclick="showProfileTab('overview')">${icon('user', 'icon-small')} Overview</button>` : ''}
    <button type="button" class="profile-tab-btn${ENABLE_OVERVIEW_TAB ? '' : ' active'}" data-tab="account" onclick="showProfileTab('account')">${icon('edit', 'icon-small')} Account</button>
    <button type="button" class="profile-tab-btn" data-tab="connections" onclick="showProfileTab('connections')">${icon('globe', 'icon-small')} Connections</button>
    <button type="button" class="profile-tab-btn" data-tab="privacy" onclick="showProfileTab('privacy')">${icon('shield', 'icon-small')} Privacy</button>
  </div>

  ${ENABLE_OVERVIEW_TAB ? `
  <div class="profile-tab-panel active" id="tab-overview">
    <div class="profile-columns">
      <div>
        <div class="info-section-title" style="margin-bottom:14px;">${icon('message', 'icon-medium')} About</div>
        ${user.bio
          ? `<p style="color:var(--text-secondary);line-height:1.8;margin-bottom:24px;">${h(user.bio).replace(/\n/g, '<br>')}</p>`
          : `<p class="text-muted" style="margin-bottom:24px;">No bio yet. <a href="javascript:void(0)" onclick="showProfileTab('account')" style="color:var(--accent-2);">Add one</a> to tell others about yourself.</p>`}

        ${favs.length > 0 ? `
        <div class="info-section-title" style="margin-bottom:14px;">${icon('heart', 'icon-medium')} Favorites</div>
        <div class="anime-grid">
          ${favs.slice(0, 8).map((fav: any) => `
          <div class="anime-card" onclick="window.location.href='${siteUrl}/anime?id=${fav.anime_id}'">
            <div class="anime-card-poster">${fav.anime_image ? `<img src="${h(fav.anime_image)}" alt="${h(fav.anime_title)}" loading="lazy">` : icon('user', 'icon-xl')}</div>
            <div class="anime-card-info"><div class="anime-card-title">${h(fav.anime_title)}</div></div>
          </div>`).join('')}
        </div>` : ''}
      </div>

      <aside class="profile-side">
        <div class="settings-card">
          <a href="${siteUrl}/mylist" class="settings-row" style="text-decoration:none;color:inherit;">
            <div class="settings-row-name">${icon('list', 'icon-small')} My List</div>
            ${icon('chevron-right', 'icon-small')}
          </a>
          <a href="${siteUrl}/importexport" class="settings-row" style="text-decoration:none;color:inherit;">
            <div class="settings-row-name">${icon('box', 'icon-small')} Import / Export</div>
            ${icon('chevron-right', 'icon-small')}
          </a>
        </div>
      </aside>
    </div>
  </div>` : ''}

  <div class="profile-tab-panel${ENABLE_OVERVIEW_TAB ? '' : ' active'}" id="tab-account"${ENABLE_OVERVIEW_TAB ? ' hidden' : ''}>
    <div class="settings-card mb-2">
      <div class="settings-row">
        <div class="settings-row-label">
          <div class="settings-row-name">${icon('camera', 'icon-small')} Profile Picture</div>
          <div class="settings-row-desc">Click your avatar at the top of the page to change it · JPG, PNG, GIF, WEBP · Max 20MB</div>
        </div>
        ${user.avatar_url ? `<button type="button" class="btn btn-ghost btn-sm" id="delete-avatar-btn" onclick="deleteAvatar()" title="Remove your current avatar">${icon('trash', 'icon-small')} Remove</button>` : ''}
      </div>
      <div class="settings-row">
        <div class="settings-row-label">
          <div class="settings-row-name">${icon('camera', 'icon-small')} Profile Banner</div>
          <div class="settings-row-desc">Click "${user.banner_url ? 'Change' : 'Add'} Banner" at the top of the page · JPG, PNG, GIF, WEBP · Max 20MB</div>
        </div>
        ${user.banner_url ? `<button type="button" class="btn btn-ghost btn-sm" onclick="removeBanner()" title="Remove your current banner">${icon('trash', 'icon-small')} Remove</button>` : ''}
      </div>
    </div>

    <form method="POST" class="settings-card">
      <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
          <label class="settings-row-name" for="bio-input">${icon('message', 'icon-small')} Bio</label>
          <span id="bio-char-count" class="text-muted" style="font-size:.72rem;">${(user.bio ?? '').length}/500</span>
        </div>
        <textarea id="bio-input" name="bio" class="form-control" rows="3" maxlength="500" placeholder="Tell others about yourself..." oninput="document.getElementById('bio-char-count').textContent=this.value.length+'/500'">${h(user.bio ?? '')}</textarea>
      </div>
      ${ENABLE_TAGLINE ? `
      <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px;">
        <label class="settings-row-name" for="tagline-input">${icon('edit', 'icon-small')} Tagline</label>
        <div class="settings-row-desc" style="margin:-4px 0 4px;">A short status line shown right under your name</div>
        <input id="tagline-input" type="text" name="tagline" class="form-control" maxlength="80" placeholder="e.g. Currently marathoning Fall 2026" value="${h(user.tagline ?? '')}">
      </div>` : ''}
      <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px;">
        <label class="settings-row-name" for="pronouns-input">${icon('user', 'icon-small')} Pronouns</label>
        <input id="pronouns-input" type="text" name="pronouns" class="form-control" maxlength="30" placeholder="e.g. she/her" value="${h(user.pronouns ?? '')}">
      </div>
      <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:10px;">
        <label class="settings-row-name">${icon('globe', 'icon-small')} Social Links</label>
        <div class="social-input-row">
          ${icon('discord', 'icon-small')}
          ${user.discord_id
            ? `<div class="social-input-static">${icon('check', 'icon-small')} Connected via Discord login <span class="text-muted">(ID: ${h(user.discord_id)})</span></div>`
            : `<input type="text" name="social_discord_id" class="form-control" maxlength="40" placeholder="Discord User ID (User Settings → right-click your name → Copy User ID)" value="${h(user.social_discord_id ?? '')}">`}
        </div>
        <div class="social-input-row">
          <span class="social-input-spacer"></span>
          <input type="text" name="social_discord_label" class="form-control" maxlength="60" placeholder="Discord display name to show" value="${h(user.social_discord_label ?? '')}">
        </div>
        <div class="social-input-row">${icon('twitter', 'icon-small')}<input type="text" name="social_twitter" class="form-control" maxlength="100" placeholder="Twitter/X username (no @)" value="${h(user.social_twitter ?? '')}"></div>
        <div class="social-input-row">${icon('instagram', 'icon-small')}<input type="text" name="social_instagram" class="form-control" maxlength="100" placeholder="Instagram username (no @)" value="${h(user.social_instagram ?? '')}"></div>
        <div class="social-input-row">${icon('facebook', 'icon-small')}<input type="text" name="social_facebook" class="form-control" maxlength="100" placeholder="Facebook username or profile ID" value="${h(user.social_facebook ?? '')}"></div>
        <div class="social-input-row">${icon('youtube', 'icon-small')}<input type="text" name="social_youtube" class="form-control" maxlength="100" placeholder="YouTube handle (without @)" value="${h(user.social_youtube ?? '')}"></div>
        <div class="social-input-row">${icon('reddit', 'icon-small')}<input type="text" name="social_reddit" class="form-control" maxlength="100" placeholder="Reddit username (no u/)" value="${h(user.social_reddit ?? '')}"></div>
        <div class="social-input-row">${icon('tv', 'icon-small')}<input type="text" name="social_mal" class="form-control" maxlength="100" placeholder="MyAnimeList username" value="${h(user.social_mal ?? '')}"></div>
        <div class="social-input-row">${icon('anilist', 'icon-small')}<input type="text" name="social_anilist" class="form-control" maxlength="100" placeholder="AniList username" value="${h(user.social_anilist ?? '')}"></div>
        <div class="social-input-row">${icon('globe', 'icon-small')}<input type="text" name="social_website" class="form-control" maxlength="200" placeholder="Website URL" value="${h(user.social_website ?? '')}"></div>
      </div>
      <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px;">
        <label class="settings-row-name" for="password-input">${icon('lock', 'icon-small')} New Password</label>
        <div class="settings-row-desc" style="margin:-4px 0 4px;">Leave blank to keep your current password</div>
        <input id="password-input" type="password" name="new_password" class="form-control" placeholder="Min. 6 characters" minlength="6">
      </div>
      <div class="settings-row" style="justify-content:flex-end;">
        <button type="submit" class="btn btn-primary">${icon('check', 'icon-small')} Save Changes</button>
      </div>
    </form>
  </div>

  <div class="profile-tab-panel" id="tab-privacy" hidden>
    <form method="POST" class="settings-card mb-2">
      <input type="hidden" name="privacy_form" value="1">
      <label class="settings-row toggle-row">
        <div class="settings-row-label">
          <div class="settings-row-name">${icon('users', 'icon-small')} Hide follower list</div>
          <div class="settings-row-desc">Your follower count still shows, but the list itself is hidden from other people</div>
        </div>
        <input type="checkbox" class="toggle-switch" name="privacy_hide_followers" value="1" ${user.privacy_hide_followers ? 'checked' : ''}>
      </label>
      <label class="settings-row toggle-row">
        <div class="settings-row-label">
          <div class="settings-row-name">${icon('users', 'icon-small')} Hide following list</div>
          <div class="settings-row-desc">Your following count still shows, but the list itself is hidden from other people</div>
        </div>
        <input type="checkbox" class="toggle-switch" name="privacy_hide_following" value="1" ${user.privacy_hide_following ? 'checked' : ''}>
      </label>
      <label class="settings-row toggle-row">
        <div class="settings-row-label">
          <div class="settings-row-name">${icon('heart', 'icon-small')} Hide favorites</div>
          <div class="settings-row-desc">Don't show your favorites grid on your public profile</div>
        </div>
        <input type="checkbox" class="toggle-switch" name="privacy_hide_favorites" value="1" ${user.privacy_hide_favorites ? 'checked' : ''}>
      </label>
      <div class="settings-row" style="justify-content:flex-end;">
        <button type="submit" class="btn btn-primary">${icon('check', 'icon-small')} Save Privacy Settings</button>
      </div>
    </form>

    <div class="settings-card danger-zone">
      <div class="settings-row">
        <div class="settings-row-label">
          <div class="settings-row-name" style="color:var(--accent-2);">${icon('alert', 'icon-small')} Delete Account</div>
          <div class="settings-row-desc">Deactivates your account and logs you out. This can't be undone from the app — contact support to restore it.</div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" style="border-color:var(--accent-2);color:var(--accent-2);" onclick="openDeleteAccountModal()">${icon('trash', 'icon-small')} Delete</button>
      </div>
    </div>
  </div>

  <div class="profile-tab-panel" id="tab-connections" hidden>
    <div class="settings-card">
      <div class="settings-row">
        <div class="settings-row-label">
          <div class="settings-row-name"><svg width="18" height="18" viewBox="0 0 48 48" style="vertical-align:-3px;"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg> Google</div>
          <div class="settings-row-desc">${hasGoogle ? '<span style="color:var(--teal);">✓ Connected</span>' : 'Not connected'}</div>
        </div>
        <form method="POST" style="margin:0;">
          <input type="hidden" name="social_action" value="${hasGoogle ? 'disconnect' : 'connect'}">
          <input type="hidden" name="provider" value="google">
          ${hasGoogle
            ? `<button type="submit" class="btn btn-ghost btn-sm" ${(!hasPassword && !hasDiscord) ? `disabled title="Set a password before disconnecting your only login method."` : ''}>Disconnect</button>`
            : `<button type="submit" class="btn btn-ghost btn-sm">Connect</button>`}
        </form>
      </div>
      <div class="settings-row">
        <div class="settings-row-label">
          <div class="settings-row-name"><svg width="18" height="18" viewBox="0 0 127.14 96.36" fill="#5865F2" style="vertical-align:-3px;"><path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15zM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69z"/></svg> Discord</div>
          <div class="settings-row-desc">${hasDiscord ? '<span style="color:var(--teal);">✓ Connected</span>' : 'Not connected'}</div>
        </div>
        <form method="POST" style="margin:0;">
          <input type="hidden" name="social_action" value="${hasDiscord ? 'disconnect' : 'connect'}">
          <input type="hidden" name="provider" value="discord">
          ${hasDiscord
            ? `<button type="submit" class="btn btn-ghost btn-sm" ${(!hasPassword && !hasGoogle) ? `disabled title="Set a password before disconnecting your only login method."` : ''}>Disconnect</button>`
            : `<button type="submit" class="btn btn-ghost btn-sm">Connect</button>`}
        </form>
      </div>
    </div>

    <div class="settings-card mt-2">
      <div class="settings-row" style="display:block;">
        <div class="settings-row-name" style="margin-bottom:2px;">${icon('list', 'icon-small')} List Sync</div>
        <div class="settings-row-desc">Connect MyAnimeList and/or AniList to keep your list in sync both ways — updates you make here get pushed there, and connecting pulls in anything from there that isn't on your site list yet.</div>
      </div>
      <div class="settings-row">
        <div class="settings-row-label">
          <div class="settings-row-name">${icon('tv', 'icon-small')} MyAnimeList</div>
          <div class="settings-row-desc">${user.mal_sync_username ? `<span style="color:var(--teal);">✓ Connected as ${h(user.mal_sync_username)}</span>` : 'Not connected'}</div>
        </div>
        <div style="display:flex;gap:6px;">
          ${user.mal_sync_username ? `
          <form method="POST" style="margin:0;"><input type="hidden" name="list_sync_action" value="mal_sync_now"><button type="submit" class="btn btn-ghost btn-sm" title="Pull in anything new from MAL">${icon('download', 'icon-small')} Sync Now</button></form>
          <form method="POST" style="margin:0;"><input type="hidden" name="list_sync_action" value="mal_disconnect"><button type="submit" class="btn btn-ghost btn-sm">Disconnect</button></form>`
            : `<a href="${siteUrl}/api/list_sync_connect.php?provider=mal" class="btn btn-ghost btn-sm">Connect</a>`}
        </div>
      </div>
      <!-- AniList sync disabled for now — flip ENABLE_ANILIST_SYNC below to bring it back. -->
      ${ENABLE_ANILIST_SYNC ? `
      <div class="settings-row">
        <div class="settings-row-label">
          <div class="settings-row-name">${icon('anilist', 'icon-small')} AniList</div>
          <div class="settings-row-desc">
            ${user.anilist_sync_username ? `<span style="color:var(--teal);">✓ Connected as ${h(user.anilist_sync_username)}</span>`
              : user.anilist_sync_access_token ? `<span class="text-muted">Connected — fetching your username &amp; list (runs on a short delay, refresh in a few minutes)</span>`
              : 'Not connected'}
          </div>
        </div>
        <div style="display:flex;gap:6px;">
          ${user.anilist_sync_access_token ? `
          <form method="POST" style="margin:0;"><input type="hidden" name="list_sync_action" value="anilist_sync_now"><button type="submit" class="btn btn-ghost btn-sm" title="Pull in anything new from AniList">${icon('download', 'icon-small')} Sync Now</button></form>
          <form method="POST" style="margin:0;"><input type="hidden" name="list_sync_action" value="anilist_disconnect"><button type="submit" class="btn btn-ghost btn-sm">Disconnect</button></form>`
            : `<a href="${siteUrl}/api/list_sync_connect.php?provider=anilist" class="btn btn-ghost btn-sm">Connect</a>`}
        </div>
      </div>` : ''}
    </div>
  </div>
</div>

<script>
function showProfileTab(name){
  document.querySelectorAll('.profile-tab-panel').forEach(function(p){ p.hidden = (p.id !== 'tab-' + name); });
  document.querySelectorAll('.profile-tab-btn').forEach(function(b){ b.classList.toggle('active', b.dataset.tab === name); });
}
(function () {
  var params = new URLSearchParams(window.location.search);
  var tab = params.get('tab');
  if (tab && document.getElementById('tab-' + tab)) showProfileTab(tab);
})();
</script>
<script>${PROFILE_SCRIPT}</script>`;

  html += renderFooter({ siteUrl, currentUser: layoutUser });
  await session.save(c, lifetime);
  return c.html(html);
}

function renderDeleteAccountModal(hasPassword: boolean, siteUrl: string): string {
  return `
<div class="modal-overlay" id="delete-account-modal">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div><h3 style="color:var(--accent-2);">${icon('alert', 'icon-medium')} Delete Account</h3></div>
      <button class="modal-close" onclick="closeModal('delete-account-modal')">${icon('x', 'icon-medium')}</button>
    </div>
    <div class="modal-body">
      <p class="text-muted" style="margin:0 0 14px;">This deactivates your account immediately and logs you out. Your username, lists, and follows won't be visible to anyone else.</p>
      <div class="form-group">
        ${hasPassword
          ? `<label class="form-label">Enter your password to confirm</label>
             <input type="password" id="delete-account-password" class="form-control" placeholder="Your password">`
          : `<label class="form-label">Type DELETE to confirm</label>
             <input type="text" id="delete-account-password" class="form-control" placeholder="DELETE">`}
        <div id="delete-account-msg" style="font-size:0.8rem;margin-top:6px;min-height:16px;color:var(--accent-2);"></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:1rem;">
        <button type="button" class="btn btn-ghost" onclick="closeModal('delete-account-modal')">${icon('x', 'icon-small')} Cancel</button>
        <button type="button" class="btn btn-primary" style="background:var(--accent-2);" id="confirm-delete-account-btn" onclick="confirmDeleteAccount(${hasPassword ? 'true' : 'false'}, '${siteUrl}')">${icon('trash', 'icon-small')} Delete My Account</button>
      </div>
    </div>
  </div>
</div>`;
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
        <button type="button" class="btn btn-primary" id="save-crop-btn" onclick="saveCrop()">${icon('check', 'icon-small')} Save Avatar</button>
      </div>
    </div>
  </div>
</div>`;
}
