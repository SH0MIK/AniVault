// Ports pages/watch.php + pages/player.php. The two were tightly coupled in
// the original (player.php was PHP-included inline at the bottom of
// watch.php, sharing variables like $title/$epNum/$currentEpInfo/$allVideos)
// so they're built together here too. CSS and the bulk of the client JS
// (server-probing/switching logic, the wall-clock progress tracker, and the
// entire Senshi HLS player engine) are carried over verbatim -- see
// render/watch-css.ts, watch-script1.ts, watch-script2.ts, player-css.ts,
// and player-script.ts. This route computes the same server-side data the
// PHP version did and assembles it all together.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth, AUTO_SESSION_LIFETIME_SECONDS } from '../lib/auth';
import { MalAPI, NormalisedAnime } from '../lib/mal-api';
import { Notification } from '../lib/notification';
import { h, getAnimeTitle } from '../lib/helpers';
import { renderHeader, renderFooter, CurrentUser } from '../render/layout';
import { WATCH_CSS } from '../render/watch-css';
import { watchScript1 } from '../render/watch-script1';
import { watchScript2 } from '../render/watch-script2';
import { PLAYER_CSS } from '../render/player-css';
import { playerScript } from '../render/player-script';
import { playerBody } from '../render/player-body';
import { getBannerData } from '../lib/settings';
import { AnimeTracker } from '../lib/tracker';
import { EpisodeAir } from '../lib/episode-air';
import { DubStatus, DUB_LANGUAGES } from '../lib/dub-status';
import { getEpisodeThumbnail } from '../lib/episode-thumb';

export const watchRoutes = new Hono<{ Bindings: Env }>();

interface EpisodeVideoRow {
  [key: string]: unknown;
  id: number;
  anime_id: number;
  episode_num: number;
  title: string | null;
  video_url: string | null;
  embed_code: string | null;
  qualities: string | null;
  description: string | null;
  is_active: number;
}

/** Parses "24 min per ep" / "1 hr 30 min" style duration strings into seconds,
 * same regexes as the PHP version. Falls back to 1380s (23min) like the original. */
export function parseDurationSeconds(durationStr: string | null | undefined): number {
  if (!durationStr) return 0;
  const minMatch = durationStr.match(/(\d+)\s*min/i);
  if (minMatch) return parseInt(minMatch[1], 10) * 60;
  const hrMatch = durationStr.match(/(\d+)\s*hr/i);
  if (hrMatch) return parseInt(hrMatch[1], 10) * 3600;
  return 0;
}

/** Ports getAnilistIdFromMal(): looks up (and caches in D1) the AniList ID
 * for a MAL id via AniList's GraphQL API, since AniList's streaming-episode
 * thumbnails / episode data key off their own IDs, not MAL's. */
