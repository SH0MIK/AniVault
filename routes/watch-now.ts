// Ports pages/watch-now.php -- full paginated listing of every anime with
// available episode videos (the "Show More" target from the home page's
// truncated Watch Now preview).
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import type { NormalisedAnime } from '../lib/mal-api';
import { getHoshikaAnimeById } from '../lib/hoshika-api';
import { findIdentityByLegacyMalId } from '../lib/anime-identity';
import { Notification } from '../lib/notification';
import { getBannerData } from '../lib/settings';
import { getUserAnimeStatuses } from '../lib/user-list';
import { icon } from '../lib/icons';
import { renderAnimeCard } from '../lib/anime-card';
import { renderHeader, renderFooter, CurrentUser } from '../render/layout';

export const watchNowRoutes = new Hono<{ Bindings: Env }>();

watchNowRoutes.get('/watch-now', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  const siteUrl = c.env.SITE_URL;

  const perPage = 24;
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const offset = (page - 1) * perPage;

  const total = await db.count('SELECT COUNT(DISTINCT ev.anime_id) as cnt FROM episode_videos ev JOIN anime_identity_map im ON im.legacy_mal_id = ev.anime_id AND im.verified = 1 WHERE ev.is_active = 1');
  const totalPages = total > 0 ? Math.ceil(total / perPage) : 1;

  const rows = await db.fetchAll<{ anime_id: number }>(
    'SELECT ev.anime_id FROM episode_videos ev JOIN anime_identity_map im ON im.legacy_mal_id = ev.anime_id AND im.verified = 1 WHERE ev.is_active = 1 GROUP BY ev.anime_id ORDER BY MAX(ev.updated_at) DESC LIMIT ? OFFSET ?',
    [perPage, offset]
  );
  const animeList = (await Promise.all(rows.map(async (row): Promise<NormalisedAnime | null> => {
    const identity = await findIdentityByLegacyMalId(db, row.anime_id).catch(() => null);
    if (!identity || identity.verified !== 1 || !identity.hoshika_short_id) return null;
    const anime = await getHoshikaAnimeById(identity.hoshika_short_id, c.env.HOSHIKA_API_KEY);
    if (!anime) return null;
    const poster = anime.poster || '';
    return {
      mal_id: row.anime_id,
      hoshika_short_id: identity.hoshika_short_id,
      title: anime.title || identity.title || 'Unknown anime',
      title_english: anime.titleEnglish || '',
      title_japanese: anime.titleJapanese || '',
      images: { jpg: { image_url: poster, large_image_url: poster } },
      synopsis: anime.synopsis || '', background: '', score: anime.score,
      scored_by: null, rank: null, popularity: null, episodes: anime.episodes ?? 0,
      status: anime.status || 'Unknown', type: anime.type || '', rating: '', source: '',
      duration: null, aired: { string: null }, start_date: null,
      genres: anime.genres.map((name, index) => ({ mal_id: -(index + 1), name })),
      studios: [], related_anime: [], recommendations: [], trailer: [], themes: [],
      members: 0, broadcast: { day: null, time: null }, duration_mins: null,
    } as NormalisedAnime;
  }))).filter((anime): anime is NormalisedAnime => anime !== null);
  const cardMeta = new Map();

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
