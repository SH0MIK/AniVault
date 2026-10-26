/**
 * Public Hoshika catalog adapter.
 *
 * Catalog requests use the server-side Hoshika partner key when configured.
 * The key is never sent to browser code, and no OAuth/user-library token is used.
 * Episode metadata and episode stills are loaded from Hoshika's public
 * /api/v1/anime/{shortId}/episodes endpoint when available.
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
      const nested = imageUrl(value.url, value.src, value.medium, value.large, value.original, value.webp);
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
  const artwork = obj(x.artwork);
  return imageUrl(
    // Hoshika catalog feeds have used both poster/cover objects and flat
    // posterImage/coverImage URL fields. Accept both without changing source.
    poster.medium, poster.small, poster.url, poster.src, poster.large, poster.original,
    x.posterImage, x.poster_image, x.poster_image_url, x.poster_url, x.posterUrl,
    x.coverImage, x.cover_image, x.cover_image_url, x.cover_url, x.coverUrl,
    images.posterImage, images.poster_image, images.poster_medium, images.poster_small,
    images.medium, images.small, mainPicture.medium, mainPicture.small,
    poster, cover, images.poster, images.cover, images.cover_image, images.poster_url,
    images.original, images.large, images.medium, mainPicture.large,
    x.image, x.imageUrl, x.image_url, x.thumbnail, x.thumbnailUrl, x.thumbnail_url,
    artwork.poster, artwork.cover, artwork.image, artwork,
  );
}

function coverFrom(item: any): string {
  const x = obj(item);
  const images = obj(x.images);
  const banner = obj(x.banner);
  const artwork = obj(x.artwork);
  return imageUrl(
    x.bannerImage, x.banner_image, x.banner_url, x.bannerUrl,
    x.backdrop, x.backdropImage, x.backdrop_image, x.backdrop_url, x.backdropUrl,
    banner, images.banner, images.backdrop, images.banner_url, images.backdrop_url,
    artwork.banner, artwork.backdrop,
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
  const id = x.shortId ?? x.short_id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : '';
}

function normaliseTitle(value: any): string {
  return typeof value === 'string'
    ? value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
    : '';
}

/**
 * Hoshika search records may not expose a MAL ID. Match title variants
 * instead of treating Hoshika's internal shortId as a MAL ID.
 */
function titleMatchScore(item: any, title: string): number {
  const x = obj(item);
  const wanted = normaliseTitle(title);
  if (!wanted) return 0;
  const variants = [
    x.titleEnglish, x.titleRomaji, x.titleLocalized, x.titleJapanese,
    x.title, x.slug,
  ].map(normaliseTitle).filter(Boolean);
  // Prefix matches can silently cross-link seasons (e.g. a series and its
  // Final Season). Only accept exact normalized titles until an explicit
  // Hoshika-ID mapping exists.
  return variants.some((candidate) => candidate === wanted) ? 100 : 0;
}


export interface HoshikaEpisode {
  number: number;
  title: string;
  aired: string | null;
  thumbnail: string;
  filler: boolean;
  recap: boolean;
}

function episodeThumbnailFrom(item: any): string {
  const seen = new Set<any>();
  const candidates = [
    item?.thumbnail, item?.thumbnailUrl, item?.thumbnail_url,
    item?.image, item?.imageUrl, item?.image_url,
    item?.still, item?.stillUrl, item?.still_url,
    item?.preview, item?.previewUrl, item?.preview_url,
    item?.poster, item?.images, item?.artwork,
  ];
  const visit = (value: any, depth = 0): string => {
    if (depth > 5 || value == null) return '';
    if (typeof value === 'string') {
      const raw = value.trim();
      if (!raw || raw.startsWith('data:') || raw.startsWith('javascript:')) return '';
      try {
        const url = new URL(raw, 'https://hoshika.app');
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
      } catch { return ''; }
    }
    if (typeof value !== 'object' || seen.has(value)) return '';
    seen.add(value);
    if (Array.isArray(value)) {
      for (const entry of value) {
        const found = visit(entry, depth + 1);
        if (found) return found;
      }
      return '';
    }
    for (const key of ['url', 'src', 'href', 'original', 'originalUrl', 'full', 'large', 'medium', 'small', 'webp', 'thumbnail', 'thumbnailUrl', 'image', 'imageUrl', 'still', 'preview', 'path']) {
      const found = visit(value[key], depth + 1);
      if (found) return found;
    }
    return '';
  };
  for (const candidate of candidates) {
    const found = visit(candidate);
    if (found) return found;
  }
  return '';
}