async function getAnilistIdFromMal(db: Db, malId: number, env: { SCRAPER_API_BASE?: string }): Promise<number | null> {
  const row = await db.fetchOne<{ anilist_id: number }>('SELECT anilist_id FROM anime_mal_map WHERE mal_id = ?', [malId]);
  if (row?.anilist_id) return row.anilist_id;

  // Was a direct fetch to graphql.anilist.co — AniList blocks Cloudflare
  // Workers' IP ranges outright, so this silently failed on every call and
  // anime_mal_map has likely stayed empty since launch. Routed through the
  // scraper now (Railway isn't in a blocked range), same pattern as the
  // season data and episode thumbnails fixes.
  const base = env.SCRAPER_API_BASE?.replace(/\/+$/, '').replace(/\/api$/i, '');
  if (!base) return null;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${base}/api/anilist/id?malId=${malId}`, { headers: { Accept: 'application/json' }, signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const json: any = await res.json().catch(() => null);
    const anilistId = json?.anilistId ?? 0;
    if (anilistId) {
      await db.query(
        'INSERT INTO anime_mal_map (mal_id, anilist_id) VALUES (?, ?) ON CONFLICT(mal_id) DO UPDATE SET anilist_id = excluded.anilist_id',
        [malId, anilistId]
      );
      return anilistId;
    }
  } catch { /* AniList/scraper unreachable -- non-fatal, ID mapping just stays empty */ }
  return null;
}

/** Episode-specific thumbnail for the watch page's og:image, so link previews
 * (Discord, Twitter, etc.) show the actual episode instead of the anime's
 * generic cover. Previously this ran a multi-source auto-fetch chain (Kitsu
 * -> TMDB -> AniList -> Jikan -> AniSearch) directly against those APIs.
 * Priority now: an admin-saved override wins (episode_overrides.image_url,
 * set via the Episode Thumbnails admin panel) -- that lets an admin correct
 * a bad auto-fetched thumbnail. Otherwise, fetch it live from our own
 * scraper API (cached in KV, see getEpisodeThumbnail). Only falls back to
 * the anime's cover art if neither of those has anything. */
async function getEpisodeOgImage(
  db: Db, kv: KVNamespace | undefined, env: { SCRAPER_API_BASE?: string },
  malId: number, epNum: number, fallback: string
): Promise<string> {
  try {
    const row = await db.fetchOne<{ image_url: string | null }>(
      'SELECT image_url FROM episode_overrides WHERE anime_id = ? AND episode_num = ?',
      [malId, epNum]
    );
    if (row?.image_url) return row.image_url;
  } catch { /* fall through to scraper/fallback */ }

  const scraped = await getEpisodeThumbnail(env, kv, malId, epNum);
  return scraped ?? fallback;
}

watchRoutes.get('/watch', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  const mal = new MalAPI(c.env, c.env.API_CACHE, db);
  const siteUrl = c.env.SITE_URL;

  const animeId = parseInt(c.req.query('anime') ?? '0', 10) || 0;
  const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;
  if (!animeId || !epNum) return c.redirect(siteUrl + '/');

  // No more login wall on the watch page: a signed-out visitor gets a real
  // account (random username/password) created transparently right here, so
  // the player just plays. renderSignInGate() below is kept only as a
  // fallback for the rare case autoRegister() itself fails (e.g. a DB hiccup).
  let justAutoCreated: { username: string; password: string } | null = null;
  if (!auth.check()) {
    const reg = await auth.autoRegister();
    if (reg.success && reg.username && reg.password) {
      justAutoCreated = { username: reg.username, password: reg.password };
    }
  }

  const result = await mal.getAnime(animeId);
  const anime = result.data;
  if (!anime) return c.html(`<script>location.replace(${JSON.stringify(siteUrl + '/')});</script>`);

  const title = getAnimeTitle(anime);
  const image = anime.images?.jpg?.large_image_url ?? '';
  const coverSm = anime.images?.jpg?.image_url ?? image;
  // Same correction as the anime detail page — MAL's own episode count
  // lags for airing shows, and this total also drives which episode
  // numbers get nav chips below (missing/wrong = viewers can't reach an
  // episode that's actually already out). The nav grid has to render with
  // *some* number right now, so unlike the detail page this can't defer to
  // a client-side skeleton — instead it reads the cache non-blocking (any
  // age) and, if that cache is missing/stale, kicks off a background
  // refresh via waitUntil so the scraper/Jikan lookup never holds up this
  // page load; the next visit (or the detail page) picks up the fresh value.
  const { info: airedInfo, isFresh: airedInfoFresh } = await EpisodeAir.getCachedAny(db, animeId);
  if (!airedInfoFresh) {
    c.executionCtx?.waitUntil?.(EpisodeAir.get(db, c.env, mal, animeId).catch(() => {}));
  }
  const totalEps = airedInfo?.total ?? anime.episodes ?? 0;
  const dubbedLangs = await DubStatus.getFor(db, animeId);

  let epDurationSec = parseDurationSeconds(anime.duration);
  if (epDurationSec <= 0) epDurationSec = 1380;

  const video = await db.fetchOne<EpisodeVideoRow>(
    'SELECT * FROM episode_videos WHERE anime_id=? AND episode_num=? AND is_active=1',
    [animeId, epNum]
  );

  const resumeT = Math.max(0, parseInt(c.req.query('t') ?? '0', 10) || 0);
  const resumeParam = resumeT >= 30 ? resumeT : 0;
  const hasMegaplayFallback = !video;

  const anilistId = await getAnilistIdFromMal(db, animeId, c.env);

  const allVideos = await db.fetchAll<{ episode_num: number; title: string | null }>(
    'SELECT episode_num, title FROM episode_videos WHERE anime_id=? AND is_active=1 ORDER BY episode_num ASC',
    [animeId]
  );
  const epData = await mal.getAnimeEpisodes(animeId);
  const allEps: any[] = epData?.data ?? [];
  const charData = await mal.getAnimeCharacters(animeId);
  const chars: any[] = (charData?.data ?? []).slice(0, 16);

  const videoEpNumSet = new Set(allVideos.map((v) => v.episode_num));

  let prevEp: number | null = null;
  let nextEp: number | null = null;
  for (const v of allVideos) {
    const n = v.episode_num;
    if (n < epNum && (prevEp === null || n > prevEp)) prevEp = n;
    if (n > epNum && (nextEp === null || n < nextEp)) nextEp = n;
  }

  const currentEpInfo = allEps.find((ep) => Number(ep.mal_id ?? 0) === epNum) ?? null;

  let qSub: any[] = [];
  let qDub: any[] = [];
  if (video?.qualities) {
    try {
      const decoded = JSON.parse(video.qualities);
      if (Array.isArray(decoded)) {
        qSub = decoded;
      } else if (decoded && typeof decoded === 'object') {
        if ('sub' in decoded || 'dub' in decoded) {
          qSub = decoded.sub ?? [];
          qDub = decoded.dub ?? [];
        }
      }
    } catch { /* malformed qualities JSON -- fall through to embed_code below */ }
  }
  if (qSub.length === 0 && video?.embed_code) {
    qSub = [{ label: 'Default', embed: video.embed_code }];
  }

  // ── Watch history upsert (logged-in users only) ──────────────────────────
  // The PHP version ran a self-healing CREATE/ALTER TABLE dance here on every
  // page load (adding columns, fixing indexes) because InfinityFree gave no
  // migration tooling. D1 already has the right schema from the Phase 1
  // migration, so this is just a plain upsert.
  const currentUser = auth.check() ? await auth.getCurrentUser() : null;
  if (currentUser) {
    const epTitleDb = currentEpInfo?.title && currentEpInfo.title !== 'TBA' ? currentEpInfo.title : null;
    try {
      await db.query(
        `INSERT INTO watch_history (user_id, anime_id, episode_num, anime_title, anime_image, ep_title, ep_thumb, episode_duration, watched_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, datetime('now'))
         ON CONFLICT(user_id, anime_id) DO UPDATE SET
           episode_num = excluded.episode_num,
           anime_title = excluded.anime_title,
           anime_image = excluded.anime_image,
           ep_title = excluded.ep_title,
           ep_thumb = NULL,
           episode_duration = CASE WHEN watch_history.episode_duration = 0 THEN excluded.episode_duration ELSE watch_history.episode_duration END,
           watched_at = datetime('now')`,
        [currentUser.id, animeId, epNum, title, coverSm, epTitleDb, epDurationSec]
      );
    } catch { /* best-effort, same as the PHP version's try/catch */ }
  }

  const listEntry = currentUser ? await AnimeTracker.getUserEntry(db, currentUser.id, animeId) : null;
  const episodesWatched = listEntry?.episodes_watched ?? 0;

  const unreadCount = currentUser ? await Notification.unreadCount(db, currentUser.id) : 0;
  const layoutUser: CurrentUser | null = currentUser
    ? { id: currentUser.id, username: currentUser.username, avatar_url: currentUser.avatar_url, role: currentUser.role }
    : null;

  const ogImage = await getEpisodeOgImage(db, c.env.API_CACHE, c.env, animeId, epNum, image);

  const __banner = await getBannerData(db);
  let html = renderHeader({
    ...__banner,    siteUrl, siteName: c.env.SITE_NAME, pageTitle: `Ep ${epNum} — ${title}`, currentPage: 'watch',
    currentUser: layoutUser, unreadCount, requestUrl: c.req.url,
    ogData: {
      title: `Ep ${epNum} — ${title} | AniVault`,
      description: `"${currentEpInfo?.title && currentEpInfo.title !== 'TBA' ? currentEpInfo.title : 'Episode ' + epNum}" · Watch on AniVault`,
      image: ogImage, image_width: 1280, image_height: 720,
      url: `${siteUrl}/watch?anime=${animeId}&ep=${epNum}`,
      type: 'video.episode',
    },
  });

  html += `<style>${WATCH_CSS}</style>`;
  html += renderWatchBody({
    anime, image, coverSm, title, animeId, epNum, totalEps, video, qSub, hasMegaplayFallback,
    isLoggedIn: auth.check(), prevEp, nextEp, currentEpInfo, chars, allEps, allVideos,
    videoEpNumSet, resumeT, layoutUser, siteUrl, episodesWatched, dubbedLangs,
  });

  // Server-probing/switching script (always present)
  // NOTE: watchScript1() already returns its own <script>...</script>-wrapped
  // string — do NOT wrap it again here. Doing so produces nested <script>
  // tags, which the browser's HTML parser can't handle (it just scans for
  // the first literal </script>, closing the tag early and handing the JS
  // engine a stray leftover "<script>" as its first token — an immediate
  // syntax error that silently kills this entire block before anything,
  // including the server probe, ever runs).
  html += watchScript1({
    anilistId, epNum, resumeParam, animeId, siteUrl, qSub, qDub, isLoggedIn: auth.check(),
  });

  // Wall-clock progress tracker (logged-in users only, matches the PHP Auth::check() gate)
  if (auth.check()) {
    html += watchScript2(animeId, epNum, siteUrl, epDurationSec, totalEps);
  }

  html += renderFooter({ siteUrl, currentUser: layoutUser });

  // Senshi player -- pre-rendered hidden, moved into #watch-player-wrap by
  // the server-switching script on demand (same DOM-move pattern as the PHP version).
  const watchBase = `${siteUrl}/watch?anime=${animeId}&ep=`;
  let epNums: number[] = [];
  if (allVideos.length > 0) epNums = allVideos.map((v) => v.episode_num);
  else if (allEps.length > 0) epNums = allEps.map((e: any) => Number(e.mal_id ?? 0)).filter((n) => n > 0);
  else if (totalEps > 0) epNums = Array.from({ length: totalEps }, (_, i) => i + 1);
  epNums.sort((a, b) => a - b);

  let pPrevEp: number | null = null;
  let pNextEp: number | null = null;
  for (const n of epNums) {
    if (n < epNum && (pPrevEp === null || n > pPrevEp)) pPrevEp = n;
    if (n > epNum && (pNextEp === null || n < pNextEp)) pNextEp = n;
  }
  if (pPrevEp === null && epNum > 1) pPrevEp = epNum - 1;
  if (pNextEp === null && (totalEps === 0 || epNum < totalEps)) pNextEp = epNum + 1;

  html += `<div id="senshi-player-holder" style="display:none;width:0;height:0;overflow:hidden;">`;
  html += `<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700&family=Exo+2:wght@400;500;600&display=swap" rel="stylesheet">`;
  html += `<style id="sp-skin">${PLAYER_CSS}</style>`;
  html += playerBody({
    title, epNum, currentEpTitle: currentEpInfo?.title ?? null, prevEpNum: pPrevEp, nextEpNum: pNextEp,
    watchBase, epNums, curEp: epNum, totalEpsN: totalEps, episodesWatched,
  });
  html += `<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.min.js"></script>`;
  // Same double-wrap issue as watchScript1/2 above — playerScript() already
  // returns its own <script> tags.
  html += playerScript(animeId, epNum, siteUrl);
  html += `</div>`;

  if (justAutoCreated) {
    // One-time toast (handled in app.js) so the visitor sees their generated
    // credentials immediately; the same details also live in their
    // notifications bell (see Auth.autoRegister) in case they miss this.
    html += `<script>window.__autoAccountInfo=${JSON.stringify(justAutoCreated)};</script>`;
  }

  await session.save(c, session.data.auto_created ? AUTO_SESSION_LIFETIME_SECONDS : lifetime);
  return c.html(html);
});

