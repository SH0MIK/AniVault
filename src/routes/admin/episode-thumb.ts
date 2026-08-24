// Shared episode-thumbnail lookup used by the admin thumb-search tool
// (api/thumb_search.php, see routes/api-thumb-search.ts).
//
// Previously this ran its own 5-source chain directly from the Worker
// (Kitsu -> TMDB -> AniList streamingEpisodes -> Jikan -> AniSearch scrape).
// That's been replaced with a single call to our own scraper API's
// /api/episode endpoint (SCRAPER_API_BASE) -- the scraper already does that
// same multi-source resolution server-side and returns the winning
// thumbnail plus its own resolution log, so the Worker no longer needs to
// talk to any third-party API for this at all.
import type { Db } from './db';

export async function httpGetText(url: string, headers: Record<string, string> = {}, timeoutMs = 10000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: { Accept: 'application/json', ...headers },
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

/** Cache key shared between the admin thumb-search tool and the live
 * site-facing lookups below. Was a KV key; now a D1 primary key -- kept the
 * same string shape so nothing else needs to change. */
export function episodeThumbCacheKey(malId: number, epNum: number): string {
  return `epthumb_${malId}_${epNum}`;
}

export interface EpisodeThumbEnv {
  SCRAPER_API_BASE?: string;
}

export interface EpisodeThumbResult {
  thumbs: string[];
  log: string[];
  scraperConfigured: boolean;
}

// Same "strip trailing /api" normalisation used by routes/api-scraper.ts and
// routes/watch.ts, so SCRAPER_API_BASE can be set either as "https://host"
// or "https://host/api". Exported so the site-facing spots below (and any
// other caller) don't need to re-implement this.
export function getScraperBase(env: EpisodeThumbEnv): string | null {
  const base = env.SCRAPER_API_BASE;
  if (!base) return null;
  return base.replace(/\/+$/, '').replace(/\/api$/i, '');
}

/**
 * Looks up an episode-specific thumbnail via our own scraper API
 * (GET /api/episode?malId=&ep=), which is the single source of truth now.
 *
 * @param isList Kept for API-shape compatibility with callers (mode=list
 *   used to mean "keep querying every source so all candidates can be shown
 *   side by side"). With one source there's only ever one candidate, so
 *   this no longer changes behavior -- it's a no-op parameter.
 */
export async function findEpisodeThumbnails(
  env: EpisodeThumbEnv,
  epNum: number,
  malId: number,
  isList = false
): Promise<EpisodeThumbResult> {
  const log: string[] = [];
  const base = getScraperBase(env);
  if (!base) {
    log.push('Scraper API: not configured (SCRAPER_API_BASE not set)');
    return { thumbs: [], log, scraperConfigured: false };
  }
  if (!malId || !epNum) {
    log.push('Scraper API: missing malId or ep');
    return { thumbs: [], log, scraperConfigured: true };
  }

  const body = await httpGetText(`${base}/api/episode?malId=${malId}&ep=${epNum}`);
  if (!body) {
    log.push('Scraper API: HTTP failed');
    return { thumbs: [], log, scraperConfigured: true };
  }

  try {
    const json: any = JSON.parse(body);
    // Bubble up the scraper's own resolution log (e.g. "Kitsu ID lookup:
    // cache hit", "Thumbnail: not found on Kitsu, trying TMDB") so the
    // admin debug view still shows exactly where the thumbnail came from.
    if (Array.isArray(json.log)) {
      for (const line of json.log) log.push(`Scraper: ${line}`);
    }
    const thumb: string | null = json.data?.thumbnail ?? null;
    if (thumb) {
      log.push(`Scraper API ep ${epNum}: found ${thumb} (source: ${json.data?.thumbnailSource ?? 'unknown'})`);
      return { thumbs: [thumb], log, scraperConfigured: true };
    }
    log.push(`Scraper API ep ${epNum}: no thumbnail`);
    return { thumbs: [], log, scraperConfigured: true };
  } catch {
    log.push('Scraper API: parse failed');
    return { thumbs: [], log, scraperConfigured: true };
  }
}

// ── Site-facing helpers (with D1 caching) ───────────────────────────────────
// The functions above return a full log and are meant for the admin tool.
// Everything below is what the live spots (og:image, watch sidebar,
// Continue Watching, Watch History, episode grid, embed.php, and the admin
// thumb-search tool's own cache) call: same scraper endpoint, but cached in
// D1 so a scraper request only happens once per episode (or once per anime
// for the bulk version) instead of on every page view.
//
// This used to be KV. Moved to D1 (a table, `episode_thumb_cache`, see
// migrations/episode_thumb_cache.sql) because KV's free-tier daily write
// cap (1,000/day) was getting hit on busy days -- D1's write budget is far
// higher and it's already the site's primary database, so no new binding
// was needed.
const LIVE_CACHE_TTL_SECONDS = 21600; // 6h -- how often an ongoing show gets
// re-checked for a newly released episode. Does NOT mean "wipe everything
// and refetch every 6h" -- see getAnimeEpisodeThumbnails below: episodes
// already resolved are cached permanently (their stills don't change just
// because the show is still airing), and only the *next* unseen episode
// number gets probed once this window has passed.

/**
 * Reads a raw cache entry (still-JSON-encoded string, same as the old KV
 * `.get(key)`). Returns null on a miss OR an expired row -- an expired row
 * is opportunistically deleted so the table doesn't grow unbounded with
 * dead entries (best-effort; failure here doesn't block the read).
 */
export async function getCachedRaw(db: Db, key: string): Promise<string | null> {
  try {
    const row = await db.fetchOne<{ value: string; expires_at: number | null }>(
      'SELECT value, expires_at FROM episode_thumb_cache WHERE cache_key = ?',
      [key]
    );
    if (!row) return null;
    if (row.expires_at !== null && row.expires_at <= Math.floor(Date.now() / 1000)) {
      db.query('DELETE FROM episode_thumb_cache WHERE cache_key = ?', [key]).catch(() => {});
      return null;
    }
    // Visible in `wrangler tail` / the Cloudflare dashboard's live Logs tab
    // -- lets you confirm a repeat visit is skipping the scraper entirely.
    console.log(`[episode-thumb] D1 hit ${key} (no scraper call)`);
    return row.value;
  } catch (err: any) {
    console.warn('[episode-thumb] D1 get failed (continuing without cache):', key, '-', String(err?.message ?? err));
    return null;
  }
}

/**
 * Writes a raw cache entry. `ttlSeconds=null` stores expires_at as NULL, so
 * the row is kept indefinitely instead of expiring. A number keeps normal
 * TTL behavior. See getEpisodeThumbnail/getAnimeEpisodeThumbnails below for
 * when each is used -- as of this cache redesign, ttlSeconds is only ever
 * non-null for a *miss* on a still-airing show (retry later); anything
 * that's actually been resolved is written permanent, since a released
 * episode's thumbnail doesn't change regardless of whether the show itself
 * is still airing.
 */
export async function putCachedRaw(db: Db, key: string, value: string, ttlSeconds: number | null): Promise<void> {
  try {
    const expiresAt = ttlSeconds === null ? null : Math.floor(Date.now() / 1000) + ttlSeconds;
    await db.query(
      `INSERT INTO episode_thumb_cache (cache_key, value, expires_at, created_at)
       VALUES (?, ?, ?, unixepoch())
       ON CONFLICT(cache_key) DO UPDATE SET
         value = excluded.value, expires_at = excluded.expires_at, created_at = excluded.created_at`,
      [key, value, expiresAt]
    );
    console.log(`[episode-thumb] D1 write ${key} -> ${ttlSeconds === null ? 'PERMANENT (no expiry)' : `TTL ${ttlSeconds}s`}`);
  } catch (err: any) {
    console.warn('[episode-thumb] D1 put failed (continuing without cache write):', key, '-', String(err?.message ?? err));
  }
}

/** MAL/AniList status strings (see mal-api.ts mapStatus) that mean an
 * anime's episode count is locked in for good -- once every episode is
 * cached, there's nothing left to ever check again. Everything else
 * (Currently Airing, Not yet aired, or unknown/missing status) keeps
 * checking for a new episode every LIVE_CACHE_TTL_SECONDS. */
function isPermanentStatus(status?: string | null): boolean {
  return status === 'Finished Airing';
}

/**
 * Single-episode thumbnail, cached in D1. This is the drop-in replacement
 * for "check episode_overrides, else show the cover" -- callers should try
 * this after an admin override misses and before falling back to cover art.
 * Uses the same cache key/shape the admin thumb-search tool writes, so a
 * hit from either one benefits the other.
 *
 * Lookup order: 1) this episode's own cache row, 2) the per-anime bulk row
 * (`epthumbs_all_{malId}`) in case an admin import or an earlier
 * getAnimeEpisodeThumbnails call already resolved this episode without ever
 * writing an individual row for it -- promoting it to its own row on the
 * way out so the next single-episode read for THIS episode doesn't need to
 * fetch/parse the whole bulk blob again, 3) the scraper, as a last resort.
 *
 * A resolved thumbnail is always cached permanently, regardless of the
 * show's airing status -- a released episode's still doesn't change just
 * because the show as a whole is still airing. Only a MISS (episode hasn't
 * aired yet / no source has a still for it yet) gets a TTL, and only if the
 * show isn't finished -- so a still-airing show's not-yet-released episode
 * gets retried, while a finished show's permanent miss means no source
 * ever got one for it.
 *
 * @param animeStatus Pass the show's MAL/AniList status (e.g. "Finished
 *   Airing") when the caller already has it, so a miss on a finished show
 *   is cached permanently instead of retried forever. Omit if unknown.
 */
export async function getEpisodeThumbnail(
  env: EpisodeThumbEnv,
  db: Db,
  malId: number,
  epNum: number,
  animeStatus?: string | null
): Promise<string | null> {
  if (!malId || !epNum) return null;
  const cacheKey = episodeThumbCacheKey(malId, epNum);
  const cachedRaw = await getCachedRaw(db, cacheKey);
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw) as { thumb?: string | null };
      return cached.thumb ?? null;
    } catch { /* fall through and re-fetch on a corrupt cache row */ }
  }

  // Not cached individually -- check the per-anime bulk row before ever
  // touching the scraper. A large admin import (see importAnimeEpisodeThumbnails)
  // or a prior getAnimeEpisodeThumbnails call may already have this
  // episode's thumbnail sitting in there without an individual row existing
  // for it yet (writing one row per episode for a 1000+ episode show in a
  // single request blows Workers' per-invocation subrequest limit -- see
  // importAnimeEpisodeThumbnails for the full story). Promotion here spreads
  // those individual writes out one-at-a-time across normal page views instead.
  const bulkRaw = await getCachedRaw(db, animeEpisodeThumbsCacheKey(malId));
  if (bulkRaw) {
    try {
      const bulk = JSON.parse(bulkRaw) as AnimeThumbCacheValue;
      const thumb = bulk.episodes?.[epNum];
      if (thumb) {
        await putCachedRaw(db, cacheKey, JSON.stringify({ success: true, thumb }), null);
        return thumb;
      }
    } catch { /* corrupt bulk row -- fall through to the scraper */ }
  }

  const { thumbs } = await findEpisodeThumbnails(env, epNum, malId);
  const thumb = thumbs[0] ?? null;
  const ttl = thumb ? null : (isPermanentStatus(animeStatus) ? null : LIVE_CACHE_TTL_SECONDS);
  await putCachedRaw(db, cacheKey, JSON.stringify({ success: true, thumb }), ttl);
  return thumb;
}