/**
 * Resolve episode numbers and stills from Hoshika's public catalog.
 * Search results identify Hoshika anime by shortId; this is NOT a MAL ID.
 * The endpoint's documented response shape is { items, total, nextAfter }.
 */
export async function getHoshikaAnimeEpisodes(
  title: string,
  kv?: KVNamespace,
  apiKey?: string,
): Promise<HoshikaEpisode[] | null> {
  if (!title) return null;

  const searchUrl = new URL('https://hoshika.app/api/v1/search');
  searchUrl.searchParams.set('q', title);
  try {
    const searchResponse = await fetch(searchUrl.toString(), {
      headers: { Accept: 'application/json', ...(apiKey ? { 'X-Hoshika-Key': apiKey } : {}) },
    });
    if (!searchResponse.ok) return null;
    const searchPayload: any = await searchResponse.json();
    if (searchPayload?.ok === false) return null;

    const match = resultsFrom(searchPayload)
      .map((item) => ({ item, score: titleMatchScore(item, title) }))
      .filter((entry) => entry.score === 100)
      .sort((a, b) => b.score - a.score)[0]?.item;
    const shortId = shortIdFrom(match);
    if (!match || !shortId) return null;


    const episodes: HoshikaEpisode[] = [];
    let after: string | null = null;
    // Bound pagination so malformed cursors cannot cause an unbounded Worker request.
    for (let page = 0; page < 10; page++) {
      const url = new URL(`https://hoshika.app/api/v1/anime/${encodeURIComponent(shortId)}/episodes`);
      url.searchParams.set('locale', 'en');
      url.searchParams.set('limit', '100');
      if (after) url.searchParams.set('after', after);
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json', ...(apiKey ? { 'X-Hoshika-Key': apiKey } : {}) },
      });
      if (!response.ok) return episodes.length ? episodes : null;
      const payload: any = await response.json();
      if (payload?.ok === false || !Array.isArray(payload?.items)) {
        return episodes.length ? episodes : null;
      }

      for (const item of payload.items) {
        const number = Number(item?.number);
        const thumbnail = episodeThumbnailFrom(item);
        if (!Number.isInteger(number) || number < 1) continue;
        episodes.push({
          number,
          title: typeof item?.title === 'string' ? item.title : `Episode ${number}`,
          aired: typeof item?.aired === 'string' ? item.aired : null,
          thumbnail,
          filler: !!item?.filler,
          recap: !!item?.recap,
        });
      }

      after = typeof payload.nextAfter === 'string' && payload.nextAfter ? payload.nextAfter : null;
      if (!after || payload.items.length === 0) break;
    }

    episodes.sort((a, b) => a.number - b.number);
    return episodes.length ? episodes : null;
  } catch (error) {
    console.warn('[hoshika] Public episode lookup failed:', String(error));
    return null;
  }
}

/**
 * Fetch episodes directly by Hoshika shortId. This is the preferred API for
 * migrated pages; it avoids title matching and never interprets IDs as MAL.
 */
export async function getHoshikaAnimeEpisodesById(shortIdValue: string | number, apiKey?: string): Promise<HoshikaEpisode[] | null> {
  const shortId = String(shortIdValue ?? '').trim();
  if (!shortId) return null;
  const episodes: HoshikaEpisode[] = [];
  let after: string | null = null;
  try {
    for (let page = 0; page < 10; page++) {
      const url = new URL(`https://hoshika.app/api/v1/anime/${encodeURIComponent(shortId)}/episodes`);
      url.searchParams.set('locale', 'en');
      url.searchParams.set('limit', '100');
      if (after) url.searchParams.set('after', after);
      const response = await fetch(url.toString(), { headers: { Accept: 'application/json', ...(apiKey ? { 'X-Hoshika-Key': apiKey } : {}) } });
      if (!response.ok) return episodes.length ? episodes : null;
      const payload: any = await response.json();
      if (payload?.ok === false || !Array.isArray(payload?.items)) return episodes.length ? episodes : null;
      for (const item of payload.items) {
        const number = Number(item?.number);
        if (!Number.isInteger(number) || number < 1) continue;
        episodes.push({
          number,
          title: typeof item?.title === 'string' && item.title.trim() ? item.title : `Episode ${number}`,
          aired: typeof item?.aired === 'string' ? item.aired : null,
          thumbnail: episodeThumbnailFrom(item),
          filler: !!item?.filler,
          recap: !!item?.recap,
        });
      }
      after = typeof payload.nextAfter === 'string' && payload.nextAfter ? payload.nextAfter : null;
      if (!after || payload.items.length === 0) break;
    }
    episodes.sort((a, b) => a.number - b.number);
    return episodes.length ? episodes : null;
  } catch (error) {
    console.warn('[hoshika] Episode lookup by ID failed:', String(error));
    return episodes.length ? episodes : null;
  }
}

