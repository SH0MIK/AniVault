// Full port of includes/api.php's MalAPI class (aliased as JikanAPI in the old
// codebase). Talks to the official MyAnimeList v2 API for most endpoints and
// falls back to the public Jikan API for characters/episodes/streaming, which
// MAL v2 doesn't expose -- exactly like the PHP version. File-based caching
// (CACHE_DIR/mal_*.json) is replaced with Workers KV.
import { Db } from './db';

const MAL_API_BASE = 'https://api.myanimelist.net/v2';
const LIST_FIELDS = 'id,title,alternative_titles,main_picture,synopsis,mean,rank,popularity,num_episodes,status,genres,start_date,rating,media_type,nsfw,num_list_users,broadcast,average_episode_duration';
const DETAIL_FIELDS = 'id,title,alternative_titles,main_picture,synopsis,mean,rank,popularity,num_episodes,status,genres,start_date,end_date,rating,media_type,nsfw,background,studios,related_anime,recommendations,statistics,source,average_episode_duration,broadcast';

export interface MalEnv {
  MAL_CLIENT_ID?: string;
  API_CACHE_ENABLED?: string; // "1" / "0" via wrangler.toml var
  API_CACHE_TIME?: string; // seconds
  TMDB_API_KEY?: string;
  SCRAPER_API_BASE?: string; // same secret as api-scraper.ts / episode-air.ts
}

export interface NormalisedAnime {
  mal_id: number;
  title: string;
  title_english: string;
  title_japanese: string;
  images: { jpg: { image_url: string; large_image_url: string } };
  synopsis: string;
  background: string;
  score: number | null;
  scored_by: number | null;
  rank: number | null;
  popularity: number | null;
  episodes: number;
  status: string;
  type: string;
  rating: string;
  source: string;
  duration: string | null;
  aired: { string: string | null };
  start_date: string | null;
  genres: { mal_id: number; name: string }[];
  studios: { mal_id: number; name: string }[];
  related_anime: any[];
  recommendations: any[];
  trailer: any[];
  themes: any[];
  members: number;
  broadcast: { day: string | null; time: string | null };
  duration_mins: number | null;
  // Only populated for AniList-sourced entries (see getAniListSeasonNow) —
  // MAL/Jikan has no equivalent field. A real wide banner image, not a poster.
  banner_image?: string;
}

export class MalAPI {
  constructor(private env: MalEnv, private kv: KVNamespace | undefined, private db: Db) {}

  // Fire-and-forget cache write. KV's daily put() quota (1,000/day on the
  // free tier) is easy to exceed with an hourly scanner + Jikan pagination
  // fallback — when that happens put() throws, and previously that was
  // unhandled and took the whole request down with it (see incident:
  // "KV put() limit exceeded for the day" crashing GET /). A cache write is
  // never worth failing the response over, so this always resolves and just
  // logs on failure.
  private async safeKvPut(key: string, value: string, opts?: KVNamespacePutOptions): Promise<void> {
    if (!this.kv) return;
    try {
      await this.kv.put(key, value, opts);
    } catch (err: any) {
      console.warn('[mal-api] KV put failed (continuing without cache write):', key, '-', String(err?.message ?? err));
    }
  }

  private cacheEnabled(): boolean {
    return (this.env.API_CACHE_ENABLED ?? '1') === '1';
  }
  private cacheTtl(): number {
    return Number(this.env.API_CACHE_TIME ?? 3600);
  }

  private async get(endpoint: string, params: Record<string, string | number> = {}): Promise<any> {
    const url = MAL_API_BASE + endpoint + (Object.keys(params).length ? '?' + new URLSearchParams(params as any).toString() : '');

    if (this.kv && this.cacheEnabled()) {
      const cacheKey = 'mal_' + (await sha1(url));
      const cached = await this.kv.get(cacheKey, 'json');
      if (cached) return cached;

      const res = await fetch(url, { headers: { 'X-MAL-CLIENT-ID': this.env.MAL_CLIENT_ID ?? '', Accept: 'application/json' } });
      if (!res.ok) return { error: 'API request failed' };
      const json = await res.json();
      await this.safeKvPut(cacheKey, JSON.stringify(json), { expirationTtl: this.cacheTtl() });
      return json;
    }

    const res = await fetch(url, { headers: { 'X-MAL-CLIENT-ID': this.env.MAL_CLIENT_ID ?? '', Accept: 'application/json' } });
    if (!res.ok) return { error: 'API request failed' };
    return res.json();
  }

