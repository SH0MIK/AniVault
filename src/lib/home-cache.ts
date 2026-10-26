import { Db } from './db';

export const HOME_CACHE_KEYS = ['trending', 'popular', 'upcoming'] as const;
export type HomeCacheKey = typeof HOME_CACHE_KEYS[number];

export interface HomepageSnapshot {
  trending: any[];
  popular: any[];
  upcoming: any[];
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

/**
 * Legacy MAL/AniList homepage snapshots are intentionally not read during the
 * Hoshika-only migration. We leave existing D1 rows untouched because this
 * database may be shared with production; they are simply not trusted as
 * current catalogue data.
 */
export async function getHomepageSnapshot(_db: Db): Promise<HomepageSnapshot | null> {
  return null;
}

/**
 * Hoshika's confirmed public API does not currently expose popularity,
 * seasonal, or upcoming listing endpoints. Do not fetch MAL/AniList or write
 * fabricated/empty snapshots. Return null until a supported listing feed is
 * available.
 */
export async function refreshHomepageSnapshot(_db: Db, _legacyCatalog?: unknown): Promise<HomepageSnapshot | null> {
  return null;
}

export async function refreshHomepageSnapshotIfDue(db: Db, _legacyCatalog?: unknown): Promise<HomepageSnapshot | null> {
  await getHomepageRefreshMinutes(db);
  return null;
}
