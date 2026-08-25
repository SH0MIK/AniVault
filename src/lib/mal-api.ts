// Full port of includes/api.php's MalAPI class (aliased as JikanAPI in the old
// codebase). Talks to the official MyAnimeList v2 API for most endpoints and
// falls back to the public Jikan API for characters/episodes/streaming, which
// MAL v2 doesn't expose -- exactly like the PHP version. File-based caching
// (CACHE_DIR/mal_*.json) is replaced with Workers KV.
import { Db } from './db';
import { Settings } from './settings';

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
  // Resolved via getAnimeArt() (see below) -- the scraper's /api/anime
  // poster/cover/logo, blended with your admin-saved overrides per the
  // Image Source Priority setting. Populated for every MAL/Jikan-sourced
  // entry (i.e. everywhere except the AniList season path above).
  cover_image?: string;
  logo_image?: string;
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

  // Called by the scheduled cron handler — always hits AniList live (via
  // our own scraper, see fetchAniListSeasonLive) and overwrites the cache
  // key that getAniListSeasonNow() reads. Returns true on a successful
  // refresh. Now callable directly from this Worker's own cron (see
  // scheduled.ts) since routing through the scraper sidesteps AniList's
  // block on Cloudflare Workers IPs — no external relay needed.
  async refreshAniListSeasonCache(): Promise<boolean> {
    const data = await this.fetchAniListSeasonLive();
    if (!data || data.length === 0) return false;
    if (this.kv && this.cacheEnabled()) {
      await this.safeKvPut(this.seasonCacheKey(), JSON.stringify({ data }), { expirationTtl: 7200 });
    }
    return true;
  }

  private seasonCacheKey(): string {
    const now = new Date();
    const month = now.getUTCMonth() + 1; // 1-12
    const seasonYear = now.getUTCFullYear();
    const season = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL';
    return `anilist_season_${season}_${seasonYear}`;
  }

  private async fetchAniListSeasonLive(): Promise<NormalisedAnime[] | null> {
    // Routed through our own scraper (Railway) instead of calling
    // graphql.anilist.co directly -- AniList blocks Cloudflare Workers'
    // IP ranges outright, but Railway isn't a Workers IP and this is just
    // an ordinary HTTPS call to our own backend, same "scraperGet" path
    // every other MalAPI method already uses. See scraper's
    // src/scrapers/anilist.ts for the actual AniList call.
    const fromScraper = await this.scraperGet('/api/anilist/season');
    if (!fromScraper?.media) {
      console.error('[anilist] scraper API returned nothing for /anilist/season');
      return null;
    }

    const media: any[] = fromScraper.media;
    console.log(`[anilist] fetched ${media.length} media for ${fromScraper.season} ${fromScraper.seasonYear} (via scraper)`);

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

  // ── Image Source Priority (admin/anime_images.php) ───────────────────────
  // One global setting: whether the scraper's live API art (poster/cover/
  // logo, resolved via its own TMDB -> Kitsu -> AniList chain) or your
  // admin-saved art wins when both exist for a title. The loser still acts
  // as a fallback either way -- this only controls which one is *preferred*,
  // for comparing load speed between the two sources.
  async getImagePriority(): Promise<'api' | 'saved'> {
    const settings = new Settings(this.db);
    const val = await settings.get('image_source_priority', 'saved');
    return val === 'api' ? 'api' : 'saved';
  }

  // Calls our own scraper's combined GET /api/anime?malId=X endpoint (see
  // AniVault-Scraper's src/routes.ts), which resolves poster, cover
  // (backdrop), and logo art itself via TMDB -> Kitsu -> AniList, each tier
  // independently. This replaces every direct MAL main_picture / TMDB call
  // this file used to make -- the scraper is now the single source of live
  // (non-admin-saved) art for the whole site.
  // Always requests the scraper's full-size art, deliberately NOT its
  // ?list=1 (smaller) variant -- that variant turned out to resolve
  // inconsistently (empty for some titles that resolve fine without it),
  // which showed up as the same anime having different art on a grid card
  // vs. its own detail page. One size, one cache key, used everywhere, so
  // every page always agrees. A result with at least one non-empty field is
  // cached for a week, since this art essentially never changes. A
  // fully-empty result (scraper timeout/error, or a title it genuinely has
  // no art for) is only cached for 5 minutes -- long enough to absorb a
  // burst of page loads, short enough that a transient failure (e.g. the
  // scraper's host cold-starting) heals itself on its own instead of
  // getting stuck showing no art for a week.
  async getScraperArt(malId: number): Promise<{ poster: string; cover: string; logo: string }> {
    const empty = { poster: '', cover: '', logo: '' };
    if (!malId) return empty;

    const cacheKey = `scraper_art_${malId}_full`;
    if (this.kv && this.cacheEnabled()) {
      const cached = await this.kv.get(cacheKey, 'json') as typeof empty | null;
      if (cached) return cached;
    }

    const fromScraper = await this.scraperGet(`/api/anime?malId=${malId}`, 10000);
    const d = fromScraper?.data;
    const art = { poster: d?.poster || '', cover: d?.cover || '', logo: d?.logo || '' };
    const hasAnyArt = !!(art.poster || art.cover || art.logo);

    if (this.kv && this.cacheEnabled()) {
      await this.safeKvPut(cacheKey, JSON.stringify(art), { expirationTtl: hasAnyArt ? 604800 : 300 });
    }
    return art;
  }

  // Deletes the cached scraper art for a title, so the next page load
  // re-fetches from the scraper instead of serving a stale/empty cached
  // result. Also clears the old (now-unused) ?list=1 cache key from before
  // that variant was dropped, so a stale entry there can't linger and
  // confuse things. Exposed on admin/anime_images.php as a manual
  // "Refresh Art Cache" action for exactly that kind of stuck entry.
  async clearScraperArtCache(malId: number): Promise<void> {
    if (!malId || !this.kv) return;
    await Promise.all([
      this.kv.delete(`scraper_art_${malId}_list`).catch(() => {}),
      this.kv.delete(`scraper_art_${malId}_full`).catch(() => {}),
    ]);
  }

  // The single choke point every poster/cover/logo on the site should go
  // through. Merges the scraper's live art with your admin-saved overrides
  // (anime_images for poster, anime_banners/home_hero_banners for cover,
  // anime_logos/home_hero_banners for logo), ordered by whichever source
  // getImagePriority() says should be tried first -- the other one is still
  // used as a fallback if the preferred source came back empty for that
  // piece. Silently returns empty strings on failure since art is always a
  // visual enhancement, never something that should break a page.
  async getAnimeArt(animeId: number): Promise<{ poster: string; cover: string; logo: string }> {
    const empty = { poster: '', cover: '', logo: '' };
    if (!animeId) return empty;

    const [priority, scraperArt, savedPoster, savedBanner, savedLogo] = await Promise.all([
      this.getImagePriority(),
      this.getScraperArt(animeId),
      this.getLocalAnimeImage(animeId),
      this.getLocalAnimeBannerInfo(animeId),
      this.getLocalAnimeLogo(animeId),
    ]);
    const savedCover = savedBanner?.image_url || '';

    const pick = (api: string, saved: string) => (priority === 'api' ? (api || saved) : (saved || api));

    return {
      poster: pick(scraperArt.poster, savedPoster),
      cover: pick(scraperArt.cover, savedCover),
      logo: pick(scraperArt.logo, savedLogo),
    };
  }

  private async normalise(node: any): Promise<NormalisedAnime> {
    const animeId = Number(node.id ?? 0);
    const art = animeId ? await this.getAnimeArt(animeId) : { poster: '', cover: '', logo: '' };
    const mediumImage = art.poster;
    const largeImage = art.poster;


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
      cover_image: art.cover,
      logo_image: art.logo,
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
        // Check genres straight off the raw node before normalising --
        // normalise() now resolves art via the scraper API, which isn't
        // worth paying for on the ~80% of each 100-item page that gets
        // discarded by the genre filter below.
        const nodeGenreIds = (n.node?.genres ?? []).map((g: any) => g?.id ?? -1);
        if (genreIds.some((g) => !nodeGenreIds.includes(g))) continue;
        if (skipped < skip) { skipped++; continue; }
        const anime = await this.normalise(n.node);
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
