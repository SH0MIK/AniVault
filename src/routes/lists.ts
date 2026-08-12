// Ports pages/mylist.php, pages/favorites.php, pages/history.php,
// pages/notifications.php, pages/announcements.php.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { AnimeTracker, ITEMS_PER_PAGE } from '../lib/tracker';
import { Notification } from '../lib/notification';
import { h, timeAgo, statusBadge } from '../lib/helpers';
import { icon } from '../lib/icons';
import { renderAnimeCard, buildCardMetaMap, LANG_CODE } from '../lib/anime-card';
import { renderHeader, renderFooter, CurrentUser } from '../render/layout';
import { HISTORY_CSS } from '../render/history-css';
import { getBannerData } from '../lib/settings';

export const listRoutes = new Hono<{ Bindings: Env }>();

async function requireLoginCtx(c: any): Promise<{ db: Db; session: Session; lifetime: number; auth: Auth; userId: number } | null> {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  if (!auth.check()) return null;
  return { db, session, lifetime, auth, userId: session.user_id! };
}

async function commonLayoutData(db: Db, auth: Auth) {
  const currentUser = await auth.getCurrentUser();
  const unreadCount = currentUser ? await Notification.unreadCount(db, currentUser.id) : 0;
  const layoutUser: CurrentUser | null = currentUser
    ? { id: currentUser.id, username: currentUser.username, avatar_url: currentUser.avatar_url, role: currentUser.role }
    : null;
  return { currentUser, unreadCount, layoutUser };
}