function metadataFrom(item: any): HoshikaAnimeMetadata {
  return {
    poster: posterFrom(item),
    cover: coverFrom(item),
    episodes: episodeCountFrom(item),
  };
}

/**
 * Temporary compatibility bridge for existing MAL-keyed callers: use an
 * exact normalized title match to obtain Hoshika metadata. The MAL ID is only
 * a legacy-call guard; it is never sent to Hoshika and is NOT treated as a
 * Hoshika ID. New/migrated code should call getHoshikaAnimeById() directly.
 * No KV cache is read or written here.
 */
export async function getHoshikaAnimeMetadata(
  malId: number,
  title: string,
  kv?: KVNamespace,
  includeDetail = false,
  apiKey?: string,
): Promise<HoshikaAnimeMetadata | null> {
  if (!malId || !title) return null;


  try {
    const url = new URL('https://hoshika.app/api/v1/search');
    url.searchParams.set('q', title);
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json', ...(apiKey ? { 'X-Hoshika-Key': apiKey } : {}) },
    });
    if (!response.ok) return null;
    const payload: any = await response.json();
    if (payload?.ok === false) return null;

    const match = resultsFrom(payload)
      .map((item) => ({ item, score: titleMatchScore(item, title) }))
      .filter((entry) => entry.score === 100)
      .sort((a, b) => b.score - a.score)[0]?.item;
    if (!match) {
      return null;
    }

    let result = metadataFrom(match);
    const shortId = shortIdFrom(match);
    const needsDetail = includeDetail && shortId && (!result.poster || result.episodes === null || !result.cover);
    if (needsDetail) {
      const detailResponse = await fetch(
        `https://hoshika.app/api/v1/anime/${encodeURIComponent(shortId)}`,
        { headers: { Accept: 'application/json', ...(apiKey ? { 'X-Hoshika-Key': apiKey } : {}) } },
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

    return result.poster || result.cover || result.episodes !== null ? result : null;
  } catch (error) {
    console.warn('[hoshika] Public catalog lookup failed:', String(error));
    return null;
  }
}


/**
 * Hoshika-native catalog record. Hoshika shortId is the canonical AniVault
 * catalog ID during the migration; it must never be interpreted as a MAL ID.
 */
export interface HoshikaCatalogAnime {
  id: string;
  shortId: string;
  slug: string;
  title: string;
  titleEnglish: string;
  titleRomaji: string;
  titleJapanese: string;
  synopsis: string;
  poster: string;
  cover: string;
  episodes: number | null;
  score: number | null;
  status: string;
  type: string;
  year: number | null;
  season: string;
  genres: string[];
  raw: any;
}

