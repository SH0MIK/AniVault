// Ports includes/header.php and includes/footer.php.
// Deliberate change from the PHP version: style.css/app.js/icons.svg are
// served as normal static assets (via Workers Assets, same URLs as before)
// instead of being read into the page with readfile() on every request.
// Same visual output, but cacheable by the browser/CDN instead of re-sent
// every page load. The icon sprite is still inlined in <head> though —
// that one's kept exactly as the PHP version did it, since same-page
// fragment `<use href="#icon-x">` references are what work reliably on
// older Android WebKit (relevant given the Oppo A15 rendering issues).
import { h } from '../lib/helpers';
import { icon } from '../lib/icons';
import { ICON_SPRITE } from '../lib/icon-sprite';
import { FOOTER_CSS } from './footer-css';

export interface CurrentUser {
  id: number;
  username: string;
  avatar_url: string | null;
  role: string;
}

export interface OgData {
  title?: string;
  description?: string;
  image?: string;
  image_width?: number;
  image_height?: number;
  url?: string;
  type?: string;
  site_name?: string;
}

export interface LayoutOptions {
  siteUrl: string;
  siteName: string;
  pageTitle?: string;
  pageDescription?: string;
  ogData?: OgData;
  currentPage: string; // basename without .php, e.g. "index", "browse"
  currentUser: CurrentUser | null;
  unreadCount: number;
  bannerEnabled?: boolean;
  bannerMessage?: string;
  bannerType?: 'info' | 'success' | 'warning' | 'error';
  requestUrl: string; // full request URL, for canonical / og:url fallback
}

const BANNER_COLORS: Record<string, string> = { info: 'rgba(33,150,243,.15)', success: 'rgba(76,175,80,.15)', warning: 'rgba(255,193,7,.15)', error: 'rgba(244,67,54,.15)' };
const BANNER_BORDERS: Record<string, string> = { info: 'rgba(33,150,243,.4)', success: 'rgba(76,175,80,.4)', warning: 'rgba(255,193,7,.4)', error: 'rgba(244,67,54,.4)' };
const BANNER_ICONS: Record<string, string> = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '🚨' };

