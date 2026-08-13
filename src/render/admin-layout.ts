// Ports admin/header.php + admin/footer.php. Same deliberate change as the
// public layout: CSS/JS/icon-sprite served as static assets instead of
// readfile()'d into every response.
import { h } from '../lib/helpers';
import { icon } from '../lib/icons';
import { ICON_SPRITE } from '../lib/icon-sprite';

export interface AdminLayoutOptions {
  siteUrl: string;
  pageTitle: string;
  adminPage: string; // basename matching the nav links below
  isOwner: boolean;
  impersonating: { username: string } | null;
  queryRole?: string; // for highlighting "Admins" sub-link under Users
}

export function renderAdminHeader(o: AdminLayoutOptions): string {
  const active = (p: string) => (o.adminPage === p ? 'active' : '');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${h(o.pageTitle)} — AniVault Admin</title>
<link rel="stylesheet" href="${o.siteUrl}/assets/css/style.css">
<link rel="stylesheet" href="${o.siteUrl}/assets/css/admin.css">
<link rel="icon" type="image/png" href="${o.siteUrl}/assets/img/site-img/icon.png">
<script src="${o.siteUrl}/assets/js/app.js" defer></script>
</head>
<body>
<div id="toast-container"></div>
${ICON_SPRITE}

${o.impersonating ? `
<div style="position:sticky;top:0;z-index:99999;background:rgba(255,193,7,0.95);color:#000;padding:8px 20px;display:flex;align-items:center;justify-content:space-between;font-size:0.88rem;font-weight:600;gap:1rem;">
  <span>${icon('eye', 'icon-small')} You are viewing the site as <strong>${h(o.impersonating.username)}</strong></span>
  <a href="${o.siteUrl}/admin/impersonate.php?action=stop" style="background:#000;color:#fff;padding:4px 14px;border-radius:6px;text-decoration:none;font-size:0.82rem;">${icon('x', 'icon-small')} Stop Impersonating</a>
</div>` : ''}

<div class="admin-layout">
<aside class="admin-sidebar">
  <div class="admin-logo">${icon('shield', 'icon-medium')} Admin Panel</div>
  <button class="admin-sidebar-toggle">${icon('menu', 'icon-small')} Show Navigation</button>
  <nav class="admin-nav">
    <div class="nav-group">Dashboard</div>
    <a href="index.php" class="${active('index')}">${icon('home', 'icon-small')} Overview</a>
    <a href="activity.php" class="${active('activity')}">${icon('activity', 'icon-small')} Activity Log</a>
    <a href="analytics.php" class="${active('analytics')}">${icon('chart-bar', 'icon-small')} Analytics</a>
    <a href="watch_stats.php" class="${active('watch_stats')}">${icon('tv', 'icon-small')} Watch Stats</a>

    <div class="nav-group">Users</div>
    <a href="users.php" class="${o.adminPage === 'users' && o.queryRole !== 'admin' ? 'active' : ''}">${icon('users', 'icon-small')} All Users</a>
    <a href="users.php?role=admin" class="${o.adminPage === 'users' && o.queryRole === 'admin' ? 'active' : ''}">${icon('shield', 'icon-small')} Admins</a>
    <a href="badges.php" class="${active('badges')}">${icon('star', 'icon-small')} Badges</a>
    ${o.isOwner ? `
    <a href="username_fixer.php" class="${active('username_fixer')}">${icon('wrench', 'icon-small')} Username Fixer</a>
    <a href="merge_users.php" class="${active('merge_users')}">${icon('merge', 'icon-small')} Merge Accounts</a>` : ''}

    <div class="nav-group">Content</div>
    <a href="announcements.php" class="${active('announcements')}">${icon('megaphone', 'icon-small')} Announcements</a>
    <a href="banner.php" class="${active('banner')}">${icon('layout', 'icon-small')} Sitewide Banner</a>
    <a href="reviews.php" class="${active('reviews')}">${icon('star', 'icon-small')} Reviews</a>
    <a href="feedback.php" class="${active('feedback')}">${icon('message', 'icon-small')} Feedback</a>
    <a href="survey.php" class="${active('survey')}">${icon('chart-bar', 'icon-small')} Hosting Survey</a>
    <a href="episodes.php" class="${active('episodes')}">${icon('edit', 'icon-small')} Episode Overrides</a>
    <a href="videos.php" class="${active('videos')}">${icon('play', 'icon-small')} Episode Videos</a>
    <a href="stream_cache.php" class="${active('stream_cache')}">${icon('database', 'icon-small')} Stream Cache</a>
    <a href="ep_thumbnails.php" class="${active('ep_thumbnails')}">${icon('camera', 'icon-small')} EP Thumbnails</a>
    <a href="anime_images.php" class="${active('anime_images')}">${icon('upload', 'icon-small')} Anime Images</a>
    <a href="anime_banners.php" class="${active('anime_banners')}">${icon('camera', 'icon-small')} Anime Banners & Logos</a>
    <a href="home_banners.php" class="${active('home_banners')}">${icon('layout', 'icon-small')} Homepage Hero</a>
    <a href="heal_images.php" class="${active('heal_images')}">${icon('heal', 'icon-small')} Heal Images</a>

    <div class="nav-group">System</div>
    <a href="cache.php" class="${active('cache')}">${icon('database', 'icon-small')} Clear Cache</a>
    <div style="margin-top:auto;padding:1rem 1.5rem;border-top:1px solid var(--border);">
      <a href="${o.siteUrl}/">${icon('arrow-left', 'icon-small')} Back to Site</a>
    </div>
  </nav>
</aside>

<main class="admin-main">
<div id="toast-container"></div>`;
}

export function renderAdminFooter(siteUrl: string): string {
  return `
</main>
</div>
<script>
(function () {
  const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  function fmt(ts) {
    const nowSec = Date.now() / 1000;
    const diff   = Math.floor(nowSec - ts);
    const d      = new Date(ts * 1000);
    if (diff < 60)     return 'just now';
    if (diff < 3600)   return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400)  return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: userTz }).format(d);
  }
  function fmtFull(ts) {
    return new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: userTz }).format(new Date(ts * 1000));
  }
  function updateAll() {
    document.querySelectorAll('time.local-ts[data-ts]').forEach(el => {
      const ts = parseInt(el.getAttribute('data-ts'), 10);
      if (isNaN(ts)) return;
      el.textContent = el.dataset.full ? fmtFull(ts) : fmt(ts);
    });
  }
  updateAll();
  setInterval(updateAll, 60000);
})();
</script>
</body>
</html>`;
}