// ── pages/mylist.php ───────────────────────────────────────────────────────
listRoutes.on(['GET', 'POST'], '/mylist', async (c) => {
  const ctx = await requireLoginCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, auth, userId } = ctx;

  let successMsg: string | null = null;
  let errorMsg: string | null = null;

  if (c.req.method === 'POST') {
    const body = await c.req.parseBody();
    if (body.action === 'delete_full_list') {
      const csrfToken = session.data.csrf_token as string | undefined;
      if (!body.csrf_token || body.csrf_token !== csrfToken) {
        errorMsg = 'Invalid security token. Please try again.';
      } else {
        const count = await db.count('SELECT COUNT(*) as cnt FROM anime_list WHERE user_id=?', [userId]);
        if (count > 0) {
          await db.query('DELETE FROM anime_list WHERE user_id=?', [userId]);
          const { Logger } = await import('../lib/logger');
          await Logger.log(db, userId, 'delete_full_list', `Deleted entire anime list (${count} entries)`);
          await session.save(c, lifetime);
          return c.redirect(`${siteUrl}/mylist?deleted=1`);
        } else {
          errorMsg = 'Your list is already empty.';
        }
      }
    }
  }

  if (!session.data.csrf_token) {
    session.data.csrf_token = crypto.randomUUID().replace(/-/g, '');
  }
  const csrfToken = session.data.csrf_token as string;

  const status = c.req.query('status') ?? '';
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const data = await AnimeTracker.getUserList(db, userId, status, page);
  const stats = await AnimeTracker.getStats(db, userId);
  const showSuccess = c.req.query('deleted') !== undefined;
  const cardMeta = await buildCardMetaMap(db, data.items.map((it: any) => ({ mal_id: it.anime_id } as any)));

  const { unreadCount, layoutUser } = await commonLayoutData(db, auth);

  const __banner = await getBannerData(db);
  let html = renderHeader({ ...__banner, siteUrl, siteName: c.env.SITE_NAME, pageTitle: 'My Anime List', currentPage: 'mylist', currentUser: layoutUser, unreadCount, requestUrl: c.req.url });
  const statItems: [string, string, string, string][] = [
    ['watching', 'watching', 'Watching', 'blue'],
    ['completed', 'completed', 'Completed', 'teal'],
    ['plan_to_watch', 'plantowatch', 'Planning', 'purple'],
    ['dropped', 'dropped', 'Dropped', 'accent'],
  ];
  const tabs: [string, string][] = [['', 'All'], ['watching', 'Watching'], ['completed', 'Completed'], ['plan_to_watch', 'Planning'], ['on_hold', 'On Hold'], ['dropped', 'Dropped']];

  html += `
<div class="container section">
  <div class="flex-between mb-3">
    <h1>${icon('list', 'icon-large')} My Anime List</h1>
    <a href="${siteUrl}/browse" class="btn btn-primary btn-sm">${icon('plus', 'icon-small')} Add Anime</a>
  </div>

  ${showSuccess ? `<div class="alert alert-success mb-2">${icon('check', 'icon-small')} ${h(successMsg ?? 'Your list has been cleared successfully.')}</div>` : ''}
  ${errorMsg ? `<div class="alert alert-error mb-2">${icon('alert', 'icon-small')} ${h(errorMsg)}</div>` : ''}

  <div class="grid-4 mb-3" style="gap:12px;">
    ${statItems.map(([s, ic, label, color]) => `
    <a href="/mylist?status=${s}" style="text-decoration:none;">
      <div class="stat-card" style="${status === s ? `border-color:var(--${color})` : ''}">
        ${icon(ic, 'stat-icon')}
        <div class="stat-value" style="color:var(--${color})">${(stats as any)[s]}</div>
        <div class="stat-label">${label}</div>
      </div>
    </a>`).join('')}
  </div>

  <div class="grid-3 mb-3" style="gap:12px;">
    <div class="stat-card">${icon('play', 'stat-icon')}<div class="stat-value">${stats.total_episodes.toLocaleString('en-US')}</div><div class="stat-label">Episodes Watched</div></div>
    <div class="stat-card">${icon('star', 'stat-icon')}<div class="stat-value" style="color:var(--gold)">${stats.avg_score || '—'}</div><div class="stat-label">Average Score</div></div>
    <div class="stat-card" id="last">${icon('list', 'stat-icon')}<div class="stat-value">${stats.total}</div><div class="stat-label">Total Anime</div></div>
  </div>

  <div style="display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:1.5rem;flex-wrap:wrap;">
    ${tabs.map(([k, v]) => `<a href="/mylist?status=${k}" class="tab-btn ${status === k ? 'active' : ''}" style="text-decoration:none;">${v}</a>`).join('')}
  </div>

  ${data.items.length === 0 ? `
  <div class="flex-center" style="padding:4rem;flex-direction:column;gap:1rem;">
    ${icon('list', 'icon-xl', '48px')}
    <p class="text-muted">No anime in this list yet.</p>
    <a href="${siteUrl}/browse" class="btn btn-primary">${icon('search', 'icon-small')} Browse Anime</a>
  </div>` : `
  <div class="flex-between mb-3" style="flex-wrap: wrap; gap: 1rem;">
    <div class="flex gap-1"><a href="${siteUrl}/importexport" class="btn btn-ghost btn-sm">${icon('box', 'icon-small')} Import / Export</a></div>
    ${stats.total > 0 ? `<button type="button" class="btn btn-danger btn-sm" id="delete-full-list-btn" onclick="confirmDeleteFullList()">${icon('trash', 'icon-small')} Delete Entire List (${stats.total.toLocaleString('en-US')} items)</button>` : ''}
  </div>

  <div class="card" style="overflow-x:auto;">
    <div class="data-table-wrap"><div class="data-table-wrap"><table class="data-table">
      <thead><tr><th style="width:60px;">#</th><th>Anime</th><th>Status</th><th>Progress</th><th>Score</th><th>Updated</th><th>Actions</th></tr></thead>
      <tbody>
        ${data.items.map((item, i) => {
          const jt = JSON.stringify(item.anime_title ?? '');
          const ji = JSON.stringify(item.anime_image ?? '');
          const meta = cardMeta.get(item.anime_id);
          const airedInfo = meta?.airedInfo;
          // Prefer the Jikan-derived aired-so-far total when we have it
          // cached — the stored anime_episodes snapshot can lag behind for
          // airing shows, same issue as the card grids.
          const eps = (airedInfo?.total ?? item.anime_episodes) ?? 0;
          const dubbed = meta?.dubbedLangs ?? [];
          const dubCodes = dubbed.map((l) => LANG_CODE[l] ?? l.slice(0, 2).toUpperCase());
          return `
        <tr data-anime-id="${item.anime_id}">
          <td>${(page - 1) * ITEMS_PER_PAGE + i + 1}</td>
          <td><div class="flex" style="gap:12px;align-items:center;">
            ${item.anime_image ? `<img src="${h(item.anime_image)}" alt="" style="width:40px;height:56px;object-fit:cover;border-radius:4px;flex-shrink:0;">` : icon('user', 'icon-medium')}
            <a href="${siteUrl}/anime?id=${item.anime_id}" style="color:var(--text-primary);font-weight:500;font-size:0.9rem;">${h(item.anime_title ?? '')}</a>
            ${dubCodes.length ? `<span title="Dubbed: ${h(dubbed.join(', '))}" style="font-size:.65rem;font-weight:700;color:var(--teal,#2dd4bf);white-space:nowrap;">🎙️ ${h(dubCodes.length > 3 ? dubCodes.slice(0, 3).join(' ') + ' +' + (dubCodes.length - 3) : dubCodes.join(' '))}</span>` : ''}
          </div></td>
          <td data-cell="status">${statusBadge(item.status)}</td>
          <td data-cell="progress">
            <span style="font-size:0.85rem;color:var(--text-secondary);">${item.episodes_watched}${eps ? '/' + eps : ''} eps</span>
            ${eps > 0 ? `<div class="progress-bar" style="width:80px;"><div class="progress-fill" style="width:${Math.min(100, Math.round((item.episodes_watched / eps) * 100))}%"></div></div>` : ''}
          </td>
          <td data-cell="score">${item.score ? `<span style="color:var(--gold);font-weight:600;">${icon('star', 'icon-small')} ${item.score}</span>` : `<span class="text-muted">—</span>`}</td>
          <td data-cell="updated" style="font-size:0.8rem;color:var(--text-muted);">${timeAgo(item.updated_at)}</td>
          <td><div class="flex gap-1">
            <button class="btn btn-ghost btn-sm" onclick='addToList(${item.anime_id}, ${jt}, ${ji}, ${eps})'>${icon('edit', 'icon-small')} Edit</button>
            <button class="btn btn-danger btn-sm" onclick="if(confirm('Remove this anime from your list?')) removeFromList(${item.anime_id}, this)">${icon('trash', 'icon-small')}</button>
          </div></td>
        </tr>`;
        }).join('')}
      </tbody>
    </table></div></div>
  </div>

  ${data.pages > 1 ? `<div class="pagination">${Array.from({ length: data.pages }, (_, i) => i + 1).map((i) => `<a href="/mylist?status=${status}&page=${i}" class="${i === page ? 'current' : ''}">${i}</a>`).join('')}</div>` : ''}`}
</div>

<div class="modal-overlay" id="delete-confirm-modal">
  <div class="modal" style="max-width: 500px;">
    <div class="modal-header" style="border-bottom-color: var(--accent);">
      <h3 style="color: var(--accent);">${icon('alert', 'icon-medium')} Delete Entire List?</h3>
      <button class="modal-close" onclick="closeModal('delete-confirm-modal')">${icon('x', 'icon-medium')}</button>
    </div>
    <div class="modal-body">
      <div style="text-align: center; margin-bottom: 1.5rem;">${icon('trash', 'icon-xl', '48px')}</div>
      <h4 style="text-align: center; margin-bottom: 1rem;">This action cannot be undone!</h4>
      <p style="text-align: center; color: var(--text-secondary); margin-bottom: 1.5rem;">You are about to delete <strong>${stats.total.toLocaleString('en-US')}</strong> anime entries from your list.</p>
      <div style="background:rgba(124,58,237,0.1); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1.5rem;">
        <p style="font-size: 0.85rem; margin: 0;">${icon('info', 'icon-small')} <strong>Tip:</strong> <a href="${siteUrl}/importexport" style="color: var(--accent);">Export your list</a> first if you want to keep a backup.</p>
      </div>
      <form method="POST" id="delete-full-list-form">
        <input type="hidden" name="action" value="delete_full_list">
        <input type="hidden" name="csrf_token" value="${h(csrfToken)}">
        <div class="form-group">
          <label class="form-label">Type <strong style="color: var(--accent);">DELETE</strong> to confirm:</label>
          <input type="text" id="confirm-delete-input" class="form-control" placeholder="DELETE" autocomplete="off">
        </div>
        <div class="flex gap-1">
          <button type="submit" class="btn btn-danger" style="flex: 1;" id="confirm-delete-btn" disabled>${icon('trash', 'icon-small')} Yes, Delete Everything</button>
          <button type="button" class="btn btn-ghost" onclick="closeModal('delete-confirm-modal')">${icon('x', 'icon-small')} Cancel</button>
        </div>
      </form>
    </div>
  </div>
</div>

<script>
async function removeFromList(animeId, btn) {
  const fd = new FormData();
  fd.append('action', 'remove');
  fd.append('anime_id', animeId);
  const res  = await fetch('/api/list.php', {method:'POST', body:fd});
  const data = await res.json();
  if (data.success) {
    btn.closest('tr').remove();
    showToast('Removed from list');
    const deleteBtn = document.getElementById('delete-full-list-btn');
    if (deleteBtn) {
      const currentMatch = deleteBtn.textContent.match(/(\\d+)/);
      if (currentMatch) {
        let newCount = parseInt(currentMatch[1]) - 1;
        if (newCount > 0) { deleteBtn.textContent = \`⚠️ Delete Entire List (\${newCount} items)\`; }
        else { deleteBtn.remove(); }
      }
    }
  }
}
function confirmDeleteFullList() {
  const modal = document.getElementById('delete-confirm-modal');
  if (modal) {
    modal.classList.add('open');
    const input = document.getElementById('confirm-delete-input');
    if (input) { input.value = ''; input.focus(); }
  }
}
document.addEventListener('DOMContentLoaded', function() {
  const confirmInput = document.getElementById('confirm-delete-input');
  const confirmBtn = document.getElementById('confirm-delete-btn');
  if (confirmInput && confirmBtn) {
    confirmInput.addEventListener('input', function() {
      confirmBtn.disabled = this.value.toUpperCase() !== 'DELETE';
    });
    confirmInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter' && confirmBtn && !confirmBtn.disabled) {
        e.preventDefault();
        document.getElementById('delete-full-list-form').submit();
      }
    });
  }
});
</script>`;

  html += renderFooter({ siteUrl, currentUser: layoutUser });
  await session.save(c, lifetime);
  return c.html(html);
});

