// Ports index.php. The debug var_dump(session_id(), $_SESSION) at the top of
// the original was leftover debug code (dumps session data to every page load
// in production) — dropped here rather than ported, since it's clearly not
// intentional and would leak session internals on your live homepage.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { AnimeTracker } from '../lib/tracker';
import { Notification } from '../lib/notification';
import { getUserAnimeStatuses } from '../lib/user-list';
import { icon } from '../lib/icons';
import { h } from '../lib/helpers';
import { renderAnimeCard, AnimeCardMeta } from '../lib/anime-card';
import { renderHeader, renderFooter } from '../render/layout';
import { CONTINUE_WATCHING_CSS } from '../render/home-css';
import { continueWatchingScript, heroSliderScript, rowNavScript } from '../render/home-js';
import type { NormalisedAnime } from '../lib/mal-api';
import { getBannerData } from '../lib/settings';
import { getHoshikaAnimeById, searchHoshikaAnime, getHoshikaAnimeEpisodesById, getHoshikaHomeSections, getHoshikaGenres, type HoshikaCatalogAnime } from '../lib/hoshika-api';
import { findIdentityByLegacyMalId, findIdentityByHoshikaId } from '../lib/anime-identity';

export const homeRoutes = new Hono<{ Bindings: Env }>();

