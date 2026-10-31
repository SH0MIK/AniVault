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
import { Auth } from '../lib/auth';
import type { NormalisedAnime } from '../lib/mal-api';
import { getHoshikaAnimeById, getHoshikaAnimeEpisodesById } from '../lib/hoshika-api';
import { findIdentityByHoshikaId, findIdentityByLegacyMalId } from '../lib/anime-identity';
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
import { DubStatus, DUB_LANGUAGES } from '../lib/dub-status';
import { SUB_PROVIDERS, DUB_PROVIDERS, HINDI_PROVIDERS, fixedServerBtn } from '../lib/stream-sources';
import { renderWatchComments } from '../render/watch-comments';

interface VdoHideServerRow { [key: string]: unknown; id:number; anime_id:number; episode_num:number; label:string; embed_url:string; audio_tracks:string; is_active:number; }

export const watchRoutes = new Hono<{ Bindings: Env }>();
function vdoTrackGroup(track: any): 'sub'|'dub'|'hindi'|'multi' {
  const label = String(track?.label || track?.name || '').trim().toLowerCase();
  const lang = String(track?.lang || '').trim().toLowerCase();
  const text = (label + ' ' + lang).trim();
  if (lang === 'hi' || lang === 'hin' || /^hi$|^hin$|hindi|हिन्दी|हिंदी/.test(text) || /hindi/.test(label)) return 'hindi';
  if (lang === 'en' || lang === 'eng' || /^en$|^eng$|english/.test(text) || /english/.test(label)) return 'dub';
  if (lang === 'ja' || lang === 'jpn' || /^ja$|^jpn$|japanese|日本語|\b(sub|subtitle|original)\b/.test(text)) return 'sub';
  return track?.default ? 'sub' : 'multi';
}
function prettyVdoTrackLabel(t: any, group: string): string {
  const raw = String(t?.label || t?.name || '').trim();
  const lang = String(t?.lang || '').trim().toLowerCase();
  const map: Record<string, string> = {
    hin: 'Hindi', hi: 'Hindi',
    eng: 'English', en: 'English',
    jpn: 'Japanese', ja: 'Japanese',
    tam: 'Tamil', ta: 'Tamil',
    tel: 'Telugu', te: 'Telugu',
    mal: 'Malayalam', ml: 'Malayalam',
    kan: 'Kannada', kn: 'Kannada',
  };
  if (map[raw.toLowerCase()]) return map[raw.toLowerCase()];
  if (lang && map[lang]) {
    if (!raw || raw.toLowerCase() === lang) return map[lang];
    return raw + ' (' + map[lang] + ')';
  }
  return raw || (group === 'hindi' ? 'Hindi' : 'VdoHide');
}
function parseVdoTracks(row: VdoHideServerRow): any[] {
  try {
    const v=JSON.parse(row.audio_tracks||'[]');
    if (!Array.isArray(v)) return [];
    const seen: Record<string,number> = {};
    return v.map((t:any) => {
      const group=vdoTrackGroup(t);
      const label=String(t?.label || t?.name || '').trim().toLowerCase();
      const lang=String(t?.lang || '').trim().toLowerCase();
      const base=[label,lang,group].join('|');
      const occurrence=seen[base]||0; seen[base]=occurrence+1;
      return {...t, group, key:[label,lang,group,occurrence].join('|')};
    });
  } catch { return []; }
}
function renderVdoTrackButtons(servers: VdoHideServerRow[], group: string, siteUrl: string): string {
  return servers.flatMap(v => {
    const tracks = parseVdoTracks(v as any);
    const matching = tracks.filter(t => t.group === group);
    if (matching.length > 0) {
      return matching.map(t =>
        '<button class="server-btn vdohide-server-btn av-server" data-server="vdohide:' + v.id + '" data-vdohide-id="' + v.id + '" data-vdo-track-key="' + h(t.key || '') + '"><img class="av-server-logo" src="' + siteUrl + '/assets/img/site-img/icon.png" alt="" aria-hidden="true"><span class="av-server-label" style="margin-left:4px;">' + h(prettyVdoTrackLabel(t, group)) + '</span></button>'
      );
    }
    if (tracks.length === 0 && group === 'sub') {
      return ['<button class="server-btn vdohide-server-btn av-server" data-server="vdohide:' + v.id + '" data-vdohide-id="' + v.id + '" data-vdo-track-key=""><img class="av-server-logo" src="' + siteUrl + '/assets/img/site-img/icon.png" alt="" aria-hidden="true"><span class="av-server-label" style="margin-left:4px;">' + h(v.label || 'VdoHide') + '</span></button>'];
    }
    return [];
  }).join('');
}
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

