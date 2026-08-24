// Ports index.php. The debug var_dump(session_id(), $_SESSION) at the top of
// the original was leftover debug code (dumps session data to every page load
// in production) — dropped here rather than ported, since it's clearly not
// intentional and would leak session internals on your live homepage.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { MalAPI } from '../lib/mal-api';
import { AnimeTracker } from '../lib/tracker';
import { Notification } from '../lib/notification';
import { getUserAnimeStatuses } from '../lib/user-list';
import { icon } from '../lib/icons';
import { h } from '../lib/helpers';
import { renderAnimeCard, buildCardMetaMap, AnimeCardMeta } from '../lib/anime-card';
import { renderHeader, renderFooter } from '../render/layout';
import { CONTINUE_WATCHING_CSS } from '../render/home-css';
import { continueWatchingScript, heroSliderScript, rowNavScript } from '../render/home-js';
import type { NormalisedAnime } from '../lib/mal-api';
import { getBannerData } from '../lib/settings';
import { getEpisodeThumbnail } from '../lib/episode-thumb';

export const homeRoutes = new Hono<{ Bindings: Env }>();

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

homeRoutes.get('/', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  const mal = new MalAPI(c.env, c.env.API_CACHE, db);
  const siteUrl = c.env.SITE_URL;

  const [seasonal, topAnime, upcoming] = await Promise.all([
    mal.getAniListSeasonNow(),
    mal.getTopAnime('bypopularity', 1),
    mal.getSeasonUpcoming(),
  ]);
  const seasonalList = (seasonal.data ?? []).slice(0, 12);
  const topList = (topAnime.data ?? []).slice(0, 12);
  const upcomingList = (upcoming.data ?? []).slice(0, 8);

  // Watch Now — anime that have episodes available in episode_videos
  let watchNowList: any[] = [];
  try {
    const rows = await db.fetchAll<{ anime_id: number }>(
      'SELECT DISTINCT anime_id FROM episode_videos WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 12'
    );
    const results = await Promise.all(rows.map((r) => mal.getAnime(r.anime_id)));
    watchNowList = results.map((r) => r.data).filter(Boolean);
  } catch {
    watchNowList = [];
  }

  // Watch history (logged-in users only) — the PHP version's CREATE TABLE /
  // ALTER TABLE self-healing runs on every home page load; that schema
  // migration dance isn't needed here since watch_history already exists
  // with the right shape from the D1 migration.
  let watchHistory: WatchHistoryRow[] = [];
  let episodeThumbOverrides: Record<string, string> = {};
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
    // Continue Watching thumbnails: an admin-saved override wins where one
    // exists (episode_overrides.image_url, set via the Episode Thumbnails
    // admin panel). Batch look these up for the episodes on this page in
    // one query, then live-fetch (via our scraper API, KV-cached) whatever
    // episodes are still missing one -- only a handful of cards per page
    // load, so this stays cheap. Cards fall back to a placeholder only if
    // both miss.
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

      const missing = watchHistory.filter((r) => !episodeThumbOverrides[`${r.anime_id}:${r.episode_num}`]);
      if (missing.length > 0) {
        // Look up each distinct show's status first (mal.getAnime is itself
        // KV-cached, so this is cheap on a warm cache) so a finished-airing
        // show's thumbnail gets written to the permanent cache tier instead
        // of the 6h one -- same as the anime detail/watch pages.
        const distinctIds = [...new Set(missing.map((r) => r.anime_id))];
        const statusMap = new Map<number, string | undefined>();
        await Promise.all(distinctIds.map(async (id) => {
          const res = await mal.getAnime(id).catch(() => null);
          statusMap.set(id, res?.data?.status);
        }));

        const scraped = await Promise.all(
          missing.map((r) => getEpisodeThumbnail(c.env, db, r.anime_id, r.episode_num, statusMap.get(r.anime_id)))
        );
        missing.forEach((r, i) => {
          const thumb = scraped[i];
          if (thumb) episodeThumbOverrides[`${r.anime_id}:${r.episode_num}`] = thumb;
        });
      }
    }
  }

  const unreadCount = currentUser ? await Notification.unreadCount(db, currentUser.id) : 0;
  const userStatuses = currentUser ? await getUserAnimeStatuses(db, currentUser.id) : {};

  // Curated hero banners need their episode counts too (see hero-slide
  // section below) — fetch just the IDs now so they can go into the same
  // cache-only cardMeta lookup as everything else, instead of a second
  // query later that the hero slides were silently missing out on.
  const curatedRows = await db
    .fetchAll<any>('SELECT anime_id, banner_image_url, logo_image_url FROM home_hero_banners ORDER BY display_order ASC LIMIT 8')
    .catch(() => []);
  const cardMeta = await buildCardMetaMap(db, [...watchNowList, ...seasonalList, ...topList, ...upcomingList, ...curatedRows.map((r) => ({ mal_id: r.anime_id } as NormalisedAnime))]);

  const layoutUser = currentUser
    ? { id: currentUser.id, username: currentUser.username, avatar_url: currentUser.avatar_url, role: currentUser.role }
    : null;

  const __banner = await getBannerData(db);
  let html = renderHeader({
    ...__banner,    siteUrl,
    siteName: c.env.SITE_NAME,
    pageTitle: 'Home',
    pageDescription: 'Watch all anime subbed & dubbed Ad-free on Anivault!',
    currentPage: 'index',
    currentUser: layoutUser,
    unreadCount,
    requestUrl: c.req.url,
  });

  // Hero slider slides. If the admin has curated slides in
  // home_hero_banners (admin/home_banners.php), those win — in the exact
  // order set there, with their own banner/logo overrides. Otherwise fall
  // back to the auto-generated pool: newly-airing anime this season
  // (sourced from AniList since MAL/Jikan's season/now data is frequently
  // stale), matching Anivexa's "spotlight" behaviour rather than the
  // all-time popular list.
  let heroPool: NormalisedAnime[] = [];
  let heroBanners: string[] = [];
  let heroLogos: string[] = [];

  if (curatedRows.length > 0) {
    const curatedAnime = await Promise.all(curatedRows.map((r) => mal.getAnime(r.anime_id)));
    for (let i = 0; i < curatedRows.length; i++) {
      const r = curatedRows[i];
      const anime = curatedAnime[i].data;
      if (!anime) continue; // skip slides whose Anime ID no longer resolves
      heroPool.push(anime);
      // getAnime() already ran this title through getAnimeArt() (scraper
      // cover/logo blended with your admin-saved overrides), so a slide
      // with no manual override here still isn't left blank.
      heroBanners.push(r.banner_image_url || anime.cover_image || '');
      heroLogos.push(r.logo_image_url || anime.logo_image || '');
    }
  }

  if (heroPool.length === 0) {
    heroPool = (seasonalList.length > 0 ? seasonalList : topList).slice(0, 6);
    // Desktop shows the wide banner, mobile shows the portrait cover
    // instead via a <picture> breakpoint swap (no JS needed). topList
    // entries already carry cover_image/logo_image from getAnimeArt() at
    // zero extra cost; seasonalList entries are AniList-sourced and don't
    // go through that pipeline, so they fall back to your saved
    // banner/logo library instead (never to a live scraper call here).
    [heroBanners, heroLogos] = await Promise.all([
      Promise.all(heroPool.map(async (a) => a.cover_image || (await mal.getLocalAnimeBannerInfo(a.mal_id))?.image_url || '')),
      Promise.all(heroPool.map(async (a) => a.logo_image || (await mal.getLocalAnimeLogo(a.mal_id)))),
    ]);
  }
  html += `
<section id="hero">
  <div id="hero-slides">
    ${heroPool.map((a, i) => renderHeroSlide(a, i, siteUrl, heroBanners[i] || a.banner_image, a.images?.jpg?.image_url, heroLogos[i], cardMeta.get(a.mal_id))).join('')}
  </div>
  <div class="hero-indicators" id="hero-dots">
    ${heroPool.map((_, i) => `<button class="hero-dot ${i === 0 ? 'active' : ''}" data-idx="${i}" aria-label="Slide ${i + 1}"></button>`).join('')}
  </div>
  <button class="hero-prev" id="hero-prev" aria-label="Previous slide">${icon('chevron-left', 'icon-medium')}</button>
  <button class="hero-next" id="hero-next" aria-label="Next slide">${icon('chevron-right', 'icon-medium')}</button>
</section>
${heroSliderScript(heroPool.length)}

<div class="container">`;

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
  const genreList = mal.getAnimeGenres().data;
  html += `
  <div class="genre-nav-wrap">
    <button class="btn btn-ghost btn-sm btn-icon genre-nav-btn prev" data-target="genre-bar" data-dir="prev" aria-label="Previous genres">${icon('chevron-left', 'icon-small')}</button>
    <div class="genre-bar" id="genre-bar">
      ${genreList.map((g) => `<a href="${siteUrl}/browse?genre=${g.mal_id}" class="genre-pill">${h(g.name)}</a>`).join('')}
    </div>
    <button class="btn btn-ghost btn-sm btn-icon genre-nav-btn next" data-target="genre-bar" data-dir="next" aria-label="Next genres">${icon('chevron-right', 'icon-small')}</button>
  </div>

  <div class="home-grid">
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
          ${watchHistory.map((hRow) => renderContinueWatchingCard(hRow, siteUrl, episodeThumbOverrides)).join('')}
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
          ${watchNowList.map((a) => renderAnimeCard(a, siteUrl, userStatuses[a.mal_id] ?? null, cardMeta.get(a.mal_id))).join('')}
        </div>
      </section>`;
  }

  // ── Trending Now (seasonal) ─────────────────────────────────────────────
  html += `
      <section class="content-section">
        ${sectionHeader('Trending Now', 'row-trending', `${siteUrl}/seasonal`)}
        ${seasonalList.length === 0
          ? `<p class="text-muted text-center">Could not load seasonal anime. API may be rate limited — try again shortly.</p>`
          : `<div class="scroll-row" id="row-trending">${seasonalList.map((a) => renderAnimeCard(a, siteUrl, userStatuses[a.mal_id] ?? null, cardMeta.get(a.mal_id))).join('')}</div>`}
      </section>

      <section class="content-section">
        ${sectionHeader('Most Popular', 'row-popular', `${siteUrl}/top`, 'View Full Rankings')}
        <div class="scroll-row" id="row-popular">${topList.map((a) => renderAnimeCard(a, siteUrl, userStatuses[a.mal_id] ?? null, cardMeta.get(a.mal_id))).join('')}</div>
      </section>`;

  if (upcomingList.length > 0) {
    html += `
      <section class="content-section">
        ${sectionHeader('Coming Soon', 'row-upcoming')}
        <div class="scroll-row" id="row-upcoming">${upcomingList.map((a) => renderAnimeCard(a, siteUrl, userStatuses[a.mal_id] ?? null, cardMeta.get(a.mal_id))).join('')}</div>
      </section>`;
  }

  html += `
    </div>

    <aside>
      <div class="sidebar-widget">
        <div class="sidebar-widget-header">${icon('trophy', 'icon-small')} Top 10 Ranked</div>
        ${topList.slice(0, 10).map((a, i) => renderSidebarItem(a, i + 1, siteUrl)).join('')}
      </div>
    </aside>
  </div>`;

  html += `</div>`;
  html += rowNavScript();
  html += renderFooter({ siteUrl, currentUser: layoutUser });

  await session.save(c, lifetime);
  return c.html(html);
});