// ── pages/favorites.php ────────────────────────────────────────────────────
listRoutes.get('/favorites', async (c) => {
  const ctx = await requireLoginCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, auth, userId } = ctx;

  const favs = await AnimeTracker.getFavorites(db, userId);
  const { unreadCount, layoutUser } = await commonLayoutData(db, auth);
  const cardMeta = await buildCardMetaMap(db, favs.map((f) => ({ mal_id: f.anime_id } as any)));

  const __banner = await getBannerData(db);
  let html = renderHeader({ ...__banner, siteUrl, siteName: c.env.SITE_NAME, pageTitle: 'Favorites', currentPage: 'favorites', currentUser: layoutUser, unreadCount, requestUrl: c.req.url });
  html += `
<div class="container section">
  <h1 class="mb-3">♥ My Favorites</h1>
  ${favs.length === 0 ? `
  <div class="flex-center" style="padding:4rem;flex-direction:column;gap:1rem;">
    <span style="font-size:3rem;">♡</span>
    <p class="text-muted">No favorites yet. Browse anime and click the heart!</p>
    <a href="/browse" class="btn btn-primary">Browse Anime</a>
  </div>` : `
  <div class="anime-grid">
    ${favs.map((fav) => renderAnimeCard({
      mal_id: fav.anime_id, title: fav.anime_title, title_english: fav.anime_title,
      images: { jpg: { image_url: fav.anime_image, large_image_url: fav.anime_image } },
      type: '', score: null, episodes: 0,
    } as any, siteUrl, null, cardMeta.get(fav.anime_id))).join('')}
  </div>`}
</div>`;

  html += renderFooter({ siteUrl, currentUser: layoutUser });
  await session.save(c, lifetime);
  return c.html(html);
});

