// Ports pages/watch-now.php -- full paginated listing of every anime with
// available episode videos (the "Show More" target from the home page's
// truncated Watch Now preview).
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { MalAPI } from '../lib/mal-api';
import { Notification } from '../lib/notification';
import { getBannerData } from '../lib/settings';
import { getUserAnimeStatuses } from '../lib/user-list';
import { icon } from '../lib/icons';
import { renderAnimeCard, buildCardMetaMap } from '../lib/anime-card';
import { renderHeader, renderFooter, CurrentUser } from '../render/layout';

export const watchNowRoutes = new Hono<{ Bindings: Env }>();

watchNowRoutes.get('/watch-now', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  const mal = new MalAPI(c.env, c.env.API_CACHE, db);
  const siteUrl = c.env.SITE_URL;

  const perPage = 24;
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const offset = (page - 1) * perPage;

  const total = await db.count('SELECT COUNT(DISTINCT anime_id) as cnt FROM episode_videos WHERE is_active = 1');
  const totalPages = total > 0 ? Math.ceil(total / perPage) : 1;

  const rows = await db.fetchAll<{ anime_id: number }>(
    'SELECT DISTINCT anime_id FROM episode_videos WHERE is_active = 1 ORDER BY updated_at DESC LIMIT ? OFFSET ?',
    [perPage, offset]
  );
  const results = await Promise.all(rows.map((r) => mal.getAnime(r.anime_id, true)));
  const animeList = results.map((r) => r.data).filter(Boolean) as any[];
  const cardMeta = await buildCardMetaMap(db, animeList);

  const currentUser = auth.check() ? await auth.getCurrentUser() : null;
  const unreadCount = currentUser ? await Notification.unreadCount(db, currentUser.id) : 0;
  const userStatuses = currentUser ? await getUserAnimeStatuses(db, currentUser.id) : {};
  const layoutUser: CurrentUser | null = currentUser
    ? { id: currentUser.id, username: currentUser.username, avatar_url: currentUser.avatar_url, role: currentUser.role }
    : null;

  const __banner = await getBannerData(db);
  let html = renderHeader({ ...__banner, siteUrl, siteName: c.env.SITE_NAME, pageTitle: 'Watch Now', currentPage: 'watch-now', currentUser: layoutUser, unreadCount, requestUrl: c.req.url });

  html += `
<style>
.wn-pagination { display:flex; align-items:center; justify-content:center; gap:.5rem; margin-top:2rem; flex-wrap:wrap; }
.wn-page-btn { display:inline-flex; align-items:center; gap:.3rem; padding:.4rem .85rem; border-radius:6px; border:1px solid var(--border, rgba(255,255,255,.12)); color:var(--text-muted); font-size:.82rem; font-weight:600; text-decoration:none; transition:color .15s, border-color .15s, background .15s; }
.wn-page-btn:hover { color:var(--text-primary); border-color:var(--accent, #e00); }
.wn-page-btn.active { background:var(--accent, #e00); border-color:var(--accent, #e00); color:#fff; pointer-events:none; }
.wn-page-dots { color:var(--text-muted); font-size:.85rem; padding:0 .25rem; }
</style>

<div class="container section">
  <div class="section-title">${icon('watching', 'icon-small')} Watch Now</div>

  ${animeList.length === 0 ? `<p class="text-muted text-center">No anime with episodes available yet.</p>` : `
  <div class="anime-grid">
    ${animeList.map((a) => renderAnimeCard(a, siteUrl, userStatuses[a.mal_id] ?? null, cardMeta.get(a.mal_id))).join('')}
  </div>
  ${totalPages > 1 ? renderPagination(page, totalPages) : ''}`}
</div>`;

  html += renderFooter({ siteUrl, currentUser: layoutUser });
  await session.save(c, lifetime);
  return c.html(html);
});

function renderPagination(page: number, totalPages: number): string {
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  let out = '<div class="wn-pagination">';
  if (page > 1) out += `<a href="?page=${page - 1}" class="wn-page-btn">← Prev</a>`;
  if (start > 1) {
    out += `<a href="?page=1" class="wn-page-btn">1</a>`;
    if (start > 2) out += `<span class="wn-page-dots">…</span>`;
  }
  for (let p = start; p <= end; p++) out += `<a href="?page=${p}" class="wn-page-btn ${p === page ? 'active' : ''}">${p}</a>`;
  if (end < totalPages) {
    if (end < totalPages - 1) out += `<span class="wn-page-dots">…</span>`;
    out += `<a href="?page=${totalPages}" class="wn-page-btn">${totalPages}</a>`;
  }
  if (page < totalPages) out += `<a href="?page=${page + 1}" class="wn-page-btn">Next →</a>`;
  out += '</div>';
  return out;
}
