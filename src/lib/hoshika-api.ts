/**
 * Public Hoshika catalog adapter.
 *
 * The documented catalog endpoints are searched without credentials. We
 * intentionally do not call user-library endpoints or require an OAuth token.
 * Hoshika does not document an episode-thumbnail endpoint, so episode stills
 * remain on AniVault's existing scraper route until a supported field/endpoint
 * can be confirmed.
 */
export interface HoshikaAnimeMetadata {
  poster: string;
  cover: string;
  episodes: number | null;
}

function obj(value: any): any {
  return value && typeof value === 'object' ? value : {};
}

function unwrap(payload: any): any {
  let value = payload;
  for (let i = 0; i < 4; i++) {
    const x = obj(value);
    if (x.data !== undefined) value = x.data;
    else if (x.anime !== undefined) value = x.anime;
    else if (x.item !== undefined) value = x.item;
    else break;
  }
  return value;
}

function resultsFrom(payload: any): any[] {
  const root = obj(payload);
  const data = unwrap(root);
  const candidates = [
    root.results, root.items, root.anime,
    data?.results, data?.items, data?.anime,
    data?.data?.results, data?.data?.items,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return [data];
  return [];
}

function imageUrl(...values: any[]): string {
  for (const value of values) {
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
    if (value && typeof value === 'object') {
      const nested = imageUrl(value.url, value.src, value.original, value.large, value.medium, value.webp);
      if (nested) return nested;
    }
  }
  return '';
}

function posterFrom(item: any): string {
  const x = obj(item);
  const images = obj(x.images);
  const poster = obj(x.poster);
  const cover = obj(x.cover);
  const mainPicture = obj(x.main_picture);
  return imageUrl(
    x.poster_url, x.posterUrl, x.cover_url, x.coverUrl, x.cover_image, x.coverImage,
    poster, cover, images.poster, images.cover, images.cover_image, images.poster_url,
    images.original, images.large, images.medium, mainPicture.large, mainPicture.medium,
    x.image, x.image_url, x.thumbnail,
  );
}

function coverFrom(item: any): string {
  const x = obj(item);
  const images = obj(x.images);
  const banner = obj(x.banner);
  return imageUrl(
    x.banner_url, x.bannerUrl, x.bannerImage, x.backdrop_url, x.backdropUrl,
    banner, images.banner, images.backdrop, images.banner_url, images.backdrop_url,
  );
}

function episodeCountFrom(item: any): number | null {
  const x = obj(item);
  const raw = x.episodes ?? x.num_episodes ?? x.episode_count ?? x.episodeCount ?? x.total_episodes;
  if (Array.isArray(raw)) return raw.length;
  const value = raw && typeof raw === 'object'
    ? (raw.total ?? raw.count ?? raw.sub ?? raw.eps)
    : raw;
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function shortIdFrom(item: any): string {
  const x = obj(item);
  const id = x.shortId ?? x.short_id ?? x.shortId ?? x.slug ?? x.id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : '';
}

function normaliseTitle(value: any): string {
  return typeof value === 'string'
    ? value.toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\\s+/g, ' ')
    : '';
}

/**
 * Hoshika search records do not expose a MAL ID in the public response.
 * Match on the known title variants instead of treating Hoshika's internal
 * shortId as a MAL ID (they are different identifier spaces).
 */
function titleMatchScore(item: any, title: string): number {
  const x = obj(item);
  const wanted = normaliseTitle(title);
  if (!wanted) return 0;
  const variants = [
    x.titleEnglish, x.titleRomaji, x.titleLocalized, x.titleJapanese,
    x.title, x.slug,
  ].map(normaliseTitle).filter(Boolean);
  if (variants.some((candidate) => candidate === wanted)) return 100;
  if (variants.some((candidate) => candidate.startsWith(wanted) || wanted.startsWith(candidate))) return 80;
  return 0;
}

function metadataFrom(item: any): HoshikaAnimeMetadata {
  return {
    poster: posterFrom(item),
    cover: coverFrom(item),
    episodes: episodeCountFrom(item),
  };
}

/**
 * Resolve a MAL ID against Hoshika's public catalog. Search is one request in
 * the common case; detail is only fetched for a single-title/detail request
 * when search results do not include the requested fields. Cache successful
 * and empty results to avoid repeatedly hitting Hoshika for the same title.
 */
export async function getHoshikaAnimeMetadata(
  malId: number,
  title: string,
  kv?: KVNamespace,
  includeDetail = false,
): Promise<HoshikaAnimeMetadata | null> {
  if (!malId || !title) return null;

  const cacheKey = `hoshika_public_anime_v2_${malId}`;
  let cached: HoshikaAnimeMetadata | null = null;
  if (kv) {
    try {
      cached = await kv.get(cacheKey, 'json') as HoshikaAnimeMetadata | null;
      if (cached && (!includeDetail || (cached.poster && cached.cover && cached.episodes !== null))) {
        return cached.poster || cached.cover || cached.episodes !== null ? cached : null;
      }
    } catch { /* Cache failures must not break anime pages. */ }
  }

  try {
    const url = new URL('https://hoshika.app/api/v1/search');
    url.searchParams.set('q', title);
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return cached;
    const payload: any = await response.json();
    if (payload?.ok === false) return cached;

    const match = resultsFrom(payload)
      .map((item) => ({ item, score: titleMatchScore(item, title) }))
      .filter((entry) => entry.score >= 80)
      .sort((a, b) => b.score - a.score)[0]?.item;
    if (!match) {
      if (kv) {
        try { await kv.put(cacheKey, JSON.stringify({ poster: '', cover: '', episodes: null }), { expirationTtl: 3600 }); } catch {}
      }
      return null;
    }

    let result = metadataFrom(match);
    const shortId = shortIdFrom(match);
    const needsDetail = includeDetail && shortId && (!result.poster || result.episodes === null || !result.cover);
    if (needsDetail) {
      const detailResponse = await fetch(
        `https://hoshika.app/api/v1/anime/${encodeURIComponent(shortId)}`,
        { headers: { Accept: 'application/json' } },
      );
      if (detailResponse.ok) {
        const detailPayload: any = await detailResponse.json();
        if (detailPayload?.ok !== false) {
          const detail = unwrap(detailPayload);
          const detailMetadata = metadataFrom(detail);
          result = {
            poster: detailMetadata.poster || result.poster,
            cover: detailMetadata.cover || result.cover,
            episodes: detailMetadata.episodes ?? result.episodes,
          };
        }
      }
    }

    if (kv) {
      try {
        await kv.put(cacheKey, JSON.stringify(result), {
          expirationTtl: result.poster || result.cover || result.episodes !== null ? 86400 : 3600,
        });
      } catch { /* Metadata is still usable if KV is unavailable. */ }
    }
    return result.poster || result.cover || result.episodes !== null ? result : null;
  } catch (error) {
    console.warn('[hoshika] Public catalog lookup failed:', String(error));
    return cached;
  }
}