interface WatchBodyParams {
  anime: NormalisedAnime;
  image: string;
  coverSm: string;
  title: string;
  animeId: number;
  epNum: number;
  totalEps: number;
  video: EpisodeVideoRow | null;
  qSub: any[];
  hasMegaplayFallback: boolean;
  isLoggedIn: boolean;
  prevEp: number | null;
  nextEp: number | null;
  currentEpInfo: any;
  chars: any[];
  allEps: any[];
  allVideos: { episode_num: number; title: string | null }[];
  videoEpNumSet: Set<number>;
  resumeT: number;
  layoutUser: CurrentUser | null;
  siteUrl: string;
  episodesWatched: number;
  dubbedLangs: string[];
}

export function renderWatchBody(p: WatchBodyParams): string {
  const { anime, image, coverSm, title, animeId, epNum, totalEps, video, qSub, hasMegaplayFallback,
    isLoggedIn, prevEp, nextEp, currentEpInfo, chars, allEps, allVideos, videoEpNumSet, layoutUser, siteUrl,
    episodesWatched, dubbedLangs } = p;

  const genres = (anime.genres ?? []).slice(0, 6);
  const score = anime.score;
  const status = anime.status ?? '';
  const animeType = anime.type ?? '';
  const animePage = `${siteUrl}/anime?id=${animeId}`;

  const hasRealVideo = !!video && (qSub.length > 0 || !!video.video_url);

  let playerHtml: string;
  if (hasRealVideo) {
    playerHtml = isLoggedIn
      ? `<div class="wp-player-shell" id="watch-player-wrap">${qSub.length > 0 ? qSub[0].embed : `<iframe id="main-player-iframe" src="${h(video!.video_url ?? '')}" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share" allowfullscreen loading="lazy"></iframe>`}</div><div class="wp-player-accent-line"></div>`
      : renderSignInGate(image, 'wg-play', 'wg-signin', 'wg-signup');
  } else if (hasMegaplayFallback) {
    playerHtml = isLoggedIn
      ? `<div class="wp-player-shell" id="watch-player-wrap" style="position:relative;aspect-ratio:unset;overflow:visible;background:transparent;border:none;box-shadow:none;"><div class="wp-finding-server" id="wp-finding-server"><div class="wpfs-ring"></div><div class="wpfs-text">Finding the best server<span class="wpfs-dots"><span>.</span><span>.</span><span>.</span></span></div></div></div><div class="wp-player-accent-line"></div>`
      : renderSignInGate(image, 'wg-play2', 'wg-signin2', 'wg-signup2');
  } else {
    playerHtml = `<div class="wp-no-video"><div class="nv-icon">🎬</div><p>No video available yet.<br>Check back later or explore other episodes.</p><a href="${animePage}" class="btn btn-ghost btn-sm" style="margin-top:.25rem">← Back to Anime</a></div>`;
  }

  const serverControlsHtml = (isLoggedIn && (video || hasMegaplayFallback)) ? `
        <div class="wp-controls">
          <div class="wp-controls-top"><span class="wpc-label">Server</span><span class="wpc-hint">F = fullscreen</span></div>
          ${qSub.length > 0 ? `
          <div class="wp-quality-row">
            <span class="wpc-label">Quality</span>
            <div class="wpc-quals" id="watch-quality-btns">
              ${qSub.map((q, qi) => `<button class="wpc-q${qi === 0 ? ' on' : ''}" onclick="switchWatchQuality(this,${qi})">${h(q.label)}</button>`).join('')}
            </div>
          </div>` : ''}
          <div class="server-panel" id="server-grid">
            <div class="server-panel-head"><span class="server-panel-lbl"><span class="server-panel-dot"></span>Servers</span><span class="server-panel-hint">Click to switch</span></div>
            <div class="server-panel-body">
              <div class="server-tabs"><button class="server-tab active" data-tab="sub">Sub</button><button class="server-tab" data-tab="dub">Dub</button></div>
              <div class="server-tab-panel active" id="tab-panel-sub" data-audio="sub">
                <div class="server-skel-group" id="servers-sub-loading">
                  <span class="server-skel"><span class="server-skel-dot"></span><span class="server-skel-bar" style="width:72px"></span></span>
                  <span class="server-skel"><span class="server-skel-dot"></span><span class="server-skel-bar" style="width:46px"></span></span>
                  <span class="server-skel"><span class="server-skel-dot"></span><span class="server-skel-bar" style="width:58px"></span></span>
                </div>
              </div>
              <div class="server-tab-panel" id="tab-panel-dub" data-audio="dub">
                <div class="server-skel-group" id="servers-dub-loading">
                  <span class="server-skel"><span class="server-skel-dot"></span><span class="server-skel-bar" style="width:72px"></span></span>
                  <span class="server-skel"><span class="server-skel-dot"></span><span class="server-skel-bar" style="width:46px"></span></span>
                  <span class="server-skel"><span class="server-skel-dot"></span><span class="server-skel-bar" style="width:58px"></span></span>
                </div>
              </div>
            </div>
          </div>
        </div>` : '';

  const navHtml = (prevEp || nextEp) ? `
        <div class="wp-nav">
          ${prevEp ? `<a href="${siteUrl}/watch?anime=${animeId}&ep=${prevEp}" class="wp-nav-btn"><svg viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/></svg><div class="wp-nav-inner"><span class="wp-nav-lbl">Previous</span><span class="wp-nav-ep">Episode ${prevEp}</span></div></a>`
            : `<div class="wp-nav-btn disabled"><svg viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/></svg><div class="wp-nav-inner"><span class="wp-nav-lbl">Previous</span><span class="wp-nav-ep">—</span></div></div>`}
          ${nextEp ? `<a href="${siteUrl}/watch?anime=${animeId}&ep=${nextEp}" class="wp-nav-btn next"><div class="wp-nav-inner"><span class="wp-nav-lbl">Next</span><span class="wp-nav-ep">Episode ${nextEp}</span></div><svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg></a>`
            : `<div class="wp-nav-btn next disabled"><div class="wp-nav-inner"><span class="wp-nav-lbl">Next</span><span class="wp-nav-ep">—</span></div><svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg></div>`}
        </div>` : '';

  const epTitleDisplay = currentEpInfo?.title && currentEpInfo.title !== 'TBA' ? h(currentEpInfo.title) : `Episode ${epNum}`;

  const jTitle = JSON.stringify(title);
  const jImage = JSON.stringify(coverSm);

  const charsHtml = chars.length > 0 ? `
      <div class="wp-chars">
        <div class="wp-chars-head"><span class="wp-chars-ttl">Characters</span><a href="${animePage}#tab-characters">All →</a></div>
        <div class="char-grid-v2">
          ${chars.map((chEntry) => {
            const ch = chEntry.character ?? {};
            const charId = ch.mal_id ?? 0;
            const role = chEntry.role ?? '';
            const img = ch.images?.jpg?.image_url ?? '';
            return `
          <a href="${siteUrl}/character?id=${charId}" class="char-v2">
            <div class="char-v2-img-wrap">
              ${img ? `<img src="${h(img)}" class="char-v2-img" alt="${h(ch.name ?? '')}" loading="lazy">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.4rem;background:var(--bg-surface)">🎭</div>`}
              <div class="char-v2-role-badge">${h(role)}</div>
            </div>
            <div class="char-v2-name">${h(ch.name ?? '')}</div>
          </a>`;
          }).join('')}
        </div>
      </div>` : '';

  // Sidebar episode list -- prefer Jikan's episode list (has real titles),
  // falling back to just the anime_list rows we actually have videos for.
  //
  // Long-running shows (Naruto, One Piece...) get an episode-range picker
  // (like anikura's "Kazekage Rescue · 1-32" chunks, minus the arc names --
  // no free API exposes those) so the sidebar isn't one giant unusable
  // scroll. Below EP_CHUNK_SIZE episodes this is a no-op and everything
  // renders exactly as before. Out-of-range items are hidden with an
  // inline style at render time (not just via JS after the fact) so there's
  // no flash of the full unfiltered list before the client script runs.
  const EP_CHUNK_SIZE = 30;
  const epNumsForRange = (
    allEps.length > 0 ? allEps.map((e: any) => Number(e.mal_id ?? 0)).filter((n) => n > 0)
    : allVideos.length > 0 ? allVideos.map((v) => v.episode_num)
    : totalEps > 0 ? Array.from({ length: totalEps }, (_, i) => i + 1)
    : []
  ).slice().sort((a, b) => a - b);
  const useRangePicker = epNumsForRange.length > EP_CHUNK_SIZE;
  const epChunks: number[][] = [];
  let rangeLo = -Infinity;
  let rangeHi = Infinity;
  let activeChunkIdx = 0;
  if (useRangePicker) {
    for (let i = 0; i < epNumsForRange.length; i += EP_CHUNK_SIZE) epChunks.push(epNumsForRange.slice(i, i + EP_CHUNK_SIZE));
    activeChunkIdx = epChunks.findIndex((c) => epNum >= c[0] && epNum <= c[c.length - 1]);
    if (activeChunkIdx === -1) activeChunkIdx = 0;
    rangeLo = epChunks[activeChunkIdx][0];
    rangeHi = epChunks[activeChunkIdx][epChunks[activeChunkIdx].length - 1];
  }
  const epRangeWrapHtml = useRangePicker ? `
        <div class="ep-range-wrap" id="ep-range-wrap">
          <button type="button" class="ep-range-btn" id="ep-range-toggle">
            <span id="ep-range-label">Episodes ${rangeLo}\u2013${rangeHi}</span>
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>
          </button>
          <div class="modal-overlay" id="ep-range-modal">
            <div class="modal" style="max-width:420px;">
              <div class="modal-header"><span style="font-weight:700;">Jump to episodes</span><button type="button" class="modal-close" id="ep-range-close">&times;</button></div>
              <div class="modal-body" style="padding:.5rem 0;max-height:60vh;overflow-y:auto;">
                ${epChunks.map((c, idx) => `<button type="button" class="ep-range-row${idx === activeChunkIdx ? ' active' : ''}" data-range-idx="${idx}"><span>Episodes ${c[0]}\u2013${c[c.length - 1]}</span><span class="ep-range-radio"></span></button>`).join('')}
              </div>
            </div>
          </div>
        </div>
        <script>window.__epChunks = ${JSON.stringify(epChunks)}; window.__epActiveChunk = ${activeChunkIdx};</script>` : '';

  let epListHtml: string;
  if (allEps.length > 0) {
    epListHtml = allEps.map((ep) => {
      const n = Number(ep.mal_id ?? 0);
      const ept = (ep.title ?? '') !== 'TBA' ? (ep.title ?? '') : '';
      const hasVid = videoEpNumSet.has(n);
      const isAct = n === epNum;
      const isWatched = episodesWatched > 0 && n <= episodesWatched;
      const outOfRange = useRangePicker && (n < rangeLo || n > rangeHi);
      return `
          <a href="${h(`${siteUrl}/watch?anime=${animeId}&ep=${n}`)}"
             class="ep-item${hasVid ? ' playable' : ''}${isAct ? ' active' : ''}${isWatched ? ' watched' : ''}"
             data-ep-num="${n}"
             ${outOfRange ? 'style="display:none" ' : ''}data-s="${h(`ep ${n} ${ept || 'episode ' + n}`.toLowerCase())}">
            <div class="ep-thumb-box" data-ep="${n}">
              <img src="${h(coverSm)}" alt="" class="ep-thumb-img" loading="lazy" onload="this.classList.add('vis')">
              <div class="ep-play-ov"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
              ${!hasVid ? `<span class="ep-num-fallback">${n}</span>` : ''}
            </div>
            <div class="ep-meta"><div class="ep-num-txt">Episode ${n}</div><div class="ep-title-txt">${h(ept || 'Episode ' + n)}</div></div>
            ${isAct ? `<span class="ep-live-dot"></span>` : ''}
          </a>`;
    }).join('');
  } else if (allVideos.length > 0) {
    epListHtml = allVideos.map((v) => {
      const n = v.episode_num;
      const isAct = n === epNum;
      const isWatched = episodesWatched > 0 && n <= episodesWatched;
      const outOfRange = useRangePicker && (n < rangeLo || n > rangeHi);
      return `
          <a href="${siteUrl}/watch?anime=${animeId}&ep=${n}" class="ep-item playable${isAct ? ' active' : ''}${isWatched ? ' watched' : ''}" data-ep-num="${n}"${outOfRange ? ' style="display:none"' : ''} data-s="ep ${n} ${(v.title || 'episode ' + n).toLowerCase()}">
            <div class="ep-thumb-box" data-ep="${n}">
              <img src="${h(coverSm)}" alt="" class="ep-thumb-img" loading="lazy" onload="this.classList.add('vis')">
              <div class="ep-play-ov"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
            </div>
            <div class="ep-meta"><div class="ep-num-txt">Episode ${n}</div><div class="ep-title-txt">${h(v.title || 'Episode ' + n)}</div></div>
            ${isAct ? `<span class="ep-live-dot"></span>` : ''}
          </a>`;
    }).join('');
  } else if (totalEps > 0) {
    // Neither Jikan nor our own DB has per-episode data (common for very
    // long-running shows -- Jikan's episode endpoint is frequently empty
    // past a few hundred episodes, and we may not have scraped every ep
    // into episode_videos yet). Fall back to numbered stubs 1..totalEps,
    // same as the ep-strip near the player already does, so the sidebar
    // list isn't left showing "No episode data" while playback works fine.
    epListHtml = Array.from({ length: totalEps }, (_, i) => i + 1).map((n) => {
      const isAct = n === epNum;
      const isWatched = episodesWatched > 0 && n <= episodesWatched;
      const outOfRange = useRangePicker && (n < rangeLo || n > rangeHi);
      return `
          <a href="${siteUrl}/watch?anime=${animeId}&ep=${n}" class="ep-item${isAct ? ' active' : ''}${isWatched ? ' watched' : ''}" data-ep-num="${n}"${outOfRange ? ' style="display:none"' : ''} data-s="ep ${n} episode ${n}">
            <div class="ep-thumb-box" data-ep="${n}">
              <img src="${h(coverSm)}" alt="" class="ep-thumb-img" loading="lazy" onload="this.classList.add('vis')">
              <div class="ep-play-ov"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
              <span class="ep-num-fallback">${n}</span>
            </div>
            <div class="ep-meta"><div class="ep-num-txt">Episode ${n}</div><div class="ep-title-txt">Episode ${n}</div></div>
            ${isAct ? `<span class="ep-live-dot"></span>` : ''}
          </a>`;
    }).join('');
  } else {
    epListHtml = `<div style="padding:.9rem;color:var(--text-muted);font-size:.85rem;">No episode data available.</div>`;
  }

  return `
<div class="av-ambient">
  <div class="av-ambient-img" style="background-image:url('${h(image)}')"></div>
  <div class="av-ambient-overlay"></div>
</div>

<div class="wp-page">
  <nav class="wp-crumb" aria-label="Breadcrumb">
    <a href="${siteUrl}/">Home</a><span class="sep">›</span>
    <a href="${animePage}">${h(title)}</a><span class="sep">›</span>
    <span class="now">Episode ${epNum}</span>
  </nav>

  <div class="wp-grid">
    <div class="wp-left">
      <div class="wp-player-zone">
        <div class="wp-player-glow"></div>
        ${playerHtml}
        ${serverControlsHtml}
        ${navHtml}
      </div>

      <div class="wp-info">
        <div class="wp-info-banner"></div>
        <div class="wp-info-head">
          <div class="wp-ep-chip">Episode ${epNum}${totalEps > 0 ? ` of ${totalEps}` : ''}</div>
          <div class="wp-ep-title">${epTitleDisplay}</div>
          <div class="wp-ep-meta">
            <a href="${animePage}">${h(title)}</a>
            ${currentEpInfo?.aired ? `<span class="dot">·</span><span>${new Date(currentEpInfo.aired).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>` : ''}
            ${currentEpInfo?.score ? `<span class="dot">·</span><span>⭐ ${currentEpInfo.score}</span>` : ''}
            ${currentEpInfo?.filler ? `<span class="ep-tag filler">Filler</span>` : ''}
            ${currentEpInfo?.recap ? `<span class="ep-tag recap">Recap</span>` : ''}
          </div>
        </div>

        <div class="wp-actions">
          <a href="${animePage}" class="wp-act-btn primary"><svg viewBox="0 0 24 24"><path d="M13 3L4 14h7v7l9-11h-7V3z"/></svg>Anime Page</a>
          ${isLoggedIn ? `<button class="wp-act-btn" onclick='addToList(${animeId}, ${jTitle}, ${jImage}, ${totalEps})'><svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>My List</button>` : ''}
          <a href="https://myanimelist.net/anime/${animeId}" target="_blank" rel="noopener" class="wp-act-btn"><svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>MAL</a>
        </div>

        ${isLoggedIn ? `
        <div class="wp-prog-wrap" id="wp-prog">
          <div class="wp-prog-header"><span class="wp-prog-lbl">Progress</span><span class="wp-prog-time" id="wp-prog-time">—</span></div>
          <div class="wp-prog-track"><div class="wp-prog-fill" id="wp-prog-fill"></div></div>
        </div>` : ''}
      </div>

      ${charsHtml}
    </div>

    <div class="wp-sidebar">
      <div class="wp-anime-card">
        <div class="wp-anime-banner">
          <div class="wp-anime-banner-bg" style="background-image:url('${h(image)}')"></div>
          <div class="wp-anime-banner-grad"></div>
          <img src="${h(coverSm)}" class="wp-anime-poster" alt="${h(title)}" loading="lazy">
        </div>
        <div class="wp-anime-body">
          <div class="wp-anime-title"><a href="${animePage}">${h(title)}</a></div>
          <div class="wp-anime-sub">${h(animeType)}${animeType && status ? ' · ' : ''}${h(status)}${totalEps > 0 ? ` · ${totalEps} eps` : ''}</div>
          ${dubbedLangs.length > 0 ? `<div class="wp-anime-sub" style="color:var(--teal,#2dd4bf);font-size:0.78rem;margin-top:2px;">🎙️ Dubbed: ${h(dubbedLangs.map((l) => DUB_LANGUAGES[l] ?? l).join(', '))} <span style="color:var(--text-muted);">(© <a href="https://mydublist.com" target="_blank" rel="noopener" style="color:inherit;">MyDubList</a>)</span></div>` : ''}
          ${score ? `
          <div class="wp-score-row">
            <div class="wp-score"><svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>${score}</div>
            <div class="wp-score-bar-wrap"><div class="wp-score-bar" style="width:${Math.min(100, (score / 10) * 100)}%"></div></div>
          </div>` : ''}
          ${genres.length > 0 ? `<div class="wp-genres">${genres.map((g) => `<span class="wp-genre">${h(g.name)}</span>`).join('')}</div>` : ''}
        </div>
      </div>

      <div class="wp-ep-card">
        <div class="wp-ep-head">
          <span class="wp-ep-ttl">Episodes</span>
          ${allVideos.length > 0 ? `<span class="wp-ep-count">${allVideos.length} available</span>` : ''}
        </div>
        ${epRangeWrapHtml}
        <div class="wp-ep-search-wrap">
          <div class="wp-ep-search-ico"><svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16a6.471 6.471 0 004.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg></div>
          <input type="text" class="wp-ep-search" id="ep-search" placeholder="Search episodes…" oninput="filterEps(this.value)">
        </div>
        <div class="wp-ep-list" id="ep-list">${epListHtml}</div>
      </div>
    </div>
  </div>
</div>`;
}

function renderSignInGate(image: string, playId: string, signinId: string, signupId: string): string {
  return `<div class="wp-player-shell" id="watch-player-wrap">
              <div class="wp-gate">
                <div class="wp-gate-bg" style="background-image:url('${h(image)}')"></div>
                <div class="wp-gate-vignette"></div>
                <div class="wp-gate-inner">
                  <div class="wp-gate-ring" id="${playId}"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
                  <div><div class="wp-gate-title">Sign in to watch</div><div class="wp-gate-sub">Free account · No credit card needed</div></div>
                  <div class="wp-gate-btns">
                    <button class="wp-gate-cta" id="${signinId}">Sign In</button>
                    <button class="wp-gate-ghost" id="${signupId}">Join Free</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="wp-player-accent-line"></div>`;
}