// Keep Hoshika-hosted catalog art on its own CDN. Cloudflare image
// transformations are only used for TMDB URLs; wrapping third-party Hoshika
// URLs through /cdn-cgi/image can fail when the remote origin is not eligible.
function resizeHeroImageUrl(url: string, width: number, height: number, fit: 'cover' | 'contain', quality = 75): string {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  if (!/^https:\/\/image\.tmdb\.org\//i.test(url)) return url;
  return `/cdn-cgi/image/width=${width},height=${height},fit=${fit},format=auto,quality=${quality}/${url}`;
}

function transformHomepageCardImage(url: string, width: number): string {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  // Use a consistent, reasonably high-resolution TMDB source for every
  // variant; otherwise a w342 source could be upscaled for the 500px card.
  const tmdb = url.match(/^(https:\/\/image\.tmdb\.org\/t\/p\/)w\d+(\/.+)$/);
  if (!tmdb) return url;
  const source = `${tmdb[1]}w500${tmdb[2]}`;
  return `/cdn-cgi/image/width=${width},height=${Math.round(width * 1.5)},fit=cover,format=auto,quality=75/${source}`;
}

interface WatchHistoryRow {
  [key: string]: unknown;
  anime_id: number;
  anime_title: string | null;
  anime_image: string | null;
  episode_num: number;
  ep_title: string | null;
  ep_thumb: string | null;
  watched_at: string;
  watch_time: number;
  episode_duration: number;
}

function toHoshikaNormalisedAnime(anime: Awaited<ReturnType<typeof getHoshikaAnimeById>>, legacyId: number): NormalisedAnime | null {
  if (!anime) return null;
  const poster = anime.poster || '';
  return {
    mal_id: legacyId, title: anime.title || 'Unknown anime',
    title_english: anime.titleEnglish || '', title_japanese: anime.titleJapanese || '',
    images: { jpg: { image_url: poster, large_image_url: poster } },
    synopsis: anime.synopsis || '', background: '', score: anime.score ?? 0,
    scored_by: null, rank: null, popularity: null, episodes: anime.episodes ?? 0,
    status: anime.status || 'Unknown', type: anime.type || '', rating: '', source: '',
    duration: null, aired: { string: null }, start_date: null,
    genres: anime.genres.map((name, index) => ({ mal_id: -(index + 1), name })),
    studios: [], related_anime: [], recommendations: [], trailer: [], themes: [],
    members: 0, broadcast: { day: null, time: null }, duration_mins: null,
  } as NormalisedAnime;
}
function toHoshikaHomeAnime(anime: HoshikaCatalogAnime, index = 0): NormalisedAnime {
  const numericId = Number(anime.shortId);
  const legacyShape = toHoshikaNormalisedAnime(anime as Awaited<ReturnType<typeof getHoshikaAnimeById>>, Number.isSafeInteger(numericId) && numericId > 0 ? -numericId : -(index + 1))!;
  return Object.assign(legacyShape, { hoshika_short_id: anime.shortId, hoshika_slug: anime.slug });
}

function renderHoshikaHomeCard(a: NormalisedAnime, siteUrl: string): string {
  const item = a as NormalisedAnime & { hoshika_short_id?: string };
  const title = a.title_english && a.title_english !== a.title ? a.title_english : (a.title || 'Unknown anime');
  const poster = a.images?.jpg?.image_url || a.images?.jpg?.large_image_url || '';
  const href = item.hoshika_short_id ? `${siteUrl}/anime?id=${encodeURIComponent(item.hoshika_short_id)}` : `${siteUrl}/anime?id=${a.mal_id}`;
  return `<a class="anime-card" href="${href}">
    <div class="anime-card-poster">${poster ? `<img src="${h(transformHomepageCardImage(poster, 240))}" alt="" loading="lazy">` : '<div class="anime-card-placeholder"></div>'}
      ${a.score ? `<span class="anime-card-score">★ ${a.score.toFixed(1)}</span>` : ''}
    </div>
    <div class="anime-card-info"><div class="anime-card-title">${h(title)}</div><div class="anime-card-meta">${[a.type, a.episodes ? `${a.episodes} eps` : '', a.aired?.string].filter(Boolean).map(v => h(String(v))).join(' · ')}</div></div>
  </a>`;
}

homeRoutes.get('/', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const hasSession = /(?:^|;\s*)av_session=/.test(c.req.header('cookie') ?? '') || !!c.req.header('authorization');
  const homepageCacheKey = new Request(c.req.url, { method: 'GET' });
  if (!hasSession) {
    const cached = await caches.default.match(homepageCacheKey);
    if (cached) return cached;
  }
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  const siteUrl = c.env.SITE_URL;

  // Homepage feeds come directly from Hoshika. No MAL/Jikan/AniList fallback.
  const hoshikaHome = await getHoshikaHomeSections(c.env.HOSHIKA_API_KEY);
  const topList: NormalisedAnime[] = (hoshikaHome.trending.length ? hoshikaHome.trending : hoshikaHome.top).map(toHoshikaHomeAnime);
  const upcomingList: NormalisedAnime[] = hoshikaHome.seasonal.map(toHoshikaHomeAnime);
  const recentList: NormalisedAnime[] = hoshikaHome.recent.map(toHoshikaHomeAnime);

  // Watch Now — only display rows whose legacy IDs have verified Hoshika mappings.
  let watchNowList: NormalisedAnime[] = [];
  try {
    const rows = await db.fetchAll<{ anime_id: number }>(
      'SELECT anime_id FROM episode_videos WHERE is_active = 1 GROUP BY anime_id ORDER BY MAX(updated_at) DESC LIMIT 12'
    );
    const resolved = await Promise.all(rows.map(async ({ anime_id }) => {
      const identity = await findIdentityByLegacyMalId(db, anime_id).catch(() => null);
      if (!identity || identity.verified !== 1 || !identity.hoshika_short_id) return null;
      const anime = await getHoshikaAnimeById(identity.hoshika_short_id, c.env.HOSHIKA_API_KEY);
      const normalized = toHoshikaNormalisedAnime(anime, anime_id);
      return normalized ? Object.assign(normalized, { hoshika_short_id: identity.hoshika_short_id }) : null;
    }));
    watchNowList = resolved.filter((anime) => anime !== null) as NormalisedAnime[];
  } catch {
    watchNowList = [];
  }
  // Watch history (logged-in users only) — the PHP version's CREATE TABLE /
  // ALTER TABLE self-healing runs on every home page load; that schema
  // migration dance isn't needed here since watch_history already exists
  // with the right shape from the D1 migration.
  let watchHistory: WatchHistoryRow[] = [];
  let episodeThumbOverrides: Record<string, string> = {};
  const historyPosters: Record<number, string> = {};
  const historyHoshikaIds: Record<number, string> = {};
  const currentUser = auth.check() ? await auth.getCurrentUser() : null;
  if (currentUser) {
    try {
      watchHistory = await db.fetchAll<WatchHistoryRow>(
        `SELECT anime_id, anime_title, anime_image, episode_num, ep_title, ep_thumb, watched_at, watch_time, episode_duration
         FROM watch_history WHERE user_id = ? ORDER BY watched_at DESC LIMIT 8`,
        [currentUser.id]
      );
    } catch {
      watchHistory = [];
    }
    // Resolve portrait posters from Hoshika for history cards. The legacy
    // anime_image field may contain a landscape banner, so never use it as a
    // poster fallback.
    await Promise.all(watchHistory.map(async (row) => {
      try {
        // New watch-history rows may already use Hoshika IDs, so try the
        // current catalog ID directly before consulting the legacy-ID mapping.
        let anime = row.anime_id > 0
          ? await getHoshikaAnimeById(String(row.anime_id), c.env.HOSHIKA_API_KEY).catch(() => null)
          : null;
        if (anime && String(anime.shortId ?? '') !== String(row.anime_id)) anime = null;
        if (!anime && row.anime_id > 0) {
          const hoshikaIdentity = await findIdentityByHoshikaId(db, row.anime_id).catch(() => null);
          const legacyIdentity = await findIdentityByLegacyMalId(db, row.anime_id).catch(() => null);
          const mappedId = hoshikaIdentity?.hoshika_short_id || legacyIdentity?.hoshika_short_id;
          if (mappedId) anime = await getHoshikaAnimeById(mappedId, c.env.HOSHIKA_API_KEY).catch(() => null);
        }
        // Old migration-era rows may have anime_id=0. Recover the canonical
        // Hoshika ID from the saved title so the card never links to anime=0.
        if (!anime && row.anime_title?.trim()) {
          const matches = await searchHoshikaAnime(row.anime_title.trim(), 5, c.env.HOSHIKA_API_KEY).catch(() => []);
          const wanted = row.anime_title.trim().toLowerCase();
          anime = matches.find(a => [a.title, a.titleEnglish, a.titleRomaji].some(t => String(t || '').trim().toLowerCase() === wanted))
            || matches[0] || null;
        }
        if (anime) {
          historyHoshikaIds[row.anime_id] = String(anime.shortId);
          if (anime.poster) historyPosters[row.anime_id] = anime.poster;
        }
      } catch { /* keep a neutral placeholder if Hoshika has no poster */ }
    }));
    if (watchHistory.length > 0) {
      try {
        const pairs = watchHistory.map(() => '(?, ?)').join(', ');
        const params = watchHistory.flatMap((r) => [r.anime_id, r.episode_num]);
        const rows = await db.fetchAll<{ anime_id: number; episode_num: number; image_url: string | null }>(
          `SELECT anime_id, episode_num, image_url FROM episode_overrides WHERE (anime_id, episode_num) IN (${pairs})`,
          params
        );
        for (const row of rows) {
          if (row.image_url) episodeThumbOverrides[`${row.anime_id}:${row.episode_num}`] = row.image_url;
        }
      } catch { /* best-effort -- cards fall back to scraper/placeholder */ }

      // Fill missing history-card art from Hoshika's actual episode endpoint.
      // The API returns { items: [{ number, thumbnail, ... }] }; use the
      // episode-specific thumbnail and preserve admin overrides above it.
      await Promise.all(watchHistory.map(async (row) => {
        const key = `${row.anime_id}:${row.episode_num}`;
        if (episodeThumbOverrides[key]) return;
        try {
          let episodes = await getHoshikaAnimeEpisodesById(String(row.anime_id), c.env.HOSHIKA_API_KEY);
          if (!episodes) {
            const identity = await findIdentityByLegacyMalId(db, Number(row.anime_id));
            if (identity?.hoshika_short_id) {
              episodes = await getHoshikaAnimeEpisodesById(identity.hoshika_short_id, c.env.HOSHIKA_API_KEY);
            }
          }
          const episode = episodes?.find((item) => item.number === Number(row.episode_num));
          if (episode?.thumbnail) episodeThumbOverrides[key] = episode.thumbnail;
        } catch { /* retain stored image/poster fallbacks */ }
      }));

      // Missing thumbnails stay blank rather than reading or repopulating the legacy scraper cache.
    }
  }

  const unreadCount = currentUser ? await Notification.unreadCount(db, currentUser.id) : 0;
  const userStatuses = currentUser ? await getUserAnimeStatuses(db, currentUser.id) : {};

  // Hero metadata is refreshed from Hoshika and cached in D1 for six hours.
  // The admin-managed home_hero_banners table remains the only source of hero selection/artwork.
  const cardMeta = new Map<number, AnimeCardMeta>();
  const layoutUser = currentUser
    ? { id: currentUser.id, username: currentUser.username, avatar_url: currentUser.avatar_url, role: currentUser.role }
    : null;

  const __banner = await getBannerData(db);
  let html = renderHeader({
    ...__banner, siteUrl,
    siteName: c.env.SITE_NAME,
    pageTitle: 'Home',
    pageDescription: 'Watch all anime subbed & dubbed Ad-free on Anivault!',
    currentPage: 'index',
    currentUser: layoutUser,
    unreadCount,
    requestUrl: c.req.url,
  });

  async function getCachedHeroAnime(shortId: string, legacyId: number): Promise<NormalisedAnime | null> {
    const cacheKey = `hero_metadata:${shortId}`;
    const now = Math.floor(Date.now() / 1000);
    let cached: { payload: string; updated_at: number } | null = null;
    try {
      cached = await db.fetchOne<{ payload: string; updated_at: number }>(
        'SELECT payload, updated_at FROM homepage_cache WHERE cache_key = ?', [cacheKey]
      );
    } catch { /* migration may not have run yet; fetch live without caching */ }
    if (cached?.payload) {
      try {
        const parsed = JSON.parse(cached.payload);
        if (now - Number(cached.updated_at) < 21600) return toHoshikaNormalisedAnime(parsed, legacyId);
      } catch { /* corrupt cache: refresh from Hoshika */ }
    }
    const fresh = await getHoshikaAnimeById(shortId, c.env.HOSHIKA_API_KEY).catch(() => null);
    if (fresh) {
      try {
        await db.query(
          'INSERT INTO homepage_cache (cache_key, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at',
          [cacheKey, JSON.stringify(fresh), now]
        );
      } catch { /* preserve homepage availability if cache writes fail */ }
      return toHoshikaNormalisedAnime(fresh, legacyId);
    }
    // Stale-if-error: keep the last known metadata if Hoshika is unavailable.
    if (cached?.payload) {
      try { return toHoshikaNormalisedAnime(JSON.parse(cached.payload), legacyId); } catch { /* ignore invalid stale data */ }
    }
    return null;
  }

  // Only admin-selected hero rows are displayed; no static list or Trending fallback.
  const curatedRows = await db
    .fetchAll<any>('SELECT anime_id, anime_title, banner_image_url, logo_image_url FROM home_hero_banners ORDER BY display_order ASC LIMIT 8')
    .catch(() => []);
  const curatedHeroRows = (await Promise.all(curatedRows.map(async (row) => {
    const legacyId = Number(row.anime_id);
    const identity = await findIdentityByLegacyMalId(db, legacyId).catch(() => null);
    if (!identity || identity.verified !== 1 || !identity.hoshika_short_id) return null;
    const anime = await getCachedHeroAnime(identity.hoshika_short_id, legacyId);
    return anime ? { row, anime } : null;
  }))).filter((item): item is { row: any; anime: NormalisedAnime } => item !== null);
  // Hero slides use verified Hoshika metadata plus the admin-supplied banner art.
  let heroPool: NormalisedAnime[] = [];
  let heroBanners: string[] = [];
  let heroLogos: string[] = [];
  let heroCovers: string[] = [];
  for (const item of curatedHeroRows) {
    heroPool.push(item.anime);
    heroBanners.push(item.row.banner_image_url || '');
    heroLogos.push(''); // Hoshika has no title-logo endpoint.
    heroCovers.push(item.anime.images?.jpg?.large_image_url || '');
  }
  // Preload slide 0's LCP image so it starts downloading during <head> parsing.
  if (heroPool.length > 0) {
    const p0 = heroPool[0];
    const poster0 = p0.images?.jpg?.large_image_url || p0.images?.jpg?.image_url || '';
    const bg0 = resizeHeroImageUrl(heroBanners[0] || p0.banner_image || poster0, 1344, 756, 'cover', 60);
    const cover0 = resizeHeroImageUrl(heroCovers[0] || poster0, 500, 750, 'cover', 70);
    const pre = [
      cover0 ? `<link rel="preload" as="image" href="${h(cover0)}" media="(max-width: 768px)" fetchpriority="high">` : '',
      bg0 ? `<link rel="preload" as="image" href="${h(bg0)}" media="(min-width: 769px)" fetchpriority="high">` : '',
    ].join('\n');
    html = html.replace('<head>', '<head>\n' + pre);
  }
  if (heroPool.length > 0) {
    html += `
<section id="hero">
  <div id="hero-slides">
    ${heroPool.map((a, i) => renderHeroSlide(a, i, siteUrl, heroBanners[i] || a.banner_image, heroCovers[i], heroLogos[i], cardMeta.get(a.mal_id))).join('')}
  </div>
  <div class="hero-indicators" id="hero-dots">
    ${heroPool.map((_, i) => `<button class="hero-dot ${i === 0 ? 'active' : ''}" data-idx="${i}" aria-label="Slide ${i + 1}"></button>`).join('')}
  </div>
  <button class="hero-prev" id="hero-prev" aria-label="Previous slide">${icon('chevron-left', 'icon-medium')}</button>
  <button class="hero-next" id="hero-next" aria-label="Next slide">${icon('chevron-right', 'icon-medium')}</button>
</section>
${heroSliderScript(heroPool.length)}
    `;
  } else {
    html += `
<section class="container" style="padding:3.5rem 1rem 2rem;text-align:center">
  <h1 style="font-size:clamp(2rem,5vw,3.25rem);margin:0 0 .75rem">Discover your next anime</h1>
  <p class="text-muted" style="max-width:38rem;margin:0 auto 1.25rem">Explore Hoshika's anime catalog, browse the latest titles, or search for a series to get started.</p>
  <a href="${siteUrl}/browse" class="btn btn-primary">${icon('search', 'icon-small')} Search Anime</a>
</section>
    `;
  }
  html += `<div class="container">`;

  if (currentUser) {
    const stats = await AnimeTracker.getStats(db, currentUser.id);
    html += `
  <div class="grid-4 mb-3">
    <div class="stat-card">${icon('list', 'stat-icon')}<div class="stat-value">${stats.total}</div><div class="stat-label">Total Tracked</div></div>
    <div class="stat-card">${icon('watching', 'stat-icon')}<div class="stat-value" style="color:var(--blue)">${stats.watching}</div><div class="stat-label">Watching</div></div>
    <div class="stat-card">${icon('completed', 'stat-icon')}<div class="stat-value" style="color:var(--teal)">${stats.completed}</div><div class="stat-label">Completed</div></div>
    <div class="stat-card">${icon('star', 'stat-icon')}<div class="stat-value" style="color:var(--gold)">${stats.avg_score || '—'}</div><div class="stat-label">Avg Score</div></div>
  </div>`;
  }

  // ── Genre bar ────────────────────────────────────────────────────────────
  const genreList = await getHoshikaGenres(c.env.HOSHIKA_API_KEY);
  if (genreList.length > 0) {
    html += `
  <div class="genre-nav-wrap">
    <button class="btn btn-ghost btn-sm btn-icon genre-nav-btn prev" data-target="genre-bar" data-dir="prev" aria-label="Previous genres">${icon('chevron-left', 'icon-small')}</button>
    <div class="genre-bar" id="genre-bar">
      ${genreList.map((g) => `<a href="${siteUrl}/browse?genre=${encodeURIComponent(g.slug)}" class="genre-pill">${h(g.name)}</a>`).join('')}
    </div>
    <button class="btn btn-ghost btn-sm btn-icon genre-nav-btn next" data-target="genre-bar" data-dir="next" aria-label="Next genres">${icon('chevron-right', 'icon-small')}</button>
  </div>`;
  }

  html += `<div class="home-grid">
    <div class="home-sections">`;

  // ── Continue Watching ──────────────────────────────────────────────────
  if (watchHistory.length > 0) {
    html += `
      <section class="content-section">
        <style>${CONTINUE_WATCHING_CSS}</style>
        <div class="section-header">
          <h2 class="section-title">Continue Watching</h2>
          <div style="display:flex;align-items:center;gap:14px;">
            <button onclick="clearWatchHistory(this)" class="btn btn-ghost btn-sm">Clear All</button>
            <button class="btn btn-ghost btn-sm btn-icon row-nav-btn" data-target="row-history" data-dir="prev" aria-label="Previous">${icon('chevron-left', 'icon-small')}</button>
            <button class="btn btn-ghost btn-sm btn-icon row-nav-btn" data-target="row-history" data-dir="next" aria-label="Next">${icon('chevron-right', 'icon-small')}</button>
            <a href="${siteUrl}/history" class="section-link">View Full History ${icon('arrow-right', 'icon-small')}</a>
          </div>
        </div>
        <div class="scroll-row" id="row-history">
          ${watchHistory.map((hRow) => renderContinueWatchingCard(hRow, siteUrl, episodeThumbOverrides, historyPosters[hRow.anime_id] || '', historyHoshikaIds[hRow.anime_id] || '')).join('')}
        </div>
      </section>
      ${continueWatchingScript(siteUrl)}`;
  }

  // ── Watch Now ────────────────────────────────────────────────────────────
  if (watchNowList.length > 0) {
    html += `
      <section class="content-section">
        ${sectionHeader('Watch Now', 'row-watchnow', `${siteUrl}/watch-now`)}
        <div class="scroll-row" id="row-watchnow">
          ${watchNowList.map((a) => renderAnimeCard(a, siteUrl, userStatuses[a.mal_id] ?? null, cardMeta.get(a.mal_id), transformHomepageCardImage)).join('')}
        </div>
      </section>`;
  }

  if (upcomingList.length > 0) {
    html += `
      <section class="content-section">
        ${sectionHeader('Current Season', 'row-upcoming', `${siteUrl}/browse?sort=trending`)}
        <div class="scroll-row" id="row-upcoming">${upcomingList.map((a) => renderHoshikaHomeCard(a, siteUrl)).join('')}</div>
      </section>`;
  }
  if (topList.length > 0) {
    html += `
      <section class="content-section">
        ${sectionHeader('Most Popular', 'row-popular', `${siteUrl}/top`, 'View Full Rankings')}
        <div class="scroll-row" id="row-popular">${topList.map((a) => renderHoshikaHomeCard(a, siteUrl)).join('')}</div>
      </section>`;
  } else {
    html += `
      <section class="content-section">
        <h2 class="section-title">Most Popular</h2>
        <p class="text-muted">Hoshika's popularity feed is not available yet. Search titles to explore the catalog.</p>
        <a class="section-link" href="${siteUrl}/browse">Search Anime ${icon('arrow-right', 'icon-small')}</a>
      </section>`;
  }


  html += `
    </div>

    ${topList.length > 0 ? `<aside>
      <div class="sidebar-widget">
        <div class="sidebar-widget-header">${icon('trophy', 'icon-small')} Top 10 Ranked</div>
        ${topList.slice(0, 10).map((a, i) => renderSidebarItem(a, i + 1, siteUrl)).join('')}
      </div>
    </aside>` : ''}
  </div>`;

  html += `</div>`;
  html += rowNavScript();
  html += renderFooter({ siteUrl, currentUser: layoutUser });

  const response = c.html(html);
  if (!hasSession) {
    response.headers.set('Cache-Control', 'public, max-age=30');
    c.executionCtx.waitUntil(caches.default.put(homepageCacheKey, response.clone()));
    return response;
  }
  await session.save(c, lifetime);
  return response;
});

