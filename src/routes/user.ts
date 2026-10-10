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
  const equippedCosmetics = await db.fetchAll<{cosmetic_type:string;cosmetic_value:string}>(
    'SELECT c.cosmetic_type,c.cosmetic_value FROM points_inventory i JOIN points_catalog c ON c.id=i.item_id WHERE i.user_id=? AND i.equipped=1',
    [profileId]
  ).catch(() => []);
  const cosmeticValue = (type:string) => equippedCosmetics.find(x => x.cosmetic_type === type)?.cosmetic_value ?? '';
  const avatarFrame = cosmeticValue('avatar_frame');
  const profileBackground = cosmeticValue('profile_background');
  const profileBackgroundKey = profileBackground.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const nameStyle = cosmeticValue('name_style');
  const profileFlair = cosmeticValue('flair');
  const profileEffect = cosmeticValue('profile_effect');
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

${profileBackground === 'sakura' ? `<div class="profile-sakura-petals" aria-hidden="true">${Array.from({ length: 22 }, (_, i) => `<span class="profile-sakura-petal" style="--petal-i:${i};--petal-x:${(i * 47 + 11) % 100}%;--petal-dur:${9 + (i * 7 % 10)}s;--petal-delay:-${(i * 13 % 19)}s;--petal-drift:${((i * 17) % 81) - 40}px;--petal-size:${7 + (i * 5 % 9)}px"></span>`).join('')}</div>` : ''}

${profileBackgroundKey === 'midnight_grid' || profileBackgroundKey === 'midnightgrid' || profileBackgroundKey === 'midnight' ? `<style>
.profile-midnight-grid{position:fixed;inset:0;z-index:3;overflow:hidden;pointer-events:none;contain:strict;opacity:.96;isolation:isolate}
.profile-midnight-grid:before{content:"";position:absolute;left:-35%;right:-35%;bottom:-4%;height:112%;background-image:linear-gradient(rgba(163,145,255,.68) 1px,transparent 1px),linear-gradient(90deg,rgba(104,164,255,.62) 1px,transparent 1px),linear-gradient(rgba(145,126,255,.2) 2px,transparent 2px),linear-gradient(90deg,rgba(92,151,255,.18) 2px,transparent 2px);background-size:38px 38px,38px 38px,190px 190px,190px 190px;background-position:center center;transform:perspective(390px) rotateX(66deg);transform-origin:center bottom;mask-image:linear-gradient(to top,rgba(0,0,0,1) 0%,rgba(0,0,0,.98) 48%,rgba(0,0,0,.72) 76%,transparent 100%);filter:drop-shadow(0 0 8px rgba(109,94,255,.7));animation:profile-grid-drift 11s linear infinite}
.profile-midnight-grid:after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 78%,rgba(105,61,255,.28),transparent 48%),radial-gradient(ellipse at 15% 58%,rgba(38,111,255,.18),transparent 38%),radial-gradient(ellipse at 85% 45%,rgba(0,219,255,.12),transparent 34%),linear-gradient(to bottom,rgba(5,7,17,.06),transparent 35%,rgba(5,7,17,.05));animation:profile-grid-glow 7s ease-in-out infinite alternate}
.profile-grid-light{position:absolute;left:var(--grid-light-x);top:var(--grid-light-y);width:3px;height:3px;border-radius:50%;background:#fff;box-shadow:0 0 9px 3px rgba(151,115,255,.95),0 0 24px 7px rgba(75,128,255,.52);opacity:0;animation:profile-grid-light var(--grid-light-duration) ease-in-out var(--grid-light-delay) infinite}
@keyframes profile-grid-drift{0%{background-position:center 0,center 0,center 0,center 0}100%{background-position:center 38px,center 38px,center 190px,center 190px}}
@keyframes profile-grid-glow{0%{opacity:.72;filter:hue-rotate(-12deg)}100%{opacity:1;filter:hue-rotate(18deg)}}
@keyframes profile-grid-light{0%,12%,100%{opacity:0;transform:translateY(-8px) scale(.7)}22%{opacity:1;transform:translateY(0) scale(1.25)}48%{opacity:.45;transform:translateY(16px) scale(1)}65%{opacity:0;transform:translateY(25px) scale(.7)}}
.profile-midnight-falling-stars{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:4;contain:strict}
.profile-midnight-falling-star{position:absolute;top:-12%;left:var(--fall-x);width:2px;height:2px;border-radius:50%;background:#fff;opacity:0;box-shadow:0 0 5px 1px rgba(190,210,255,.9);animation:profile-midnight-fall var(--fall-duration) linear var(--fall-delay) infinite}
.profile-midnight-falling-star:after{content:"";position:absolute;top:-24px;left:0;width:1px;height:24px;background:linear-gradient(to top,transparent,rgba(151,174,255,.95));transform:translateX(.5px)}
@keyframes profile-midnight-fall{0%{transform:translate3d(0,-8vh,0);opacity:0}8%{opacity:.85}82%{opacity:.6}100%{transform:translate3d(var(--fall-drift),112vh,0);opacity:0}}
@media(max-width:600px){.profile-midnight-grid{opacity:.9}.profile-midnight-grid:before{background-size:30px 30px,30px 30px,150px 150px,150px 150px;left:-60%;right:-60%;height:92%;bottom:-3%;transform:perspective(330px) rotateX(68deg)}}</style>` : ''}

