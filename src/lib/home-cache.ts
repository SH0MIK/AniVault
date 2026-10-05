import { Db } from './db';
import { MalAPI, NormalisedAnime } from './mal-api';

export const HOME_CACHE_KEYS = ['trending', 'popular', 'upcoming'] as const;
export type HomeCacheKey = typeof HOME_CACHE_KEYS[number];

export interface HomepageSnapshot {
  trending: NormalisedAnime[];
  popular: NormalisedAnime[];
  upcoming: NormalisedAnime[];
  updatedAt: number;
}

const DEFAULT_REFRESH_MINUTES = 360;

export async function getHomepageRefreshMinutes(db: Db): Promise<number> {
  try {
    const row = await db.fetchOne<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'homepage_cache_refresh_minutes'"
    );
    const value = Number(row?.value ?? DEFAULT_REFRESH_MINUTES);
    return Number.isFinite(value) && value >= 60
      ? Math.min(value, 30 * 24 * 60)
      : DEFAULT_REFRESH_MINUTES;
  } catch {
    return DEFAULT_REFRESH_MINUTES;
  }
}

export async function getHomepageSnapshot(db: Db): Promise<HomepageSnapshot | null> {
  try {
    const rows = await db.fetchAll<{ cache_key: HomeCacheKey; payload: string; updated_at: number }>(
      'SELECT cache_key, payload, updated_at FROM homepage_cache WHERE cache_key IN (?, ?, ?)',
      ['trending', 'popular', 'upcoming']
    );
    if (rows.length !== 3) return null;

    const byKey = new Map(rows.map((r) => [r.cache_key, r]));
    const parse = (key: HomeCacheKey): NormalisedAnime[] => {
      try {
        const value = JSON.parse(byKey.get(key)!.payload);
        return Array.isArray(value) ? value : [];
      } catch {
        return [];
      }
    };

    const updatedAt = Math.min(...rows.map((r) => Number(r.updated_at) || 0));
    return {
      trending: parse('trending'),
      popular: parse('popular'),
      upcoming: parse('upcoming'),
      updatedAt,
    };
  } catch {
    return null;
  }
}

export async function refreshHomepageSnapshot(db: Db, mal: MalAPI): Promise<HomepageSnapshot | null> {
  const [trending, popular, upcoming] = await Promise.all([
    mal.getAniListSeasonNow(),
    mal.getTopAnime('bypopularity', 1),
    mal.getSeasonUpcoming(),
  ]);

  const lists = {
    trending: (trending.data ?? []).slice(0, 12),
    popular: (popular.data ?? []).slice(0, 12),
    upcoming: (upcoming.data ?? []).slice(0, 8),
  };

  const ids = [...new Set([
    ...lists.trending.map((a) => a.mal_id),
    ...lists.popular.map((a) => a.mal_id),
    ...lists.upcoming.map((a) => a.mal_id),
  ].filter(Boolean))];

  const artEntries = await Promise.all(ids.map(async (id) => ({
    id,
    art: await mal.getScraperArt(id, true).catch(() => ({ poster: '', cover: '', logo: '' })),
  })));
  const artById = new Map(artEntries.map((x) => [x.id, x.art]));

  for (const list of Object.values(lists)) {
    for (const anime of list) {
      const art = artById.get(anime.mal_id);
      if (!art) continue;
      if (art.poster) anime.images = { jpg: { image_url: art.poster, large_image_url: art.poster } };
      if (art.cover) anime.cover_image = art.cover;
      if (art.logo) anime.logo_image = art.logo;
    }
  }

  const updatedAt = Math.floor(Date.now() / 1000);
  const statements = HOME_CACHE_KEYS.map((key) =>
    db.prepare(
      'INSERT INTO homepage_cache (cache_key, payload, updated_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at'
    ).bind(key, JSON.stringify(lists[key]), updatedAt)
  );
  await db.batch(statements);

  return { ...lists, updatedAt };
}

export async function refreshHomepageSnapshotIfDue(db: Db, mal: MalAPI): Promise<HomepageSnapshot | null> {
  const existing = await getHomepageSnapshot(db);
  const interval = await getHomepageRefreshMinutes(db);
  if (existing && Date.now() / 1000 - existing.updatedAt < interval * 60) return existing;
  return refreshHomepageSnapshot(db, mal);
}
