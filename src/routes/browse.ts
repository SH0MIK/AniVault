import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { MalAPI } from '../lib/mal-api';
import { Notification } from '../lib/notification';
import { getUserAnimeStatuses } from '../lib/user-list';
import { icon } from '../lib/icons';
import { h } from '../lib/helpers';
import { renderAnimeCard, buildCardMetaMap } from '../lib/anime-card';
import { renderHeader, renderFooter } from '../render/layout';
import { getBannerData } from '../lib/settings';

export const browseRoutes = new Hono<{ Bindings: Env }>();

browseRoutes.get('/browse', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  const mal = new MalAPI(c.env, c.env.API_CACHE, db);
  const siteUrl = c.env.SITE_URL;

  const q = (c.req.query('q') ?? '').trim();
  const type = c.req.query('type') ?? '';
  const status = c.req.query('status') ?? '';
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);

  // genres[] query params, with BC support for old single ?genre=
  let genres = c.req.queries('genres[]')?.map((g) => parseInt(g, 10)).filter((n) => !Number.isNaN(n)) ?? [];
  if (genres.length === 0 && c.req.query('genre')) {
    const g = parseInt(c.req.query('genre')!, 10);
    if (!Number.isNaN(g)) genres = [g];
  }

  let result: { data: any[]; pagination: any };
  if (q) {
    result = await mal.searchAnime(q, page, type, status);
  } else if (genres.length > 0) {
    result = await mal.getAnimeByGenres(genres, page);
  } else {
    result = await mal.getTopAnime('bypopularity', page);
  }

  const items = result.data ?? [];
  const pagination = result.pagination ?? {};
  const totalPages = pagination.last_visible_page ?? 1;
  const cardMeta = await buildCardMetaMap(db, items);
  const genreList = mal.getAnimeGenres().data;

  const currentUser = auth.check() ? await auth.getCurrentUser() : null;
  const unreadCount = currentUser ? await Notification.unreadCount(db, currentUser.id) : 0;
  const userStatuses = currentUser ? await getUserAnimeStatuses(db, currentUser.id) : {};
  const layoutUser = currentUser
    ? { id: currentUser.id, username: currentUser.username, avatar_url: currentUser.avatar_url, role: currentUser.role }
    : null;

  const __banner = await getBannerData(db);
  let html = renderHeader({
    ...__banner,    siteUrl, siteName: c.env.SITE_NAME, pageTitle: 'Browse Anime', currentPage: 'browse',
    currentUser: layoutUser, unreadCount, requestUrl: c.req.url,
  });

  const heading = q ? `🔍 Results for "${h(q)}"` : (genres.length > 0 ? '🏷️ Genre Browse' : '🌐 All Anime');
  const totalCount = pagination.items?.total ?? items.length;

  const activeFilterCount = (type ? 1 : 0) + (status ? 1 : 0) + genres.length + (q ? 1 : 0);
  const hasAnyFilter = activeFilterCount > 0;

  // Each chip links to the same filter set minus that one filter, so a
  // person can back out of a single facet without opening the drawer.
  function chipUrl(opts: { dropQ?: boolean; dropType?: boolean; dropStatus?: boolean; dropGenre?: number }): string {
    const qs = new URLSearchParams();
    if (q && !opts.dropQ) qs.set('q', q);
    if (type && !opts.dropType) qs.set('type', type);
    if (status && !opts.dropStatus) qs.set('status', status);
    for (const g of genres) if (g !== opts.dropGenre) qs.append('genres[]', String(g));
    const s = qs.toString();
    return `/browse${s ? `?${s}` : ''}`;
  }
  const chips: string[] = [];
  if (q) chips.push(`<a href="${chipUrl({ dropQ: true })}" class="active-filter-chip">"${h(q)}" ${icon('x', 'icon-small')}</a>`);
  if (type) chips.push(`<a href="${chipUrl({ dropType: true })}" class="active-filter-chip">${h(type)} ${icon('x', 'icon-small')}</a>`);
  if (status) chips.push(`<a href="${chipUrl({ dropStatus: true })}" class="active-filter-chip">${h(status.charAt(0).toUpperCase() + status.slice(1))} ${icon('x', 'icon-small')}</a>`);
  for (const gid of genres) {
    const g = genreList.find((x) => x.mal_id === gid);
    if (g) chips.push(`<a href="${chipUrl({ dropGenre: gid })}" class="active-filter-chip">${h(g.name)} ${icon('x', 'icon-small')}</a>`);
  }

  html += `
<div class="container section">
  <div class="flex-between mb-3" style="flex-wrap:wrap;gap:1rem;">
    <h1 style="font-size:1.4rem;">${heading}</h1>
    <span class="text-muted">${totalCount} titles found</span>
  </div>

  <button type="button" class="btn btn-ghost filter-toggle-btn" onclick="openFilterDrawer()">
    ${icon('settings', 'icon-small')} Filters${activeFilterCount > 0 ? `<span class="filter-toggle-count">${activeFilterCount}</span>` : ''}
  </button>

  ${chips.length ? `<div class="active-filters-row">${chips.join('')}</div>` : ''}

  <div class="layout-sidebar">
    <aside id="filter-drawer">
      <div class="sidebar">
        <div class="filter-panel-header">
          <span class="filter-panel-title">${icon('settings', 'icon-small')} Filters</span>
          <div style="display:flex;align-items:center;gap:14px;">
            ${hasAnyFilter ? `<a href="/browse" class="filter-clear-link">Clear all</a>` : ''}
            <button type="button" onclick="closeFilterDrawer()" style="display:none;background:none;border:none;color:var(--text-muted);cursor:pointer;" id="drawer-close-btn">${icon('x', 'icon-small')}</button>
          </div>
        </div>
        <form method="GET" action="" id="browse-form">
          <div class="filter-section">
            <div class="filter-section-label">Search</div>
            <div class="filter-search-wrap">
              ${icon('search', 'icon-small')}
              <input type="text" name="q" class="form-control" value="${h(q)}" placeholder="Anime title...">
            </div>
          </div>
          <div class="filter-section">
            <div class="filter-section-label">Type</div>
            <div class="filter-pill-group" id="type-pills">
              <span class="filter-pill ${!type ? 'active' : ''}" data-value="">All</span>
              ${['TV', 'Movie', 'OVA', 'ONA', 'Special', 'Music'].map((t) => `<span class="filter-pill ${type === t ? 'active' : ''}" data-value="${t}">${t}</span>`).join('')}
            </div>
            <input type="hidden" name="type" id="type-input" value="${h(type)}">
          </div>
          <div class="filter-section">
            <div class="filter-section-label">Status</div>
            <div class="filter-pill-group" id="status-pills">
              <span class="filter-pill ${!status ? 'active' : ''}" data-value="">All</span>
              <span class="filter-pill ${status === 'airing' ? 'active' : ''}" data-value="airing">Airing</span>
              <span class="filter-pill ${status === 'complete' ? 'active' : ''}" data-value="complete">Completed</span>
              <span class="filter-pill ${status === 'upcoming' ? 'active' : ''}" data-value="upcoming">Upcoming</span>
            </div>
            <input type="hidden" name="status" id="status-input" value="${h(status)}">
          </div>
          ${genreList.length > 0 ? `
          <div class="filter-section">
            <div class="filter-section-label">Genres</div>
            <div class="filter-pill-group" id="genre-tags">
              ${genreList.slice(0, 30).map((g) => `<span class="filter-pill ${genres.includes(g.mal_id) ? 'active' : ''}" data-id="${g.mal_id}">${h(g.name)}</span>`).join('')}
            </div>
            <div id="genre-inputs"></div>
          </div>` : ''}
          <div class="filter-section">
            <button type="submit" class="btn btn-primary btn-block">${icon('search', 'icon-small')} Search</button>
          </div>
        </form>
      </div>
    </aside>

    <div>
      ${items.length === 0 ? `
      <div class="flex-center" style="padding:4rem;flex-direction:column;gap:1rem;">
        <span style="font-size:3rem;">🔍</span>
        <p class="text-muted">No results found. Try a different search.</p>
      </div>` : `
      <div class="anime-grid">
        ${items.map((a) => renderAnimeCard(a, siteUrl, userStatuses[a.mal_id] ?? null, cardMeta.get(a.mal_id))).join('')}
      </div>
      ${totalPages > 1 ? renderPagination(q, type, status, genres, page, totalPages) : ''}`}
    </div>
  </div>
</div>

<div class="filter-drawer-backdrop" id="filter-backdrop" onclick="closeFilterDrawer()"></div>

<script>
(function () {
  const form = document.getElementById('browse-form');
  const typeInput = document.getElementById('type-input');
  const statusInput = document.getElementById('status-input');
  const selected = new Set(${JSON.stringify(genres)});
  const inputBox = document.getElementById('genre-inputs');

  function syncGenreInputs() {
    inputBox.innerHTML = '';
    selected.forEach(id => {
      const inp = document.createElement('input');
      inp.type  = 'hidden';
      inp.name  = 'genres[]';
      inp.value = id;
      inputBox.appendChild(inp);
    });
  }

  // Type/status: single-select pills that auto-submit immediately —
  // no separate "Apply" click needed for facet changes.
  function wireSingleSelect(groupId, input) {
    document.querySelectorAll('#' + groupId + ' .filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        input.value = pill.dataset.value;
        form.submit();
      });
    });
  }
  wireSingleSelect('type-pills', typeInput);
  wireSingleSelect('status-pills', statusInput);

  // Genres: multi-select, also auto-submits on each click.
  document.querySelectorAll('#genre-tags .filter-pill').forEach(tag => {
    tag.addEventListener('click', () => {
      const id = parseInt(tag.dataset.id, 10);
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      syncGenreInputs();
      form.submit();
    });
  });
  syncGenreInputs();

  // Mobile filter drawer
  const drawer = document.getElementById('filter-drawer');
  const backdrop = document.getElementById('filter-backdrop');
  const closeBtn = document.getElementById('drawer-close-btn');
  window.openFilterDrawer = function () {
    drawer.classList.add('open');
    backdrop.classList.add('open');
    closeBtn.style.display = 'inline-flex';
    document.body.style.overflow = 'hidden';
  };
  window.closeFilterDrawer = function () {
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
    closeBtn.style.display = 'none';
    document.body.style.overflow = '';
  };
})();
</script>`;

  html += renderFooter({ siteUrl, currentUser: layoutUser });
  await session.save(c, lifetime);
  return c.html(html);
});