export function renderHeader(o: LayoutOptions): string {
  const og = o.ogData;
  const ogBlock = og && og.title
    ? `
<meta property="og:title" content="${h(og.title)}">
<meta property="og:description" content="${h(og.description ?? '')}">
<meta property="og:image" content="${h(og.image ?? '')}">
<meta property="og:image:width" content="${og.image_width ?? 1200}">
<meta property="og:image:height" content="${og.image_height ?? 630}">
<meta property="og:image:alt" content="${h(og.title)}">
<meta property="og:url" content="${h(og.url ?? o.requestUrl)}">
<meta property="og:type" content="${h(og.type ?? 'website')}">
<meta property="og:site_name" content="${h(og.site_name ?? o.siteName)}">
<meta property="og:locale" content="en_US">
${og.type === 'video.episode' ? `
<meta property="og:video" content="${h(og.url ?? '')}">
<meta property="og:video:type" content="text/html">
<meta property="og:video:width" content="1280">
<meta property="og:video:height" content="720">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${h(og.title)}">
<meta name="twitter:description" content="${h(og.description ?? '')}">
<meta name="twitter:image" content="${h(og.image ?? '')}">
<meta name="twitter:site" content="@AniVault">
<meta name="theme-color" content="#7c3aed">`
    : `
<meta property="og:title" content="${h(o.siteName)}.co">
<meta property="og:description" content="Watch all anime subbed & dubbed Ad-free on Anivault!">
<meta property="og:site_name" content="${h(o.siteName)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${h(o.requestUrl)}">
<meta property="og:image" content="${o.siteUrl}/assets/img/site-img/embed.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${h(o.siteName)}.co">
<meta name="twitter:description" content="Watch all anime subbed & dubbed Ad-free on Anivault!">
<meta name="twitter:image" content="${o.siteUrl}/assets/img/site-img/embed.png">
<meta name="theme-color" content="#7c3aed">`;

  const bannerBlock = o.bannerEnabled && o.bannerMessage
    ? `<div style="padding:10px 20px;font-size:0.88rem;text-align:center;background:${BANNER_COLORS[o.bannerType ?? 'info']};border-bottom:1px solid ${BANNER_BORDERS[o.bannerType ?? 'info']};color:var(--text-primary);">${BANNER_ICONS[o.bannerType ?? 'info']} ${h(o.bannerMessage)}</div>`
    : '';

  const cu = o.currentUser;
  const userNavBlock = cu
    ? `
    <div class="dropdown" id="notif-dropdown-wrap">
      <div class="notif-bell ${o.unreadCount > 0 ? 'has-unread' : ''}" id="notif-bell" title="Notifications">
        ${icon('bell', 'icon-medium')}
        ${o.unreadCount > 0
          ? `<span class="notif-badge" id="notif-badge">${o.unreadCount > 99 ? '99+' : o.unreadCount}</span>`
          : `<span class="notif-badge" id="notif-badge" style="display:none;">0</span>`}
      </div>
      <div class="notif-dropdown" id="notif-panel">
        <div class="notif-dropdown-header">
          <h4>${icon('bell', 'icon-small')} NOTIFICATIONS</h4>
          <button onclick="markAllRead()" class="btn btn-ghost btn-sm" style="font-size:0.75rem;padding:3px 10px;">${icon('check', 'icon-small')} All read</button>
        </div>
        <div class="notif-list" id="notif-list"><div class="notif-empty"><span>${icon('bell', 'icon-large')}</span>Loading...</div></div>
        <div class="notif-footer"><a href="${o.siteUrl}/notifications">${icon('arrow-right', 'icon-small')} View all notifications →</a></div>
      </div>
    </div>
    <div class="dropdown">
      <div class="nav-avatar" title="${h(cu.username)}">
        ${cu.avatar_url ? `<img src="${h(cu.avatar_url)}" alt="avatar">` : icon('user', 'icon-medium')}
      </div>
      <div class="dropdown-menu">
        <a href="${o.siteUrl}/u/${h(cu.username)}">${icon('user', 'icon-small')} My Profile</a>
        <a href="${o.siteUrl}/profile">${icon('edit', 'icon-small')} Edit Profile</a>
        <a href="${o.siteUrl}/mylist">${icon('list', 'icon-small')} My List</a>
        <a href="${o.siteUrl}/announcements">${icon('megaphone', 'icon-small')} Announcements</a>
        <a href="${o.siteUrl}/favorites">${icon('heart', 'icon-small')} Favorites</a>
        <a href="${o.siteUrl}/importexport">${icon('box', 'icon-small')} Import / Export</a>
        ${(cu.role === 'admin' || cu.role === 'owner') ? `<div class="dropdown-divider"></div><a href="${o.siteUrl}/admin/index.php">${icon('shield', 'icon-small')} Admin Panel</a>` : ''}
        <div class="dropdown-divider"></div>
        <a href="${o.siteUrl}/logout">${icon('logout', 'icon-small')} Logout</a>
      </div>
    </div>`
    : `
    <button onclick="requireLogin('login')" class="btn btn-ghost btn-sm">${icon('login', 'icon-small')} Login</button>
    <button onclick="requireLogin('signup')" class="btn btn-primary btn-sm">${icon('plus', 'icon-small')} Sign Up</button>`;

  const active = (p: string) => (o.currentPage === p ? 'active' : '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${h(o.pageTitle ?? o.siteName)} — AniVault</title>
<meta name="description" content="${h(og?.description ?? o.pageDescription ?? 'Watch all anime subbed & dubbed Ad-free on Anivault!')}">
<meta name="application-name" content="AniVault">
<link rel="stylesheet" href="${o.siteUrl}/assets/css/style.css">
<link rel="stylesheet" href="${o.siteUrl}/assets/css/anivexa-theme.css?v=2">
<link rel="icon" type="image/png" href="${o.siteUrl}/assets/img/site-img/icon.png">
<link rel="canonical" href="${h(og?.url ?? o.requestUrl)}">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "AniVault",
  "url": "https://www.anivault.co",
  "description": "Watch all anime subbed & dubbed Ad-free on Anivault!"
}
</script>
<script>window.__siteUrl = '${o.siteUrl}';</script>
<script src="${o.siteUrl}/assets/js/app.js" defer></script>
${ogBlock}
<style>
#av-page-loader{position:fixed;inset:0;z-index:99999;background:#0a0a0f;display:flex;justify-content:center;align-items:center;}
#av-page-loader.av-loader-hidden{opacity:0;visibility:hidden;pointer-events:none;transition:opacity .4s ease,visibility .4s ease;}
</style>
<script>
(function(){
  function getLoader(){ return document.getElementById('av-page-loader'); }

  function dismissLoader(){
    var l=getLoader();
    if(!l)return;
    l._done=true;
    l.classList.add('av-loader-hidden');
    clearTimeout(l._safety);
  }

  // Kept separate from dismissLoader so a click can re-show it even after
  // this page's own load already hid it. The node is never removed from
  // the DOM (unlike the old version) specifically so it stays available
  // to be re-shown here.
  function showLoader(){
    var l=getLoader();
    if(!l)return;
    l._done=false;
    l.classList.remove('av-loader-hidden');
    // Safety net: if the click/submit gets cancelled somewhere (validation
    // error, confirm() decline, etc.) and no real navigation happens,
    // don't leave the user stuck staring at the loader forever.
    clearTimeout(l._safety);
    l._safety=setTimeout(dismissLoader,8000);
  }

  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',dismissLoader); } else { dismissLoader(); }
  setTimeout(dismissLoader,3000);
  window.__dismissLoader=dismissLoader;
  window.__showLoader=showLoader;

  function isRealNav(a){
    if(!a) return false;
    if(a.target && a.target!=='' && a.target!=='_self') return false;
    if(a.hasAttribute('download')) return false;
    if(a.dataset && a.dataset.noLoader!==undefined) return false;
    var href=a.getAttribute('href');
    if(!href || href.charAt(0)==='#') return false;
    if(/^(javascript:|mailto:|tel:)/i.test(href)) return false;
    try{
      var url=new URL(href, window.location.href);
      if(url.origin!==window.location.origin) return false;
      // Same path+query, only the #hash differs => in-page jump, not a real load.
      if(url.pathname===window.location.pathname && url.search===window.location.search && url.hash) return false;
    }catch(_e){ return false; }
    return true;
  }

  // Capture phase so this runs before any handler's stopPropagation() can
  // hide the click from us (e.g. the dropdown-menu click-outside guard).
  // The actual "did something cancel this?" check happens a tick later,
  // once every bubble-phase handler (including AJAX forms/links that call
  // preventDefault) has had a chance to run.
  document.addEventListener('click', function(e){
    if(e.button!==0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if(!isRealNav(a)) return;
    setTimeout(function(){ if(!e.defaultPrevented) showLoader(); }, 0);
  }, true);

  document.addEventListener('submit', function(e){
    var f=e.target;
    if(!(f instanceof HTMLFormElement)) return;
    if(f.target && f.target!=='' && f.target!=='_self') return;
    if(f.dataset && f.dataset.noLoader!==undefined) return;
    setTimeout(function(){ if(!e.defaultPrevented) showLoader(); }, 0);
  }, true);

  // Back/forward restored straight from bfcache without a real reload —
  // make sure a loader left visible before navigating away doesn't linger.
  window.addEventListener('pageshow', function(e){ if(e.persisted) dismissLoader(); });
})();
</script>
</head>
<body>
${ICON_SPRITE}
<div id="av-page-loader">
  <div class="av-loader">
    <div class="particle p1"></div><div class="particle p2"></div><div class="particle p3"></div>
    <div class="logo-wrap"><img src="${o.siteUrl}/assets/img/site-img/logo.png" class="logo" alt="AniVault"></div>
  </div>
</div>
${bannerBlock}
<div id="toast-container"></div>

<div class="chat-widget" id="chat-widget">
  <button class="chat-fab" id="chat-fab" aria-label="Open community chat" title="Community Chat">
    ${icon('message', 'icon-medium')}
    <span class="chat-fab-badge" id="chat-fab-badge" style="display:none;">0</span>
  </button>
  <div class="chat-panel" id="chat-panel">
    <div class="chat-panel-header">
      <h4>${icon('message', 'icon-small')} Community Chat <span class="chat-online-count" id="chat-online-count" style="display:none;"><span class="chat-online-dot"></span><span id="chat-online-num">0</span></span></h4>
      <button class="chat-minimize" id="chat-minimize" aria-label="Close chat" title="Close">${icon('x', 'icon-small')}</button>
    </div>
    <div class="chat-messages" id="chat-messages">
      <button class="chat-load-more" id="chat-load-more" style="display:none;">Load older messages</button>
      <div class="chat-empty" id="chat-empty">${icon('message', 'icon-large')}Loading chat…</div>
    </div>
    <div class="chat-typing-row" id="chat-typing-row" style="display:none;"></div>
    ${cu ? `
    <div class="chat-mention-suggest" id="chat-mention-suggest" style="display:none;"></div>
    <div class="chat-replying-bar" id="chat-replying-bar" style="display:none;">
      <div class="chat-replying-info">
        <span class="chat-replying-label">Replying to <span id="chat-replying-name"></span></span>
        <span class="chat-replying-text" id="chat-replying-text"></span>
      </div>
      <button type="button" class="chat-replying-cancel" id="chat-replying-cancel" aria-label="Cancel reply" title="Cancel reply">${icon('x', 'icon-small')}</button>
    </div>
    <form class="chat-input-row" id="chat-form">
      <textarea id="chat-input" class="chat-input" placeholder="Message everyone…" maxlength="500" rows="1"></textarea>
      <button type="submit" class="chat-send-btn" id="chat-send-btn" aria-label="Send">${icon('arrow-right', 'icon-small')}</button>
    </form>` : `
    <div class="chat-guest-bar" id="chat-guest-bar">
      <span>${icon('lock', 'icon-small')} Log in to join the conversation</span>
      <button type="button" class="btn btn-primary btn-sm" onclick="requireLogin('login')">${icon('login', 'icon-small')} Login</button>
    </div>`}
  </div>
</div>

<nav class="navbar">
  <button class="nav-hamburger" id="nav-hamburger" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>
  <a href="${o.siteUrl}/" class="nav-logo">Ani<span>Vault</span></a>
  <ul class="nav-links">
    <li><a href="${o.siteUrl}/" class="${active('index')}">${icon('home', 'icon-small')} Home</a></li>
    <li><a href="${o.siteUrl}/browse" class="${active('browse')}">${icon('search', 'icon-small')} Browse</a></li>
    <li><a href="${o.siteUrl}/seasonal" class="${active('seasonal')}">${icon('fire', 'icon-small')} Seasonal</a></li>
    <li><a href="${o.siteUrl}/top" class="${active('top')}">${icon('trophy', 'icon-small')} Top</a></li>
    <li><a href="${o.siteUrl}/schedule" class="${active('schedule')}">${icon('calendar', 'icon-small')} Schedule</a></li>

  </ul>
  <form id="nav-search-form" class="nav-search">
    <input type="text" placeholder="Search anime..." name="q" autocomplete="off">
    <button type="submit">${icon('search', 'icon-small')}</button>
  </form>
  <button class="nav-search-icon" id="nav-search-icon" aria-label="Search">${icon('search', 'icon-small')}</button>
  <div class="nav-user">${userNavBlock}</div>
</nav>

<script>
window.__loggedIn = ${cu ? 'true' : 'false'};
window.__siteUrl  = '${o.siteUrl}';
window.__currentPage = '${o.currentPage}';
</script>

<div class="mobile-menu" id="mobile-menu">
  <form class="mobile-search" id="mobile-search-form">
    <input type="text" placeholder="Search anime..." name="q" autocomplete="off">
    <button type="submit">${icon('search', 'icon-small')}</button>
  </form>
  <a href="${o.siteUrl}/" class="${active('index')}">${icon('home', 'icon-small')} Home</a>
  <a href="${o.siteUrl}/browse" class="${active('browse')}">${icon('search', 'icon-small')} Browse</a>
  <a href="${o.siteUrl}/seasonal" class="${active('seasonal')}">${icon('fire', 'icon-small')} Seasonal</a>
  <a href="${o.siteUrl}/top" class="${active('top')}">${icon('trophy', 'icon-small')} Top Anime</a>
  <a href="${o.siteUrl}/schedule" class="${active('schedule')}">${icon('calendar', 'icon-small')} Schedule</a>
  ${cu ? `
  <a href="${o.siteUrl}/mylist" class="${active('mylist')}">${icon('list', 'icon-small')} My List</a>
  <div class="mobile-menu-divider"></div>
  <a href="${o.siteUrl}/u/${h(cu.username)}">${icon('user', 'icon-small')} My Profile</a>
  <a href="${o.siteUrl}/profile">${icon('edit', 'icon-small')} Edit Profile</a>
  <a href="${o.siteUrl}/favorites">${icon('heart', 'icon-small')} Favorites</a>
  <a href="${o.siteUrl}/importexport">${icon('box', 'icon-small')} Import / Export</a>
  ${(cu.role === 'admin' || cu.role === 'owner') ? `<div class="mobile-menu-divider"></div><a href="${o.siteUrl}/admin/index.php">${icon('shield', 'icon-small')} Admin Panel</a>` : ''}
  <div class="mobile-menu-divider"></div>
  <a href="${o.siteUrl}/logout">${icon('logout', 'icon-small')} Logout</a>` : `
  <div class="mobile-menu-divider"></div>
  <button onclick="requireLogin('login');document.getElementById('mobile-menu').classList.remove('open');" class="btn btn-ghost" style="text-align:left;justify-content:flex-start;gap:0.5rem;width:100%;border-radius:0;padding:0.9rem 1.25rem;">${icon('login', 'icon-small')} Login</button>
  <button onclick="requireLogin('signup');document.getElementById('mobile-menu').classList.remove('open');" class="btn btn-primary" style="text-align:left;justify-content:flex-start;gap:0.5rem;width:100%;border-radius:0;padding:0.9rem 1.25rem;">${icon('plus', 'icon-small')} Sign Up</button>`}
</div>

<div class="search-popup-overlay" id="search-popup-overlay">
  <div class="search-popup" id="search-popup">
    <form id="search-popup-form" class="search-popup-form">
      <button type="button" class="search-popup-back" id="search-popup-close" aria-label="Close search">${icon('arrow-left', 'icon-medium')}</button>
      <input type="text" id="search-popup-input" placeholder="Search anime..." name="q" autocomplete="off">
      <button type="submit" class="search-popup-submit" aria-label="Submit search">${icon('search', 'icon-medium')}</button>
    </form>
  </div>
</div>

<div class="modal-overlay" id="add-to-list-modal">
  <div class="modal">
    <div class="modal-header">
      <h3 id="modal-title">${icon('plus', 'icon-small')} Add to List</h3>
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <button type="button" class="btn btn-danger btn-sm" id="modal-delete-btn" style="display:none; gap:0.3em; padding:0.3em 0.65em; font-size:0.8rem;" onclick="deleteFromList()">${icon('trash', 'icon-small')} Delete</button>
        <button class="modal-close">${icon('x', 'icon-medium')}</button>
      </div>
    </div>
    <div class="modal-body">
      <form id="add-to-list-form">
        <input type="hidden" name="anime_id" id="al_anime_id">
        <input type="hidden" name="anime_title" id="al_anime_title">
        <input type="hidden" name="anime_image" id="al_anime_image">
        <input type="hidden" name="anime_episodes" id="al_anime_eps">
        <input type="hidden" name="score" id="al_score" value="">
        <div class="form-group">
          <label class="form-label">Status</label>
          <select name="status" id="al_status" class="form-control">
            <option value="plan_to_watch">${icon('plantowatch', 'icon-small')} Planning</option>
            <option value="watching">${icon('watching', 'icon-small')} Watching</option>
            <option value="completed">${icon('completed', 'icon-small')} Completed</option>
            <option value="on_hold">${icon('onhold', 'icon-small')} On Hold</option>
            <option value="dropped">${icon('dropped', 'icon-small')} Dropped</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Episodes Watched</label>
          <input type="number" id="al_watched" name="episodes_watched" class="form-control" min="0" value="0" placeholder="0">
        </div>
        <div class="form-group">
          <label class="form-label">Score (1–10)</label>
          <div class="score-input" data-target="al_score">
            ${Array.from({ length: 10 }, (_, i) => i + 1).map((i) => `<button type="button" class="score-btn" data-score="${i}">${i}</button>`).join('')}
          </div>
        </div>
        <div class="flex gap-1">
          <button type="submit" class="btn btn-primary" style="flex:1">${icon('check', 'icon-small')} Save to List</button>
          <button type="button" class="btn btn-ghost" onclick="closeModal('add-to-list-modal')">${icon('x', 'icon-small')} Cancel</button>
        </div>
      </form>
    </div>
  </div>
</div>

<div class="modal-overlay" id="auth-modal" data-static="1">
  <div class="modal" style="max-width:460px;">
    <div class="auth-modal-tabs">
      <button class="auth-tab active" id="auth-tab-login" onclick="authSwitchTab('login')">Sign In</button>
      <button class="auth-tab" id="auth-tab-signup" onclick="authSwitchTab('signup')">Sign Up</button>
      <button class="modal-close" onclick="closeModal('auth-modal')" style="margin-left:auto;padding:0 1.25rem;">${icon('x', 'icon-medium')}</button>
    </div>
    <div class="modal-body auth-panel" id="auth-panel-login">
      <div class="text-center mb-3"><p class="text-muted" style="font-size:0.9rem;">Sign in to your AniVault account</p></div>
      <div id="auth-login-error" class="alert alert-error" style="display:none;"></div>
      <div id="auth-login-success" class="alert alert-success" style="display:none;"></div>
      <div style="margin-bottom:1.1rem;">
        <a id="auth-google-login-btn" href="#" onclick="authGoogleRedirect(event)" style="display:flex;align-items:center;justify-content:center;gap:10px;padding:11px 16px;border-radius:8px;font-weight:600;font-size:0.95rem;background:#fff;color:#3c4043;border:1px solid #dadce0;text-decoration:none;transition:box-shadow .15s;">
          <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
          Continue with Google
        </a>
      </div>
      <div style="margin-bottom:1.1rem;">
        <a id="auth-discord-login-btn" href="#" onclick="authDiscordRedirect(event)" style="display:flex;align-items:center;justify-content:center;gap:10px;padding:11px 16px;border-radius:8px;font-weight:600;font-size:0.95rem;background:#5865F2;color:#fff;border:none;text-decoration:none;transition:filter .15s;" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='brightness(1)'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.055a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
          Continue with Discord
        </a>
      </div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.1rem;color:var(--text-muted);font-size:0.82rem;"><div style="flex:1;height:1px;background:var(--border);"></div>or sign in with email<div style="flex:1;height:1px;background:var(--border);"></div></div>
      <div id="auth-login-form-wrap">
        <div class="form-group"><label class="form-label">${icon('user','icon-small')} Username or Email</label><input type="text" id="auth-login-username" class="form-control" placeholder="Username or email" autocomplete="username"></div>
        <div class="form-group"><label class="form-label">${icon('lock','icon-small')} Password</label><input type="password" id="auth-login-password" class="form-control" placeholder="Password" autocomplete="current-password"></div>
        <button class="btn btn-primary btn-block btn-lg" onclick="authSubmitLogin()">${icon('login','icon-small')} Sign In</button>
      </div>
      <p class="text-center mt-2" style="color:var(--text-secondary);font-size:0.88rem;">Don't have an account? <a href="#" onclick="authSwitchTab('signup');return false;">${icon('plus','icon-small')} Sign up free</a></p>
    </div>
    <div class="modal-body auth-panel" id="auth-panel-signup" style="display:none;">
      <div class="text-center mb-3"><p class="text-muted" style="font-size:0.9rem;">Join AniVault — track, rate &amp; discover anime</p></div>
      <div id="auth-signup-error" class="alert alert-error" style="display:none;"></div>
      <div id="auth-signup-success" class="alert alert-success" style="display:none;"></div>
      <div style="margin-bottom:1.1rem;">
        <a id="auth-google-signup-btn" href="#" onclick="authGoogleRedirect(event)" style="display:flex;align-items:center;justify-content:center;gap:10px;padding:11px 16px;border-radius:8px;font-weight:600;font-size:0.95rem;background:#fff;color:#3c4043;border:1px solid #dadce0;text-decoration:none;transition:box-shadow .15s;">
          <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
          Sign up with Google
        </a>
      </div>
      <div style="margin-bottom:1.1rem;">
        <a id="auth-discord-signup-btn" href="#" onclick="authDiscordRedirect(event)" style="display:flex;align-items:center;justify-content:center;gap:10px;padding:11px 16px;border-radius:8px;font-weight:600;font-size:0.95rem;background:#5865F2;color:#fff;border:none;text-decoration:none;transition:filter .15s;" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='brightness(1)'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.055a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
          Sign up with Discord
        </a>
      </div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.1rem;color:var(--text-muted);font-size:0.82rem;"><div style="flex:1;height:1px;background:var(--border);"></div>or create an account<div style="flex:1;height:1px;background:var(--border);"></div></div>
      <div id="auth-signup-form-wrap">
        <div class="form-group"><label class="form-label">${icon('user','icon-small')} Username</label><input type="text" id="auth-signup-username" class="form-control" placeholder="Choose a username" autocomplete="username" minlength="3" maxlength="50"></div>
        <div class="form-group"><label class="form-label">${icon('mail','icon-small')} Email</label><input type="email" id="auth-signup-email" class="form-control" placeholder="your@email.com" autocomplete="email"></div>
        <div class="form-group"><label class="form-label">${icon('lock','icon-small')} Password</label><input type="password" id="auth-signup-password" class="form-control" placeholder="Min. 6 characters" autocomplete="new-password" minlength="6"></div>
        <div class="form-group"><label class="form-label">${icon('check','icon-small')} Confirm Password</label><input type="password" id="auth-signup-confirm" class="form-control" placeholder="Repeat password" autocomplete="new-password"></div>
        <button class="btn btn-primary btn-block btn-lg" onclick="authSubmitSignup()">${icon('plus','icon-small')} Create Account</button>
      </div>
      <p class="text-center mt-2" style="color:var(--text-secondary);font-size:0.88rem;">Already have an account? <a href="#" onclick="authSwitchTab('login');return false;">${icon('login','icon-small')} Sign in</a></p>
    </div>
  </div>
</div>

<main class="page-content">`;
}

