/**
 * Optional Hoshika catalog metadata adapter.
 *
 * Hoshika's documented API exposes anime search and detail endpoints and
 * documents MAL ID mapping. It does not currently document an episode
 * thumbnail endpoint, so thumbnails intentionally remain on AniVault's
 * existing episode-thumb source.
 */
export interface HoshikaAnimeMetadata {
  cover: string;
  episodes: number | null;
}

function asObject(value: any): any {
  return value && typeof value === 'object' ? value : {};
}

function listFrom(payload: any): any[] {
  const p = asObject(payload);
  const data = p.data ?? p.results ?? p.anime ?? p.items;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  if (data && typeof data === 'object') return [data];
  return [];
}

function findCover(item: any): string {
  const x = asObject(item);
  const images = asObject(x.images);
  const picture = asObject(x.main_picture);
  const cover = asObject(x.cover);
  const candidates = [
    x.cover_url, x.coverImage, x.cover_image, x.poster_url, x.poster,
    cover.url, cover.src, cover.original, cover.large,
    images.cover, images.cover_url, images.poster, images.poster_url,
    images.original, images.large, images.medium,
    picture.large, picture.medium,
  ];
  return candidates.find((v) => typeof v === 'string' && /^https?:\/\//i.test(v)) ?? '';
}

function findEpisodeCount(item: any): number | null {
  const x = asObject(item);
  const raw = x.episodes ?? x.num_episodes ?? x.episode_count ?? x.total_episodes;
  const value = typeof raw === 'object' ? (raw.total ?? raw.count ?? raw.sub ?? raw.eps) : raw;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function findShortId(item: any): string {
  const x = asObject(item);
  const id = x.shortId ?? x.short_id ?? x.slug ?? x.id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : '';
}

function matchesMalId(item: any, malId: number): boolean {
  const x = asObject(item);
  const ids = asObject(x.external_ids ?? x.externalIds ?? x.ids);
  return Number(x.mal_id ?? x.malId ?? x.malID ?? ids.mal_id ?? ids.malId) === malId;
}

/**
 * Fetches Hoshika's cover and episode count for a MAL ID. Failures are
 * non-fatal: AniVault continues using its existing MAL/TMDB/scraper data.
 * Requires HOSHIKA_ACCESS_TOKEN (a valid OAuth access token).
 */
export async function getHoshikaAnimeMetadata(
  malId: number,
  title: string,
  accessToken?: string,
  kv?: KVNamespace,
): Promise<HoshikaAnimeMetadata | null> {
  if (!malId || !title || !accessToken) return null;

  const cacheKey = `hoshika_anime_${malId}`;
  if (kv) {
    try {
      const cached = await kv.get(cacheKey, 'json') as HoshikaAnimeMetadata | null;
      if (cached && (cached.cover || cached.episodes !== null)) return cached;
    } catch { /* Cache failures must not affect anime pages. */ }
  }

  try {
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
    const searchUrl = new URL('https://hoshika.app/api/v1/search');
    searchUrl.searchParams.set('q', title);
    const searchRes = await fetch(searchUrl.toString(), { headers });
    if (!searchRes.ok) return null;

    const searchPayload: any = await searchRes.json();
    if (searchPayload?.ok === false) return null;
    const results = listFrom(searchPayload);
    const match = results.find((item) => matchesMalId(item, malId));
    if (!match) return null;

    let detail = match;
    const shortId = findShortId(match);
    if (shortId) {
      const detailRes = await fetch(
        `https://hoshika.app/api/v1/anime/${encodeURIComponent(shortId)}`,
        { headers },
      );
      if (detailRes.ok) {
        const detailPayload: any = await detailRes.json();
        if (detailPayload?.ok !== false) {
          const payload = asObject(detailPayload?.data ?? detailPayload?.anime ?? detailPayload);
          detail = payload;
        }
      }
    }

    const metadata: HoshikaAnimeMetadata = {
      cover: findCover(detail) || findCover(match),
      episodes: findEpisodeCount(detail) ?? findEpisodeCount(match),
    };
    if (kv && (metadata.cover || metadata.episodes !== null)) {
      try {
        await kv.put(cacheKey, JSON.stringify(metadata), { expirationTtl: 86400 });
      } catch { /* Metadata can be served even when cache writes fail. */ }
    }
    return metadata.cover || metadata.episodes !== null ? metadata : null;
  } catch (error) {
    console.warn('[hoshika] Metadata lookup failed:', String(error));
    return null;
  }
}