${profileBackgroundKey === 'constellation' || profileBackgroundKey === 'constellations' || profileBackgroundKey === 'starry_night' ? `<style>
.profile-starry-sky{position:fixed;inset:0;z-index:4;overflow:hidden;pointer-events:none;contain:strict;opacity:.76;mix-blend-mode:screen}
.profile-starry-sky:before,.profile-starry-sky:after{content:"";position:absolute;inset:-18%;pointer-events:none}
.profile-starry-sky:before{background:radial-gradient(ellipse at 78% 18%,rgba(130,111,255,.17),transparent 31%),radial-gradient(ellipse at 16% 43%,rgba(83,139,255,.12),transparent 36%),radial-gradient(ellipse at 70% 78%,rgba(196,118,255,.1),transparent 32%);filter:blur(22px);animation:profile-nebula-drift 32s ease-in-out infinite alternate}
.profile-starry-sky:after{background:linear-gradient(118deg,transparent 25%,rgba(113,126,255,.045) 43%,rgba(218,163,255,.07) 50%,rgba(99,173,255,.035) 57%,transparent 73%);filter:blur(26px);transform:translateX(-18%);animation:profile-aurora-drift 38s ease-in-out infinite alternate}
.profile-starry-star{position:absolute;left:var(--star-x);top:var(--star-y);width:var(--star-size);height:var(--star-size);border-radius:50%;background:#eaf0ff;opacity:var(--star-opacity,.48);box-shadow:0 0 4px rgba(184,205,255,.48);animation:profile-star-twinkle var(--star-duration) ease-in-out var(--star-delay) infinite alternate}
@keyframes profile-star-twinkle{0%{opacity:.16;transform:scale(.8)}100%{opacity:.62;transform:scale(1.25)}}
@keyframes profile-nebula-drift{0%{transform:translate3d(-1.5%,-1%,0) scale(1)}100%{transform:translate3d(1.5%,1%,0) scale(1.08)}}
@keyframes profile-aurora-drift{0%{transform:translate3d(-8%,-2%,0) rotate(-7deg)}100%{transform:translate3d(8%,2%,0) rotate(-2deg)}}
.profile-starry-moon{position:absolute;top:14%;right:9%;width:clamp(46px,6vw,78px);aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff 0%,#e4e8ff 34%,#b6c3ff 68%,rgba(151,168,255,.4) 100%);box-shadow:0 0 18px rgba(177,190,255,.3),0 0 58px rgba(145,151,255,.16);opacity:.62}
.profile-starry-moon:after{content:"";position:absolute;inset:-2px;border-radius:50%;background:#111327;transform:translate(28%,-13%);opacity:.94}
.profile-falling-star{position:absolute;top:-12%;left:var(--fall-x);width:2px;height:2px;border-radius:50%;background:#fff;opacity:0;box-shadow:0 0 5px 1px rgba(199,215,255,.8);animation:profile-falling-star var(--fall-duration) linear var(--fall-delay) infinite}
.profile-falling-star:after{content:"";position:absolute;top:-22px;left:0;width:1px;height:22px;background:linear-gradient(to top,transparent,rgba(194,211,255,.8));transform:translateX(.5px)}
@keyframes profile-falling-star{0%{transform:translate3d(0,-8vh,0);opacity:0}8%{opacity:.72}86%{opacity:.5}100%{transform:translate3d(var(--fall-drift),112vh,0);opacity:0}}
.profile-shooting-star{position:absolute;top:19%;left:-12%;width:76px;height:1px;opacity:0;background:linear-gradient(90deg,transparent,rgba(210,225,255,.7),#fff);box-shadow:0 0 5px rgba(170,200,255,.55);transform:rotate(-25deg);animation:profile-shooting-star 19s ease-out 5s infinite}
.profile-shooting-star--second{top:43%;width:58px;animation-delay:14s;animation-duration:24s}
@keyframes profile-shooting-star{0%,82%,100%{opacity:0;transform:translate3d(0,0,0) rotate(-25deg)}84%{opacity:.65}91%{opacity:0;transform:translate3d(115vw,42vh,0) rotate(-25deg)}}
.u-banner.u-banner-fallback{background:#000!important;background-image:none!important}

@media(max-width:600px){.profile-fullbleed-hero .u-banner{height:150px!important;min-height:150px!important;max-height:150px!important}}
@media(prefers-reduced-motion:reduce){.profile-starry-star,.profile-starry-sky:before,.profile-starry-sky:after,.profile-shooting-star,.profile-falling-star{animation:none}.profile-shooting-star,.profile-falling-star{display:none}}
</style>` : ''}