// ── pages/history.php ──────────────────────────────────────────────────────
listRoutes.get('/history', async (c) => {
  const ctx = await requireLoginCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, auth, userId } = ctx;

  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const limit = 24;
  const offset = (page - 1) * limit;

  const total = await db.count('SELECT COUNT(*) as cnt FROM watch_history WHERE user_id = ?', [userId]);
  const history = await db.fetchAll<any>(
    `SELECT anime_id, anime_title, anime_image, episode_num, ep_title, ep_thumb, watched_at, watch_time, episode_duration
     FROM watch_history WHERE user_id = ? ORDER BY watched_at DESC LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );
  const totalPages = total ? Math.ceil(total / limit) : 1;

  const { unreadCount, layoutUser } = await commonLayoutData(db, auth);
  const __banner = await getBannerData(db);
  let html = renderHeader({ ...__banner, siteUrl, siteName: c.env.SITE_NAME, pageTitle: 'Watch History', currentPage: 'history', currentUser: layoutUser, unreadCount, requestUrl: c.req.url });
  html += `<style>${HISTORY_CSS}</style>
<div class="hist-wrap">
  <div class="hist-header">
    <div class="hist-title">▶ Watch <span>History</span><span class="hist-count">${total} anime</span></div>
    ${total > 0 ? `<button class="hist-clear-btn" onclick="clearAll(this)">Clear All History</button>` : ''}
  </div>

  <div class="hist-grid" id="hist-grid">
    ${history.length === 0 ? `
    <div class="hist-empty">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <p>No watch history yet.</p>
      <a href="${siteUrl}/browse" style="color:var(--accent,#e00);font-weight:600;text-decoration:none;">Browse Anime →</a>
    </div>` : history.map((hRow) => renderHistoryCard(hRow, siteUrl)).join('')}
  </div>

  ${totalPages > 1 ? renderHistPagination(page, totalPages) : ''}
</div>

<script>
(function() {
  var BEARER = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI5MGM2MTA0NGEzODMxYWM1NDQ4Y2ZmYzg5YWU4Nzk0YiIsIm5iZiI6MTc3ODM3NTk5NC45MTI5OTk5LCJzdWIiOiI2OWZmZGQzYWQ5ZTdhZDY1NTIxZTEyYTgiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.NeITU3u5e-9-_YaN_zrQQCUp4u8tKSXpZDOWlouxjps';
  function tmdbFetch(url) {
    return fetch(url, { headers: { Authorization: 'Bearer ' + BEARER } })
      .then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; });
  }
  function applyThumb(img, url) {
    var tmp = new Image();
    tmp.onload = function(){
      img.src = url;
      fetch('${siteUrl}/api/watch_history.php', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_ep_info', anime_id: parseInt(img.dataset.animeId), episode_num: parseInt(img.dataset.ep), ep_thumb: url })
      }).catch(function(){});
    };
    tmp.src = url;
  }
  var pending = {};
  document.querySelectorAll('.hist-ep-img').forEach(function(img) {
    var aid = img.dataset.animeId;
    if (!pending[aid]) pending[aid] = [];
    pending[aid].push(img);
  });
  Object.keys(pending).forEach(async function(aid) {
    var imgs = pending[aid];
    var tmdbId = null;
    var extRes = await fetch('https://api.jikan.moe/v4/anime/' + aid + '/external')
      .then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; });
    if (extRes && extRes.data) {
      var entry = extRes.data.find(function(e){ return e.url && e.url.includes('themoviedb.org/tv/'); });
      if (entry) { var m = entry.url.match(/themoviedb\\.org\\/tv\\/(\\d+)/); if (m) tmdbId = m[1]; }
    }
    if (!tmdbId) {
      var firstImg = imgs[0];
      var card = firstImg.closest('.hist-card-wrap');
      var title = card ? (card.querySelector('.hist-anime-title') || {}).textContent || '' : '';
      if (title) {
        var sr = await tmdbFetch('https://api.themoviedb.org/3/search/tv?query=' + encodeURIComponent(title.trim()));
        if (sr && sr.results && sr.results.length) tmdbId = sr.results[0].id;
      }
    }
    if (tmdbId) {
      var season = await tmdbFetch('https://api.themoviedb.org/3/tv/' + tmdbId + '/season/1');
      if (season && season.episodes) {
        var tmdbMap = {};
        season.episodes.forEach(function(ep){
          if (ep.still_path && ep.episode_number) tmdbMap[ep.episode_number] = 'https://image.tmdb.org/t/p/w500' + ep.still_path;
        });
        var missing = [];
        imgs.forEach(function(img){
          var ep = parseInt(img.dataset.ep);
          if (tmdbMap[ep]) applyThumb(img, tmdbMap[ep]); else missing.push(img);
        });
        imgs = missing;
      }
    }
    if (!imgs.length) return;
    try {
      var res = await fetch('https://graphql.anilist.co', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'query ($malId: Int) { Media(idMal: $malId, type: ANIME) { streamingEpisodes { title thumbnail site } } }',
          variables: { malId: parseInt(aid) }
        })
      });
      var data = await res.json();
      var eps  = data && data.data && data.data.Media && data.data.Media.streamingEpisodes || [];
      var SKIP = ['netflix','amazon','prime','disney','hulu','apple'];
      var PREF = ['crunchyroll','funimation','hidive','vrv'];
      function siteScore(site) {
        var s = (site||'').toLowerCase();
        if (SKIP.some(function(x){ return s.indexOf(x)!==-1; })) return -1;
        if (PREF.some(function(x){ return s.indexOf(x)!==-1; })) return 2;
        return 1;
      }
      var raw = {};
      eps.forEach(function(ep) {
        var m = (ep.title||'').match(/Episode\\s+(\\d+)/i);
        if (!m || !ep.thumbnail) return;
        var n = parseInt(m[1]), s = siteScore(ep.site);
        if (s < 0) return;
        if (!raw[n] || s > raw[n].s) raw[n] = { url: ep.thumbnail, s: s };
      });
      imgs.forEach(function(img) {
        var epNum = parseInt(img.dataset.ep);
        var entry = raw[epNum];
        if (!entry) return;
        applyThumb(img, entry.url);
      });
    } catch(e) {}
  });
})();

