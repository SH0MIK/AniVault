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
import { renderAnimeCard } from '../lib/anime-card';
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

  html += `
<div class="container section">
  <div class="flex-between mb-3" style="flex-wrap:wrap;gap:1rem;">
    <h1 style="font-size:1.4rem;">${heading}</h1>
    <span class="text-muted">${totalCount} titles found</span>
  </div>

  <div class="layout-sidebar">
    <aside>
      <div class="sidebar">
        <form method="GET" action="" id="browse-form">
          <div style="padding:1rem;border-bottom:1px solid var(--border);">
            <label class="form-label">Search</label>
            <input type="text" name="q" class="form-control" value="${h(q)}" placeholder="Anime title...">
          </div>
          <div style="padding:1rem;border-bottom:1px solid var(--border);">
            <label class="form-label">Type</label>
            <select name="type" class="form-control">
              <option value="">All Types</option>
              ${['TV', 'Movie', 'OVA', 'ONA', 'Special', 'Music'].map((t) => `<option value="${t}" ${type === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
          <div style="padding:1rem;border-bottom:1px solid var(--border);">
            <label class="form-label">Status</label>
            <select name="status" class="form-control">
              <option value="">All Status</option>
              <option value="airing" ${status === 'airing' ? 'selected' : ''}>Airing</option>
              <option value="complete" ${status === 'complete' ? 'selected' : ''}>Completed</option>
              <option value="upcoming" ${status === 'upcoming' ? 'selected' : ''}>Upcoming</option>
            </select>
          </div>
          <div id="genre-inputs"></div>
          <div style="padding:1rem;">
            <button type="submit" class="btn btn-primary btn-block">Apply Filters</button>
            ${(q || type || status || genres.length > 0) ? `<a href="/browse" class="btn btn-ghost btn-block mt-1">Clear Filters</a>` : ''}
          </div>
        </form>

        ${genreList.length > 0 ? `
        <div style="border-top:1px solid var(--border);padding:1rem;">
          <div class="section-title" style="font-size:0.75rem;margin-bottom:0.5rem;">Genres</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;" id="genre-tags">
            ${genreList.slice(0, 30).map((g) => {
              const active = genres.includes(g.mal_id);
              return `<span class="genre-tag ${active ? 'active' : ''}" data-id="${g.mal_id}" style="cursor:pointer;user-select:none;${active ? 'border-color:var(--accent);color:var(--accent);' : ''}">${h(g.name)}</span>`;
            }).join('')}
          </div>
        </div>` : ''}
      </div>
    </aside>

    <div>
      ${items.length === 0 ? `
      <div class="flex-center" style="padding:4rem;flex-direction:column;gap:1rem;">
        <span style="font-size:3rem;">🔍</span>
        <p class="text-muted">No results found. Try a different search.</p>
      </div>` : `
      <div class="anime-grid">
        ${items.map((a) => renderAnimeCard(a, siteUrl, userStatuses[a.mal_id] ?? null)).join('')}
      </div>
      ${totalPages > 1 ? renderPagination(q, type, status, genres, page, totalPages) : ''}`}
    </div>
  </div>
</div>

<script>
(function () {
  const selected = new Set(${JSON.stringify(genres)});
  const inputBox = document.getElementById('genre-inputs');

  function syncInputs() {
    inputBox.innerHTML = '';
    selected.forEach(id => {
      const inp = document.createElement('input');
      inp.type  = 'hidden';
      inp.name  = 'genres[]';
      inp.value = id;
      inputBox.appendChild(inp);
    });
  }

  document.querySelectorAll('#genre-tags .genre-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const id = parseInt(tag.dataset.id, 10);
      if (selected.has(id)) {
        selected.delete(id);
        tag.classList.remove('active');
        tag.style.borderColor = '';
        tag.style.color = '';
      } else {
        selected.add(id);
        tag.classList.add('active');
        tag.style.borderColor = 'var(--accent)';
        tag.style.color = 'var(--accent)';
      }
      syncInputs();
    });
  });

  syncInputs();
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