/** Cache key for the whole-anime bulk lookup below. */
function animeEpisodeThumbsCacheKey(malId: number): string {
  return `epthumbs_all_${malId}`;
}

/** Stored shape for the bulk cache row. `checkedAt` (unix ms) tracks the
 * last time we asked "has a new episode aired?" -- separate from the row's
 * own D1 expiry, which is always NULL (permanent) now. Freshness for an
 * ongoing show is driven entirely by checkedAt, not by the row expiring. */
interface AnimeThumbCacheValue {
  episodes: Record<number, string>;
  checkedAt: number;
}

// Upper bound on how many NEW episode numbers get probed in a single check,
// so a show that hasn't been visited in a long time (weeks) doesn't trigger
// a burst of scraper calls all at once -- it just catches up a bit more on
// each subsequent visit instead. Weekly-airing shows will basically never
// hit this; it's a safety cap, not the expected case.
const MAX_NEW_EPISODES_PER_CHECK = 15;

/**
 * All episode thumbnails for one anime, cached as one D1 row shaped like
 * { episodes: {1: url, 2: url, ...}, checkedAt: <ms> }. Use this instead of
 * getEpisodeThumbnail-per-episode wherever a page can show many episodes at
 * once (episode grid, watch page sidebar).
 *
 * First-ever lookup for a show does one bulk scraper call (GET
 * /api/episode?malId=X, no &ep=) to seed everything at once. After that:
 * - Finished shows: just return the cached episodes. Nothing new will ever
 *   air, so there's nothing left to check, ever.
 * - Ongoing shows, within the 6h window since the last check: return the
 *   cached episodes as-is. No scraper call at all.
 * - Ongoing shows, past the 6h window: do NOT refetch the whole show.
 *   Already-cached episodes are left untouched (their stills don't change).
 *   Only probe forward from the highest episode number already cached,
 *   one at a time via the single-episode endpoint (GET
 *   /api/episode?malId=X&ep=N), stopping at the first miss (that episode
 *   isn't out yet) or after MAX_NEW_EPISODES_PER_CHECK, whichever comes
 *   first. Each hit gets written as its own permanent per-episode row too.
 *
 * @param animeStatus Pass the show's MAL/AniList status (e.g. "Finished
 *   Airing") so a finished show stops checking entirely.
 * @param totalEpisodesKnown Pass MAL's total episode count when the caller
 *   already has it (e.g. api-episode-override.ts's `totalEps`), so probing
 *   never goes past a show's actual last episode. Optional -- without it,
 *   probing is still capped by MAX_NEW_EPISODES_PER_CHECK.
 */