/** Episode-specific social preview image. During the Hoshika migration, use
 * an admin-saved override when available and otherwise the verified anime
 * cover. Do not read or repopulate the legacy scraper thumbnail cache. */
async function getEpisodeOgImage(
  db: Db, malId: number, epNum: number, fallback: string
): Promise<string> {
  try {
    const row = await db.fetchOne<{ image_url: string | null }>(
      'SELECT image_url FROM episode_overrides WHERE anime_id = ? AND episode_num = ?',
      [malId, epNum]
    );
    if (row?.image_url) return row.image_url;
  } catch { /* use the verified anime cover as a fallback */ }
  return fallback;
}

// Matches the user-agents link-preview crawlers send (Facebook, Discord,
// Twitter/X, Slack, Telegram, WhatsApp, LinkedIn, iMessage/Applebot, etc).
// These never render JS or need the player -- they just read <head> meta
// tags and move on. The full handler does additional Hoshika and database
// lookups plus an anonymous-visitor auto-register DB write, since crawlers
// send no session cookie. This fast path skips the player and nonessential
// page work so link previews can return quickly: one cached
// anime lookup, no auth/account creation, no watch-history write, no
// episode/character/AniList calls.
const PREVIEW_BOT_RE = /facebookexternalhit|Facebot|Twitterbot|Discordbot|Slackbot|TelegramBot|WhatsApp|LinkedInBot|Pinterest|SkypeUriPreview|vkShare|redditbot|Applebot|Google-InspectionTool|W3C_Validator/i;

async function getMappedWatchAnime(db: Db, requestedId: string | number, apiKey?: string): Promise<{ anime: NormalisedAnime; shortId: string } | null> {
  // Hoshika is the sole catalogue identity. Never reinterpret a requested
  // Hoshika ID as a legacy MAL ID or borrow metadata from another catalogue.
  const rawId = String(requestedId ?? '').trim();
  const hoshikaLookupId = rawId.replace(/^hsk-/i, '');
  const identity = await findIdentityByHoshikaId(db, hoshikaLookupId).catch(() => null);
  const shortId = identity?.hoshika_short_id ?? hoshikaLookupId;
  const hoshika = await getHoshikaAnimeById(shortId, apiKey).catch(() => null);
  if (!hoshika) return null;
  const poster = hoshika.poster || hoshika.cover || '';
  const banner = hoshika.cover || hoshika.poster || '';
  const status = /airing|ongoing|currently/i.test(hoshika.status) ? 'Currently Airing'
    : /upcoming|not.?yet/i.test(hoshika.status) ? 'Not yet aired'
    : hoshika.status ? hoshika.status : 'Unknown';
  const anime = {
    mal_id: requestedId,
    title: hoshika.title || 'Unknown anime',
    title_english: hoshika.titleEnglish || '',
    title_japanese: hoshika.titleJapanese || '',
    cover_image: banner,
    images: { jpg: { image_url: poster, large_image_url: banner } },
    synopsis: hoshika.synopsis || '',
    background: '',
    score: hoshika.score,
    scored_by: null,
    rank: null,
    popularity: null,
    episodes: hoshika.episodes ?? 0,
    status,
    type: hoshika.type || '',
    rating: '',
    source: '',
    duration: null,
    aired: { string: null },
    start_date: null,
    genres: hoshika.genres.map((name, index) => ({ mal_id: -(index + 1), name })),
    studios: [],
    related_anime: [],
    recommendations: [],
    trailer: [],
    themes: [],
    members: 0,
    broadcast: { day: null, time: null },
    duration_mins: null,
  } as NormalisedAnime;
  return { anime, shortId };
}