function firstText(...values: any[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function numberOrNull(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normaliseHoshikaAnime(item: any): HoshikaCatalogAnime | null {
  const x = obj(item);
  const shortId = shortIdFrom(x);
  if (!shortId) return null;
  const titleEnglish = firstText(x.titleEnglish, x.title_english, x.titles?.english);
  const titleRomaji = firstText(x.titleRomaji, x.title_romaji, x.titles?.romaji);
  const titleJapanese = firstText(x.titleJapanese, x.title_japanese, x.titles?.japanese);
  const title = firstText(x.titleLocalized, x.title_localized, x.title, titleEnglish, titleRomaji, titleJapanese, x.slug);
  const rawGenres = Array.isArray(x.genres) ? x.genres : [];
  const genres = rawGenres.map((g: any) => typeof g === 'string' ? g : firstText(g?.name, g?.title)).filter(Boolean);
  const rawYear = x.year ?? x.seasonYear ?? x.startYear ?? x.start_date?.year;
  return {
    id: String(x.id ?? shortId),
    shortId,
    slug: typeof x.slug === 'string' ? x.slug : '',
    title,
    titleEnglish,
    titleRomaji,
    titleJapanese,
    synopsis: firstText(x.synopsis, x.description, x.overview),
    poster: posterFrom(x),
    cover: coverFrom(x),
    episodes: episodeCountFrom(x),
    score: numberOrNull(x.averageScore ?? x.average_score ?? x.score ?? x.rating ?? x.mean),
    status: firstText(x.status, x.airingStatus),
    type: firstText(x.type, x.format, x.mediaType),
    year: numberOrNull(rawYear),
    season: firstText(x.season, x.seasonName, x.season_name),
    genres,
    raw: x,
  };
}

/** Search only Hoshika. No MAL/Jikan/AniList fallback and no KV cache. */
export async function searchHoshikaAnime(query: string, limit = 20, apiKey?: string): Promise<HoshikaCatalogAnime[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const url = new URL('https://hoshika.app/api/v1/search');
    url.searchParams.set('q', q);
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json', ...(apiKey ? { 'X-Hoshika-Key': apiKey } : {}) } });
    if (!response.ok) return [];
    const payload: any = await response.json();
    if (payload?.ok === false) return [];
    return resultsFrom(payload)
      .map(normaliseHoshikaAnime)
      .filter((anime): anime is HoshikaCatalogAnime => !!anime)
      .slice(0, Math.max(1, Math.min(50, Math.trunc(limit))));
  } catch (error) {
    console.warn('[hoshika] Search failed:', String(error));
    return [];
  }
}

/** Fetch one catalog record using Hoshika's canonical shortId. */
export async function getHoshikaAnimeById(shortId: string | number, apiKey?: string): Promise<HoshikaCatalogAnime | null> {
  const id = String(shortId ?? '').trim();
  if (!id) return null;
  try {
    const response = await fetch(
      `https://hoshika.app/api/v1/anime/${encodeURIComponent(id)}`,
      { headers: { Accept: 'application/json', ...(apiKey ? { 'X-Hoshika-Key': apiKey } : {}) } },
    );
    if (!response.ok) return null;
    const payload: any = await response.json();
    if (payload?.ok === false) return null;
    const detail: any = unwrap(payload);
    // Some public detail responses omit the top-level catalog identity fields
    // while still including the current title in watchOrder. Use that exact
    // shortId entry as a metadata supplement; never match by title.
    const watchOrder = Array.isArray(detail?.watchOrder) ? detail.watchOrder : [];
    const currentEntry = watchOrder.find((entry: any) => String(entry?.shortId ?? '') === id && entry?.current)
      ?? watchOrder.find((entry: any) => String(entry?.shortId ?? '') === id)
      ?? null;
    const merged = {
      ...(currentEntry ?? {}),
      ...detail,
      shortId: detail?.shortId ?? detail?.short_id ?? id,
      title: detail?.title ?? currentEntry?.title,
      titleEnglish: detail?.titleEnglish ?? currentEntry?.titleEnglish,
      titleRomaji: detail?.titleRomaji ?? currentEntry?.titleRomaji,
      slug: detail?.slug ?? currentEntry?.slug,
      coverImage: detail?.coverImage ?? currentEntry?.coverImage,
      format: detail?.format ?? currentEntry?.format,
      year: detail?.year ?? currentEntry?.year,
    };
    const record = normaliseHoshikaAnime(merged);
    return record?.shortId ? { ...record, raw: merged } : null;
  } catch (error) {
    console.warn('[hoshika] Detail lookup failed:', String(error));
    return null;
  }
}


export interface HoshikaHomeSections {
  trending: HoshikaCatalogAnime[];
  recent: HoshikaCatalogAnime[];
  top: HoshikaCatalogAnime[];
  seasonal: HoshikaCatalogAnime[];
}

function findCatalogArray(root: any, keys: string[], depth = 0): any[] {
  if (!root || typeof root !== 'object' || Array.isArray(root) || depth > 6) return [];
  for (const key of keys) {
    const value = root[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const childKey of ['items', 'results', 'anime', 'entries', 'data']) {
        if (Array.isArray(value[childKey])) return value[childKey];
      }
      const nested = findCatalogArray(value, keys, depth + 1);
      if (nested.length) return nested;
    }
  }
  for (const value of Object.values(root)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = findCatalogArray(value, keys, depth + 1);
      if (nested.length) return nested;
    }
  }
  return [];
}