async function removeEntry(animeId, btn) {
  var wrap = btn.closest('.hist-card-wrap');
  if (!wrap) return;
  wrap.style.opacity = '0.4';
  wrap.style.pointerEvents = 'none';
  try {
    await fetch('${siteUrl}/api/watch_history.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', anime_id: animeId })
    });
    wrap.style.transition = 'opacity .2s, transform .2s';
    wrap.style.transform  = 'scale(0.92)';
    wrap.style.opacity    = '0';
    setTimeout(function() { wrap.remove(); }, 220);
  } catch(e) {
    wrap.style.opacity = '1';
    wrap.style.pointerEvents = '';
  }
}
async function clearAll(btn) {
  if (!confirm('Clear your entire watch history?')) return;
  btn.disabled = true;
  try {
    await fetch('${siteUrl}/api/watch_history.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear' })
    });
    document.getElementById('hist-grid').innerHTML =
      '<div class="hist-empty"><p>No watch history yet.</p><a href="${siteUrl}/browse" style="color:var(--accent,#e00);font-weight:600;text-decoration:none;">Browse Anime →</a></div>';
    btn.remove();
  } catch(e) { btn.disabled = false; }
}
</script>`;

  html += renderFooter({ siteUrl, currentUser: layoutUser });
  await session.save(c, lifetime);
  return c.html(html);
});

export function renderHistoryCard(hRow: any, siteUrl: string): string {
  const watchUrl = `${siteUrl}/watch?anime=${hRow.anime_id}&ep=${hRow.episode_num}`;
  const epNum = hRow.episode_num;
  const animeTitle = h(hRow.anime_title || `Anime #${hRow.anime_id}`);
  const epTitle = hRow.ep_title ? h(hRow.ep_title) : `Episode ${epNum}`;
  const thumb = hRow.ep_thumb ?? '';
  const cover = hRow.anime_image ?? '';
  const date = hRow.watched_at ? new Date(hRow.watched_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';

  const watchTime = hRow.watch_time ?? 0;
  const epDuration = hRow.episode_duration ?? 0;
  const progressPct = epDuration > 0 ? Math.min(100, Math.round((watchTime / epDuration) * 100)) : 0;
  const secsLeft = epDuration > 0 && watchTime > 0 ? Math.max(0, epDuration - watchTime) : 0;
  const minsLeft = secsLeft > 60 ? Math.round(secsLeft / 60) : 0;
  const timeLeftStr = minsLeft >= 60 ? `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m left` : (minsLeft > 0 ? `${minsLeft}m left` : '');
  const resumeUrl = watchTime >= 30 ? `${watchUrl}&t=${watchTime}` : watchUrl;

  return `
<div class="hist-card-wrap" data-anime-id="${hRow.anime_id}">
  <a href="${h(resumeUrl)}" class="hist-card">
    <div class="hist-thumb">
      ${thumb || cover ? `<img src="${h(thumb || cover)}" data-anime-id="${hRow.anime_id}" data-ep="${epNum}" class="hist-ep-img" loading="lazy" alt="${epTitle}">`
        : `<div class="hist-thumb-placeholder"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>`}
      <div class="hist-play-overlay"><svg width="40" height="40" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
      <span class="hist-ep-badge">Ep ${epNum}</span>
      ${timeLeftStr ? `<span class="hist-time-left">${h(timeLeftStr)}</span>` : ''}
      ${progressPct > 0 ? `<div class="hist-progress-bar"><div class="hist-progress-fill" style="width:${progressPct}%"></div></div>` : ''}
    </div>
    <div class="hist-info">
      <div class="hist-anime-title">${animeTitle}</div>
      <div class="hist-ep-title">E${epNum} – ${epTitle}</div>
      ${date ? `<div class="hist-date">${date}</div>` : ''}
    </div>
  </a>
  <button class="hist-remove" onclick="removeEntry(${hRow.anime_id}, this)" title="Remove">✕</button>
</div>`;
}