watchRoutes.get('/watch', async (c) => {
  const siteUrl = c.env.SITE_URL;
  const animeParam = (c.req.query('anime') ?? '').trim();
  const requestedId = animeParam.replace(/^hsk-/i, '');
  const requestedNumericId = /^\d+$/.test(requestedId) ? Number(requestedId) : 0;
  const epNum = parseInt(c.req.query('ep') ?? '0', 10) || 0;
  if (!requestedId || !epNum) return c.redirect(siteUrl + '/');

  const db = new Db(c.env.DB);
  // Public watch URLs use Hoshika shortIds. Older AniVault links may still
  // contain MAL IDs, so resolve those only through an explicitly verified map.
  let hoshikaId = requestedId;
  let identity = requestedNumericId
    ? await findIdentityByHoshikaId(db, requestedId).catch(() => null)
    : null;
  if (!identity && requestedNumericId) {
    identity = await findIdentityByLegacyMalId(db, requestedNumericId).catch(() => null);
    if (identity?.verified === 1) hoshikaId = identity.hoshika_short_id;
  }
  // Watch-history and episode-source tables need a stable numeric key. Prefer the
  // verified legacy MAL key when one exists; otherwise use the Hoshika shortId.
  // Falling back to 0 makes Continue Watching link to anime=0 and breaks poster lookup.
  const animeId = identity?.verified === 1 && identity.legacy_mal_id
    ? identity.legacy_mal_id
    : (requestedNumericId || (Number( hoshikaId ) || 0));

  const ua = c.req.header('user-agent') ?? '';
  if (PREVIEW_BOT_RE.test(ua)) {
    const mapped = await getMappedWatchAnime(db, hoshikaId, c.env.HOSHIKA_API_KEY);
    if (!mapped) return c.text('Anime not found in Hoshika. Please check the Hoshika ID.', 404);
    const anime = mapped.anime;
    const title = getAnimeTitle(anime);
    const coverFallback = anime.images?.jpg?.large_image_url ?? '';
    const image = await getEpisodeOgImage(db, animeId, epNum, coverFallback);
    const __banner = await getBannerData(db);
    const html = renderHeader({
      ...__banner, siteUrl, siteName: c.env.SITE_NAME, pageTitle: `Ep ${epNum} — ${title}`, currentPage: 'watch',
      currentUser: null, unreadCount: 0, requestUrl: c.req.url,
      ogData: {
        title: `Ep ${epNum} — ${title} | AniVault`,
        description: `Watch ${title} Episode ${epNum} on AniVault`,
        image, image_width: 1280, image_height: 720,
        url: `${siteUrl}/watch?anime=${encodeURIComponent(hoshikaId)}&ep=${epNum}`,
        type: 'video.episode',
      },
    }) + `</main></body></html>`;
    return c.html(html);
  }

  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  // Accept Hoshika IDs directly and resolve legacy MAL URLs through the verified map.
  const mapped = await getMappedWatchAnime(db, hoshikaId, c.env.HOSHIKA_API_KEY);
  if (!mapped) return c.text('Anime not found in Hoshika. Please check the Hoshika ID.', 404);
  const anime = mapped.anime;

  // Watching remains public. Signed-out visitors do not receive an account;
  // account-specific progress and list actions are gated in the API.

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
  const hoshikaEpisodes = await getHoshikaAnimeEpisodesById(mapped.shortId, c.env.HOSHIKA_API_KEY);
  const totalEps = Math.max(anime.episodes ?? 0, hoshikaEpisodes?.length ?? 0);
  const hoshikaNumericId = Number(mapped.shortId) || 0;
  const animeLookupIds = Array.from(new Set([animeId, hoshikaNumericId].filter((id) => id > 0)));
  const animeLookupSql = animeLookupIds.length > 1 ? 'IN (?, ?)' : '= ?';
  const dubbedLangs = await DubStatus.getFor(db, animeId);

  let epDurationSec = parseDurationSeconds(anime.duration);
  if (epDurationSec <= 0) epDurationSec = 1380;

  const video = await db.fetchOne<EpisodeVideoRow>(
    `SELECT * FROM episode_videos WHERE anime_id ${animeLookupSql} AND episode_num=? AND is_active=1 ORDER BY CASE WHEN anime_id=? THEN 0 ELSE 1 END LIMIT 1`,
    [...animeLookupIds, epNum, animeId]
  );

  const resumeT = Math.max(0, parseInt(c.req.query('t') ?? '0', 10) || 0);
  const resumeParam = resumeT >= 30 ? resumeT : 0;
  const hasMegaplayFallback = !video;
  const vdohideServers = await db.fetchAll<VdoHideServerRow>(`SELECT id,anime_id,episode_num,label,embed_url,audio_tracks,is_active FROM vdohide_servers WHERE anime_id ${animeLookupSql} AND episode_num=? AND is_active=1 ORDER BY id`,[...animeLookupIds,epNum]);

  const anilistId = 0;

  const allVideos = await db.fetchAll<{ episode_num: number; title: string | null }>(
    `SELECT episode_num, title FROM episode_videos WHERE anime_id ${animeLookupSql} AND is_active=1 ORDER BY episode_num ASC`,
    [...animeLookupIds]
  );
  // Episode navigation and titles are sourced only from Hoshika. Character
  // data is not available in the confirmed public Hoshika API.
  const allEps: any[] = (hoshikaEpisodes ?? []).map((ep) => ({
    mal_id: ep.number,
    title: ep.title || 'TBA',
    synopsis: '',
    aired: ep.aired,
    images: { jpg: { image_url: ep.thumbnail, large_image_url: ep.thumbnail } },
  }));
  const chars: any[] = [];

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

  const episodeStill = hoshikaEpisodes?.find((ep) => ep.number === epNum)?.thumbnail || image;
  const ogImage = await getEpisodeOgImage(db, animeId, epNum, episodeStill);

  const __banner = await getBannerData(db);
  let html = renderHeader({
    ...__banner,    siteUrl, siteName: c.env.SITE_NAME, pageTitle: `Ep ${epNum} — ${title}`, currentPage: 'watch',
    currentUser: layoutUser, unreadCount, requestUrl: c.req.url,
    ogData: {
      title: `Ep ${epNum} — ${title} | AniVault`,
      description: `"${currentEpInfo?.title && currentEpInfo.title !== 'TBA' ? currentEpInfo.title : 'Episode ' + epNum}" · Watch on AniVault`,
      image: ogImage, image_width: 1280, image_height: 720,
      url: `${siteUrl}/watch?anime=${encodeURIComponent(hoshikaId)}&ep=${epNum}`,
      type: 'video.episode',
    },
  });

  html += `<style>${WATCH_CSS}</style>`;
  html += renderWatchBody({
    anime, image, coverSm, title, animeId, hoshikaId: mapped.shortId, epNum, totalEps, video, qSub, hasMegaplayFallback,
    isLoggedIn: auth.check(), prevEp, nextEp, currentEpInfo, chars, allEps, allVideos,
    videoEpNumSet, resumeT, layoutUser, siteUrl, episodesWatched, dubbedLangs, vdohideServers,
  });

  // Senshi player is emitted before the startup scripts so the player DOM
  // is guaranteed to exist when watchScript1 begins its DOM-ready startup.
  // Senshi player -- pre-rendered hidden, moved into #watch-player-wrap by
  // the server-switching script on demand (same DOM-move pattern as the PHP version).
  const watchBase = `${siteUrl}/watch?anime=${encodeURIComponent(mapped.shortId)}&ep=`;
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
    anilistId, epNum, resumeParam, animeId, hoshikaId: mapped.shortId, siteUrl, qSub, qDub, isLoggedIn: auth.check(),
  });

  // Wall-clock progress tracker (logged-in users only, matches the PHP Auth::check() gate)
  if (auth.check()) {
    html += watchScript2(animeId, epNum, siteUrl, epDurationSec, totalEps);
  }
  html += renderFooter({ siteUrl, currentUser: layoutUser });


  await session.save(c, lifetime);
  return c.html(html);
});

