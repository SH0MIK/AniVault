// Episode thumbnails sourced ONLY from AniVault's own scraper API
// (GET /api/episode?malId=X[&ep=N] on SCRAPER_API_BASE). All the external
// fallback chain (Kitsu -> TMDB -> AniList -> Jikan -> AniSearch) has been
// dropped from every auto-display path in favor of this single call --
// the scraper API owns its own fallback chain internally now.
//
// lib/episode-thumb.ts (findEpisodeThumbnails) is left untouched and still
// used only by the admin ep_thumbnails.php manual-override picker tool,
// which intentionally wants multiple candidate sources to choose from.

export interface ScraperEnv {
  SCRAPER_API_BASE?: string;
}

/** Same base-URL normalisation used throughout routes/api-scraper.ts:
 * accepts "https://host" or "https://host/api", always returns the former. */
export function getScraperBase(env: ScraperEnv): string | null {
  const base = env.SCRAPER_API_BASE;
  if (!base) return null;
  return base.replace(/\/+$/, '').replace(/\/api$/i, '');
}

interface ApiEpisodeListResponse {
  episodes?: { episode: number; thumbnail?: string | null }[];
}

interface ApiEpisodeSingleResponse {
  data?: { thumbnail?: string | null };
}

/** GET /api/episode?malId=X -- every episode's thumbnail in one call.
 * Returns an { episodeNum: thumbnailUrl } map (episodes with no thumbnail
 * are simply omitted). */
export async function fetchEpisodeThumbnailsFromApi(
  env: ScraperEnv,
  malId: number,
  timeoutMs = 8000
): Promise<Record<number, string>> {
  const base = getScraperBase(env);
  if (!base || !malId) return {};
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${base}/api/episode?malId=${malId}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) return {};
    const json = (await res.json().catch(() => null)) as ApiEpisodeListResponse | null;
    const map: Record<number, string> = {};
    for (const ep of json?.episodes ?? []) {
      if (ep.thumbnail && typeof ep.episode === 'number') map[ep.episode] = ep.thumbnail;
    }
    return map;
  } catch {
    return {};
  }
}

/** GET /api/episode?malId=X&ep=N -- a single episode's thumbnail. */
export async function fetchEpisodeThumbnailFromApi(
  env: ScraperEnv,
  malId: number,
  epNum: number,
  timeoutMs = 8000
): Promise<string | null> {
  const base = getScraperBase(env);
  if (!base || !malId || !epNum) return null;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${base}/api/episode?malId=${malId}&ep=${epNum}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as ApiEpisodeSingleResponse | null;
    return json?.data?.thumbnail ?? null;
  } catch {
    return null;
  }
}