function renderContinueWatchingCard(hRow: WatchHistoryRow, siteUrl: string, episodeThumbOverrides: Record<string, string>, animePoster = '', hoshikaId = ''): string {
  const watchId = hoshikaId || (hRow.anime_id > 0 ? String(hRow.anime_id) : '');
  const watchUrl = `${siteUrl}/watch?anime=${encodeURIComponent(watchId)}&ep=${hRow.episode_num}`;
  // Prefer admin-saved episode artwork, then retain existing episode/anime
  // artwork already stored in watch_history. This avoids blank cards for
  // history created before the Hoshika migration.
  const thumbSrc = episodeThumbOverrides[`${hRow.anime_id}:${hRow.episode_num}`]
    || hRow.ep_thumb
    || animePoster
    || hRow.anime_image
    || '';
  const epNum = hRow.episode_num;
  const animeTitle = h(hRow.anime_title || `Anime #${hRow.anime_id}`);
  const epTitle = hRow.ep_title ? h(hRow.ep_title) : `Episode ${epNum}`;
  const hasThumb = !!thumbSrc;

  const watchTime = hRow.watch_time ?? 0;
  const duration = hRow.episode_duration ?? 0;
  const progressPct = duration > 0 && watchTime > 0 ? Math.min(100, Math.round((watchTime / duration) * 100)) : 0;
  const secsLeft = duration > 0 && watchTime > 0 ? Math.max(0, duration - watchTime) : 0;
  const minsLeft = secsLeft > 60 ? Math.round(secsLeft / 60) : 0;
  const timeLeft = duration > 0 && minsLeft >= 60
    ? `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m left`
    : (duration > 0 && minsLeft > 0 ? `${minsLeft}m left` : '');
  const resumeUrl = watchTime >= 30 ? `${watchUrl}&t=${watchTime}` : watchUrl;
  const phId = `cwph-${hRow.anime_id}-${epNum}`;

  return `
<a class="cw-card" id="whcard-${hRow.anime_id}" href="${resumeUrl}">
  <div class="cw-thumb">
    ${!hasThumb ? `<div class="cw-placeholder" id="${phId}"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>` : ''}
    <img src="${h(thumbSrc)}" alt="${epTitle}" loading="lazy" data-anime-id="${hRow.anime_id}" data-ep="${epNum}" data-anime-title="${animeTitle}" data-fallback="${h(animePoster)}" onerror="if(this.dataset.fallback && this.src!==this.dataset.fallback){this.src=this.dataset.fallback;return;}this.style.display='none';" data-ph-id="${phId}" class="wh-ep-thumb" style="${!hasThumb ? 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none;' : ''}">
    <div class="cw-play"><div class="cw-play-circle"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></div></div>
    <div class="cw-ep-badge">Ep ${epNum}</div>
    ${timeLeft ? `<span class="cw-time-left">${h(timeLeft)}</span>` : ''}
    ${progressPct > 0 ? `<div class="cw-progress-bar"><div class="cw-progress-fill" style="--pct:${progressPct}%"></div></div>` : ''}
    <button class="cw-remove" onclick="event.preventDefault();event.stopPropagation();removeFromHistory(${hRow.anime_id},this)" title="Remove">✕</button>
  </div>
  <div class="cw-info">
    <div class="cw-anime-name">${animeTitle}</div>
    <div class="cw-ep-title">E${epNum} – ${epTitle}</div>
  </div>
</a>`;
}