export function renderFooter(o: { siteUrl: string; currentUser: CurrentUser | null }): string {
  const cu = o.currentUser;
  const year = new Date().getUTCFullYear();
  return `
</main>

<style>${FOOTER_CSS}</style>

<footer class="footer">
  <div class="footer-grid">
    <div class="footer-col">
      <div class="footer-logo"><img src="${o.siteUrl}/assets/img/site-img/icon.png" alt="AniVault" class="footer-logo-img" width="28" height="28"> Ani<span>Vault</span></div>
      <p class="footer-about">Free & Ad-free anime streaming platform</p>
      <div class="footer-social">
        <a href="https://discord.gg/QK2dAVgK2a" aria-label="Discord" class="social-link">${icon('discord', 'social-icon')}</a>
        <a href="https://github.com/SH0MIK" aria-label="GitHub" class="social-link">${icon('github', 'social-icon')}</a>
        <a href="https://facebook.com/shomik585" aria-label="Facebook" class="social-link">${icon('facebook', 'social-icon')}</a>
        <a href="#" aria-label="Twitter" class="social-link">${icon('twitter', 'social-icon')}</a>
      </div>
    </div>
    <div class="footer-col">
      <h4 class="footer-heading">Navigate</h4>
      <ul class="footer-links">
        <li><a href="${o.siteUrl}/">${icon('home', 'icon-inline')} Home</a></li>
        <li><a href="${o.siteUrl}/browse">${icon('search', 'icon-inline')} Browse</a></li>
        <li><a href="${o.siteUrl}/seasonal">${icon('fire', 'icon-inline')} Seasonal</a></li>
        <li><a href="${o.siteUrl}/top">${icon('trophy', 'icon-inline')} Top Anime</a></li>
        <li><a href="${o.siteUrl}/schedule">${icon('calendar', 'icon-inline')} Schedule</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4 class="footer-heading">Your Vault</h4>
      <ul class="footer-links">
        ${cu ? `
        <li><a href="${o.siteUrl}/mylist">${icon('list', 'icon-inline')} My List</a></li>
        <li><a href="${o.siteUrl}/favorites">${icon('heart', 'icon-inline')} Favorites</a></li>
        <li><a href="${o.siteUrl}/profile">${icon('edit', 'icon-inline')} Edit Profile</a></li>
        <li><a href="${o.siteUrl}/importexport">${icon('box', 'icon-inline')} Import / Export</a></li>` : `
        <li><a href="#" onclick="requireLogin('login');return false;">${icon('login', 'icon-inline')} Login</a></li>
        <li><a href="${o.siteUrl}/register">${icon('plus', 'icon-inline')} Sign Up</a></li>`}
      </ul>
    </div>
    <div class="footer-col">
      <h4 class="footer-heading">Info</h4>
      <ul class="footer-links">
        <li><a href="${o.siteUrl}/announcements">${icon('megaphone', 'icon-inline')} Announcements</a></li>
        <li><a href="${o.siteUrl}/terms">${icon('terms', 'icon-inline')} Terms of Use</a></li>
        <li><a href="${o.siteUrl}/privacy">${icon('shield', 'icon-inline')} Privacy Policy</a></li>
        <li><a href="mailto:abdullahalmahim585@gmail.com">${icon('mail', 'icon-inline')} Contact</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <div class="footer-bottom-left"><span>© ${year} AniVault. All rights reserved.</span></div>
    <span>Made with ♥ for anime fans</span>
  </div>
</footer>

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
  function updateAll() {
    document.querySelectorAll('time.local-ts[data-ts]').forEach(el => {
      const ts = parseInt(el.getAttribute('data-ts'), 10);
      if (!isNaN(ts)) el.textContent = fmt(ts);
    });
  }
  updateAll();
  setInterval(updateAll, 60000);
})();
</script>
<script>
if (window.__dismissLoader) window.__dismissLoader();
</script>
</body>
</html>`;
}