export function renderHistPagination(page: number, totalPages: number): string {
  const range = 2;
  const start = Math.max(1, page - range);
  const end = Math.min(totalPages, page + range);
  let out = '<div class="hist-pagination">';
  out += page > 1 ? `<a href="?page=${page - 1}" class="hist-page-btn">← Prev</a>` : `<span class="hist-page-btn disabled">← Prev</span>`;
  if (start > 1) out += `<span class="hist-page-btn disabled">…</span>`;
  for (let i = start; i <= end; i++) out += `<a href="?page=${i}" class="hist-page-btn ${i === page ? 'active' : ''}">${i}</a>`;
  if (end < totalPages) out += `<span class="hist-page-btn disabled">…</span>`;
  out += page < totalPages ? `<a href="?page=${page + 1}" class="hist-page-btn">Next →</a>` : `<span class="hist-page-btn disabled">Next →</span>`;
  out += '</div>';
  return out;
}

// ── pages/notifications.php ────────────────────────────────────────────────
listRoutes.get('/notifications', async (c) => {
  const ctx = await requireLoginCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, auth, userId } = ctx;

  await Notification.markAllRead(db, userId);

  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const limit = 25;
  const offset = (page - 1) * limit;
  const notifs = await Notification.getForUser(db, userId, limit, offset);
  const total = await db.count('SELECT COUNT(*) as cnt FROM notifications WHERE user_id=?', [userId]);
  const pages = Math.ceil(total / limit);

  const { unreadCount, layoutUser } = await commonLayoutData(db, auth);
  const __banner = await getBannerData(db);
  let html = renderHeader({ ...__banner, siteUrl, siteName: c.env.SITE_NAME, pageTitle: 'Notifications', currentPage: 'notifications', currentUser: layoutUser, unreadCount, requestUrl: c.req.url });
  html += `
<div class="container section" style="max-width:720px;">
  <div class="flex-between mb-3">
    <h1>${icon('bell', 'icon-large')} Notifications</h1>
    ${total > 0 ? `<form method="POST" action="${siteUrl}/api/notifications.php"><input type="hidden" name="action" value="read_all"><button class="btn btn-ghost btn-sm" type="submit">${icon('check', 'icon-small')} Mark all read</button></form>` : ''}
  </div>

  ${notifs.length === 0 ? `
  <div class="flex-center" style="padding:5rem;flex-direction:column;gap:1rem;text-align:center;">
    ${icon('bell', 'icon-xl', '64px')}
    <h2>All caught up!</h2>
    <p class="text-muted">You have no notifications yet.<br>Follow people and interact with the community!</p>
    <a href="${siteUrl}/browse" class="btn btn-primary">${icon('search', 'icon-small')} Discover Anime</a>
  </div>` : `
  <div style="display:flex;flex-direction:column;gap:6px;">
    ${notifs.map((n) => {
      const meta = Notification.getMeta(n.type);
      const link = Notification.getLink(n, siteUrl);
      const unreadStyle = !n.is_read ? 'border-color:rgba(124,58,237,0.25);background:rgba(124,58,237,0.04);' : '';
      return `
    <div class="card" style="display:flex;align-items:flex-start;gap:14px;padding:14px 16px;${unreadStyle}" id="notif-${n.id}">
      <a href="${siteUrl}/u/${h(n.actor_name ?? '')}" style="flex-shrink:0;position:relative;">
        <div class="nav-avatar" style="width:46px;height:46px;font-size:1.1rem;">
          ${n.actor_avatar ? `<img src="${h(n.actor_avatar)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : (n.actor_name ?? '?').charAt(0).toUpperCase()}
        </div>
        <span style="position:absolute;bottom:-2px;right:-2px;background:var(--bg-card);border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:0.7rem;border:1px solid var(--border);">${meta.icon}</span>
      </a>
      <div style="flex:1;min-width:0;">
        <a href="${h(link)}" style="color:var(--text-primary);text-decoration:none;font-size:0.92rem;line-height:1.5;display:block;">${Notification.getText(n)}</a>
        <span class="text-muted" style="font-size:0.78rem;">${timeAgo(n.created_at)}</span>
      </div>
      ${!n.is_read ? `<div style="width:8px;height:8px;border-radius:50%;background:var(--accent);flex-shrink:0;"></div>` : ''}
      <button onclick="deleteNotif(${n.id})" title="Dismiss" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.1rem;padding:4px;flex-shrink:0;">${icon('x', 'icon-small')}</button>
    </div>`;
    }).join('')}
  </div>
  ${pages > 1 ? `<div class="pagination">${Array.from({ length: pages }, (_, i) => i + 1).map((i) => `<a href="/notifications?page=${i}" class="${i === page ? 'current' : ''}">${i}</a>`).join('')}</div>` : ''}`}
</div>

<script>
async function deleteNotif(id) {
  const el = document.getElementById('notif-' + id);
  const fd = new FormData();
  fd.append('action', 'delete');
  fd.append('id', id);
  await fetch('${siteUrl}/api/notifications.php', {method:'POST', body:fd});
  if (el) { el.style.opacity='0'; el.style.height='0'; el.style.padding='0'; el.style.transition='all 0.25s ease'; setTimeout(()=>el.remove(), 250); }
}
</script>`;

  html += renderFooter({ siteUrl, currentUser: layoutUser });
  await session.save(c, lifetime);
  return c.html(html);
});

// ── pages/announcements.php ────────────────────────────────────────────────
listRoutes.get('/announcements', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  const siteUrl = c.env.SITE_URL;

  const announcements = await db.fetchAll<any>('SELECT * FROM announcements WHERE is_active=1 ORDER BY created_at DESC');
  const { unreadCount, layoutUser } = await commonLayoutData(db, auth);

  const __banner = await getBannerData(db);
  let html = renderHeader({ ...__banner, siteUrl, siteName: c.env.SITE_NAME, pageTitle: 'Announcements', currentPage: 'announcements', currentUser: layoutUser, unreadCount, requestUrl: c.req.url });
  html += `
<div class="container section" style="max-width:760px;">
  <h1 class="mb-3">${icon('megaphone', 'icon-large')} Announcements</h1>
  ${announcements.length === 0 ? `
  <div class="flex-center" style="padding:4rem;flex-direction:column;gap:1rem;">
    ${icon('megaphone', 'icon-xl', '48px')}
    <p class="text-muted">No announcements yet.</p>
  </div>` : announcements.map((a) => `
  <div class="card card-body mb-2">
    ${a.image_url ? `<img src="${h(a.image_url)}" alt="" style="width:100%;border-radius:var(--radius-md);margin-bottom:1rem;">` : ''}
    <h3 class="mb-1">${h(a.title)}</h3>
    <p style="color:var(--text-secondary);line-height:1.7;white-space:pre-wrap;">${h(a.content)}</p>
    <p class="text-muted mt-1" style="font-size:0.8rem;">${timeAgo(a.created_at)}</p>
  </div>`).join('')}
</div>`;

  html += renderFooter({ siteUrl, currentUser: layoutUser });
  await session.save(c, lifetime);
  return c.html(html);
});