// Reusable Anivexa-style section header: title + prev/next row-scroll arrows
// + an optional "View All" link.
function sectionHeader(title: string, rowId: string, viewAllHref?: string, viewAllLabel = 'View All'): string {
  return `
<div class="section-header">
  <h2 class="section-title">${h(title)}</h2>
  <div style="display:flex;align-items:center;gap:14px;">
    <button class="btn btn-ghost btn-sm btn-icon row-nav-btn" data-target="${rowId}" data-dir="prev" aria-label="Previous">${icon('chevron-left', 'icon-small')}</button>
    <button class="btn btn-ghost btn-sm btn-icon row-nav-btn" data-target="${rowId}" data-dir="next" aria-label="Next">${icon('chevron-right', 'icon-small')}</button>
    ${viewAllHref ? `<a href="${viewAllHref}" class="section-link">${h(viewAllLabel)} ${icon('arrow-right', 'icon-small')}</a>` : ''}
  </div>
</div>`;
}

// One slide of the hero carousel, built from the curated D1 entry or popular fallback.
// `banner` = wide art for desktop (admin/local override >
// poster fallback). `mobileCover` = your own saved local cover, shown
// instead of the banner on small screens (Anivexa does the same) — falls
// back to the API poster if you haven't saved one for this title yet.
// `logo` = TMDB's transparent title-art image, shown ONLY on mobile in
// place of the plain text title (Anivexa's desktop still uses plain text —
// this matches that split exactly). Falls back to plain text if TMDB has
// no logo for this title.
// Slides 2+ are stacked on top of slide 1 (opacity:0), so the browser treats
// them as in-viewport and loading="lazy" never defers them. Park their URLs in
// data-* attributes instead; the slider script swaps them in before they show.
const LAZY_PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