  async jikanGet(url: string): Promise<any> {
    if (this.kv && this.cacheEnabled()) {
      const cacheKey = 'jikan_' + (await sha1(url));
      const cached = await this.kv.get(cacheKey, 'json') as any;
      if (cached && cached.data !== undefined) return cached;
    }

    // Jikan rate-limit: 3 req/sec. Retry once after a short wait on 429.
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'AnimeApp/1.0' } });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      if (!res.ok) return { data: [] };
      const decoded: any = await res.json().catch(() => null);
      if (!decoded || decoded.data === undefined) return { data: [] };

      if (this.kv && this.cacheEnabled()) {
        const cacheKey = 'jikan_' + (await sha1(url));
        await this.safeKvPut(cacheKey, JSON.stringify(decoded), { expirationTtl: this.cacheTtl() });
      }
      return decoded;
    }
    return { data: [] };
  }

  // AniList's "this season" data is far more current than MAL/Jikan's
  // season/now endpoint (which frequently lags real air dates or lists
  // shows as "airing" long after/before they actually are). This also
  // gives us AniList's real wide bannerImage for free, which MAL has no
  // equivalent for at all — that's what the home page hero uses.
  //
  // Live requests should almost never need to hit AniList directly: a cron
  // job (see refreshAniListSeasonCache below + src/scheduled.ts) keeps this
  // cache warm on a timer. This method is the read path — cache first, and
  // only falls back to a live AniList call / then MAL if the cache is
  // somehow cold (e.g. right after first deploy, before the cron has run).
  async getAniListSeasonNow(): Promise<{ data: NormalisedAnime[] }> {
    const cacheKey = this.seasonCacheKey();
    if (this.kv && this.cacheEnabled()) {
      const cached = await this.kv.get(cacheKey, 'json') as { data: NormalisedAnime[] } | null;
      if (cached) return cached;
    }

    const data = await this.fetchAniListSeasonLive();
    if (!data || data.length === 0) return this.getSeasonNowFallback();

    const result = { data };
    if (this.kv && this.cacheEnabled()) {
      // Generous TTL as a safety net — the cron is what actually keeps this
      // fresh minute-to-minute; this just stops a cold cache from forcing
      // every single request to call AniList live.
      await this.safeKvPut(cacheKey, JSON.stringify(result), { expirationTtl: Math.max(this.cacheTtl(), 7200) });
    }
    return result;
  }

  // Called by the scheduled cron handler ONLY — always hits AniList live
  // (ignores whatever's already cached) and overwrites the cache key that
  // getAniListSeasonNow() reads. Returns true on a successful refresh.
  async refreshAniListSeasonCache(): Promise<boolean> {
    const data = await this.fetchAniListSeasonLive();
    if (!data || data.length === 0) return false;
    if (this.kv && this.cacheEnabled()) {
      await this.safeKvPut(this.seasonCacheKey(), JSON.stringify({ data }), { expirationTtl: 7200 });
    }
    return true;
  }

  // AniList blocks requests from Cloudflare Workers outright (confirmed via
  // a 403 "manually blocked" response) — there's no live single-anime
  // lookup available here the way there is for MAL/Jikan. But the season
  // cache your GitHub Action already populates (see
  // .github/workflows/anilist-cache.yml) carries AniList's real
  // bannerImage for every title in the current season "for free" — if the
  // anime being viewed happens to be currently airing, we can pull its
  // banner out of that cache with zero extra requests. Anything outside
  // the current season simply isn't covered (returns '').
  async getAniListBannerFromSeasonCache(malId: number): Promise<string> {
    if (!malId || !this.kv) return '';
    const cached = await this.kv.get(this.seasonCacheKey(), 'json') as { data: NormalisedAnime[] } | null;
    if (!cached?.data) return '';
    return cached.data.find((a) => a.mal_id === malId)?.banner_image || '';
  }

  // Second tier: AniList's all-time top-200-by-popularity banner map (also
  // written by the same GitHub Action, refreshed roughly daily since it's
  // effectively static). Covers older/finished popular titles that the
  // season cache above can never include — Attack on Titan, Naruto, etc.
  async getAniListTopBanner(malId: number): Promise<string> {
    if (!malId || !this.kv) return '';
    const map = await this.kv.get('anilist_top_banners', 'json') as Record<string, string> | null;
    return map?.[malId] || '';
  }

  private seasonCacheKey(): string {
    const now = new Date();
    const month = now.getUTCMonth() + 1; // 1-12
    const seasonYear = now.getUTCFullYear();
    const season = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL';
    return `anilist_season_${season}_${seasonYear}`;
  }

  private async fetchAniListSeasonLive(): Promise<NormalisedAnime[] | null> {
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const seasonYear = now.getUTCFullYear();
    const season = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL';

    const query = `
      query ($season: MediaSeason, $seasonYear: Int) {
        Page(page: 1, perPage: 50) {
          media(season: $season, seasonYear: $seasonYear, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
            idMal
            title { romaji english }
            description(asHtml: false)
            bannerImage
            coverImage { large extraLarge }
            genres
            episodes
            averageScore
            format
            status
          }
        }
      }`;

    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables: { season, seasonYear } }),
      });
      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        console.error(`[anilist] HTTP ${res.status} ${res.statusText}`, bodyText.slice(0, 500));
        return null;
      }
      const json: any = await res.json();
      if (json?.errors?.length) {
        console.error('[anilist] GraphQL errors:', JSON.stringify(json.errors).slice(0, 500));
        return null;
      }
      const media: any[] = json?.data?.Page?.media ?? [];
      console.log(`[anilist] fetched ${media.length} media for ${season} ${seasonYear}`);

      return media
        .filter((m) => m.idMal)
        .map((m) => ({
          mal_id: m.idMal,
          title: m.title?.romaji || m.title?.english || 'Unknown',
          title_english: m.title?.english || '',
          title_japanese: '',
          images: {
            jpg: {
              image_url: m.coverImage?.large || '',
              large_image_url: m.coverImage?.extraLarge || m.coverImage?.large || '',
            },
          },
          synopsis: stripAniListHtml(m.description || ''),
          background: '',
          score: typeof m.averageScore === 'number' ? m.averageScore / 10 : null,
          scored_by: null,
          rank: null,
          popularity: null,
          episodes: m.episodes || 0,
          status: m.status || '',
          type: m.format || 'TV',
          rating: '',
          source: '',
          duration: null,
          aired: { string: null },
          start_date: null,
          genres: (m.genres || []).map((g: string, i: number) => ({ mal_id: i, name: g })),
          studios: [],
          related_anime: [],
          recommendations: [],
          trailer: [],
          themes: [],
          members: 0,
          broadcast: { day: null, time: null },
          duration_mins: null,
          banner_image: m.bannerImage || undefined,
        }));
    } catch (err) {
      console.error('[anilist] fetch threw:', err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  // Used when AniList errors, times out, or returns nothing — falls back to
  // MAL/Jikan's season/now data so the row and hero still populate (just
  // without AniList's banner art) instead of showing nothing. Deliberately
  // not cached under the AniList key, so the very next request tries
  // AniList fresh rather than staying stuck on the fallback.
  private async getSeasonNowFallback(): Promise<{ data: NormalisedAnime[] }> {
    try {
      return await this.getSeasonNow(1);
    } catch {
      return { data: [] };
    }
  }

  // Public so the home page (and anywhere else) can look up an admin-saved
  // local cover for a specific anime — e.g. the mobile hero, which shows
  // your own cover art instead of the wide banner (see home.ts).
  async getLocalAnimeImage(animeId: number): Promise<string> {
    if (!animeId) return '';
    const row = await this.db.fetchOne<{ image_url: string }>('SELECT image_url FROM anime_images WHERE anime_id = ?', [animeId]);
    return row ? row.image_url : '';
  }

  // Same idea as getLocalAnimeImage, but for wide banner art (a separate
  // table/admin page: anime_banners / admin/anime_banners.php). AniList's
  // bannerImage is community-submitted and often mediocre — this lets you
  // manually curate a nicer banner per title, same as Anivexa does.
  // Returns order_index too, so the home page hero can honour your manual
  // display order (see getAniListSeasonNow's caller in home.ts).
  // Falls back to home_hero_banners (the Homepage Hero Carousel admin page)
  // if nothing's saved in the dedicated anime_banners library — titles
  // curated for the homepage hero should also get their banner on their
  // own detail page instead of needing to be saved twice.
  async getLocalAnimeBannerInfo(animeId: number): Promise<{ image_url: string; order_index: number } | null> {
    if (!animeId) return null;
    const row = await this.db.fetchOne<{ image_url: string; order_index: number | null }>(
      'SELECT image_url, order_index FROM anime_banners WHERE anime_id = ?',
      [animeId]
    );
    if (row) return { image_url: row.image_url, order_index: row.order_index ?? 0 };

    const heroRow = await this.db.fetchOne<{ banner_image_url: string | null; display_order: number | null }>(
      'SELECT banner_image_url, display_order FROM home_hero_banners WHERE anime_id = ?',
      [animeId]
    );
    return heroRow?.banner_image_url ? { image_url: heroRow.banner_image_url, order_index: heroRow.display_order ?? 0 } : null;
  }

  // A manually-saved logo (admin/anime_banners.php "Add Logo" button) takes
  // priority over the automatic TMDB search — lets you fix a wrong/missing
  // match without waiting on TMDB to have the right one. Falls back to
  // home_hero_banners' logo_image_url (Homepage Hero Carousel) if nothing's
  // saved in the dedicated anime_logos library, for the same reason as above.
  async getLocalAnimeLogo(animeId: number): Promise<string> {
    if (!animeId) return '';
    const row = await this.db.fetchOne<{ image_url: string }>('SELECT image_url FROM anime_logos WHERE anime_id = ?', [animeId]);
    if (row) return row.image_url;

    const heroRow = await this.db.fetchOne<{ logo_image_url: string | null }>('SELECT logo_image_url FROM home_hero_banners WHERE anime_id = ?', [animeId]);
    return heroRow?.logo_image_url ?? '';
  }

  // TMDB stores a "clear logo" per title — transparent-background title art,
  // which is what Anivexa overlays on the mobile cover instead of plain
  // text. Checks your manually-saved local logo library first (instant,
  // always correct); only falls back to a live TMDB title search (best-
  // effort, first result — good enough for a hero row of a handful of
  // titles) if you haven't saved one. Silently returns '' on any failure
  // (missing key, no match, no logo for that title, network error) since
  // this is purely a visual enhancement, never something that should break
  // the page.
  async getTitleLogo(animeId: number, title: string): Promise<string> {
    const local = await this.getLocalAnimeLogo(animeId);
    if (local) return local;
    const { logo } = await this.getTmdbImages(animeId, title);
    return logo;
  }

  // Textless/clean backdrop from TMDB, used as the first-choice hero
  // background before falling back to AniList banners. Shares the same
  // cached /images lookup as the logo, so this costs nothing extra when
  // getTitleLogo has already been called for the same anime.
  async getTitleBackdrop(animeId: number, title: string): Promise<string> {
    const { backdrop } = await this.getTmdbImages(animeId, title);
    return backdrop;
  }

  private async getTmdbImages(animeId: number, title: string): Promise<{ logo: string; backdrop: string }> {
    const empty = { logo: '', backdrop: '' };
    if (!this.env.TMDB_API_KEY || !title) return empty;

    const cacheKey = `tmdb_images_${animeId || (await sha1(title.toLowerCase()))}`;
    if (this.kv && this.cacheEnabled()) {
      const cached = await this.kv.get(cacheKey);
      if (cached !== null) {
        try { return JSON.parse(cached); } catch { /* stale/corrupt entry, refetch below */ }
      }
    }

    const images = await this.fetchTmdbImages(title);
    if (this.kv && this.cacheEnabled()) {
      // Logos/backdrops essentially never change — cache for a week either
      // way (even a "not found" result), so a title with neither doesn't
      // get re-searched on every single page load.
      await this.safeKvPut(cacheKey, JSON.stringify(images), { expirationTtl: 604800 });
    }
    return images;
  }

  // Strips a trailing season marker from a title so a season-2+ entry can
  // fall back to searching for its base/season-1 title. Returns null if no
  // recognisable season suffix is present (nothing to strip).
  private stripSeasonSuffix(title: string): string | null {
    const patterns = [
      /\s+(?:the\s+)?\d+(?:st|nd|rd|th)\s+season$/i,   // "... 2nd Season"
      /\s+season\s+\d+$/i,                              // "... Season 2"
      /\s+cour\s+\d+$/i,                                 // "... Cour 2"
      /\s+part\s+\d+$/i,                                 // "... Part 2"
      /\s+s\d+$/i,                                       // "... S2"
      /\s+(?:ii|iii|iv|v)$/i,                            // "... II" / "III" etc
      /\s+\d+$/,                                         // "... 2" (plain trailing number)
    ];
    for (const re of patterns) {
      if (re.test(title)) {
        const stripped = title.replace(re, '').trim();
        if (stripped && stripped.toLowerCase() !== title.toLowerCase()) return stripped;
      }
    }
    return null;
  }

  private async fetchTmdbImages(title: string, isFallback = false): Promise<{ logo: string; backdrop: string }> {
    const empty = { logo: '', backdrop: '' };
    try {
      const key = this.env.TMDB_API_KEY!;
      const searchUrl = (kind: 'tv' | 'movie') =>
        `https://api.themoviedb.org/3/search/${kind}?api_key=${key}&query=${encodeURIComponent(title)}`;

      let id: number | null = null;
      let kind: 'tv' | 'movie' = 'tv';
      for (const k of ['tv', 'movie'] as const) {
        const res = await fetch(searchUrl(k));
        if (!res.ok) continue;
        const json: any = await res.json();
        const first = json?.results?.[0];
        if (first?.id) { id = first.id; kind = k; break; }
      }
      if (!id) {
        // No TMDB entry matched this exact title (common for season 2+
        // entries) — retry once with the season suffix stripped so we land
        // on the season 1 / base show entry instead.
        if (!isFallback) {
          const stripped = this.stripSeasonSuffix(title);
          if (stripped) return await this.fetchTmdbImages(stripped, true);
        }
        return empty;
      }

      const imgRes = await fetch(`https://api.themoviedb.org/3/${kind}/${id}/images?api_key=${key}&include_image_language=en,ja,null`);
      if (!imgRes.ok) return empty;
      const imgJson: any = await imgRes.json();
      const logos: any[] = imgJson?.logos ?? [];
      const backdrops: any[] = imgJson?.backdrops ?? [];

      let logo = '';
      if (logos.length > 0) {
        const best = logos.find((l) => l.iso_639_1 === 'en') || logos[0];
        logo = best?.file_path ? `https://image.tmdb.org/t/p/w500${best.file_path}` : '';
      }

      let backdrop = '';
      if (backdrops.length > 0) {
        // Prefer textless backdrops (no language tag) over ones with a
        // logo/text baked in.
        const best = backdrops.find((b) => b.iso_639_1 === null) || backdrops[0];
        backdrop = best?.file_path ? `https://image.tmdb.org/t/p/original${best.file_path}` : '';
      }

      // If either piece is still missing, fill the gap from the season 1 /
      // base title instead of overwriting what we already found.
      if ((!logo || !backdrop) && !isFallback) {
        const stripped = this.stripSeasonSuffix(title);
        if (stripped) {
          const fallback = await this.fetchTmdbImages(stripped, true);
          logo = logo || fallback.logo;
          backdrop = backdrop || fallback.backdrop;
        }
      }

      return { logo, backdrop };
    } catch {
      return empty;
    }
  }

  private async normalise(node: any): Promise<NormalisedAnime> {
    const animeId = Number(node.id ?? 0);
    const localImage = animeId ? await this.getLocalAnimeImage(animeId) : '';
    const mediumImage = localImage || node.main_picture?.medium || '';
    const largeImage = localImage || node.main_picture?.large || node.main_picture?.medium || '';

    const genres = (node.genres ?? []).filter(Boolean).map((g: any) => ({ mal_id: g?.id ?? 0, name: g?.name ?? '' }));
    const studios = (node.studios ?? []).filter(Boolean).map((s: any) => ({ mal_id: s?.id ?? 0, name: s?.name ?? '' }));

    const related = await Promise.all((node.related_anime ?? []).filter(Boolean).map(async (r: any) => {
      const entry = r?.node ?? {};
      const entryId = Number(entry?.id ?? 0);
      const entryLocalImage = entryId ? await this.getLocalAnimeImage(entryId) : '';
      return {
        entry: {
          mal_id: entryId,
          title: entry?.title ?? '',
          images: { jpg: { image_url: entryLocalImage || entry?.main_picture?.medium || '' } },
        },
        relation_type_formatted: r?.relation_type_formatted ?? '',
      };
    }));

    const recommendations = await Promise.all((node.recommendations ?? []).filter(Boolean).map(async (r: any) => {
      const entry = r?.node ?? {};
      const entryId = Number(entry?.id ?? 0);
      const entryLocalImage = entryId ? await this.getLocalAnimeImage(entryId) : '';
      return {
        entry: {
          mal_id: entryId,
          title: entry?.title ?? '',
          images: { jpg: { image_url: entryLocalImage || entry?.main_picture?.medium || '' } },
        },
      };
    }));

    const altTitles = node.alternative_titles ?? {};
    const duration = node.average_episode_duration !== undefined
      ? `${Math.round(node.average_episode_duration / 60)} min per ep`
      : null;
    let aired: string | null = null;
    if (node.start_date) {
      aired = node.start_date + (node.end_date ? ' to ' + node.end_date : '');
    }

    return {
      mal_id: animeId,
      title: node.title ?? '',
      title_english: altTitles.en ?? '',
      title_japanese: altTitles.ja ?? '',
      images: { jpg: { image_url: mediumImage, large_image_url: largeImage } },
      synopsis: node.synopsis ?? '',
      background: node.background ?? '',
      score: node.mean ?? null,
      scored_by: node._scored_by ?? node.statistics?.scoring?.count ?? node.num_list_users ?? null,
      rank: node.rank ?? null,
      popularity: node.popularity ?? null,
      episodes: node.num_episodes ?? 0,
      status: mapStatus(node.status ?? ''),
      type: (node.media_type ?? '').toUpperCase(),
      rating: node.rating ?? '',
      source: node.source ?? '',
      duration,
      aired: { string: aired },
      start_date: node.start_date ?? null,
      genres,
      studios,
      related_anime: related,
      recommendations,
      trailer: [],
      themes: [],
      members: node.num_list_users ?? node.statistics?.num_list_users ?? 0,
      broadcast: { day: node.broadcast?.day_of_the_week ?? null, time: node.broadcast?.start_time ?? null },
      duration_mins: node.average_episode_duration !== undefined ? Math.round(node.average_episode_duration / 60) : null,
    };
  }

  currentSeasonPublic(): string {
    return this.currentSeason();
  }

  private currentSeason(): string {
    const m = new Date().getUTCMonth() + 1;
    if (m <= 3) return 'winter';
    if (m <= 6) return 'spring';
    if (m <= 9) return 'summer';
    return 'fall';
  }

  private nextSeason(): [number, string] {
    const seasons = ['winter', 'spring', 'summer', 'fall'];
    const idx = seasons.indexOf(this.currentSeason());
    const next = (idx + 1) % 4;
    const year = next === 0 ? new Date().getUTCFullYear() + 1 : new Date().getUTCFullYear();
    return [year, seasons[next]];
  }

  // ── Public API (same shapes as the old Jikan-backed version) ─────────────

  async searchAnime(query: string, page = 1, type = '', status = ''): Promise<{ data: NormalisedAnime[]; pagination: any }> {
    const offset = (page - 1) * 20;
    const params: Record<string, string | number> = { q: query, limit: 20, offset, fields: LIST_FIELDS, nsfw: 'false' };
    if (type) params.media_type = type.toLowerCase();
    if (status) params.status = status;
    const raw = await this.get('/anime', params);
    const data = await Promise.all((raw.data ?? []).map((n: any) => this.normalise(n.node)));
    return { data, pagination: { last_visible_page: Math.max(1, raw.paging?.next ? page + 5 : page), items: { total: data.length } } };
  }

  async getAnime(id: number): Promise<{ data: NormalisedAnime | null }> {
    const raw = await this.get(`/anime/${id}`, { fields: DETAIL_FIELDS });
    if (raw.error) return { data: null };
    return { data: await this.normalise(raw) };
  }

  // Replaces getCharacter + getCharacterAnime + getCharacterVoices (3
  // separate Jikan calls) with one -- MAL's character page has bio,
  // animeography, and voice roles all on a single page, so one scrape
  // covers what used to take 3 requests. Falls back to the original 3
  // parallel Jikan calls if the scraper is unavailable/errors.
  async getCharacterFull(id: number): Promise<{ character: any; animeography: any; voices: any }> {
    const fromScraper = await this.scraperGet(`/api/mal/character/${id}`);
    if (fromScraper) return mapScraperCharacterFull(fromScraper);

    const [character, animeography, voices] = await Promise.all([
      this.jikanGet(`https://api.jikan.moe/v4/characters/${id}`),
      this.jikanGet(`https://api.jikan.moe/v4/characters/${id}/anime`),
      this.jikanGet(`https://api.jikan.moe/v4/characters/${id}/voices`),
    ]);
    return { character, animeography, voices };
  }

  async getAnimeCharacters(id: number): Promise<any> {
    const fromScraper = await this.scraperGet(`/api/mal/anime/${id}/characters`);
    if (fromScraper) return mapScraperCharacters(fromScraper);
    return this.jikanGet(`https://api.jikan.moe/v4/anime/${id}/characters`);
  }

  async getAnimeEpisodes(id: number, page = 1): Promise<any> {
    const fromScraper = await this.scraperGet(`/api/mal/anime/${id}/episodes?page=${page}`);
    if (fromScraper) return mapScraperEpisodes(fromScraper);
    return this.jikanGet(`https://api.jikan.moe/v4/anime/${id}/episodes?page=${page}`);
  }

  async getAnimeStreaming(id: number): Promise<any> {
    return this.jikanGet(`https://api.jikan.moe/v4/anime/${id}/streaming`);
  }

  // New endpoints -- no prior site UI consumed these, so no Jikan-shape
  // reshaping is needed the way episodes/characters had to match existing
  // callers. Still keep Jikan as a fallback for resilience, same pattern
  // as everything else here, reshaped from Jikan's actual shape into ours
  // instead (the reverse direction, since our own shape is what the new
  // UI below is built against).
  async getAnimeThemes(id: number): Promise<{ opening: any[]; ending: any[] }> {
    const fromScraper = await this.scraperGet(`/api/mal/anime/${id}/themes`);
    if (fromScraper) return fromScraper;

    const jikan = await this.jikanGet(`https://api.jikan.moe/v4/anime/${id}/themes`);
    return {
      opening: (jikan?.data?.openings ?? []).map((t: string, i: number) => ({ number: i + 1, title: t, artist: '', episodes: null, spotifyUrl: null })),
      ending: (jikan?.data?.endings ?? []).map((t: string, i: number) => ({ number: i + 1, title: t, artist: '', episodes: null, spotifyUrl: null })),
    };
  }

  async getAnimeVideos(id: number): Promise<{ musicVideos: any[]; trailers: any[] }> {
    const fromScraper = await this.scraperGet(`/api/mal/anime/${id}/videos`);
    if (fromScraper) return fromScraper;

    const jikan = await this.jikanGet(`https://api.jikan.moe/v4/anime/${id}/videos`);
    const trailer = jikan?.data?.promo?.[0]?.trailer;
    return {
      musicVideos: [],
      trailers: trailer?.youtube_id
        ? [{ label: 'PV 1', youtubeId: trailer.youtube_id, embedUrl: trailer.embed_url, songTitle: null, songArtist: null }]
        : [],
    };
  }

  async getAnimePictures(id: number): Promise<{ data: any[] }> {
    const fromScraper = await this.scraperGet(`/api/mal/anime/${id}/pictures`);
    if (fromScraper) return fromScraper;

    const jikan = await this.jikanGet(`https://api.jikan.moe/v4/anime/${id}/pictures`);
    return { data: (jikan?.data ?? []).map((p: any) => ({ image: p.jpg?.image_url ?? null, thumbnail: p.jpg?.small_image_url ?? null })) };
  }

  async getCharacterPictures(id: number): Promise<{ data: any[] }> {
    const fromScraper = await this.scraperGet(`/api/mal/character/${id}/pictures`);
    if (fromScraper) return fromScraper;

    const jikan = await this.jikanGet(`https://api.jikan.moe/v4/characters/${id}/pictures`);
    return { data: (jikan?.data ?? []).map((p: any) => ({ image: p.jpg?.image_url ?? null, thumbnail: p.jpg?.small_image_url ?? null })) };
  }

  // Own scraper (see AniVault-Scraper's src/scrapers/mal.ts) — same base-URL
  // env var and stripping convention as api-scraper.ts / episode-air.ts.
  // Returns null (not throw) on any failure/missing config so callers fall
  // straight through to the Jikan path above, same "scraper first, Jikan as
  // safety net" shape episode-air.ts already established.
  private async scraperGet(path: string, timeoutMs = 8000): Promise<any | null> {
    const base = this.env.SCRAPER_API_BASE?.replace(/\/+$/, '').replace(/\/api$/i, '');
    if (!base) return null;
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${base}${path}`, { headers: { Accept: 'application/json' }, signal: controller.signal });
      clearTimeout(t);
      if (!res.ok) {
        console.warn(`[mal-api] scraper API HTTP ${res.status} for ${path} — falling back to Jikan`);
        return null;
      }
      return await res.json().catch(() => null);
    } catch (err: any) {
      const reason = err?.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : String(err?.message ?? err);
      console.warn(`[mal-api] scraper API call failed for ${path} —`, reason, '— falling back to Jikan');
      return null;
    }
  }

  async getRecommendations(animeId: number): Promise<{ data: any[] }> {
    const result = await this.getAnime(animeId);
    return { data: result.data?.recommendations ?? [] };
  }

  async getSeasonNow(page = 1): Promise<{ data: NormalisedAnime[]; pagination: any }> {
    const year = new Date().getUTCFullYear();
    const season = this.currentSeason();
    const offset = (page - 1) * 20;
    const raw = await this.get(`/anime/season/${year}/${season}`, { limit: 20, offset, fields: LIST_FIELDS, sort: 'anime_score', nsfw: 'false' });
    const data = await Promise.all((raw.data ?? []).map((n: any) => this.normalise(n.node)));
    return { data, pagination: { last_visible_page: raw.paging?.next ? page + 1 : page } };
  }

  async getSeasonUpcoming(): Promise<{ data: NormalisedAnime[] }> {
    const [year, season] = this.nextSeason();
    const raw = await this.get(`/anime/season/${year}/${season}`, { limit: 20, fields: LIST_FIELDS, nsfw: 'false' });
    const data = await Promise.all((raw.data ?? []).map((n: any) => this.normalise(n.node)));
    return { data };
  }

  async getTopAnime(filter = 'bypopularity', page = 1): Promise<{ data: NormalisedAnime[]; pagination: any }> {
    const rankingMap: Record<string, string> = { bypopularity: 'bypopularity', favorite: 'favorite', airing: 'airing', upcoming: 'upcoming', byrank: 'all' };
    const rankingType = rankingMap[filter] ?? 'bypopularity';
    const offset = (page - 1) * 25;
    const raw = await this.get('/anime/ranking', { ranking_type: rankingType, limit: 25, offset, fields: LIST_FIELDS, nsfw: 'false' });
    const data = await Promise.all((raw.data ?? []).map((n: any) => this.normalise(n.node)));
    return { data, pagination: { last_visible_page: raw.paging?.next ? page + 5 : page } };
  }

  getAnimeGenres(): { data: { mal_id: number; name: string }[] } {
    return {
      data: [
        { mal_id: 1, name: 'Action' }, { mal_id: 2, name: 'Adventure' }, { mal_id: 4, name: 'Comedy' },
        { mal_id: 8, name: 'Drama' }, { mal_id: 10, name: 'Fantasy' }, { mal_id: 14, name: 'Horror' },
        { mal_id: 7, name: 'Mystery' }, { mal_id: 22, name: 'Romance' }, { mal_id: 24, name: 'Sci-Fi' },
        { mal_id: 36, name: 'Slice of Life' }, { mal_id: 30, name: 'Sports' }, { mal_id: 37, name: 'Supernatural' },
        { mal_id: 41, name: 'Thriller' }, { mal_id: 62, name: 'Isekai' }, { mal_id: 63, name: 'Magical Girl' },
        { mal_id: 17, name: 'Mecha' }, { mal_id: 18, name: 'Music' }, { mal_id: 38, name: 'Military' },
        { mal_id: 23, name: 'School' }, { mal_id: 29, name: 'Space' },
      ],
    };
  }

  async getAnimeByGenres(genreIds: number[], page = 1): Promise<{ data: NormalisedAnime[]; pagination: any }> {
    const perPage = 20;
    const collected: NormalisedAnime[] = [];
    let apiPage = 1;
    let hasMore = true;
    const skip = (page - 1) * perPage;
    let skipped = 0;

    while (collected.length < perPage && hasMore && apiPage <= 20) {
      const offset = (apiPage - 1) * 100;
      const raw = await this.get('/anime/ranking', { ranking_type: 'bypopularity', limit: 100, offset, fields: LIST_FIELDS, nsfw: 'false' });
      hasMore = !!raw.paging?.next;
      apiPage++;

      for (const n of raw.data ?? []) {
        const anime = await this.normalise(n.node);
        const animeGenreIds = anime.genres.map((g) => g.mal_id);
        if (genreIds.some((g) => !animeGenreIds.includes(g))) continue;
        if (skipped < skip) { skipped++; continue; }
        collected.push(anime);
        if (collected.length >= perPage) break;
      }
    }
    return { data: collected, pagination: { last_visible_page: collected.length === perPage ? page + 1 : page } };
  }

  async getAnimeByGenre(genreId: number, page = 1) {
    return this.getAnimeByGenres([genreId], page);
  }

  async getSchedule(day = ''): Promise<{ data: NormalisedAnime[] }> {
    const year = new Date().getUTCFullYear();
    const season = this.currentSeason();
    let all: NormalisedAnime[] = [];
    for (let page = 1; page <= 3; page++) {
      const offset = (page - 1) * 50;
      const raw = await this.get(`/anime/season/${year}/${season}`, { limit: 50, offset, fields: LIST_FIELDS, sort: 'anime_score', nsfw: 'false' });
      const batch = await Promise.all((raw.data ?? []).map((n: any) => this.normalise(n.node)));
      all = all.concat(batch);
      if (!raw.paging?.next) break;
    }
    if (day !== '') {
      all = all.filter((a) => (a.broadcast.day ?? '').toLowerCase() === day.toLowerCase());
    }
    all.sort((a, b) => (a.broadcast.time ?? '99:99').localeCompare(b.broadcast.time ?? '99:99'));
    return { data: all };
  }
}

// Reshapes AniVault-Scraper's /api/mal/anime/{id}/episodes response into
// the same { data: [...], pagination: { last_visible_page, has_next_page } }
// shape Jikan returned, so every existing caller (episode-air.ts,
// watch.ts, anime-tail.ts's server-rendered path) needs zero changes.
function mapScraperEpisodes(raw: any): any {
  const data = (raw?.data ?? []).map((ep: any) => ({
    mal_id: ep.malId,
    url: ep.url,
    title: ep.title,
    title_japanese: ep.titleJapanese,
    aired: ep.aired,
    filler: !!ep.filler,
    recap: !!ep.recap,
  }));
  return {
    data,
    pagination: {
      last_visible_page: raw?.pagination?.currentPage ?? 1,
      has_next_page: !!raw?.pagination?.hasNextPage,
    },
  };
}

// Same idea for /api/mal/anime/{id}/characters -> Jikan's
// { data: [{ character, role, voice_actors }] } shape.
function mapScraperCharacters(raw: any): any {
  const data = (raw?.data ?? []).map((ch: any) => ({
    character: {
      mal_id: ch.characterId,
      url: ch.url,
      images: { jpg: { image_url: ch.image } },
      name: ch.name,
    },
    role: ch.role,
    voice_actors: (ch.voiceActors ?? []).map((va: any) => ({
      person: {
        mal_id: va.peopleId,
        url: va.url,
        images: { jpg: { image_url: va.image } },
        name: va.name,
      },
      language: va.language,
    })),
  }));
  return { data };
}

// Reshapes /api/mal/character/{id} into the 3-piece shape getCharacterFull
// returns, each piece matching what its old separate Jikan call returned
// ({ data: {...} } for the bio, { data: [...] } for the other two) so
// character.ts's existing field access (char.name_kanji, entry.role, etc.)
// needed no changes.
function mapScraperCharacterFull(raw: any): { character: any; animeography: any; voices: any } {
  const character = {
    data: {
      mal_id: raw.characterId,
      name: raw.name,
      name_kanji: raw.nameKanji,
      nicknames: raw.nicknames ?? [],
      about: raw.about,
      note: raw.note ?? null,
      spoilers: raw.spoilers ?? [],
      favorites: raw.favorites,
      images: { jpg: { image_url: raw.image } },
    },
  };

  const animeography = {
    data: (raw.animeography ?? []).map((a: any) => ({
      anime: {
        mal_id: a.animeId,
        title: a.title,
        images: { jpg: { image_url: a.image } },
      },
      role: a.role,
    })),
  };

  const voices = {
    data: (raw.voiceActors ?? []).map((va: any) => ({
      person: {
        mal_id: va.peopleId,
        name: va.name,
        url: va.url,
        images: { jpg: { image_url: va.image } },
      },
      language: va.language,
    })),
  };

  return { character, animeography, voices };
}

function mapStatus(s: string): string {
  switch (s) {
    case 'currently_airing': return 'Currently Airing';
    case 'finished_airing': return 'Finished Airing';
    case 'not_yet_aired': return 'Not yet aired';
    default: return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

async function sha1(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// AniList descriptions come back with light HTML markup (<br>, <i>, etc.)
// and literal escaped entities — strip both down to plain text.
function stripAniListHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
