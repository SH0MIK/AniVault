// Primary source: your own scraper API's /api/info?malId=X, which returns
// episodeCount for whatever it has actually indexed across your streaming
// providers (animeheaven/anikoto/zoro/etc). One fast call, and it reflects
// what's really watchable on-site rather than a third-party field.
//
// Fallback: MAL's `num_episodes` field is frequently 0/stale/wrong for
// currently-airing shows, and the scraper may not have ingested a title yet
// — in that case this falls back to counting actual aired episodes from
// Jikan's per-episode air-date data, which updates promptly as each episode
// airs (but is expensive: pagination, rate-limited 3req/s).
//
// Either way this isn't cheap enough to compute live for a card grid, so
// it's cached in `episode_air_cache`. Only the single-anime detail page does
// a synchronous refresh-if-stale; grids only ever read the cache (see
// getForMany).
import { Db } from './db';
import { MalAPI } from './mal-api';

const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_PAGES = 15; // 15 * 100 = up to 1500 episodes tracked; covers everything but a handful of very long runners
const SCRAPER_TIMEOUT_MS = 5000;
const JIKAN_FALLBACK_BUDGET_MS = 5000; // total cap across all pages, not per-request

export interface AiredInfo { aired: number; total: number | null; updatedAt: string; }
export interface EpisodeAirEnv { SCRAPER_API_BASE?: string; }
export interface ScanCandidate { id: number; title: string; image: string; inSeason: boolean; cached: AiredInfo | null; }

// Races a promise against a plain timeout so a slow/hanging source can never
// hold up the whole lookup — used below because fetchAiredCountFromJikan has
// no internal timeout of its own (it can page + retry-on-429 indefinitely).
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}

export const EpisodeAir = {
  /** Scraper API lookup — same base-URL handling as api-scraper.ts (accepts
   *  either "https://host" or "https://host/api"). Returns null on any
   *  failure or missing/zero episodeCount so callers fall through to Jikan.
   *  Logs *why* it failed (unlike before, which swallowed everything) —
   *  check `wrangler tail` if this keeps falling through: the two most
   *  common causes are SCRAPER_API_BASE not being set for this environment,
   *  or the scraper responding with a different field name than expected. */
  async fetchFromScraperApi(env: EpisodeAirEnv, animeId: number): Promise<{ aired: number; total: number } | null> {
    const base = env.SCRAPER_API_BASE?.replace(/\/+$/, '').replace(/\/api$/i, '');
    if (!base) {
      console.warn('[episode-air] SCRAPER_API_BASE is not set — falling back to Jikan for anime', animeId);
      return null;
    }
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), SCRAPER_TIMEOUT_MS);
      const res = await fetch(`${base}/api/info?malId=${animeId}`, { headers: { Accept: 'application/json' }, signal: controller.signal });
      clearTimeout(t);
      if (!res.ok) {
        console.warn(`[episode-air] scraper API HTTP ${res.status} for anime ${animeId} — falling back to Jikan`);
        return null;
      }
      const data: any = await res.json().catch(() => null);
      const count = Number(data?.episodeCount);
      if (!count || count <= 0) {
        console.warn('[episode-air] scraper API returned no usable episodeCount for anime', animeId, '— raw response:', JSON.stringify(data));
        return null;
      }
      // The scraper only exposes one count, not an aired/total split — treat
      // it as both. For a streaming site this is arguably more useful than
      // MAL's "aired" distinction anyway: it's the number of episodes your
      // site actually has, which is what drives the episode grid.
      return { aired: count, total: count };
    } catch (err: any) {
      const reason = err?.name === 'AbortError' ? `timed out after ${SCRAPER_TIMEOUT_MS}ms` : String(err?.message ?? err);
      console.warn('[episode-air] scraper API call failed for anime', animeId, '—', reason, '— falling back to Jikan');
      return null;
    }
  },

  /** Does the actual Jikan fetch + count. No caching here — callers decide when this is worth running. */
  async fetchAiredCountFromJikan(mal: MalAPI, animeId: number): Promise<{ aired: number; total: number } | null> {
    let aired = 0;
    let total = 0;
    let page = 1;
    const now = Date.now();

    while (page <= MAX_PAGES) {
      const res = await mal.getAnimeEpisodes(animeId, page);
      const eps: any[] = res?.data ?? [];
      if (!eps.length) break;
      for (const ep of eps) {
        total++;
        if (ep.aired && new Date(ep.aired).getTime() <= now) aired++;
      }
      if (!res?.pagination?.has_next_page) break;
      page++;
    }
    if (total === 0) return null; // Jikan has nothing for this title — leave MAL's own count as the fallback
    return { aired, total };
  },

  /** Scraper API first (bounded by its own internal timeout), Jikan
   *  pagination fallback second (bounded here, since it has no timeout of
   *  its own and can otherwise run long on rate-limited/very long shows). */
  async fetchAiredCount(env: EpisodeAirEnv, mal: MalAPI, animeId: number): Promise<{ aired: number; total: number } | null> {
    const fromScraper = await EpisodeAir.fetchFromScraperApi(env, animeId);
    if (fromScraper) return fromScraper;
    return withTimeout(EpisodeAir.fetchAiredCountFromJikan(mal, animeId), JIKAN_FALLBACK_BUDGET_MS, null);
  },

  /** Read-through cache for a single anime — used by the detail page, where the extra round trip on a cache miss is worth it. */
  async get(db: Db, env: EpisodeAirEnv, mal: MalAPI, animeId: number): Promise<AiredInfo | null> {
    const cached = await db.fetchOne<{ aired_count: number; total_count: number | null; updated_at: string }>(
      'SELECT aired_count, total_count, updated_at FROM episode_air_cache WHERE anime_id = ?', [animeId]
    );
    const isFresh = cached && (Date.now() - new Date(cached.updated_at.replace(' ', 'T') + 'Z').getTime()) < STALE_AFTER_MS;
    if (cached && isFresh) return { aired: cached.aired_count, total: cached.total_count, updatedAt: cached.updated_at };

    const fetched = await EpisodeAir.fetchAiredCount(env, mal, animeId);
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

  /** Cron entry point — refreshes the stalest cached entries so card grids stay reasonably current without any page view ever blocking on the scraper API or Jikan. */
  async refreshStale(db: Db, env: EpisodeAirEnv, mal: MalAPI, limit = 20): Promise<number> {
    const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString().replace('T', ' ').substring(0, 19);
    const stale = await db.fetchAll<{ anime_id: number }>(
      'SELECT anime_id FROM episode_air_cache WHERE updated_at < ? ORDER BY updated_at ASC LIMIT ?', [cutoff, limit]
    );
    let refreshed = 0;
    for (const row of stale) {
      const fetched = await EpisodeAir.fetchAiredCount(env, mal, row.anime_id);
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
        const fetched = await EpisodeAir.fetchAiredCount(env, mal, id);
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
        const fetched = await EpisodeAir.fetchAiredCount(env, mal, cand.id);
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