async function fetchHoshikaJson(path: string, apiKey?: string): Promise<any | null> {
  try {
    const response = await fetch('https://hoshika.app/api/v1/' + path.replace(/^\/+/, ''), {
      headers: { Accept: 'application/json', ...(apiKey ? { 'X-Hoshika-Key': apiKey } : {}) },
    });
    if (!response.ok) return null;
    const payload: any = await response.json();
    return payload?.ok === false ? null : payload;
  } catch (error) {
    console.warn('[hoshika] Catalog request failed:', path, String(error));
    return null;
  }
}

function normalizeCatalogArray(items: any[]): HoshikaCatalogAnime[] {
  return items.map(normaliseHoshikaAnime).filter((item): item is HoshikaCatalogAnime => !!item);
}

/** Load the public Hoshika homepage feeds; deliberately no third-party fallback. */
export async function getHoshikaHomeSections(apiKey?: string): Promise<HoshikaHomeSections> {
  // The homepage's main feed is explicitly driven by Hoshika's trending
  // browse endpoint, rather than the separate /home aggregate response.
  const [trendingPayload, recentPayload, topPayload, seasonPayload] = await Promise.all([
    fetchHoshikaJson('browse?type=anime&sort=trending', apiKey),
    fetchHoshikaJson('browse?type=anime&sort=recent', apiKey),
    fetchHoshikaJson('browse?type=anime&sort=top', apiKey),
    fetchHoshikaJson('season?locale=en', apiKey),
  ]);

  const trending = normalizeCatalogArray(resultsFrom(trendingPayload ?? {}));
  const recent = normalizeCatalogArray(resultsFrom(recentPayload ?? {}));
  const top = normalizeCatalogArray(resultsFrom(topPayload ?? {}));
  const seasonal = normalizeCatalogArray(resultsFrom(seasonPayload ?? {}));

  return { trending, recent, top: top.length ? top : trending, seasonal };
}

/** Fetch the public trending anime feed directly from Hoshika's browse endpoint. */
export async function getHoshikaTrending(apiKey?: string): Promise<HoshikaCatalogAnime[]> {
  const payload = await fetchHoshikaJson('browse?type=anime&sort=trending', apiKey);
  return normalizeCatalogArray(resultsFrom(payload ?? {}));
}

