// Episode METADATA (title, aired date, filler/recap) is sourced from the
// exact same bulk scraper endpoint episode-thumb.ts already uses for
// thumbnails -- GET /api/episode?malId=X -- instead of the separate
// paginated /api/mal/anime/:id/episodes scraper route (+ Jikan fallback)
// this used to hit. That endpoint already returns title/aired/filler/recap
// alongside the thumbnail for every episode in one call, so there's no
// reason to run a second, different scraper round trip just for the text
// fields.
//
// Note: this still keeps its own D1 cache row, separate from
// episode-thumb.ts's per-thumbnail cache (epthumb_*/epthumbs_all_*).
// That cache is also read/written directly by the admin thumb-search debug
// tool (api-thumb-search.ts), sharing its exact value shape ({success,
// thumb}/{success, thumbs}) -- reshaping it to carry full episode data too
// would risk breaking that tool. So for now there are still two D1 rows per
// anime (one thumbnail-only, one full-info), but only ONE live scraper call
// feeds each on a cold cache, and both end up permanent once populated.
// Fully merging them into a single cache row is a reasonable follow-up if
// wanted later.
import type { Db } from './db';
import { getCachedRaw, putCachedRaw, getScraperBase, httpGetText, type EpisodeThumbEnv } from './episode-thumb';

export interface EpisodeInfoEntry {
  mal_id: number;
  title: string | null;
  title_japanese: string | null;
  aired: string | null;
  filler: boolean;
  recap: boolean;
}

function animeEpisodeInfoCacheKey(malId: number): string {
  return `epinfo_all_${malId}`;
}

/** Same completeness rule as episode-thumb.ts: a title and an aired date
 * means the episode has actually released and its metadata is final. */
function isComplete(ep: any): boolean {
  return !!(ep && typeof ep.title === 'string' && ep.title.trim() && ep.aired);
}

interface CacheValue {
  episodes: EpisodeInfoEntry[];
}

/**
 * All episode metadata for one anime, permanently cached in D1 -- ALL OR
 * NOTHING. One bulk call to GET /api/episode?malId=X fetches every
 * episode's title/aired/filler/recap (+ thumbnail, which this module
 * ignores -- see episode-thumb.ts for that) at once.
 *
 * If every episode in the response is complete (has both a title and an
 * aired date), the whole list is cached permanently -- released episode
 * metadata doesn't change later. If even ONE episode is missing either
 * (hasn't aired yet), nothing is cached at all, so the next request fetches
 * live again instead of permanently baking in an incomplete list.
 */
export async function getAnimeEpisodeInfo(env: EpisodeThumbEnv, db: Db, malId: number): Promise<EpisodeInfoEntry[]> {
  if (!malId) return [];
  const cacheKey = animeEpisodeInfoCacheKey(malId);
  const cachedRaw = await getCachedRaw(db, cacheKey);
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw) as CacheValue;
      return cached.episodes ?? [];
    } catch { /* fall through and refetch live on a corrupt row */ }
  }

  const base = getScraperBase(env);
  if (!base) return [];
  const body = await httpGetText(`${base}/api/episode?malId=${malId}`);
  if (!body) return [];

  let raw: any;
  try { raw = JSON.parse(body); } catch { return []; }
  const list: EpisodeInfoEntry[] = (raw?.episodes ?? []).map((ep: any) => ({
    mal_id: Number(ep.episode) || 0,
    title: ep.title ?? null,
    title_japanese: ep.titleJapanese ?? null,
    aired: ep.aired ?? null,
    filler: !!ep.filler,
    recap: !!ep.recap,
  }));

  if (list.length > 0 && list.every(isComplete)) {
    await putCachedRaw(db, cacheKey, JSON.stringify({ episodes: list } as CacheValue), null); // permanent
  } else {
    console.log(`[episode-info] MAL ${malId} has incomplete episode(s) -- not caching`);
  }

  return list;
}