// ── pages/search.php — old behavior was just a redirect into browse.php ──
browseRoutes.get('/search', (c) => {
  const q = (c.req.query('q') ?? '').trim();
  const siteUrl = c.env.SITE_URL;
  return c.redirect(q ? `${siteUrl}/browse?q=${encodeURIComponent(q)}` : `${siteUrl}/browse`);
});

// ── api/search_suggest.php — live search dropdown ─────────────────────────
browseRoutes.get('/api/search_suggest.php', async (c) => {
  const db = new Db(c.env.DB);
  const mal = new MalAPI(c.env, c.env.API_CACHE, db);
  const q = (c.req.query('q') ?? '').trim();

  if (q.length < 2) {
    return c.json([], 200, { 'Cache-Control': 'public, max-age=60' });
  }

  try {
    const result = await mal.searchAnime(q, 1);
    const items = (result.data ?? []).slice(0, 4);
    const out = items.map((a) => ({
      mal_id: a.mal_id,
      title: a.title_english || a.title,
      type: a.type ?? '',
      year: a.start_date ? a.start_date.substring(0, 4) : null,
      score: a.score ? a.score.toFixed(1) : null,
      image: a.images?.jpg?.image_url ?? '',
    }));
    return c.json(out, 200, { 'Cache-Control': 'public, max-age=60' });
  } catch {
    return c.json([], 200, { 'Cache-Control': 'public, max-age=60' });
  }
});

export function renderPagination(q: string, type: string, status: string, genres: number[], page: number, totalPages: number): string {
  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  if (type) qs.set('type', type);
  if (status) qs.set('status', status);
  let base = `/browse?${qs.toString()}`;
  for (const g of genres) base += `&genres[]=${g}`;
  const baseUrl = base + '&page=';

  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  let out = '<div class="pagination">';
  if (page > 1) out += `<a href="${baseUrl}${page - 1}">‹</a>`;
  for (let i = start; i <= end; i++) {
    out += i === page ? `<span class="current">${i}</span>` : `<a href="${baseUrl}${i}">${i}</a>`;
  }
  if (page < totalPages) out += `<a href="${baseUrl}${page + 1}">›</a>`;
  out += '</div>';
  return out;
}
