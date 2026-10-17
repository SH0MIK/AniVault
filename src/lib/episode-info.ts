// Episode titles, air dates, and filler/recap flags come from Hoshika's
// public episode endpoint too. This module intentionally does not call the
// external scraper, Kitsu, TMDB, AniList, or Jikan for episode data.
import type { Db } from './db';
import { getCachedRaw, putCachedRaw, type EpisodeThumbEnv } from './episode-thumb';
import { getHoshikaAnimeEpisodes } from './hoshika-api';

export interface EpisodeInfoEntry {
  mal_id: number;
  title: string | null;
  title_japanese: string | null;
  aired: string | null;
  filler: boolean;
  recap: boolean;
}

function animeEpisodeInfoCacheKey(malId: number): string {
  return `epinfo_hoshika_all_${malId}`;
}

function isComplete(ep: any): boolean {
  return !!(ep && typeof ep.title === 'string' && ep.title.trim() && ep.aired);
}

interface CacheValue {
  episodes: EpisodeInfoEntry[];
  source?: 'hoshika' | 'manual';
}

export async function getAnimeEpisodeInfo(
  env: EpisodeThumbEnv,
  db: Db,
  malId: number,
  animeTitle = '',
): Promise<EpisodeInfoEntry[]> {
  if (!malId || !animeTitle) return [];
  const cacheKey = animeEpisodeInfoCacheKey(malId);
  const cachedRaw = await getCachedRaw(db, cacheKey);
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw) as CacheValue;
      if ((cached.source === 'hoshika' || cached.source === 'manual') && Array.isArray(cached.episodes)) {
        return cached.episodes;
      }
    } catch { /* ignore corrupt/legacy cache and refetch Hoshika */ }
  }

  const raw = await getHoshikaAnimeEpisodes(animeTitle, env.API_CACHE);
  if (!raw?.length) return [];
  const list: EpisodeInfoEntry[] = raw.map((ep) => ({
    mal_id: ep.number,
    title: ep.title || null,
    title_japanese: null,
    aired: ep.aired,
    filler: !!ep.filler,
    recap: !!ep.recap,
  }));

  if (list.length > 0 && list.every(isComplete)) {
    await putCachedRaw(db, cacheKey, JSON.stringify({ episodes: list, source: 'hoshika' } as CacheValue), null);
  }
  return list;
}

// ── Admin bulk import ────────────────────────────────────────────────────
// Same raw JSON the admin "Episode Cache Import" page already accepts for
// thumbnails (the scraper's own GET /api/episode?malId=X response) also
// carries title/aired/filler/recap per episode -- so one paste can seed
// both caches at once. See importAnimeEpisodeThumbnails in episode-thumb.ts
// for the thumbnail half; this is the info half, called alongside it from
// the same admin route.
export interface RawEpisodeInfoEntry {
  episode: number;
  title?: string | null;
  titleJapanese?: string | null;
  aired?: string | null;
  filler?: boolean;
  recap?: boolean;
}

export interface InfoImportResult {
  malId: number;
  cached: boolean; // false if any episode was missing title/aired -- same all-or-nothing rule as the live fetch path
  count: number;
}

/**
 * Same all-or-nothing rule as getAnimeEpisodeInfo's live path: only writes
 * the cache row if EVERY pasted episode has both a title and an aired date.
 * If even one is missing, nothing is written -- `cached: false` in the
 * result reflects that, so the admin UI can say so instead of implying a
 * successful (but silently incomplete) info cache.
 */
export async function importAnimeEpisodeInfo(db: Db, malId: number, episodes: RawEpisodeInfoEntry[], source: 'hoshika' | 'manual' = 'manual'): Promise<InfoImportResult> {
  const list: EpisodeInfoEntry[] = episodes
    .filter((ep) => Number(ep.episode) > 0)
    .map((ep) => ({
      mal_id: Number(ep.episode),
      title: ep.title ?? null,
      title_japanese: ep.titleJapanese ?? null,
      aired: ep.aired ?? null,
      filler: !!ep.filler,
      recap: !!ep.recap,
    }))
    .sort((a, b) => a.mal_id - b.mal_id);

  if (list.length === 0 || !list.every(isComplete)) {
    return { malId, cached: false, count: list.length };
  }

  await putCachedRaw(db, animeEpisodeInfoCacheKey(malId), JSON.stringify({ episodes: list, source } as CacheValue), null);
  return { malId, cached: true, count: list.length };
}
