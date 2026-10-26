import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { searchHoshikaAnime, getHoshikaCatalog, getHoshikaGenres } from '../lib/hoshika-api';
import { Notification } from '../lib/notification';
import { getUserAnimeStatuses } from '../lib/user-list';
import { icon } from '../lib/icons';
import { h } from '../lib/helpers';
import { renderHeader, renderFooter } from '../render/layout';
import { getBannerData } from '../lib/settings';

export const browseRoutes = new Hono<{ Bindings: Env }>();

browseRoutes.get('/browse', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  const siteUrl = c.env.SITE_URL;

  const q = (c.req.query('q') ?? '').trim();
  const type = c.req.query('type') ?? '';
  const status = c.req.query('status') ?? '';
  const sort = (c.req.query('sort') ?? 'trending').trim();
  const year = Math.max(0, Number.parseInt(c.req.query('year') ?? '', 10) || 0);
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const hoshikaGenres = await getHoshikaGenres(c.env.HOSHIKA_API_KEY);
  const genreList: Array<{ mal_id: number; slug: string; name: string }> = hoshikaGenres.map((g, index) => ({ mal_id: index + 1, slug: g.slug, name: g.name }));

  let genres = c.req.queries('genres[]')?.map((g) => parseInt(g, 10)).filter((n) => Number.isInteger(n) && n > 0) ?? [];
  const singleGenre = (c.req.query('genre') ?? '').trim();
  if (genres.length === 0 && singleGenre) {
    const numericGenre = Number.parseInt(singleGenre, 10);
    if (Number.isInteger(numericGenre) && String(numericGenre) === singleGenre) genres = [numericGenre];
    else { const matched = genreList.find((g) => g.slug.toLowerCase() === singleGenre.toLowerCase()); if (matched) genres = [matched.mal_id]; }
  }
  const selectedGenre = genreList.find((g) => genres.includes(g.mal_id))?.slug ?? '';
  let hoshikaSearchItems: Awaited<ReturnType<typeof searchHoshikaAnime>> = [];
  let catalogResult: Awaited<ReturnType<typeof getHoshikaCatalog>> = { items: [], total: 0, totalPages: 1 };
  if (q) {
    const norm = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\\s+/g, ' ');
    const hasFacets = !!(year || type || status || selectedGenre);
    if (!hasFacets) {
      hoshikaSearchItems = await searchHoshikaAnime(q, 50, c.env.HOSHIKA_API_KEY);
      catalogResult = { items: hoshikaSearchItems, total: hoshikaSearchItems.length, totalPages: 1 };
    } else {
      // Hoshika search records often omit genre/year/status metadata. When
      // filters accompany a query, search within the actual Hoshika-filtered
      // catalog instead of silently filtering incomplete search records.
      const firstPage = await getHoshikaCatalog({
        genre: selectedGenre || undefined,
        year: year || undefined,
        sort,
        page: 1,
        type: type || undefined,
        status: status || undefined,
      }, c.env.HOSHIKA_API_KEY);
      const catalogPages = [firstPage];
      for (let p = 2; p <= Math.min(firstPage.totalPages, 10); p++) {
        catalogPages.push(await getHoshikaCatalog({
          genre: selectedGenre || undefined,
          year: year || undefined,
          sort,
          page: p,
          type: type || undefined,
          status: status || undefined,
        }, c.env.HOSHIKA_API_KEY));
      }
      const query = norm(q);
      const matched = catalogPages.flatMap((result) => result.items).filter((item) => {
        const titles = [item.title, item.titleEnglish, item.titleRomaji, item.titleJapanese, item.slug]
          .map(norm).filter(Boolean);
        return titles.some((title) => title.includes(query));
      });
      const unique = [...new Map(matched.map((item) => [item.shortId, item])).values()];
      const pageSize = 24;
      catalogResult = {
        items: unique.slice((page - 1) * pageSize, page * pageSize),
        total: unique.length,
        totalPages: Math.max(1, Math.ceil(unique.length / pageSize)),
      };
      hoshikaSearchItems = catalogResult.items;
    }
  }
  else if (sort === 'trending' && !type && !status && !year && genres.length === 0) {
    const trendingPayload: any = await fetch('https://hoshika.app/api/v1/browse?type=anime&sort=trending', { headers: { Accept: 'application/json', ...(c.env.HOSHIKA_API_KEY ? { 'X-Hoshika-Key': c.env.HOSHIKA_API_KEY } : {}) } }).then(async (r) => r.ok ? r.json() : null).catch(() => null);
    const trendingRoot: any = trendingPayload?.data ?? trendingPayload?.result ?? trendingPayload ?? {};
    const trendingRaw = Array.isArray(trendingRoot) ? trendingRoot : (trendingRoot.items ?? trendingRoot.results ?? trendingRoot.anime ?? trendingRoot.entries ?? trendingRoot.data ?? []);
    const trendingItems = Array.isArray(trendingRaw) ? trendingRaw : [];
    hoshikaSearchItems = trendingItems.map((item: any) => ({
      id: String(item.id ?? item.shortId ?? item.short_id ?? ''),
      shortId: String(item.shortId ?? item.short_id ?? item.id ?? ''),
      slug: String(item.slug ?? ''),
      title: String(item.titleLocalized ?? item.titleEnglish ?? item.title ?? item.titleRomaji ?? item.slug ?? 'Untitled anime'),
      titleEnglish: String(item.titleEnglish ?? item.title_english ?? ''),
      titleRomaji: String(item.titleRomaji ?? item.title_romaji ?? ''),
      titleJapanese: String(item.titleJapanese ?? item.title_japanese ?? ''),
      synopsis: String(item.synopsis ?? item.description ?? ''),
      poster: String(item.poster ?? item.posterImage ?? item.coverImage ?? item.cover_image ?? item.image ?? ''),
      cover: String(item.cover ?? item.bannerImage ?? item.banner_image ?? ''),
      episodes: Number.isFinite(Number(item.episodes ?? item.episodeCount)) ? Number(item.episodes ?? item.episodeCount) : null,
      score: Number.isFinite(Number(item.averageScore ?? item.score ?? item.rating)) ? Number(item.averageScore ?? item.score ?? item.rating) : null,
      status: String(item.status ?? ''),
      season: String(item.season ?? item.seasonName ?? item.season_name ?? ''),
      type: String(item.type ?? item.format ?? 'TV'),
      year: Number.isFinite(Number(item.year ?? item.seasonYear)) ? Number(item.year ?? item.seasonYear) : null,
      genres: Array.isArray(item.genres) ? item.genres.map((g: any) => typeof g === 'string' ? g : String(g?.name ?? '')).filter(Boolean) : [],
      raw: item,
    })).filter((item: any) => item.shortId);
    // Keep the Hoshika trending feed as the source for trending, then apply
    // facets against its normalized fields. Do not switch to a different
    // catalogue endpoint just because a facet is selected.
    if (year) hoshikaSearchItems = hoshikaSearchItems.filter((item: any) => Number(item.year) === year);
    if (type) {
      const wanted = type.toLowerCase();
      hoshikaSearchItems = hoshikaSearchItems.filter((item: any) => {
        const actual = String(item.type ?? '').toLowerCase();
        return actual === wanted || (wanted === 'tv' && (actual === 'tv series' || actual === 'television')) ||
          (wanted === 'ona' && actual.includes('ona')) || (wanted === 'ova' && actual.includes('ova')) ||
          (wanted === 'movie' && (actual.includes('movie') || actual.includes('film'))) ||
          (wanted === 'special' && actual.includes('special')) || (wanted === 'music' && actual.includes('music'));
      });
    }
    if (status) {
      const wanted = status.toLowerCase();
      hoshikaSearchItems = hoshikaSearchItems.filter((item: any) => {
        const actual = String(item.status ?? '').toLowerCase();
        if (wanted === 'airing') return actual.includes('airing') || actual.includes('ongoing');
        if (wanted === 'complete') return actual.includes('complete') || actual.includes('finished');
        if (wanted === 'upcoming') return actual.includes('upcoming') || actual.includes('not yet');
        return actual === wanted;
      });
    }
    if (genres.length) {
      const wantedGenres = genres.map((id) => genreList.find((g) => g.mal_id === id)?.name.toLowerCase()).filter(Boolean);
      hoshikaSearchItems = hoshikaSearchItems.filter((item: any) => wantedGenres.every((wanted) =>
        (item.genres ?? []).some((g: string) => String(g).toLowerCase() === wanted)));
    }
    catalogResult = { items: hoshikaSearchItems, total: hoshikaSearchItems.length, totalPages: 1 };
  } else catalogResult = await getHoshikaCatalog({ genre: selectedGenre, year: year || undefined, sort, page, type: type || undefined, status: status || undefined }, c.env.HOSHIKA_API_KEY);
  const items = catalogResult.items;
  const totalCount = catalogResult.total;
  const totalPages = catalogResult.totalPages;
  const cardMeta = new Map();

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

  const heading = q ? `🔍 Results for \"${h(q)}\"` : (sort === 'trending' && !type && !status && !year && genres.length === 0 ? '🔥 Trending Series' : sort === 'popular' && !type && !status && !year && genres.length === 0 ? '🔥 Most Popular Series' : '🌐 Browse Anime');

  const activeFilterCount = (type ? 1 : 0) + (status ? 1 : 0) + (sort !== 'trending' ? 1 : 0) + (year ? 1 : 0) + genres.length + (q ? 1 : 0);
  const hasAnyFilter = activeFilterCount > 0;

  // Each chip links to the same filter set minus that one filter, so a
  // person can back out of a single facet without opening the drawer.
  function chipUrl(opts: { dropQ?: boolean; dropType?: boolean; dropStatus?: boolean; dropGenre?: number }): string {
    const qs = new URLSearchParams();
    if (q && !opts.dropQ) qs.set('q', q);
    if (type && !opts.dropType) qs.set('type', type);
    if (status && !opts.dropStatus) qs.set('status', status);
    if (sort !== 'trending') qs.set('sort', sort);
    if (year) qs.set('year', String(year));
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
            <div class="filter-section-label">Sort</div>
            <select class="form-control" name="sort">
              <option value="popular" ${sort === "popular" ? "selected" : ""}>Popular</option>
              <option value="trending" ${sort === "trending" || !sort ? "selected" : ""}>Trending</option>
              <option value="recent" ${sort === "recent" ? "selected" : ""}>Recently Added</option>
              <option value="top" ${sort === "top" ? "selected" : ""}>Top Rated</option>
              <option value="revelation" ${sort === "revelation" ? "selected" : ""}>Revelation</option>
            </select>
          </div>
          <div class="filter-section">
            <div class="filter-section-label">Year</div>
            <input class="form-control" type="number" name="year" min="1960" max="2100" value="${year || ""}" placeholder="Any year">
          </div>
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
        <p class="text-muted">${q ? 'No Hoshika results found. Try a different title.' : 'No anime matched these filters. Try another genre, year, or sort option.'}</p>
      </div>` : `
      <div class="anime-grid">
        ${items.map((a: any) => renderHoshikaSearchCard(a)).join('')}
      </div>
      ${totalPages > 1 ? renderPagination(q, type, status, genres, page, totalPages, sort, year) : ''}`}
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
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 1) {
    return c.json([], 200, { 'Cache-Control': 'no-store' });
  }

  try {
    // Search suggestions now come from Hoshika only. Hoshika shortId is
    // returned separately so it cannot be mistaken for a legacy MAL ID.
    const items = await searchHoshikaAnime(q, 4, c.env.HOSHIKA_API_KEY);
    const out = items.map((a) => ({
      shortId: a.shortId,
      title: a.title,
      type: a.type ?? '',
      year: a.year ? String(a.year) : null,
      score: a.score !== null ? a.score.toFixed(1) : null,
      image: a.poster || a.cover || '',
      source: 'hoshika',
    }));
    return c.json(out, 200, { 'Cache-Control': 'no-store' });
  } catch {
    return c.json([], 200, { 'Cache-Control': 'no-store' });
  }
});

function renderHoshikaSearchCard(a: any): string {
  const id = encodeURIComponent(String(a.shortId ?? ''));
  const title = h(a.title ?? 'Untitled anime');
  const image = h(a.poster || a.cover || '');
  const meta = [a.type, a.year, a.episodes ? String(a.episodes) + ' eps' : ''].filter(Boolean).map((v) => h(String(v))).join(' · ');
  const score = a.score !== null && a.score !== undefined ? Number(a.score).toFixed(1) : '';
  return `<a class="anime-card" href="/anime?id=${id}">
    <div class="anime-card-poster">${image ? `<img src="${image}" alt="" loading="lazy">` : '<div class="anime-card-placeholder"></div>'}
      ${score ? `<span class="anime-card-score">★ ${h(score)}</span>` : ''}
    </div>
    <div class="anime-card-info"><div class="anime-card-title">${title}</div>${meta ? `<div class="anime-card-meta">${meta}</div>` : ''}</div>
  </a>`;
}

export function renderPagination(q: string, type: string, status: string, genres: number[], page: number, totalPages: number, sort = 'popular', year = 0): string {
  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  if (type) qs.set('type', type);
  if (status) qs.set('status', status);
  if (sort !== 'trending') qs.set('sort', sort);
  if (year) qs.set('year', String(year));
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