interface WatchBodyParams {
  anime: NormalisedAnime;
  image: string;
  coverSm: string;
  title: string;
  animeId: number;
  hoshikaId: string;
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
  vdohideServers: VdoHideServerRow[];
}

export function renderWatchBody(p: WatchBodyParams): string {
  const { anime, image, coverSm, title, animeId, hoshikaId, epNum, totalEps, video, qSub, hasMegaplayFallback,
    isLoggedIn, prevEp, nextEp, currentEpInfo, chars, allEps, allVideos, videoEpNumSet, resumeT, layoutUser, siteUrl,
    episodesWatched, dubbedLangs, vdohideServers } = p;

  const genres = (anime.genres ?? []).slice(0, 6);
  const score = anime.score;
  const status = anime.status ?? '';
  const animeType = anime.type ?? '';
  const animePage = `${siteUrl}/anime?id=${encodeURIComponent(hoshikaId)}`;

  const hasRealVideo = !!video && (qSub.length > 0 || !!video.video_url);
  const hasVdoHide = vdohideServers.length > 0;

  let playerHtml: string;
  if (hasRealVideo) {
    playerHtml = `<div class="wp-player-shell" id="watch-player-wrap">${qSub.length > 0 ? qSub[0].embed : `<iframe id="main-player-iframe" src="${h(video!.video_url ?? '')}" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share" allowfullscreen loading="lazy"></iframe>`}</div><div class="wp-player-accent-line"></div>`;
  } else if (hasMegaplayFallback || hasVdoHide) {
    // Keep the player shell present whenever a local or VdoHide source exists.
    // The old "Finding the best server" gate could remain visible while the
    // AV source was already playing because watchScript1 ran before the
    // hidden Senshi player DOM was emitted.
    playerHtml = `<div class="wp-player-shell" id="watch-player-wrap"><div class="wp-player-loading" id="wp-player-loading"><div class="wp-player-loading-ring"></div><span>Loading player...</span></div></div><div class="wp-player-accent-line"></div>`;
  } else {
    playerHtml = `<div class="wp-no-video"><div class="nv-icon">🎬</div><p>No video available yet.<br>Check back later or explore other episodes.</p><a href="${animePage}" class="btn btn-ghost btn-sm" style="margin-top:.25rem">← Back to Anime</a></div>`;
  }

  const serverControlsHtml = ((video || hasMegaplayFallback || hasVdoHide)) ? `
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
                <div class="source-section source-section-hls">
                  <div class="source-section-head">
                    <span class="source-section-icon source-section-icon-hls" aria-hidden="true">ϟ</span>
                    <span>HLS</span>
                  </div>
                  <div class="server-btn-row" id="servers-sub-body">
${renderVdoTrackButtons(vdohideServers, 'sub', siteUrl)}
                    ${SUB_PROVIDERS.map(p => fixedServerBtn('sub', p.source, p.provider, p.label)).join('')}
                  </div>
                </div>
                <div class="source-section source-section-embed">
                  <div class="source-section-head">
                    <span class="source-section-icon source-section-icon-embed" aria-hidden="true">◎</span>
                    <span>EMBED</span>
                  </div>
                  <div class="server-btn-row">
                    <button type="button" class="embed-server-btn" data-embed-url="https://babastream.top/embed/${animeId}/${epNum}/sub" title="BabaStream — embedded player with downloading available">
                      <span class="embed-server-name">BabaStream</span>
                      <span class="embed-server-badge">↓ Download</span>
                    </button>
                  </div>
                </div>
              </div>
              <div class="server-tab-panel" id="tab-panel-dub" data-audio="dub">
                <div class="source-section source-section-hls">
                  <div class="source-section-head">
                    <span class="source-section-icon source-section-icon-hls" aria-hidden="true">ϟ</span>
                    <span>HLS</span>
                  </div>
                  <div class="server-btn-row" id="servers-dub-body">
${renderVdoTrackButtons(vdohideServers, 'dub', siteUrl)}
                    ${DUB_PROVIDERS.map(p => fixedServerBtn('dub', p.source, p.provider, p.label)).join('')}
                  </div>
                  <div class="server-group" id="dub-hindi-group">
                    <div class="server-group-label">Hindi Dub</div>
                    <div class="server-group-body" id="servers-dub-hindi-body">
${renderVdoTrackButtons(vdohideServers, 'hindi', siteUrl)}
                      ${HINDI_PROVIDERS.map(p => fixedServerBtn('hindi', p.source, p.provider, p.label)).join('')}
                    </div>
                  </div>
                  <div class="server-group" id="dub-multi-group" style="${(vdohideServers.some(v=>parseVdoTracks(v as any).some(t=>t.group==='multi'))) ? '' : 'display:none'}">
                    <div class="server-group-label">Multi Dub</div>
                    <div class="server-group-body" id="servers-dub-multi-body">
${renderVdoTrackButtons(vdohideServers, 'multi', siteUrl)}
                      <div class="server-skel-group" id="servers-dub-multi-loading">
                        <span class="server-skel"><span class="server-skel-dot"></span><span class="server-skel-bar" style="width:64px"></span></span>
                        <span class="server-skel"><span class="server-skel-dot"></span><span class="server-skel-bar" style="width:50px"></span></span>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="source-section source-section-embed">
                  <div class="source-section-head">
                    <span class="source-section-icon source-section-icon-embed" aria-hidden="true">◎</span>
                    <span>EMBED</span>
                  </div>
                  <div class="server-btn-row">
                    <button type="button" class="embed-server-btn" data-embed-url="https://babastream.top/embed/${animeId}/${epNum}/dub" title="BabaStream — embedded player with downloading available">
                      <span class="embed-server-name">BabaStream</span>
                      <span class="embed-server-badge">↓ Download</span>
                    </button>
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
      const episodeThumb = String(ep.images?.jpg?.image_url || ep.images?.jpg?.large_image_url || '').trim();
      const thumbSrc = episodeThumb || coverSm || image;
      return `
          <a href="${h(`${siteUrl}/watch?anime=${encodeURIComponent(hoshikaId)}&ep=${n}`)}"
             class="ep-item${hasVid ? ' playable' : ''}${isAct ? ' active' : ''}${isWatched ? ' watched' : ''}"
             data-ep-num="${n}"
             ${outOfRange ? 'style="display:none" ' : ''}data-s="${h(`ep ${n} ${ept || 'episode ' + n}`.toLowerCase())}">
            <div class="ep-thumb-box" data-ep="${n}">
              <img src="${h(thumbSrc)}" alt="" class="ep-thumb-img" loading="lazy" onload="this.classList.add('vis')" onerror="if(this.src!==${JSON.stringify(coverSm || image)}){this.src=${JSON.stringify(coverSm || image)};}else{this.style.display='none';}">
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
          <a href="${siteUrl}/watch?anime=${encodeURIComponent(hoshikaId)}&ep=${n}" class="ep-item playable${isAct ? ' active' : ''}${isWatched ? ' watched' : ''}" data-ep-num="${n}"${outOfRange ? ' style="display:none"' : ''} data-s="ep ${n} ${(v.title || 'episode ' + n).toLowerCase()}">
            <div class="ep-thumb-box" data-ep="${n}">
              <img src="${h(coverSm || image)}" alt="" class="ep-thumb-img" loading="lazy" onload="this.classList.add('vis')" onerror="this.style.display='none'">
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
          <a href="${siteUrl}/watch?anime=${encodeURIComponent(hoshikaId)}&ep=${n}" class="ep-item${isAct ? ' active' : ''}${isWatched ? ' watched' : ''}" data-ep-num="${n}"${outOfRange ? ' style="display:none"' : ''} data-s="ep ${n} episode ${n}">
            <div class="ep-thumb-box" data-ep="${n}">
              <img src="${h(coverSm || image)}" alt="" class="ep-thumb-img" loading="lazy" onload="this.classList.add('vis')" onerror="this.style.display='none'">
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
        <div class="watch-quick-nav" data-next-url="${nextEp ? `${siteUrl}/watch?anime=${encodeURIComponent(hoshikaId)}&ep=${nextEp}` : ''}" data-prev-url="${prevEp ? `${siteUrl}/watch?anime=${encodeURIComponent(hoshikaId)}&ep=${prevEp}` : ''}">
          <button type="button" class="watch-auto-next" id="watch-auto-next" aria-pressed="false" title="Auto play next episode">
            <span class="watch-auto-copy">Auto Next</span>
            <span class="watch-toggle" aria-hidden="true"><span class="watch-toggle-knob"></span></span>
          </button>
          <button type="button" class="watch-native-player" id="watch-native-player" aria-pressed="false" title="Use the browser's native video player">
            <span class="watch-native-copy">Native</span>
            <span class="watch-native-toggle" aria-hidden="true"><span class="watch-native-knob"></span></span>
          </button>
          ${prevEp ? `<a class="watch-quick-btn prev" href="${siteUrl}/watch?anime=${encodeURIComponent(hoshikaId)}&ep=${prevEp}" aria-label="Previous episode">${icon('skip-back', 'watch-ep-icon')}<span>Prev</span></a>` : `<span class="watch-quick-btn prev disabled">${icon('skip-back', 'watch-ep-icon')}<span>Prev</span></span>`}
          ${nextEp ? `<a class="watch-quick-btn next" href="${siteUrl}/watch?anime=${encodeURIComponent(hoshikaId)}&ep=${nextEp}" aria-label="Next episode"><span>Ep ${nextEp}</span>${icon('skip-forward', 'watch-ep-icon')}</a>` : `<span class="watch-quick-btn next disabled"><span>Ep —</span>${icon('skip-forward', 'watch-ep-icon')}</span>`}
        </div>
        <div class="watch-title-under-player">
          <div class="watch-title-ep">Episode ${epNum}</div>
          <h1>${h(title)}</h1>
          ${currentEpInfo?.title && currentEpInfo.title !== 'TBA' ? `<div class="watch-title-sub">${epTitleDisplay}</div>` : ''}
        </div>
        ${serverControlsHtml}
        <div class="watch-report-card" style="width:fit-content;max-width:100%;margin:10px auto 4px;padding:7px 12px;border:1px solid rgba(168,85,247,.18);border-radius:999px;background:rgba(168,85,247,.05);display:flex;align-items:center;gap:8px;font-size:.74rem;line-height:1.2;">
          <span style="color:var(--text-muted);">Having trouble?</span>
          <a href="${siteUrl}/bug-reports" style="color:#a855f7;font-weight:700;text-decoration:none;white-space:nowrap;">Report a bug <span aria-hidden="true">→</span></a>
        </div>
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

  <div class="watch-comments-fullwidth">
    ${renderWatchComments(animeId, epNum, siteUrl, isLoggedIn)}
  </div>
</div>`;

}