function renderContinueWatchingCard(hRow: WatchHistoryRow, siteUrl: string, episodeThumbOverrides: Record<string, string>): string {
  const watchUrl = `${siteUrl}/watch?anime=${hRow.anime_id}&ep=${hRow.episode_num}`;
  // Only an admin-saved override shows here now -- the legacy ep_thumb
  // column (populated by old client-side auto-fetch code) is ignored.
  const thumbSrc = episodeThumbOverrides[`${hRow.anime_id}:${hRow.episode_num}`] || '';
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
    <img src="${h(thumbSrc)}" alt="${epTitle}" loading="lazy" data-anime-id="${hRow.anime_id}" data-ep="${epNum}" data-anime-title="${animeTitle}" data-ph-id="${phId}" class="wh-ep-thumb" style="${!hasThumb ? 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none;' : ''}">
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

// One slide of the hero carousel, built from a currently-airing anime entry.
// `banner` = wide art for desktop (local override > AniList's bannerImage >
// poster fallback). `mobileCover` = your own saved local cover, shown
// instead of the banner on small screens (Anivexa does the same) — falls
// back to the API poster if you haven't saved one for this title yet.
// `logo` = TMDB's transparent title-art image, shown ONLY on mobile in
// place of the plain text title (Anivexa's desktop still uses plain text —
// this matches that split exactly). Falls back to plain text if TMDB has
// no logo for this title.
function renderHeroSlide(a: NormalisedAnime, i: number, siteUrl: string, banner?: string, mobileCover?: string, logo?: string, meta?: AnimeCardMeta): string {
  const title = a.title_english && a.title_english !== a.title ? a.title_english : (a.title || 'Unknown');
  const poster = a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || '';
  const bg = banner || poster;
  const cover = mobileCover || poster;
  const desc = a.synopsis || '';
  const genres = (a.genres || []).slice(0, 3);
  const aurl = `${siteUrl}/anime?id=${a.mal_id}`;

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
      ${cover ? `<source media="(max-width: 768px)" srcset="${h(cover)}">` : ''}
      ${bg ? `<img src="${h(bg)}" alt="${h(title)}" loading="${i === 0 ? 'eager' : 'lazy'}">` : ''}
    </picture>
  </div>
  <div class="hero-gradient"></div>
  <div class="hero-content">
    <div class="container">
      <div class="hero-info${logo ? ' has-logo' : ''}">
        <h1 class="hero-title">${h(title)}</h1>
        ${logo ? `<img class="hero-logo" src="${h(logo)}" alt="${h(title)}" loading="${i === 0 ? 'eager' : 'lazy'}">` : ''}
        ${desc ? `<p class="hero-desc">${h(desc)}</p>` : ''}
        ${genres.length ? `<div class="hero-genres">${genres.map((g) => `<span class="hero-genre-tag">${h(g.name)}</span>`).join('')}</div>` : ''}
        <div class="hero-stat-strip">
          ${a.score ? `<span>${icon('star', 'icon-small')} ${a.score.toFixed(1)}</span>` : ''}
          ${epsLabel ? `<span>${icon('list', 'icon-small')} ${epsLabel}</span>` : ''}
          ${a.type ? `<span>${icon('tv', 'icon-small')} ${h(a.type)}</span>` : ''}
        </div>
        <div class="hero-actions">
          <a href="${aurl}" class="btn btn-primary">${icon('play', 'icon-small')} View Details</a>
          <button class="btn btn-ghost" onclick='event.stopPropagation(); addToList(${a.mal_id}, ${JSON.stringify(title)}, ${JSON.stringify(poster)}, ${Number(totalEps || 0)})'>${icon('plus', 'icon-small')} Add to List</button>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

// A ranked row in the "Top 10" sidebar widget.
function renderSidebarItem(a: NormalisedAnime, rank: number, siteUrl: string): string {
  const title = a.title_english && a.title_english !== a.title ? a.title_english : (a.title || 'Unknown');
  const img = a.images?.jpg?.image_url || '';
  const aurl = `${siteUrl}/anime?id=${a.mal_id}`;

  return `
<a class="sidebar-item" href="${aurl}">
  <span class="sidebar-rank">#${rank}</span>
  ${img ? `<img class="sidebar-thumb" src="${h(img)}" alt="${h(title)}" loading="lazy">` : ''}
  <div>
    <div class="sidebar-title">${h(title)}</div>
    <div class="sidebar-meta">${a.score ? `${icon('star', 'icon-small')} ${a.score.toFixed(1)}` : ''}${a.type ? ` · ${h(a.type)}` : ''}</div>
  </div>
</a>`;
}
