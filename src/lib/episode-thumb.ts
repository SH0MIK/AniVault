// Episode-thumbnail lookup and cache helpers. Hoshika is the only automatic
// source for episode stills; missing Hoshika thumbnails remain missing instead
// of silently falling back to Kitsu, TMDB, AniList, Jikan, or a scraper.
import type { Db } from './db';
import { getHoshikaAnimeEpisodes } from './hoshika-api';

/** Cache key shared between the admin thumb-search tool and the live
 * site-facing lookups below. Was a KV key; now a D1 primary key -- kept the
 * same string shape so nothing else needs to change. */
export function episodeThumbCacheKey(malId: number, epNum: number): string {
  return `epthumb_${malId}_${epNum}`;
}

export interface EpisodeThumbEnv {
  API_CACHE?: KVNamespace;
}

export interface EpisodeThumbResult {
  thumbs: string[];
  log: string[];
  hoshikaConfigured: boolean;
}

/**
 * Look up a single episode still from Hoshika's public catalog. If the title
 * does not match or the episode has no thumbnail, return no candidates.
 */
export async function findEpisodeThumbnails(
  env: EpisodeThumbEnv,
  epNum: number,
  malId: number,
  _isList = false,
  animeTitle = '',
): Promise<EpisodeThumbResult> {
  const log: string[] = [];
  if (!malId || !epNum || !animeTitle) {
    log.push('Hoshika: missing anime title, MAL ID, or episode number');
    return { thumbs: [], log, hoshikaConfigured: false };
  }

  try {
    const episodes = await getHoshikaAnimeEpisodes(animeTitle, env.API_CACHE);
    if (!episodes) {
      log.push(`Hoshika: no matching anime or episode list for "${animeTitle}"`);
      return { thumbs: [], log, hoshikaConfigured: true };
    }
    const episode = episodes.find((item) => item.number === epNum);
    if (!episode?.thumbnail) {
      log.push(`Hoshika: episode ${epNum} has no thumbnail; no fallback used`);
      return { thumbs: [], log, hoshikaConfigured: true };
    }
    log.push(`Hoshika episode ${epNum}: found ${episode.thumbnail}`);
    return { thumbs: [episode.thumbnail], log, hoshikaConfigured: true };
  } catch (error) {
    log.push(`Hoshika lookup failed: ${String(error)}`);
    return { thumbs: [], log, hoshikaConfigured: true };
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
  _animeStatus?: string | null,
  animeTitle = '',
): Promise<string | null> {
  if (!malId || !epNum || !animeTitle) return null;
  const cacheKey = episodeThumbCacheKey(malId, epNum);
  const cachedRaw = await getCachedRaw(db, cacheKey);
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw) as { thumb?: string | null; source?: string };
      if (cached.source === 'hoshika' || cached.source === 'manual') return cached.thumb ?? null;
    } catch { /* refetch Hoshika on corrupt/legacy cache */ }
  }

  const bulkRaw = await getCachedRaw(db, animeEpisodeThumbsCacheKey(malId));
  if (bulkRaw) {
    try {
      const bulk = JSON.parse(bulkRaw) as AnimeThumbCacheValue;
      const thumb = (bulk.source === 'hoshika' || bulk.source === 'manual') ? bulk.episodes?.[epNum] : '';
      if (thumb) {
        await putCachedRaw(db, cacheKey, JSON.stringify({ success: true, thumb, source: bulk.source }), null);
        return thumb;
      }
    } catch { /* ignore corrupt or legacy non-Hoshika cache */ }
  }

  const { thumbs } = await findEpisodeThumbnails(env, epNum, malId, false, animeTitle);
  const thumb = thumbs[0] ?? null;
  if (thumb) {
    await putCachedRaw(db, cacheKey, JSON.stringify({ success: true, thumb, source: 'hoshika' }), null);
  }
  return thumb;
}

/** Cache key for the whole-anime bulk lookup below. Exported so episode-air.ts
 * can fall back to this cache's episode count when MAL's own num_episodes is
 * 0/null (happens on very long-running currently-airing shows, e.g. One
 * Piece, until MAL finalizes the count at series end). */
export function animeEpisodeThumbsCacheKey(malId: number): string {
  return `epthumbs_all_${malId}`;
}

/** Stored shape for the bulk cache row. `checkedAt` (unix ms) tracks the
 * last time we asked "has a new episode aired?" -- separate from the row's
 * own D1 expiry, which is always NULL (permanent) now. Freshness for an
 * ongoing show is driven entirely by checkedAt, not by the row expiring. */
interface AnimeThumbCacheValue {
  episodes: Record<number, string>;
  checkedAt: number;
  source?: 'hoshika' | 'manual';
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
  _animeStatus?: string | null,
  _totalEpisodesKnown?: number | null,
  animeTitle = '',
): Promise<Record<number, string>> {
  if (!malId || !animeTitle) return {};
  const cacheKey = animeEpisodeThumbsCacheKey(malId);
  const cachedRaw = await getCachedRaw(db, cacheKey);
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw) as AnimeThumbCacheValue;
      if ((cached.source === 'hoshika' || cached.source === 'manual') && cached.episodes) return cached.episodes;
    } catch { /* refetch Hoshika on corrupt/legacy cache */ }
  }

  const episodes = await getHoshikaAnimeEpisodes(animeTitle, env.API_CACHE);
  if (!episodes?.length) return {};

  const thumbs: Record<number, string> = {};
  for (const episode of episodes) {
    if (episode.number > 0 && episode.thumbnail) thumbs[episode.number] = episode.thumbnail;
  }
  await putCachedRaw(db, cacheKey, JSON.stringify({
    episodes: thumbs,
    checkedAt: Date.now(),
    source: 'hoshika',
  } as AnimeThumbCacheValue), null);
  return thumbs;
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
  permanent: boolean,
  source: 'hoshika' | 'manual' = 'manual'
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

  const value: AnimeThumbCacheValue = { episodes: bulk, checkedAt: Date.now(), source };
  await putCachedRaw(db, animeEpisodeThumbsCacheKey(malId), JSON.stringify(value), null);
  return { malId, imported, skipped, permanent };
}