export async function getAnimeEpisodeThumbnails(
  env: EpisodeThumbEnv,
  db: Db,
  malId: number,
  animeStatus?: string | null,
  totalEpisodesKnown?: number | null
): Promise<Record<number, string>> {
  if (!malId) return {};
  const cacheKey = animeEpisodeThumbsCacheKey(malId);
  const cachedRaw = await getCachedRaw(db, cacheKey);
  const permanent = isPermanentStatus(animeStatus);
  const now = Date.now();

  let cached: AnimeThumbCacheValue | null = null;
  if (cachedRaw) {
    try { cached = JSON.parse(cachedRaw) as AnimeThumbCacheValue; } catch { cached = null; }
  }

  if (cached) {
    if (permanent) return cached.episodes; // finished -- nothing new will ever air, never check again

    const due = now - cached.checkedAt >= LIVE_CACHE_TTL_SECONDS * 1000;
    if (!due) return cached.episodes; // still within the window -- no scraper call

    // Past the window: probe forward from the highest known episode only.
    // Already-cached episodes below this are never touched or re-requested.
    const known = Object.keys(cached.episodes).map(Number);
    const highest = known.length > 0 ? Math.max(...known) : 0;
    const ceiling = totalEpisodesKnown && totalEpisodesKnown > 0
      ? Math.min(totalEpisodesKnown, highest + MAX_NEW_EPISODES_PER_CHECK)
      : highest + MAX_NEW_EPISODES_PER_CHECK;

    for (let ep = highest + 1; ep <= ceiling; ep++) {
      const { thumbs } = await findEpisodeThumbnails(env, ep, malId);
      const thumb = thumbs[0] ?? null;
      if (!thumb) break; // that episode isn't out yet (or nothing has a still for it yet) -- stop, try again next check
      cached.episodes[ep] = thumb;
      await putCachedRaw(db, episodeThumbCacheKey(malId, ep), JSON.stringify({ success: true, thumb }), null); // permanent
    }

    cached.checkedAt = now;
    await putCachedRaw(db, cacheKey, JSON.stringify(cached), null); // row itself is always permanent -- freshness lives in checkedAt
    return cached.episodes;
  }

  // No cache yet at all -- first-ever lookup for this anime, one full bulk fetch to seed everything.
  const result: Record<number, string> = {};
  const base = getScraperBase(env);
  if (base) {
    const body = await httpGetText(`${base}/api/episode?malId=${malId}`);
    if (body) {
      try {
        const json: any = JSON.parse(body);
        for (const ep of json.episodes ?? []) {
          const n = Number(ep?.episode ?? 0);
          if (n && ep?.thumbnail) result[n] = ep.thumbnail;
        }
      } catch { /* return whatever we parsed before the error, if anything */ }
    }
  }

  await putCachedRaw(db, cacheKey, JSON.stringify({ episodes: result, checkedAt: now } as AnimeThumbCacheValue), null);
  // Individual per-episode rows are NOT seeded here -- for a long-running
  // show (Naruto Shippuden, One Piece) that would mean hundreds/thousands
  // of D1 writes in this one request, which blows Workers' per-invocation
  // subrequest limit outright (see importAnimeEpisodeThumbnails for the
  // full story -- this hit that exact wall). getEpisodeThumbnail promotes
  // an episode from this bulk row to its own permanent row lazily, one at a
  // time, the first time that specific episode is actually looked up.
  return result;
}