${profileBackgroundKey === 'midnight_grid' || profileBackgroundKey === 'midnightgrid' || profileBackgroundKey === 'midnight' ? `<div class="profile-midnight-grid" aria-hidden="true">${Array.from({length:28},(_,i)=>`<span class="profile-grid-light" style="--grid-light-x:${(i*29+9)%96}%;--grid-light-y:${(i*43+12)%82}%;--grid-light-duration:${5+(i*7%8)}s;--grid-light-delay:-${(i*3)%17}s"></span>`).join('')}</div>` : ''}

${profileBackgroundKey === 'midnight_grid' || profileBackgroundKey === 'midnightgrid' || profileBackgroundKey === 'midnight' ? `<div class="profile-midnight-falling-stars" aria-hidden="true">${Array.from({length:9},(_,i)=>`<span class="profile-midnight-falling-star" style="--fall-x:${(i*31+8)%96}%;--fall-drift:${((i*17)%90)-45}px;--fall-duration:${11+(i*7%12)}s;--fall-delay:-${(i*5)%21}s"></span>`).join('')}</div>` : ''}

${profileBackgroundKey === 'constellation' || profileBackgroundKey === 'constellations' || profileBackgroundKey === 'starry_night' ? `<div class="profile-starry-sky" aria-hidden="true"><span class="profile-starry-moon"></span>${Array.from({length:34},(_,i)=>`<span class="profile-starry-star" style="--star-x:${(i*37+13)%97}%;--star-y:${(i*61+17)%95}%;--star-size:${i%9===0?2:1}px;--star-opacity:${.18+(i%6)*.07};--star-duration:${3.5+(i*7%35)/10}s;--star-delay:-${(i*11%40)/10}s"></span>`).join('')}${Array.from({length:9},(_,i)=>`<span class="profile-falling-star" style="--fall-x:${(i*31+8)%96}%;--fall-drift:${((i*17)%90)-45}px;--fall-duration:${11+(i*7%12)}s;--fall-delay:-${(i*5)%21}s"></span>` ).join('')}<span class="profile-shooting-star"></span><span class="profile-shooting-star profile-shooting-star--second"></span></div>` : ''}