/** Hoshika's paginated, filterable anime catalog. */
export async function getHoshikaCatalog(options: {
  genre?: string; year?: number; sort?: string; page?: number; type?: string; status?: string;
} = {}, apiKey?: string): Promise<{ items: HoshikaCatalogAnime[]; total: number; totalPages: number }> {
  // Use Hoshika's documented server-side genre/year facets first. Format and
  // status are normalized locally because the public contract only documents
  // genre/year for this endpoint. Pagination metadata comes from Hoshika.
  const requestedPage = Math.max(1, Math.trunc(options.page || 1));
  const pageSize = 24;
  const maxSourcePages = 10;
  const fetchPage = async (sourcePage: number) => {
    // Hoshika's dedicated genre endpoint returns genuinely genre-filtered
    // records. The general catalog endpoint can return the same broad feed
    // even when a genre query parameter is present, so do not use it for genres.
    const endpoint = options.genre
      ? new URL(`https://hoshika.app/api/v1/genre/${encodeURIComponent(options.genre)}`)
      : new URL('https://hoshika.app/api/v1/catalog');
    endpoint.searchParams.set('type', 'anime');
    const catalogSort = options.sort === 'trending' ? 'popular' : (options.sort || 'popular');
    endpoint.searchParams.set('sort', catalogSort);
    if (options.year) endpoint.searchParams.set('year', String(options.year));
    endpoint.searchParams.set('page', String(sourcePage));
    const payload = await fetchHoshikaJson(endpoint.pathname.replace('/api/v1/', '') + endpoint.search, apiKey);
    const root = unwrap(payload ?? {});
    const rawItems = resultsFrom(payload ?? {});
    const items = normalizeCatalogArray(rawItems.length ? rawItems : findCatalogArray(root, ['items', 'results', 'anime', 'catalog']));
    const total = numberOrNull(root?.total ?? root?.pagination?.total ?? root?.pagination?.items?.total ?? root?.items?.total ?? payload?.total);
    const totalPages = numberOrNull(root?.totalPages ?? root?.total_pages ?? root?.lastPage ?? root?.last_page ?? root?.last_visible_page ?? root?.pagination?.totalPages ?? root?.pagination?.total_pages ?? root?.pagination?.lastPage ?? root?.pagination?.last_page ?? root?.pagination?.last_visible_page ?? payload?.totalPages);
    const hasMore = typeof root?.hasMore === 'boolean' ? root.hasMore : (typeof payload?.hasMore === 'boolean' ? payload.hasMore : null);
    return { items, total, totalPages, hasMore };
  };

  const first = await fetchPage(1);
  const sourcePages = Math.max(1, Math.min(maxSourcePages, first.totalPages ?? (first.total ? Math.ceil(first.total / Math.max(first.items.length, 1)) : (first.hasMore ? maxSourcePages : 1))));
  const rest = sourcePages > 1
    ? await Promise.all(Array.from({ length: sourcePages - 1 }, (_, index) => fetchPage(index + 2)))
    : [];
  const allItems = [...first.items, ...rest.flatMap((result) => result.items)];
  const unique = new Map<string, HoshikaCatalogAnime>();
  for (const item of allItems) unique.set(item.shortId, item);
  let items = [...unique.values()];

  const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  const typeAliases: Record<string, string[]> = {
    tv: ['tv', 'tv series', 'television', 'tv anime'],
    movie: ['movie', 'film', 'anime movie'],
    ova: ['ova', 'original video animation'],
    ona: ['ona', 'original net animation', 'web'],
    special: ['special', 'tv special'],
    music: ['music', 'music video'],
  };
  // Year and genre are already applied by Hoshika. Some catalog records omit
  // those fields, so filtering them again locally would incorrectly drop valid matches.
  if (options.type) {
    const wanted = normalize(options.type);
    const aliases = typeAliases[wanted] ?? [wanted];
    items = items.filter((item) => {
      const actual = normalize(item.type || item.raw?.format || item.raw?.mediaType);
      return aliases.some((alias) => actual === alias || actual.includes(alias));
    });
  }
  if (options.status) {
    const wanted = normalize(options.status);
    items = items.filter((item) => {
      const actual = normalize(item.status || item.raw?.airingStatus);
      if (wanted === 'airing') return /airing|ongoing|currently/.test(actual);
      if (wanted === 'complete') return /complete|finished|ended/.test(actual);
      if (wanted === 'upcoming') return /upcoming|not yet|unreleased|planned/.test(actual);
      return actual === wanted;
    });
  }
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (requestedPage - 1) * pageSize;
  return { items: items.slice(startIndex, startIndex + pageSize), total, totalPages };
}

/** Fetch Hoshika's anime genre slugs and display names. */
export async function getHoshikaGenres(apiKey?: string): Promise<Array<{ slug: string; name: string }>> {
  const payload = await fetchHoshikaJson('genres', apiKey);
  const root = unwrap(payload ?? {});
  const raw = findCatalogArray(root, ['genres', 'items', 'results']);
  const source = raw.length ? raw : (Array.isArray(root) ? root : []);
  const toSlug = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const sourceItems = source.length ? source : (Array.isArray((payload as any)?.genres) ? (payload as any).genres : []);
  const mapped = sourceItems.map((item: any) => {
    if (typeof item === 'string') return { slug: toSlug(item), name: item };
    const name = firstText(item?.name, item?.title, item?.label, item?.slug, item?.id);
    const slug = toSlug(firstText(item?.slug, item?.id, name));
    return { slug, name };
  }).filter((item: { slug: string; name: string }) => !!item.slug && !!item.name);
  const unique = new Map<string, { slug: string; name: string }>();
  for (const item of mapped as Array<{ slug: string; name: string }>) unique.set(item.slug, item);
  return [...unique.values()];
}


export interface HoshikaSeasonFeed {
  season: string;
  year: number | null;
  items: HoshikaCatalogAnime[];
}

/** Fetch the current season directly from Hoshika; no third-party catalogue fallback. */
export async function getHoshikaSeason(apiKey?: string): Promise<HoshikaSeasonFeed> {
  const payload = await fetchHoshikaJson('season?locale=en', apiKey);
  const root = obj(payload);
  const data = unwrap(payload ?? {});
  const seasonInfo = obj(root.season ?? data?.season);
  const rawItems = Array.isArray(root.items) ? root.items : resultsFrom(payload ?? {});
  return {
    season: firstText(seasonInfo.season, data?.seasonName, data?.season, root.seasonName),
    year: numberOrNull(seasonInfo.year ?? data?.year ?? root.year),
    items: normalizeCatalogArray(rawItems),
  };
}
