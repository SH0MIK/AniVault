// Primary source: MAL's own `num_episodes` field (via mal.getAnime) — no
// scraper, no Jikan pagination. Fallback (MAL only, when that's 0/null):
// the highest episode number already sitting in the episode-thumbnail bulk
// cache, since that's populated independently and already has a correct
// number for long-running currently-airing shows (One Piece etc.) that MAL
// itself doesn't finalize until the show ends. See fetchFromThumbCache below.
//
// This isn't cheap enough to compute live for a card grid, so it's cached
// in `episode_air_cache`. Only the single-anime detail page does a
// synchronous refresh-if-stale; grids only ever read the cache (see
// getForMany).
import { Db } from './db';
import { MalAPI } from './mal-api';
import { getCachedRaw, animeEpisodeThumbsCacheKey } from './episode-thumb';

const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface AiredInfo { aired: number; total: number | null; updatedAt: string; }
export interface EpisodeAirEnv { SCRAPER_API_BASE?: string; }
export interface ScanCandidate { id: number; title: string; image: string; inSeason: boolean; cached: AiredInfo | null; }

export const EpisodeAir = {
  /** Fallback for when MAL's num_episodes is 0/null (long-running currently-airing
   *  shows like One Piece — MAL doesn't finalize this until the show ends). Reads
   *  the highest episode number already sitting in the episode-thumbnail bulk
   *  cache (`epthumbs_all_{malId}`, see episode-thumb.ts) — the exact same cache
   *  that already successfully renders thumbnails for these shows, so if
   *  thumbnails are showing, this will have a number too. Read-only: never
   *  writes to or otherwise touches that cache. */
  async fetchFromThumbCache(db: Db, animeId: number): Promise<number | null> {
    try {
      const raw = await getCachedRaw(db, animeEpisodeThumbsCacheKey(animeId));
      if (!raw) return null;
      const parsed: { episodes?: Record<string, string> } = JSON.parse(raw);
      const nums = Object.keys(parsed.episodes ?? {}).map(Number).filter((n) => Number.isFinite(n) && n > 0);
      if (nums.length === 0) return null;
      return Math.max(...nums);
    } catch (err: any) {
      console.warn('[episode-air] thumb-cache fallback read failed for anime', animeId, '—', String(err?.message ?? err));
      return null;
    }
  },

  /** MAL's `num_episodes` field first, straight from mal.getAnime. If that's
   *  0/null, falls back to fetchFromThumbCache above rather than returning
   *  nothing at all. Returns null only if both come up empty. MAL doesn't
   *  expose an aired/total split for a currently-airing show, so both fields
   *  get the same number either way — same shape callers already expect. */
  async fetchAiredCount(db: Db, env: EpisodeAirEnv, mal: MalAPI, animeId: number): Promise<{ aired: number; total: number } | null> {
    try {
      const res = await mal.getAnime(animeId);
      const count = Number(res?.data?.episodes);
      if (count > 0) return { aired: count, total: count };
      console.warn('[episode-air] MAL returned no usable episode count for anime', animeId, '— trying thumbnail cache');
    } catch (err: any) {
      console.warn('[episode-air] MAL lookup failed for anime', animeId, '—', String(err?.message ?? err), '— trying thumbnail cache');
    }

    const fromThumbs = await EpisodeAir.fetchFromThumbCache(db, animeId);
    if (fromThumbs) return { aired: fromThumbs, total: fromThumbs };
    return null;
  },

  /** Read-through cache for a single anime — used by the detail page, where the extra round trip on a cache miss is worth it. */
  async get(db: Db, env: EpisodeAirEnv, mal: MalAPI, animeId: number): Promise<AiredInfo | null> {
    const cached = await db.fetchOne<{ aired_count: number; total_count: number | null; updated_at: string }>(
      'SELECT aired_count, total_count, updated_at FROM episode_air_cache WHERE anime_id = ?', [animeId]
    );
    const isFresh = cached && (Date.now() - new Date(cached.updated_at.replace(' ', 'T') + 'Z').getTime()) < STALE_AFTER_MS;
    if (cached && isFresh) return { aired: cached.aired_count, total: cached.total_count, updatedAt: cached.updated_at };

    const fetched = await EpisodeAir.fetchAiredCount(db, env, mal, animeId);
    if (!fetched) return cached ? { aired: cached.aired_count, total: cached.total_count, updatedAt: cached.updated_at } : null;

    await db.query(
      `INSERT INTO episode_air_cache (anime_id, aired_count, total_count, updated_at) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(anime_id) DO UPDATE SET aired_count=excluded.aired_count, total_count=excluded.total_count, updated_at=excluded.updated_at`,
      [animeId, fetched.aired, fetched.total]
    );
    return { aired: fetched.aired, total: fetched.total, updatedAt: new Date().toISOString() };
  },

  /** Cache-only, any age — never calls the scraper API or Jikan, so this is
   *  always fast. For pages that shouldn't block their render on a live
   *  lookup: use this immediately (falling back to MAL's own field if
   *  there's nothing cached yet) and, when isFresh is false, fetch the real
   *  number client-side via /api/ep_count.php instead. */
  async getCachedAny(db: Db, animeId: number): Promise<{ info: AiredInfo | null; isFresh: boolean }> {
    const cached = await db.fetchOne<{ aired_count: number; total_count: number | null; updated_at: string }>(
      'SELECT aired_count, total_count, updated_at FROM episode_air_cache WHERE anime_id = ?', [animeId]
    );
    if (!cached) return { info: null, isFresh: false };
    const isFresh = (Date.now() - new Date(cached.updated_at.replace(' ', 'T') + 'Z').getTime()) < STALE_AFTER_MS;
    return { info: { aired: cached.aired_count, total: cached.total_count, updatedAt: cached.updated_at }, isFresh };
  },

  /** Cache-only bulk lookup for card grids — never calls the scraper API or Jikan directly, so it's always fast regardless of how many cards are on the page. */
  async getForMany(db: Db, animeIds: number[]): Promise<Map<number, AiredInfo>> {
    const map = new Map<number, AiredInfo>();
    if (!animeIds.length) return map;
    const placeholders = animeIds.map(() => '?').join(',');
    const rows = await db.fetchAll<{ anime_id: number; aired_count: number; total_count: number | null; updated_at: string }>(
      `SELECT anime_id, aired_count, total_count, updated_at FROM episode_air_cache WHERE anime_id IN (${placeholders})`,
      animeIds
    );
    for (const row of rows) map.set(row.anime_id, { aired: row.aired_count, total: row.total_count, updatedAt: row.updated_at });
    return map;
  },

  /** Cron entry point — refreshes the stalest cached entries so card grids stay reasonably current without any page view ever blocking on the scraper API or Jikan.
   *  This cache is airing-only now (see anime.ts / watch.ts / ep_count.php — finished/not-yet-aired
   *  shows read straight from MAL's own `episodes` field and never write here). Any row that's
   *  gone stale AND has since finished/not started airing is therefore leftover from before that
   *  split (or a show that finished mid-cache-lifetime) — prune it instead of refreshing it, so the
   *  cache converges to airing-only on its own instead of burning scraper/Jikan calls on titles
   *  nothing reads the cache for anymore. */
  async refreshStale(db: Db, env: EpisodeAirEnv, mal: MalAPI, limit = 20): Promise<number> {
    const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString().replace('T', ' ').substring(0, 19);
    const stale = await db.fetchAll<{ anime_id: number }>(
      'SELECT anime_id FROM episode_air_cache WHERE updated_at < ? ORDER BY updated_at ASC LIMIT ?', [cutoff, limit]
    );
    let refreshed = 0;
    for (const row of stale) {
      let status: string | undefined;
      try {
        const animeRes = await mal.getAnime(row.anime_id);
        status = animeRes?.data?.status;
      } catch { /* couldn't tell — leave it, try again next sweep rather than risk pruning a still-airing show */ }

      if (status && status !== 'Currently Airing') {
        await db.query('DELETE FROM episode_air_cache WHERE anime_id = ?', [row.anime_id]);
        continue;
      }

      const fetched = await EpisodeAir.fetchAiredCount(db, env, mal, row.anime_id);
      if (fetched) {
        await db.query('UPDATE episode_air_cache SET aired_count=?, total_count=?, updated_at=datetime(\'now\') WHERE anime_id=?', [fetched.aired, fetched.total, row.anime_id]);
        refreshed++;
      }
    }
    return refreshed;
  },

  // ── Currently-airing scanner (admin/episode_scanner.php) ──────────────────
  // Unlike refreshStale (which just chases whichever cache rows are oldest,
  // airing or not), this targets shows that can actually still change: the
  // current AniList season ∪ anything already sitting in episode_air_cache
  // (since those are the titles the site has actually served, and a few of
  // them can be currently-airing entries the season cache missed — sequels
  // announced mid-season, delayed premieres, etc).

  /** Builds the candidate list — cheap (one cached season read + one D1 query), no scraper/Jikan calls. */
  async getScanCandidates(db: Db, mal: MalAPI): Promise<ScanCandidate[]> {
    const season = await mal.getAniListSeasonNow();
    const seasonal = new Map<number, { title: string; image: string }>();
    for (const a of season.data ?? []) {
      if (a.mal_id) seasonal.set(a.mal_id, { title: a.title, image: a.images?.jpg?.image_url ?? '' });
    }

    const cachedRows = await db.fetchAll<{ anime_id: number; aired_count: number; total_count: number | null; updated_at: string }>(
      'SELECT anime_id, aired_count, total_count, updated_at FROM episode_air_cache'
    );
    const cachedMap = new Map(cachedRows.map((r) => [r.anime_id, r]));

    const ids = new Set<number>([...seasonal.keys(), ...cachedMap.keys()]);
    const out: ScanCandidate[] = [];
    for (const id of ids) {
      const s = seasonal.get(id);
      const c = cachedMap.get(id);
      out.push({
        id,
        title: s?.title ?? `Anime #${id}`,
        image: s?.image ?? '',
        inSeason: !!s,
        cached: c ? { aired: c.aired_count, total: c.total_count, updatedAt: c.updated_at } : null,
      });
    }
    // Seasonal titles first (these are the ones that matter most), then by staleness.
    out.sort((a, b) => {
      if (a.inSeason !== b.inSeason) return a.inSeason ? -1 : 1;
      const at = a.cached ? new Date(a.cached.updatedAt.replace(' ', 'T') + 'Z').getTime() : 0;
      const bt = b.cached ? new Date(b.cached.updatedAt.replace(' ', 'T') + 'Z').getTime() : 0;
      return at - bt;
    });
    return out;
  },

  /** Force-refreshes exactly the given anime IDs (ignores staleness). Used by the chunked
   *  client-driven manual scan (see admin/episode-scanner.ts) — each call is small and
   *  short-lived by design, so it never risks hitting a platform background-task time limit
   *  the way one long scanCurrentlyAiring() call over 40 items could.
   *
   *  Each id is isolated in its own try/catch: one candidate throwing (a D1 hiccup, an
   *  unexpected Jikan/scraper shape, a Workers subrequest-limit trip on a long-running
   *  Jikan pagination fallback, etc.) used to take the *entire* chunk down with an
   *  uncaught 500 — which looked like "the scanner is broken" when really it was one
   *  title. Now that one id is skipped and reported; the rest of the chunk still runs. */
  async scanIds(db: Db, env: EpisodeAirEnv, mal: MalAPI, ids: number[]): Promise<{ updated: number; errors: { id: number; message: string }[] }> {
    let updated = 0;
    const errors: { id: number; message: string }[] = [];
    for (const id of ids) {
      try {
        const fetched = await EpisodeAir.fetchAiredCount(db, env, mal, id);
        if (!fetched) continue;
        await db.query(
          `INSERT INTO episode_air_cache (anime_id, aired_count, total_count, updated_at) VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(anime_id) DO UPDATE SET aired_count=excluded.aired_count, total_count=excluded.total_count, updated_at=excluded.updated_at`,
          [id, fetched.aired, fetched.total]
        );
        updated++;
      } catch (err: any) {
        const message = String(err?.message ?? err);
        console.error(`[episode-air] scanIds: anime ${id} failed —`, message);
        errors.push({ id, message });
      }
    }
    return { updated, errors };
  },

  /** Actually runs the scan: force-refreshes (ignores staleness) up to `limit` candidates,
   *  prioritizing in-season titles without a fresh look yet. Used by the cron (gated by the
   *  auto-run setting) — runs inside the Cron Trigger's own execution context, not a
   *  fetch-handler's waitUntil, so it isn't subject to the same background-task duration cap.
   *  The admin page's manual "Scan Now" button uses scanIds() in small chunks instead — see
   *  the comment on scanIds for why.
   *  onProgress fires after every candidate (found or not) so a caller can surface a live
   *  progress bar — see admin/episode-scanner.ts, which persists it to KV for polling since
   *  the scan itself runs in the background via waitUntil. */
  async scanCurrentlyAiring(
    db: Db, env: EpisodeAirEnv, mal: MalAPI, limit = 40,
    onProgress?: (done: number, total: number, cand: ScanCandidate) => void | Promise<void>
  ): Promise<{ candidates: number; scanned: number; updated: number }> {
    const candidates = await EpisodeAir.getScanCandidates(db, mal);
    const toScan = candidates.slice(0, limit);
    let updated = 0;
    for (let i = 0; i < toScan.length; i++) {
      const cand = toScan[i];
      try {
        const fetched = await EpisodeAir.fetchAiredCount(db, env, mal, cand.id);
        if (fetched) {
          await db.query(
            `INSERT INTO episode_air_cache (anime_id, aired_count, total_count, updated_at) VALUES (?, ?, ?, datetime('now'))
             ON CONFLICT(anime_id) DO UPDATE SET aired_count=excluded.aired_count, total_count=excluded.total_count, updated_at=excluded.updated_at`,
            [cand.id, fetched.aired, fetched.total]
          );
          updated++;
        }
      } catch (err: any) {
        console.error(`[episode-air] scanCurrentlyAiring: anime ${cand.id} failed —`, String(err?.message ?? err));
      }
      if (onProgress) await onProgress(i + 1, toScan.length, cand);
    }
    return { candidates: candidates.length, scanned: toScan.length, updated };
  },
};