<div class="u-hero profile-fullbleed-hero" style="position:relative;left:auto;right:auto;transform:none;width:100vw;max-width:none;min-width:100vw;margin-left:calc(50% - 50vw);margin-right:calc(50% - 50vw);padding:0;overflow:visible;">
  <div class="u-banner${profileUser.banner_url ? '' : ' u-banner-fallback'}" style="display:block;width:100%;max-width:none;min-width:0;margin:0;box-sizing:border-box;background-position:center;background-size:cover;${profileUser.banner_url ? `background-image:url('${h(profileUser.banner_url)}');` : ''}" id="u-banner-el"></div>
</div>

<div class="container section" style="padding-top:0;">
  <div class="u-header" style="${profileEffect === 'sparkle' ? 'filter:drop-shadow(0 0 12px rgba(192,132,252,.12));' : ''}">
    <div class="u-avatar-wrap">
      <div class="nav-avatar u-avatar" style="${avatarFrame === 'gold' ? 'border:3px solid #e7c46a;box-shadow:0 0 14px rgba(231,196,106,.28);' : avatarFrame === 'sakura' ? 'border:3px solid #f0a6c7;box-shadow:0 0 12px rgba(240,166,199,.25);' : avatarFrame === 'neon' ? 'border:3px solid #62f5ff;box-shadow:0 0 14px rgba(98,245,255,.3);' : ''}">
        ${profileUser.avatar_url ? `<img src="${h(profileUser.avatar_url)}" alt="${h(profileUser.username)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : h(profileUser.username.charAt(0).toUpperCase())}
      </div>
      ${isProfileOwner ? `<span class="u-role-badge">OWNER</span>` : profileUser.role === 'admin' ? `<span class="u-role-badge">ADMIN</span>` : ''}
    </div>
    <div class="u-name-block">
      <h1 class="u-username username-with-badges" style="${nameStyle === 'gold' ? 'color:#e7c46a;text-shadow:0 0 12px rgba(231,196,106,.25);' : nameStyle === 'gradient' ? 'background:linear-gradient(90deg,#c084fc,#f0abfc,#818cf8);-webkit-background-clip:text;background-clip:text;color:transparent;' : ''}">${h(profileUser.username)}${Badge.renderList(profileBadges)}${profileUser.pronouns ? `<span class="u-pronouns">${h(profileUser.pronouns)}</span>` : ''}${profileFlair ? `<span style="display:inline-flex;vertical-align:middle;margin-left:8px;padding:3px 8px;border:1px solid var(--border);border-radius:999px;font:600 .68rem 'Exo 2',sans-serif;color:var(--accent-2);">${profileFlair === 'anime-fan' ? '♥ Anime Fan' : profileFlair === 'night-owl' ? '☾ Night Owl' : ''}</span>` : ''}</h1>
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

<style>
.profile-sakura-petals{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:4;contain:strict}
.profile-sakura-petal{position:absolute;top:-24px;left:var(--petal-x);width:var(--petal-size);height:calc(var(--petal-size)*.72);border-radius:100% 0 100% 0;background:radial-gradient(ellipse at 35% 35%,#fff4fa 0%,#ffb6d9 36%,#ff6fb4 68%,rgba(255,105,180,.25) 100%);box-shadow:0 0 5px rgba(255,145,205,.9),0 0 13px rgba(255,91,174,.55);opacity:0;transform:rotate(35deg);animation:profile-sakura-fall var(--petal-dur) linear var(--petal-delay) infinite}
@keyframes profile-sakura-fall{0%{transform:translate3d(0,-3vh,0) rotate(0deg);opacity:0}8%{opacity:.9}48%{transform:translate3d(var(--petal-drift),52vh,0) rotate(380deg);opacity:.78}88%{opacity:.72}100%{transform:translate3d(calc(var(--petal-drift)*-0.65),108vh,0) rotate(760deg);opacity:0}}
@media(prefers-reduced-motion:reduce){.profile-sakura-petal{animation:none;display:none}}
</style>
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
