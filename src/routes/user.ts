// Ports pages/user.php + api/follow.php. No dependency on the feed system
// (which the user asked to skip for now, since it has known bugs) --
// this page is entirely self-contained: profile header, stats, anime list,
// favorites, followers/following tabs.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { AnimeTracker, ITEMS_PER_PAGE } from '../lib/tracker';
import { Badge } from '../lib/badges';
import { Follow } from '../lib/follow';
import { Notification } from '../lib/notification';
import { h, timeAgo, statusBadge } from '../lib/helpers';
import { icon } from '../lib/icons';
import { renderAnimeCard, buildCardMetaMap } from '../lib/anime-card';
import { renderHeader, renderFooter, CurrentUser } from '../render/layout';
import { getBannerData } from '../lib/settings';
import { buildSocialLinks, platformColor } from '../lib/social';

export const userRoutes = new Hono<{ Bindings: Env }>();

userRoutes.get('/u/:username', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  const siteUrl = c.env.SITE_URL;

  const username = (c.req.param('username') ?? c.req.query('u') ?? '').trim();
  if (!username) return c.redirect(siteUrl + '/');

  const currentUser = auth.check() ? await auth.getCurrentUser() : null;
  const unreadCount = currentUser ? await Notification.unreadCount(db, currentUser.id) : 0;
  const layoutUser: CurrentUser | null = currentUser
    ? { id: currentUser.id, username: currentUser.username, avatar_url: currentUser.avatar_url, role: currentUser.role }
    : null;

  const profileUser = await db.fetchOne<any>(
    'SELECT id, username, email, avatar_url, banner_url, bio, role, created_at, last_login, pronouns, tagline, discord_id, social_twitter, social_mal, social_website, social_facebook, social_instagram, social_anilist, social_youtube, social_reddit, social_discord_id, social_discord_label, privacy_hide_followers, privacy_hide_following, privacy_hide_favorites FROM users WHERE username = ? AND is_active = 1',
    [username]
  );

  if (!profileUser) {
    const __banner = await getBannerData(db);
    let html = renderHeader({ ...__banner, siteUrl, siteName: c.env.SITE_NAME, pageTitle: 'User Not Found', currentPage: 'user', currentUser: layoutUser, unreadCount, requestUrl: c.req.url });    html += `
<div class="container section flex-center" style="flex-direction:column;gap:1rem;padding:5rem 0;">
  <span style="font-size:4rem;">🔍</span>
  <h2>User not found</h2>
  <p class="text-muted">No user with that username exists.</p>
  <a href="${siteUrl}/" class="btn btn-primary">Back Home</a>
</div>`;
    html += renderFooter({ siteUrl, currentUser: layoutUser });
    await session.save(c, lifetime);
    return c.html(html, 404);
  }

  const profileId = profileUser.id;
  const profileBadges = await Badge.getForUser(db, profileId);
  const isOwn = !!currentUser && currentUser.id === profileId;
  const isFollowing = currentUser && !isOwn ? await Follow.isFollowing(db, currentUser.id, profileId) : false;
  const canViewFollowers = isOwn || !profileUser.privacy_hide_followers;
  const canViewFollowing = isOwn || !profileUser.privacy_hide_following;
  const canViewFavorites = isOwn || !profileUser.privacy_hide_favorites;
  const privateNotice = (what: string) => `<div class="flex-center" style="padding:3rem;flex-direction:column;gap:1rem;">${icon('lock', 'icon-large')}<p class="text-muted">${h(profileUser.username)} has hidden their ${what}.</p></div>`;

  const filterStatus = c.req.query('status') ?? '';
  const listPage = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);

  const followerCount = await Follow.followerCount(db, profileId);
  const followingCount = await Follow.followingCount(db, profileId);
  const stats = await AnimeTracker.getStats(db, profileId);
  const favs = await AnimeTracker.getFavorites(db, profileId);
  const recentList = await AnimeTracker.getUserList(db, profileId, filterStatus, listPage);
  const cardMeta = await buildCardMetaMap(db, [
    ...favs.map((f: any) => ({ mal_id: f.anime_id } as any)),
    ...recentList.items.map((it: any) => ({ mal_id: it.anime_id } as any)),
  ]);
  const followers = await Follow.getFollowers(db, profileId, 12);
  const following = await Follow.getFollowing(db, profileId, 12);
  const modalUserIds = [...followers.map((f) => f.id), ...following.map((f) => f.id)];
  const modalUserBadges = await Badge.getForUsers(db, modalUserIds);

  const profileOgDescription = profileUser.bio
    ? profileUser.bio.substring(0, 200)
    : `${stats.total ?? 0} anime tracked · ${followerCount} followers · ${followingCount} following on AniVault.`;

  const __banner = await getBannerData(db);
  let html = renderHeader({
    ...__banner, siteUrl, siteName: c.env.SITE_NAME, pageTitle: `${profileUser.username}'s Profile`, currentPage: 'user', currentUser: layoutUser, unreadCount, requestUrl: c.req.url,
    ogData: {
      title: `${profileUser.username}'s Profile`, description: profileOgDescription,
      image: profileUser.avatar_url || `${siteUrl}/assets/img/site-img/icon.png`,
      image_width: profileUser.avatar_url ? 400 : 512, image_height: profileUser.avatar_url ? 400 : 512,
      url: `${siteUrl}/u/${profileUser.username}`, type: 'profile',
    },
  });
  const isProfileOwner = profileUser.role === 'owner' || auth.isOwnerUserId(profileId);
  const joinedDate = profileUser.created_at ? new Date(profileUser.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';

  html += `
<div class="u-hero">
  <div class="u-banner${profileUser.banner_url ? '' : ' u-banner-fallback'}"${profileUser.banner_url ? ` style="background-image:url('${h(profileUser.banner_url)}')"` : ''} id="u-banner-el"></div>
</div>

<div class="container section" style="padding-top:0;">
  <div class="u-header">
    <div class="u-avatar-wrap">
      <div class="nav-avatar u-avatar">
        ${profileUser.avatar_url ? `<img src="${h(profileUser.avatar_url)}" alt="${h(profileUser.username)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : h(profileUser.username.charAt(0).toUpperCase())}
      </div>
      ${isProfileOwner ? `<span class="u-role-badge">OWNER</span>` : profileUser.role === 'admin' ? `<span class="u-role-badge">ADMIN</span>` : ''}
    </div>
    <div class="u-name-block">
      <h1 class="u-username username-with-badges">${h(profileUser.username)}${Badge.renderList(profileBadges)}${profileUser.pronouns ? `<span class="u-pronouns">${h(profileUser.pronouns)}</span>` : ''}</h1>
      <!-- Tagline disabled for now -->
      <p class="u-joined text-muted">Joined ${joinedDate}${profileUser.last_login ? ` · Last seen ${timeAgo(profileUser.last_login)}` : ''}</p>
    </div>
    <div class="u-header-actions">
      ${isOwn ? `<a href="${siteUrl}/profile" class="btn btn-ghost btn-sm">${icon('edit', 'icon-small')} Edit Profile</a>`
        : currentUser ? `<button class="btn ${isFollowing ? 'btn-ghost' : 'btn-primary'} btn-sm" id="follow-btn" onclick="toggleFollow(${profileId}, this)">${isFollowing ? `${icon('check', 'icon-small')} Following` : `${icon('plus', 'icon-small')} Follow`}</button>`
        : `<button onclick="requireLogin()" class="btn btn-primary btn-sm">${icon('plus', 'icon-small')} Follow</button>`}
    </div>
  </div>

  <div class="u-header-meta">
    ${profileUser.bio ? `<p class="u-bio">${h(profileUser.bio).replace(/\n/g, '<br>')}</p>` : ''}
    ${(() => {
      const links = buildSocialLinks(profileUser);
      if (!links.length) return '';
      return `<div class="u-social-links">${links.map(([ic, url, label]) => `<a href="${h(url)}" target="_blank" rel="noopener noreferrer nofollow" class="u-social-link" style="--platform-color:${platformColor(ic)}" title="${h(label)}">${icon(ic, 'icon-small')}<span>${h(label)}</span></a>`).join('')}</div>`;
    })()}
  </div>

  <div class="profile-stat-strip u-stat-strip">
    <div class="profile-stat-box clickable" onclick="openModal('followers-modal')">
      <span class="profile-stat-val follower-count">${followerCount.toLocaleString('en-US')}</span>
      <span class="profile-stat-label">${icon('users', 'icon-small')} Followers</span>
    </div>
    <div class="profile-stat-box clickable" onclick="openModal('following-modal')">
      <span class="profile-stat-val">${followingCount.toLocaleString('en-US')}</span>
      <span class="profile-stat-label">${icon('users', 'icon-small')} Following</span>
    </div>
    <div class="profile-stat-box">
      <span class="profile-stat-val" style="color:var(--text-primary);">${stats.total.toLocaleString('en-US')}</span>
      <span class="profile-stat-label">${icon('list', 'icon-small')} Anime</span>
    </div>
    <div class="profile-stat-box">
      <span class="profile-stat-val" style="color:var(--gold);">${stats.avg_score || '—'}</span>
      <span class="profile-stat-label">${icon('star', 'icon-small')} Avg Score</span>
    </div>
  </div>

  <div class="tabs-container u-tabs">
    <div class="tabs">
      <button class="tab-btn active" data-tab="animelist">Anime List</button>
      <button class="tab-btn" data-tab="favorites">Favorites (${favs.length})</button>
      <button class="tab-btn" data-tab="followers">Followers (${followerCount})</button>
      <button class="tab-btn" data-tab="following">Following (${followingCount})</button>
    </div>

    <div id="tab-animelist" class="tab-content active">
      ${recentList.items.length === 0 && listPage === 1 && !filterStatus ? `
      <div class="flex-center" style="padding:3rem;flex-direction:column;gap:1rem;"><span style="font-size:2.5rem;">📋</span><p class="text-muted">No anime in list yet.</p></div>` : `
      <div class="flex flex-wrap mb-2" style="gap:6px;">
        <a href="${siteUrl}/u/${h(username)}" class="genre-tag" style="${filterStatus === '' ? 'border-color:var(--accent);color:var(--accent)' : ''}">All (${stats.total})</a>
        ${['watching', 'completed', 'plan_to_watch', 'on_hold', 'dropped'].map((s) => {
          const cnt = (stats as any)[s];
          if (!cnt) return '';
          const label = s.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
          return `<a href="${siteUrl}/u/${h(username)}?status=${s}" class="genre-tag" style="${filterStatus === s ? 'border-color:var(--accent);color:var(--accent)' : ''}">${label} (${cnt})</a>`;
        }).join('')}
      </div>
      ${recentList.items.length === 0 ? `<div class="flex-center" style="padding:3rem;flex-direction:column;gap:1rem;"><span style="font-size:2.5rem;">📋</span><p class="text-muted">No anime in this category yet.</p></div>` : `
      <div class="card" style="overflow-x:auto;">
        <div class="data-table-wrap"><table class="data-table">
          <thead><tr><th>#</th><th>Anime</th><th>Status</th><th>Progress</th><th>Score</th><th>Updated</th>${isOwn ? '<th>Actions</th>' : ''}</tr></thead>
          <tbody>
            ${recentList.items.map((item, i) => {
              const meta = cardMeta.get(item.anime_id);
              const eps = (meta?.airedInfo?.total ?? item.anime_episodes) ?? 0;
              const jt = JSON.stringify(item.anime_title ?? '');
              const ji = JSON.stringify(item.anime_image ?? '');
              return `
            <tr onclick="window.location.href='${siteUrl}/anime?id=${item.anime_id}'" style="cursor:pointer;" data-anime-id="${item.anime_id}">
              <td class="text-muted">${(listPage - 1) * ITEMS_PER_PAGE + i + 1}</td>
              <td><div class="flex" style="gap:10px;align-items:center;">
                ${item.anime_image ? `<img src="${h(item.anime_image)}" alt="" style="width:36px;height:50px;object-fit:cover;border-radius:4px;flex-shrink:0;">` : ''}
                <span style="font-weight:500;color:var(--text-primary);font-size:0.88rem;">${h(item.anime_title ?? '')}</span>
              </div></td>
              <td data-cell="status">${statusBadge(item.status)}</td>
              <td data-cell="progress">
                <span style="font-size:0.82rem;color:var(--text-secondary);">${item.episodes_watched}${eps ? '/' + eps : ''}</span>
                ${eps > 0 ? `<div class="progress-bar" style="width:70px;"><div class="progress-fill" style="width:${Math.min(100, Math.round((item.episodes_watched / eps) * 100))}%"></div></div>` : ''}
              </td>
              <td data-cell="score">${item.score ? `<span style="color:var(--gold);font-weight:600;">⭐ ${item.score}</span>` : `<span class="text-muted">—</span>`}</td>
              <td data-cell="updated" style="font-size:0.78rem;color:var(--text-muted);">${timeAgo(item.updated_at)}</td>
              ${isOwn ? `<td onclick="event.stopPropagation()"><button class="btn btn-ghost btn-sm" onclick='event.stopPropagation(); addToList(${item.anime_id}, ${jt}, ${ji}, ${eps})'>✏️ Edit</button></td>` : ''}
            </tr>`;
            }).join('')}
          </tbody>
        </table></div>
      </div>
      ${recentList.pages > 1 ? renderUserListPagination(siteUrl, username, filterStatus, listPage, recentList.pages, recentList.total) : ''}`}`}
    </div>

    <div id="tab-favorites" class="tab-content">
      ${!canViewFavorites ? privateNotice('favorites') : favs.length === 0 ? `<div class="flex-center" style="padding:3rem;flex-direction:column;gap:1rem;"><span style="font-size:2.5rem;">♡</span><p class="text-muted">No favorites yet.</p></div>`
        : `<div class="anime-grid">${favs.map((fav: any) => renderAnimeCard({
            mal_id: fav.anime_id, title: fav.anime_title, title_english: fav.anime_title,
            images: { jpg: { image_url: fav.anime_image, large_image_url: fav.anime_image } }, type: '', score: null, episodes: 0,
          } as any, siteUrl, null, cardMeta.get(fav.anime_id))).join('')}</div>`}
    </div>

    <div id="tab-followers" class="tab-content">
      ${!canViewFollowers ? privateNotice('followers list') : followers.length === 0 ? `<div class="flex-center" style="padding:3rem;flex-direction:column;gap:1rem;"><span style="font-size:2.5rem;">👥</span><p class="text-muted">No followers yet.</p></div>`
        : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem;">${followers.map((u) => renderUserCard(u, modalUserBadges, siteUrl)).join('')}</div>`}
    </div>
    <div id="tab-following" class="tab-content">
      ${!canViewFollowing ? privateNotice('following list') : following.length === 0 ? `<div class="flex-center" style="padding:3rem;flex-direction:column;gap:1rem;"><span style="font-size:2.5rem;">👤</span><p class="text-muted">Not following anyone yet.</p></div>`
        : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem;">${following.map((u) => renderUserCard(u, modalUserBadges, siteUrl)).join('')}</div>`}
    </div>
  </div>
</div>

<div class="modal-overlay" id="followers-modal">
  <div class="modal" style="max-width:400px;">
    <div class="modal-header"><h3>👥 Followers (${followerCount})</h3><button class="modal-close">✕</button></div>
    <div class="modal-body" id="followers-list" style="padding:0.5rem;max-height:420px;overflow-y:auto;">
      ${!canViewFollowers ? privateNotice('followers list') : followers.length === 0 ? `<p class="text-muted text-center" style="padding:1.5rem;">No followers yet.</p>` : followers.map((u) => renderModalUserRow(u, modalUserBadges, siteUrl, 'Followed')).join('')}
      ${canViewFollowers ? `<div id="followers-loader" style="text-align:center;padding:10px;display:none;color:var(--text-muted);font-size:0.85rem;">Loading…</div>` : ''}
    </div>
  </div>
</div>
<div class="modal-overlay" id="following-modal">
  <div class="modal" style="max-width:400px;">
    <div class="modal-header"><h3>👤 Following (${followingCount})</h3><button class="modal-close">✕</button></div>
    <div class="modal-body" id="following-list" style="padding:0.5rem;max-height:420px;overflow-y:auto;">
      ${!canViewFollowing ? privateNotice('following list') : following.length === 0 ? `<p class="text-muted text-center" style="padding:1.5rem;">Not following anyone.</p>` : following.map((u) => renderModalUserRow(u, modalUserBadges, siteUrl, 'Following since')).join('')}
      ${canViewFollowing ? `<div id="following-loader" style="text-align:center;padding:10px;display:none;color:var(--text-muted);font-size:0.85rem;">Loading…</div>` : ''}
    </div>
  </div>
</div>

<script>
(function () {
  const PROFILE_ID = ${profileId};
  const CAN_VIEW = { followers: ${canViewFollowers ? 'true' : 'false'}, following: ${canViewFollowing ? 'true' : 'false'} };
  const state = {
    followers: { offset: ${followers.length}, loading: false, done: ${followers.length < 12 ? 'true' : 'false'} },
    following: { offset: ${following.length}, loading: false, done: ${following.length < 12 ? 'true' : 'false'} },
  };
  function makeUserRow(u, label) {
    const initial = u.username.charAt(0).toUpperCase();
    const avatar  = u.avatar_url ? \`<img src="\${u.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">\` : initial;
    const time = label === 'followers' ? \`Followed \${u.created_at}\` : \`Following since \${u.created_at}\`;
    return \`<a href="/u/\${encodeURIComponent(u.username)}" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:var(--radius-md);text-decoration:none;transition:var(--trans);" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
      <div class="nav-avatar" style="width:38px;height:38px;font-size:1rem;flex-shrink:0;">\${avatar}</div>
      <div><div style="color:var(--text-primary);font-weight:500;font-size:0.9rem;">\${u.username}</div><div class="text-muted" style="font-size:0.78rem;">\${time}</div></div>
    </a>\`;
  }
  async function loadMore(type) {
    if (!CAN_VIEW[type]) return;
    const s = state[type];
    if (s.loading || s.done) return;
    s.loading = true;
    const list = document.getElementById(\`\${type}-list\`);
    const loader = document.getElementById(\`\${type}-loader\`);
    loader.style.display = 'block';
    try {
      const url = \`/api/follow.php?action=list&type=\${type}&user_id=\${PROFILE_ID}&offset=\${s.offset}\`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.users.length) {
        data.users.forEach(u => {
          const tmp = document.createElement('div');
          tmp.innerHTML = makeUserRow(u, type);
          list.insertBefore(tmp.firstElementChild, loader);
        });
        s.offset += data.users.length;
        if (!data.has_more) s.done = true;
      } else { s.done = true; }
    } catch (e) {}
    loader.style.display = 'none';
    s.loading = false;
  }
  function attachScroll(type) {
    const list = document.getElementById(\`\${type}-list\`);
    if (!list) return;
    list.addEventListener('scroll', () => {
      if (list.scrollTop + list.clientHeight >= list.scrollHeight - 60) loadMore(type);
    });
  }
  document.addEventListener('DOMContentLoaded', () => { attachScroll('followers'); attachScroll('following'); });
})();

async function toggleFollow(userId, btn) {
  btn.disabled = true;
  const fd = new FormData();
  fd.append('action', 'follow');
  fd.append('user_id', userId);
  try {
    const res = await fetch('/api/follow.php', {method:'POST', body:fd});
    const data = await res.json();
    if (data.success) {
      btn.textContent = data.following ? '✓ Following' : '+ Follow';
      btn.className = data.following ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm';
      showToast(data.message, 'success');
      document.querySelectorAll('.follower-count').forEach(s => { s.textContent = parseInt(s.textContent) + (data.following ? 1 : -1); });
    } else {
      showToast(data.message, 'error');
    }
  } catch(e) { showToast('Error', 'error'); }
  btn.disabled = false;
}
</script>`;

  html += renderFooter({ siteUrl, currentUser: layoutUser });
  await session.save(c, lifetime);
  return c.html(html);
});

function renderUserCard(u: any, badgeMap: Record<number, any[]>, siteUrl: string): string {
  return `
<a href="${siteUrl}/u/${h(u.username)}" class="card" style="padding:1rem;display:flex;align-items:center;gap:10px;text-decoration:none;">
  <div class="nav-avatar" style="width:44px;height:44px;font-size:1.1rem;flex-shrink:0;">
    ${u.avatar_url ? `<img src="${h(u.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : h(u.username.charAt(0).toUpperCase())}
  </div>
  <div style="min-width:0;">
    <div class="username-with-badges" style="color:var(--text-primary);font-weight:500;font-size:0.9rem;">${h(u.username)}${Badge.renderList(badgeMap[u.id] ?? [])}</div>
    ${u.bio ? `<div class="text-muted" style="font-size:0.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${h(u.bio)}</div>` : ''}
  </div>
</a>`;
}

function renderModalUserRow(u: any, badgeMap: Record<number, any[]>, siteUrl: string, timeLabel: string): string {
  return `
<a href="${siteUrl}/u/${h(u.username)}" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:var(--radius-md);text-decoration:none;transition:var(--trans);" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
  <div class="nav-avatar" style="width:38px;height:38px;font-size:1rem;flex-shrink:0;">
    ${u.avatar_url ? `<img src="${h(u.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : h(u.username.charAt(0).toUpperCase())}
  </div>
  <div>
    <div class="username-with-badges" style="color:var(--text-primary);font-weight:500;font-size:0.9rem;">${h(u.username)}${Badge.renderList(badgeMap[u.id] ?? [])}</div>
    <div class="text-muted" style="font-size:0.78rem;">${timeLabel} ${timeAgo(u.created_at)}</div>
  </div>
</a>`;
}

export function renderUserListPagination(siteUrl: string, username: string, filterStatus: string, page: number, pages: number, total: number): string {
  let baseUrl = `${siteUrl}/u/${h(username)}?`;
  if (filterStatus) baseUrl += `status=${encodeURIComponent(filterStatus)}&`;
  baseUrl += 'page=';

  const rangeStart = Math.max(1, page - 2);
  const rangeEnd = Math.min(pages, page + 2);
  let out = '<div class="pagination">';
  if (page > 1) out += `<a href="${baseUrl}${page - 1}">‹</a>`;
  if (rangeStart > 1) {
    out += `<a href="${baseUrl}1">1</a>`;
    if (rangeStart > 2) out += `<span style="border:none;background:none;width:auto;padding:0 4px;">…</span>`;
  }
  for (let i = rangeStart; i <= rangeEnd; i++) out += `<a href="${baseUrl}${i}" class="${i === page ? 'current' : ''}">${i}</a>`;
  if (rangeEnd < pages) {
    if (rangeEnd < pages - 1) out += `<span style="border:none;background:none;width:auto;padding:0 4px;">…</span>`;
    out += `<a href="${baseUrl}${pages}">${pages}</a>`;
  }
  if (page < pages) out += `<a href="${baseUrl}${page + 1}">›</a>`;
  out += '</div>';
  out += `<p class="text-center text-muted" style="font-size:0.82rem;margin-top:-1rem;">Page ${page} of ${pages} · ${total.toLocaleString('en-US')} total entries</p>`;
  return out;
}

// ── api/follow.php ─────────────────────────────────────────────────────────
userRoutes.on(['GET', 'POST'], '/api/follow.php', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');

  if (!auth.check()) {
    await session.save(c, lifetime);
    return c.json({ success: false, message: 'Not logged in.' }, 401);
  }
  const userId = session.user_id!;
  const body = c.req.method === 'POST' ? await c.req.parseBody() : {};
  const action = (body.action as string) ?? c.req.query('action') ?? '';

  if (action === 'follow') {
    const targetId = parseInt((body.user_id as string) ?? '0', 10) || 0;
    if (!targetId) { await session.save(c, lifetime); return c.json({ success: false, message: 'Invalid user.' }); }
    const target = await db.fetchOne('SELECT id FROM users WHERE id=? AND is_active=1', [targetId]);
    if (!target) { await session.save(c, lifetime); return c.json({ success: false, message: 'User not found.' }); }
    const result = await Follow.toggle(db, userId, targetId);
    await session.save(c, lifetime);
    return c.json(result);
  }

  if (action === 'status') {
    const targetId = parseInt(c.req.query('user_id') ?? '0', 10) || 0;
    const isFollowingRes = await Follow.isFollowing(db, userId, targetId);
    await session.save(c, lifetime);
    return c.json({ success: true, following: isFollowingRes, followers: await Follow.followerCount(db, targetId), following_count: await Follow.followingCount(db, targetId) });
  }

  if (action === 'list') {
    const targetId = parseInt(c.req.query('user_id') ?? '0', 10) || 0;
    const type = c.req.query('type') ?? '';
    const offset = Math.max(0, parseInt(c.req.query('offset') ?? '0', 10) || 0);
    const limit = 12;
    if (!targetId || (type !== 'followers' && type !== 'following')) {
      await session.save(c, lifetime);
      return c.json({ success: false, message: 'Invalid params.' });
    }
    const users = type === 'followers' ? await Follow.getFollowers(db, targetId, limit, offset) : await Follow.getFollowing(db, targetId, limit, offset);
    await session.save(c, lifetime);
    return c.json({ success: true, users, has_more: users.length === limit });
  }

  await session.save(c, lifetime);
  return c.json({ success: false, message: 'Unknown action.' }, 400);
});