function renderHeroSlide(a: NormalisedAnime, i: number, siteUrl: string, banner?: string, mobileCover?: string, logo?: string, meta?: AnimeCardMeta): string {
  const title = a.title_english && a.title_english !== a.title ? a.title_english : (a.title || 'Unknown');
  const poster = a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || '';
  const originalBanner = banner || poster;
  const originalLogo = logo || '';
  const bg = resizeHeroImageUrl(originalBanner, 1344, 756, 'cover', 60);
  const cover = resizeHeroImageUrl(mobileCover || poster, 500, 750, 'cover', 70);
  logo = originalLogo ? resizeHeroImageUrl(originalLogo, 420, 146, 'contain', 65) : '';
  const desc = a.synopsis || '';
  const genres = (a.genres || []).slice(0, 3);
  const hoshikaId = (a as NormalisedAnime & { hoshika_short_id?: string }).hoshika_short_id;
  const aurl = hoshikaId ? `${siteUrl}/anime?id=${encodeURIComponent(hoshikaId)}` : `${siteUrl}/anime?id=${a.mal_id}`;

  // Same scraper-backed count as the card grids below (see anime-card.ts) —
  // cache-only, so this never blocks the homepage render.
  const airedInfo = meta?.airedInfo;
  const totalEps = airedInfo?.total ?? a.episodes ?? 0;
  const epsLabel = airedInfo && airedInfo.aired > 0
    ? (airedInfo.total && airedInfo.total !== airedInfo.aired ? `Ep ${airedInfo.aired}/${airedInfo.total}` : `Ep ${airedInfo.aired}`)
    : (totalEps ? `${totalEps} eps` : '');

  return `
<div class="hero-slide ${i === 0 ? 'active' : ''}" data-idx="${i}">
  <div class="hero-bg${banner ? '' : ' hero-bg-fallback'}">
    <picture>
      ${cover ? `<source media="(max-width: 768px)" ${i === 0 ? 'srcset' : 'data-srcset'}="${h(cover)}">` : ''}
      ${bg ? `${i === 0 ? `<img src="${h(bg)}" data-original="${h(banner || poster)}" onerror="this.onerror=null;this.src=this.dataset.original" width="1344" height="756" alt="${h(title)}" loading="eager" fetchpriority="high" decoding="async">` : `<img src="${LAZY_PX}" data-src="${h(bg)}" data-original="${h(banner || poster)}" onerror="this.onerror=null;this.src=this.dataset.original" width="1344" height="756" alt="${h(title)}" decoding="async">`}` : ''}
    </picture>
  </div>
  <div class="hero-gradient"></div>
  <div class="hero-content">
    <div class="container">
      <div class="hero-info${logo ? ' has-logo' : ''}">
        <h1 class="hero-title">${h(title)}</h1>
        ${logo ? `${i === 0 ? `<img class="hero-logo" src="${h(logo)}" data-original="${h(originalLogo)}" onerror="this.onerror=null;this.src=this.dataset.original" width="420" height="146" alt="${h(title)}" loading="eager" decoding="async">` : `<img class="hero-logo" src="${LAZY_PX}" data-src="${h(logo)}" data-original="${h(originalLogo)}" onerror="this.onerror=null;this.src=this.dataset.original" width="420" height="146" alt="${h(title)}" decoding="async">`}` : ''}
        ${desc ? `<p class="hero-desc">${h(desc)}</p>` : ''}
        ${genres.length ? `<div class="hero-genres">${genres.map((g) => `<span class="hero-genre-tag">${h(g.name)}</span>`).join('')}</div>` : ''}
        <div class="hero-stat-strip">
          ${a.score ? `<span>${icon('star', 'icon-small')} ${a.score.toFixed(1)}</span>` : ''}
          ${epsLabel ? `<span>${icon('list', 'icon-small')} ${epsLabel}</span>` : ''}
          ${a.type ? `<span>${icon('tv', 'icon-small')} ${h(a.type)}</span>` : ''}
        </div>
        <div class="hero-actions">
          <a href="${aurl}" class="btn btn-primary">${icon('play', 'icon-small')} View Details</a>
          ${hoshikaId ? '' : `<button class="btn btn-ghost" onclick='event.stopPropagation(); addToList(${a.mal_id}, ${JSON.stringify(title)}, ${JSON.stringify(poster)}, ${Number(totalEps || 0)})'>${icon('plus', 'icon-small')} Add to List</button>`}
        </div>
      </div>
    </div>
  </div>
</div>`;
}

