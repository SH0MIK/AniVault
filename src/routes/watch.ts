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
import { icon } from '../lib/icons';
import { renderHeader, renderFooter, CurrentUser } from '../render/layout';
import { WATCH_CSS } from '../render/watch-css';
import { watchScript1 } from '../render/watch-script1';
import { watchScript2 } from '../render/watch-script2';
import { PLAYER_CSS } from '../render/player-css';
import { playerScript } from '../render/player-script';
import { playerBody } from '../render/player-body';
import { getBannerData } from '../lib/settings';
import { AnimeTracker } from '../lib/tracker';
import { EpisodeAir, AiredInfo } from '../lib/episode-air';
import { DubStatus, DUB_LANGUAGES } from '../lib/dub-status';
import { getEpisodeThumbnail } from '../lib/episode-thumb';
import { SUB_PROVIDERS, DUB_PROVIDERS, HINDI_PROVIDERS, fixedServerBtn } from '../lib/stream-sources';

interface TurboVidServerRow { id:number; anime_id:number; episode_num:number; audio_group:string; language:string; label:string; embed_url:string; is_active:number; }

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
 * scraper API (cached in D1, see getEpisodeThumbnail). Only falls back to
 * the anime's cover art if neither of those has anything. */
async function getEpisodeOgImage(
  db: Db, env: { SCRAPER_API_BASE?: string },
  malId: number, epNum: number, fallback: string, animeStatus?: string | null
): Promise<string> {
  try {
    const row = await db.fetchOne<{ image_url: string | null }>(
      'SELECT image_url FROM episode_overrides WHERE anime_id = ? AND episode_num = ?',
      [malId, epNum]
    );
    if (row?.image_url) return row.image_url;
  } catch { /* fall through to scraper/fallback */ }

  const scraped = await getEpisodeThumbnail(env, db, malId, epNum, animeStatus);
  return scraped ?? fallback;
}

// Matches the user-agents link-preview crawlers send (Facebook, Discord,
// Twitter/X, Slack, Telegram, WhatsApp, LinkedIn, iMessage/Applebot, etc).
// These never render JS or need the player -- they just read <head> meta
// tags and move on. The full handler below does ~6 sequential external
// calls (MAL/Jikan/scraper for anime, episodes, characters, AniList id
// mapping, episode thumbnail) plus an anonymous-visitor auto-register DB
// write, since crawlers send no session cookie. That easily adds up past a
// crawler's own timeout (this is why Facebook's Sharing Debugger was
// reporting "Curl Timeout" / no OG tags even though the page itself loads
// fine for a real browser). This fast path skips all of that: one cached
// anime lookup, no auth/account creation, no watch-history write, no
// episode/character/AniList calls.
const PREVIEW_BOT_RE = /facebookexternalhit|Facebot|Twitterbot|Discordbot|Slackbot|TelegramBot|WhatsApp|LinkedInBot|Pinterest|SkypeUriPreview|vkShare|redditbot|Applebot|Google-InspectionTool|W3C_Validator/i;