// ── Admin bulk import ────────────────────────────────────────────────────
// Backs the "Episode Cache Import" admin page: an admin pastes the raw JSON
// the scraper's own /api/episode?malId=X endpoint returns (title, aired,
// filler/recap flags, thumbnail, thumbnailSource per episode) and picks
// ongoing/finished by hand. This writes straight into the same cache
// getEpisodeThumbnail/getAnimeEpisodeThumbnails read from, so every page
// (anime detail, watch, home, lists, embed) picks it up immediately with no
// scraper round trip at all -- useful for backfilling a show in one shot,
// or for shows the scraper's auto-resolution keeps getting wrong.
export interface RawEpisodeThumbEntry {
  episode: number;
  thumbnail?: string | null;
}

export interface BulkImportResult {
  malId: number;
  imported: number;
  skipped: number;
  permanent: boolean;
}

/**
 * Writes the bulk cache row (`epthumbs_all_{malId}`, read by the episode
 * grid / watch sidebar / home / lists) from a parsed episode list. Episodes
 * with no thumbnail are skipped (nothing to cache), so a later live scraper
 * lookup can still fill them in rather than the import baking in a null
 * forever.
 *
 * Deliberately does NOT also write an individual `epthumb_{malId}_{epNum}`
 * row per episode here. Earlier versions did (either one-at-a-time, or
 * batched via db.batch()) -- both blow Workers' per-invocation subrequest
 * limit for a long-running show (One Piece's 1000+ episodes hit this
 * exactly: even chunked batches of 200 still counted every statement inside
 * them toward the limit, so the whole import died mid-request). Individual
 * rows are instead promoted lazily, one at a time, by getEpisodeThumbnail
 * the first time each specific episode is actually looked up -- it checks
 * this bulk row as a fallback before ever hitting the scraper. So a single
 * import here is always exactly ONE D1 write, regardless of episode count.
 *
 * The bulk row is always written permanently -- an imported thumbnail is a
 * resolved thumbnail either way, same as a live lookup hit. `permanent`
 * only affects `checkedAt`: an ongoing show gets `checkedAt = now`, so
 * getAnimeEpisodeThumbnails treats this import as a fresh check and won't
 * probe for a new episode again for another 6h. A finished show is marked
 * as never needing to check again at all.
 */
export async function importAnimeEpisodeThumbnails(
  db: Db,
  malId: number,
  episodes: RawEpisodeThumbEntry[],
  permanent: boolean
): Promise<BulkImportResult> {
  const bulk: Record<number, string> = {};
  let imported = 0;
  let skipped = 0;

  for (const ep of episodes) {
    const epNum = Number(ep.episode);
    const thumb = ep.thumbnail ?? null;
    if (!epNum || !thumb) { skipped++; continue; }
    bulk[epNum] = thumb;
    imported++;
  }

  const value: AnimeThumbCacheValue = { episodes: bulk, checkedAt: Date.now() };
  await putCachedRaw(db, animeEpisodeThumbsCacheKey(malId), JSON.stringify(value), null);
  return { malId, imported, skipped, permanent };
}