// A ranked row in the "Top 10" sidebar widget.
function renderSidebarItem(a: NormalisedAnime, rank: number, siteUrl: string): string {
  const title = a.title_english && a.title_english !== a.title ? a.title_english : (a.title || 'Unknown');
  // Top-10 sidebar cards are intentionally tiny. Resize only TMDB posters;
  // never rewrite self-hosted/custom artwork URLs.
  const originalImg = a.images?.jpg?.image_url || '';
  const img = originalImg ? transformHomepageCardImage(originalImg, 96) : '';
  const hoshikaId = (a as NormalisedAnime & { hoshika_short_id?: string }).hoshika_short_id;
  const aurl = hoshikaId ? `${siteUrl}/anime?id=${encodeURIComponent(hoshikaId)}` : `${siteUrl}/anime?id=${a.mal_id}`;

  return `
<a class="sidebar-item" href="${aurl}">
  <span class="sidebar-rank">#${rank}</span>
  ${img ? `<img class="sidebar-thumb" src="${h(img)}" alt="${h(title)}" loading="lazy">` : '<span class="sidebar-thumb" aria-hidden="true"></span>'}
  <div>
    <div class="sidebar-title">${h(title)}</div>
    <div class="sidebar-meta">${a.score ? `${icon('star', 'icon-small')} ${a.score.toFixed(1)}` : ''}${a.type ? ` · ${h(a.type)}` : ''}</div>
  </div>
</a>`;
}