watchRoutes.get('/watch', async (c) => {
  const siteUrl = c.env.SITE_URL;
  const animeId = parseInt(c.req.query('anime') ?? '0', 10) || 0;
  const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;
  if (!animeId || !epNum) return c.redirect(siteUrl + '/');

  const ua = c.req.header('user-agent') ?? '';
  if (PREVIEW_BOT_RE.test(ua)) {
    const db = new Db(c.env.DB);
    const mal = new MalAPI(c.env, c.env.API_CACHE, db);
    const result = await mal.getAnime(animeId);
    const anime = result.data;
    if (!anime) return c.html('', 404);

    const title = getAnimeTitle(anime);
    const cover = anime.images?.jpg?.large_image_url ?? '';
    const bannerInfo = await mal.getLocalAnimeBannerInfo(animeId).catch(() => null);
    const coverFallback = bannerInfo?.image_url || cover;
    const image = await getEpisodeOgImage(db, c.env, animeId, epNum, coverFallback, anime.status);
    const __banner = await getBannerData(db);
    const html = renderHeader({
      ...__banner, siteUrl, siteName: c.env.SITE_NAME, pageTitle: `Ep ${epNum} — ${title}`, currentPage: 'watch',
      currentUser: null, unreadCount: 0, requestUrl: c.req.url,
      ogData: {
        title: `Ep ${epNum} — ${title} | AniVault`,
        description: `Watch ${title} Episode ${epNum} on AniVault`,
        image, image_width: 1280, image_height: 720,
        url: `${siteUrl}/watch?anime=${animeId}&ep=${epNum}`,
        type: 'video.episode',
      },
    }) + `</main></body></html>`;
    return c.html(html);
  }

  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  const mal = new MalAPI(c.env, c.env.API_CACHE, db);

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
  // Finished and not-yet-aired shows skip all of that and use anime.episodes
  // straight from MAL — that field is already accurate once a show isn't
  // actively airing, so there's nothing for the cache to correct.
  const isAiring = anime.status === 'Currently Airing';
  let airedInfo: AiredInfo | null = null;
  if (isAiring) {
    const cached = await EpisodeAir.getCachedAny(db, animeId);
    airedInfo = cached.info;
    if (!cached.isFresh) {
      c.executionCtx?.waitUntil?.(EpisodeAir.get(db, c.env, mal, animeId).catch(() => {}));
    }
  }
  const totalEps = isAiring ? (airedInfo?.total ?? anime.episodes ?? 0) : (anime.episodes ?? 0);
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
  const turbovidServers = await db.fetchAll<TurboVidServerRow>('SELECT id,anime_id,episode_num,audio_group,language,label,embed_url,is_active FROM turbovid_servers WHERE anime_id=? AND episode_num=? AND is_active=1 ORDER BY audio_group, language, id',[animeId,epNum]);

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

  // Episode navigation should follow the actual episode list, not only uploaded
  // episode_videos. Otherwise Prev/Next become disabled whenever the current
  // episode is the only one uploaded locally.
  let navEpNums = allEps
    .map((ep: any) => Number(ep.mal_id ?? 0))
    .filter((n: number) => n > 0);
  if (navEpNums.length === 0) {
    navEpNums = allVideos.map((v) => Number(v.episode_num)).filter((n) => n > 0);
  }
  if (navEpNums.length === 0 && totalEps > 0) {
    navEpNums = Array.from({ length: totalEps }, (_, i) => i + 1);
  }
  navEpNums = Array.from(new Set(navEpNums)).sort((a, b) => a - b);

  let prevEp: number | null = null;
  let nextEp: number | null = null;
  for (const n of navEpNums) {
    if (n < epNum && (prevEp === null || n > prevEp)) prevEp = n;
    if (n > epNum && (nextEp === null || n < nextEp)) nextEp = n;
  }
  if (prevEp === null && epNum > 1) prevEp = epNum - 1;
  if (nextEp === null && (totalEps === 0 || epNum < totalEps)) nextEp = epNum + 1;

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

  const bannerInfo = await mal.getLocalAnimeBannerInfo(animeId).catch(() => null);
  const ogImage = await getEpisodeOgImage(db, c.env, animeId, epNum, bannerInfo?.image_url || image, anime.status);

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
    videoEpNumSet, resumeT, layoutUser, siteUrl, episodesWatched, dubbedLangs, turbovidServers,
  });

  // Senshi player is emitted before the startup scripts so the player DOM
  // is guaranteed to exist when watchScript1 begins its DOM-ready startup.
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

  if (justAutoCreated) {
    html += `<script>window.__autoAccountInfo=${JSON.stringify(justAutoCreated)};</script>`;
  }

  html += renderFooter({ siteUrl, currentUser: layoutUser });


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
  turbovidServers: TurboVidServerRow[];
}

