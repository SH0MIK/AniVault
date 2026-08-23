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
const LIVE_CACHE_TTL_SECONDS = 21600; // 6h -- long enough to spare the
// scraper repeat traffic from popular pages, short enough that a newly
// aired episode's thumbnail shows up same-day without an admin re-running
// the tool. Only used for shows that are still airing / not yet aired --
// permanent (expires_at = NULL) is used for finished shows instead.

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
 * Writes a raw cache entry. `ttlSeconds=null` (finished-airing shows, whose
 * episode list and art can no longer change) stores expires_at as NULL, so
 * the row is kept indefinitely instead of being re-fetched from the scraper
 * every 6h forever. A number keeps the normal TTL behavior so
 * currently-airing / not-yet-aired shows pick up newly released episode
 * thumbnails (and a status flip to "Finished Airing") within the day.
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
 * anime's episode count and art are locked in for good -- safe to cache
 * forever instead of on the usual 6h TTL. Everything else (Currently
 * Airing, Not yet aired, or unknown/missing status) uses the normal TTL so
 * newly released episodes keep showing up. */
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
 * @param animeStatus Pass the show's MAL/AniList status (e.g. "Finished
 *   Airing") when the caller already has it, so a finished show's thumbnail
 *   is cached permanently instead of on the 6h TTL. Omit if unknown --
 *   falls back to the normal TTL, same as before.
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
  const { thumbs } = await findEpisodeThumbnails(env, epNum, malId);
  const thumb = thumbs[0] ?? null;
  await putCachedRaw(db, cacheKey, JSON.stringify({ success: true, thumb }), isPermanentStatus(animeStatus) ? null : LIVE_CACHE_TTL_SECONDS);
  return thumb;
}

/** Cache key for the whole-anime bulk lookup below. */
function animeEpisodeThumbsCacheKey(malId: number): string {
  return `epthumbs_all_${malId}`;
}

/**
 * All episode thumbnails for one anime in a single scraper call (GET
 * /api/episode?malId=X, no &ep=), cached as one D1 row. Use this instead
 * of getEpisodeThumbnail-per-episode wherever a page can show many episodes
 * at once (episode grid, watch page sidebar) -- one HTTP call covers the
 * whole show instead of one per episode.
 *
 * @param animeStatus Same as getEpisodeThumbnail: pass the show's status so
 *   a finished show's full episode-thumbnail list is cached permanently
 *   instead of re-fetched from the scraper every 6h. A currently-airing
 *   show keeps the 6h TTL so its newest episode's thumbnail shows up the
 *   same day it airs, without touching any already-cached earlier episodes.
 */
export async function getAnimeEpisodeThumbnails(
  env: EpisodeThumbEnv,
  db: Db,
  malId: number,
  animeStatus?: string | null
): Promise<Record<number, string>> {
  if (!malId) return {};
  const cacheKey = animeEpisodeThumbsCacheKey(malId);
  const cachedRaw = await getCachedRaw(db, cacheKey);
  if (cachedRaw) {
    try {
      return JSON.parse(cachedRaw) as Record<number, string>;
    } catch { /* fall through and re-fetch on a corrupt cache row */ }
  }

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

  await putCachedRaw(db, cacheKey, JSON.stringify(result), isPermanentStatus(animeStatus) ? null : LIVE_CACHE_TTL_SECONDS);
  return result;
}