export function renderWatchBody(p: WatchBodyParams): string {
  const { anime, image, coverSm, title, animeId, epNum, totalEps, video, qSub, hasMegaplayFallback,
    isLoggedIn, prevEp, nextEp, currentEpInfo, chars, allEps, allVideos, videoEpNumSet, resumeT, layoutUser, siteUrl,
    episodesWatched, dubbedLangs, turbovidServers } = p;

  const genres = (anime.genres ?? []).slice(0, 6);
  const score = anime.score;
  const status = anime.status ?? '';
  const animeType = anime.type ?? '';
  const animePage = `${siteUrl}/anime?id=${animeId}`;

  const hasRealVideo = !!video && (qSub.length > 0 || !!video.video_url);
  const hasTurboVid = turbovidServers.length > 0;

  let playerHtml: string;
  if (hasRealVideo) {
    playerHtml = isLoggedIn
      ? `<div class="wp-player-shell" id="watch-player-wrap">${qSub.length > 0 ? qSub[0].embed : `<iframe id="main-player-iframe" src="${h(video!.video_url ?? '')}" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share" allowfullscreen loading="lazy"></iframe>`}</div><div class="wp-player-accent-line"></div>`
      : renderSignInGate(image, 'wg-play', 'wg-signin', 'wg-signup');
  } else if (hasMegaplayFallback || hasTurboVid) {
    // Keep the player shell present whenever a saved TurboVid source exists.
    // The old "Finding the best server" gate could remain visible while the
    // AV source was already playing because watchScript1 ran before the
    // hidden Senshi player DOM was emitted.
    playerHtml = isLoggedIn
      ? `<div class="wp-player-shell" id="watch-player-wrap"><div class="wp-player-loading" id="wp-player-loading"><div class="wp-player-loading-ring"></div><span>Loading player...</span></div></div><div class="wp-player-accent-line"></div>`
      : renderSignInGate(image, 'wg-play2', 'wg-signin2', 'wg-signup2');
  } else {
    playerHtml = `<div class="wp-no-video"><div class="nv-icon">🎬</div><p>No video available yet.<br>Check back later or explore other episodes.</p><a href="${animePage}" class="btn btn-ghost btn-sm" style="margin-top:.25rem">← Back to Anime</a></div>`;
  }

  const serverControlsHtml = (isLoggedIn && (video || hasMegaplayFallback || hasTurboVid)) ? `
        <div class="wp-controls">
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
              <div class="server-tabs"><button class="server-tab active" data-tab="sub">${icon('captions', 'server-tab-icon')}<span>Sub</span></button><button class="server-tab" data-tab="dub">${icon('mic', 'server-tab-icon')}<span>Dub</span></button></div>
              <div class="server-tab-panel active" id="tab-panel-sub" data-audio="sub">
                <div class="source-tabs" role="tablist" aria-label="Subtitle source type">
                  <button type="button" class="source-tab active" data-source-tab="hls" data-audio="sub">HLS</button>
                  <button type="button" class="source-tab" data-source-tab="embed" data-audio="sub">Embed</button>
                </div>
                <div class="source-panel active" id="source-panel-sub-hls">
                  <div class="server-btn-row" id="servers-sub-body">
                    ${turbovidServers.filter(v=>v.audio_group==='sub').map(v=>` <button class="server-btn turbovid-server-btn av-server" data-server="turbovid:${v.id}" data-turbovid-id="${v.id}" title="AniVault Sub"><img class="av-server-logo" src="${siteUrl}/assets/img/site-img/icon.png" alt="" aria-hidden="true"><span class="av-server-label" style="margin-left:4px;">Sub</span></button>`).join('')}
                    ${SUB_PROVIDERS.map(p => fixedServerBtn('sub', p.source, p.provider, p.label)).join('')}
                  </div>
                </div>
                <div class="source-panel" id="source-panel-sub-embed">
                  <div class="server-btn-row">
                    <button type="button" class="embed-server-btn" data-embed-url="https://babastream.top/embed/${animeId}/${epNum}/sub" title="BabaStream — embedded player with downloading available">
                      <span class="embed-server-name">BabaStream</span>
                      <span class="embed-server-badge">↓ Download</span>
                    </button>
                  </div>
                </div>
              </div>
              <div class="server-tab-panel" id="tab-panel-dub" data-audio="dub">
                <div class="source-tabs" role="tablist" aria-label="Dub source type">
                  <button type="button" class="source-tab active" data-source-tab="hls" data-audio="dub">HLS</button>
                  <button type="button" class="source-tab" data-source-tab="embed" data-audio="dub">Embed</button>
                </div>
                <div class="source-panel active" id="source-panel-dub-hls">
                  <div class="server-btn-row" id="servers-dub-body">
                    ${turbovidServers.filter(v=>v.audio_group==='dub').map(v=>` <button class="server-btn turbovid-server-btn av-server" data-server="turbovid:${v.id}" data-turbovid-id="${v.id}" title="AniVault Dub"><img class="av-server-logo" src="${siteUrl}/assets/img/site-img/icon.png" alt="" aria-hidden="true"><span class="av-server-label" style="margin-left:4px;">Dub</span></button>`).join('')}
                    ${DUB_PROVIDERS.map(p => fixedServerBtn('dub', p.source, p.provider, p.label)).join('')}
                  </div>
                  <div class="server-group" id="dub-hindi-group">
                    <div class="server-group-label">Hindi Dub</div>
                    <div class="server-group-body" id="servers-dub-hindi-body">
                      ${turbovidServers.filter(v=>v.audio_group==='hindi').map(v=>` <button class="server-btn turbovid-server-btn av-server" data-server="turbovid:${v.id}" data-turbovid-id="${v.id}" title="AniVault Hindi"><img class="av-server-logo" src="${siteUrl}/assets/img/site-img/icon.png" alt="" aria-hidden="true"><span class="av-server-label" style="margin-left:4px;">Hindi</span></button>`).join('')}
                      ${HINDI_PROVIDERS.map(p => fixedServerBtn('hindi', p.source, p.provider, p.label)).join('')}
                    </div>
                  </div>
                  <div class="server-group" id="dub-multi-group" style="${turbovidServers.some(v=>v.audio_group==='multi') ? '' : 'display:none'}">
                    <div class="server-group-label">Multi Dub</div>
                    <div class="server-group-body" id="servers-dub-multi-body">
                      ${turbovidServers.filter(v=>v.audio_group==='multi').map(v=>` <button class="server-btn turbovid-server-btn av-server" data-server="turbovid:${v.id}" data-turbovid-id="${v.id}" title="AniVault Multi"><img class="av-server-logo" src="${siteUrl}/assets/img/site-img/icon.png" alt="" aria-hidden="true"><span class="av-server-label" style="margin-left:4px;">${h(v.language || 'dub')}</span></button>`).join('')}
                      <div class="server-skel-group" id="servers-dub-multi-loading">
                        <span class="server-skel"><span class="server-skel-dot"></span><span class="server-skel-bar" style="width:64px"></span></span>
                        <span class="server-skel"><span class="server-skel-dot"></span><span class="server-skel-bar" style="width:50px"></span></span>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="source-panel" id="source-panel-dub-embed">
                  <div class="server-btn-row">
                    <button type="button" class="embed-server-btn" data-embed-url="https://babastream.top/embed/${animeId}/${epNum}/dub" title="BabaStream — embedded player with downloading available">
                      <span class="embed-server-name">BabaStream</span>
                      <span class="embed-server-badge">↓ Download</span>
                    </button>
                  </div>
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>` : '';

  const epTitleDisplay = currentEpInfo?.title && currentEpInfo.title !== 'TBA' ? h(currentEpInfo.title) : `Episode ${epNum}`;

  const jTitle = JSON.stringify(title);
  const jImage = JSON.stringify(coverSm);

  const charsHtml = chars.length > 0 ? `
      <section class="watch-character-section">
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
      </section>` : '';

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

  const resumeLabel = resumeT > 0
    ? `${Math.floor(resumeT / 60)}:${String(resumeT % 60).padStart(2, '0')}`
    : '';
  const watchProgress = totalEps > 0 && episodesWatched > 0
    ? Math.min(100, Math.round((episodesWatched / totalEps) * 100))
    : 0;

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

  <div class="watch-layout">
    <main class="watch-main">
      <section class="wp-player-zone">
        <div class="wp-player-glow"></div>
        ${playerHtml}
        <div class="watch-quick-nav" data-next-url="${nextEp ? `${siteUrl}/watch?anime=${animeId}&ep=${nextEp}` : ''}" data-prev-url="${prevEp ? `${siteUrl}/watch?anime=${animeId}&ep=${prevEp}` : ''}">
          <button type="button" class="watch-auto-next" id="watch-auto-next" aria-pressed="false" title="Auto play next episode">
            <span class="watch-auto-copy">Auto Next</span>
            <span class="watch-toggle" aria-hidden="true"><span class="watch-toggle-knob"></span></span>
          </button>
          <button type="button" class="watch-native-player" id="watch-native-player" aria-pressed="false" title="Use the browser's native video player">
            <span class="watch-native-copy">Native</span>
            <span class="watch-native-toggle" aria-hidden="true"><span class="watch-native-knob"></span></span>
          </button>
          ${prevEp ? `<a class="watch-quick-btn prev" href="${siteUrl}/watch?anime=${animeId}&ep=${prevEp}" aria-label="Previous episode">${icon('skip-back', 'watch-ep-icon')}<span>Prev</span></a>` : `<span class="watch-quick-btn prev disabled">${icon('skip-back', 'watch-ep-icon')}<span>Prev</span></span>`}
          ${nextEp ? `<a class="watch-quick-btn next" href="${siteUrl}/watch?anime=${animeId}&ep=${nextEp}" aria-label="Next episode"><span>Ep ${nextEp}</span>${icon('skip-forward', 'watch-ep-icon')}</a>` : `<span class="watch-quick-btn next disabled"><span>Ep —</span>${icon('skip-forward', 'watch-ep-icon')}</span>`}
        </div>     <div class="watch-title-under-player">
          <div class="watch-title-ep">Episode ${epNum}</div>
          <h1>${h(title)}</h1>
          ${currentEpInfo?.title && currentEpInfo.title !== 'TBA' ? `<div class="watch-title-sub">${epTitleDisplay}</div>` : ''}
        </div>
        ${serverControlsHtml}
      </section>

      <div class="watch-content-flow">
      <section class="watch-episode-card">
        <div class="watch-episode-main">
          ${currentEpInfo?.synopsis ? `<p class="watch-synopsis">${h(currentEpInfo.synopsis)}</p>` : ''}
        </div>
        <div class="watch-action-row">
          <a href="${animePage}" class="watch-action primary">
            <svg viewBox="0 0 24 24"><path d="M13 3 4 14h7v7l9-11h-7V3Z"/></svg> Anime page
          </a>
          ${isLoggedIn ? `<button class="watch-action" type="button" onclick='addToList(${animeId}, ${jTitle}, ${jImage}, ${totalEps})'>
            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg> My List
          </button>` : ''}
          <a href="https://myanimelist.net/anime/${animeId}" target="_blank" rel="noopener" class="watch-action">
            <svg viewBox="0 0 24 24"><path d="M14 3h7v7M21 3l-9 9M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"/></svg> MAL
          </a>
          <button class="watch-action" type="button" onclick="if(navigator.clipboard){navigator.clipboard.writeText(location.href).then(()=>{this.textContent='Copied';setTimeout(()=>this.textContent='Share',1000)})}">
            <svg viewBox="0 0 24 24"><path d="M8 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2M16 9H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2-2v-8"/></svg> Share
          </button>
        </div>

        ${isLoggedIn ? `
        <div class="watch-progress-card">
          <div class="watch-progress-head">
            <span>YOUR WATCH PROGRESS</span>
            <strong>${episodesWatched > 0 ? `Episode ${episodesWatched} of ${totalEps || '—'}` : 'Start watching'}</strong>
          </div>
          <div class="watch-progress-track"><span style="width:${watchProgress}%"></span></div>
          <div class="watch-progress-foot">
            <span>${resumeLabel ? `Resume point: ${resumeLabel}` : 'Progress is saved automatically while you watch.'}</span>
            ${watchProgress > 0 ? `<span>${watchProgress}%</span>` : ''}
          </div>
        </div>` : ''}
      </section>

      <div class="watch-character-slot">${charsHtml}</div>
      </div>
    </main>

    <aside class="watch-sidebar">
      <section class="watch-anime-card">
        <div class="watch-anime-art">
          <img src="${h(anime.cover_image || coverSm)}" alt="${h(title)}" loading="lazy">
          <div class="watch-anime-art-shade"></div>
          <div class="watch-anime-art-info">
            <span>${h(animeType || 'ANIME')}</span>
            <span>${totalEps > 0 ? `${totalEps} EPISODES` : 'EPISODES'}</span>
          </div>
        </div>
        <div class="watch-anime-body">
          <a class="watch-anime-title" href="${animePage}">${h(title)}</a>
          <div class="watch-anime-status">${h(status || 'Status unavailable')}${score ? ` <span>·</span> ★ ${score}` : ''}</div>
          ${score ? `<div class="watch-score-line"><strong>★ ${score}</strong><div><span style="width:${Math.min(100, (score / 10) * 100)}%"></span></div></div>` : ''}
          <a class="watch-anime-open" href="${animePage}">Open anime details <span>→</span></a>
        </div>
      </section>

      <section class="watch-queue-card">
        <div class="watch-queue-head">
          <div>
            <div class="watch-section-eyebrow">QUEUE</div>
            <h2>Episodes</h2>
          </div>
          ${allVideos.length > 0 ? `<span class="watch-queue-count">${allVideos.length} ready</span>` : ''}
        </div>
        ${epRangeWrapHtml}
        <div class="watch-queue-search">
          <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.27-.27A6.47 6.47 0 1 0 14 15.5l.27.27v.79l5 5L20.5 20l-5-5Zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14Z"/></svg>
          <input type="text" id="ep-search" placeholder="Find an episode…" oninput="filterEps(this.value)">
        </div>
        <div class="wp-ep-list" id="ep-list">${epListHtml}</div>
      </section>
    </aside>
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
