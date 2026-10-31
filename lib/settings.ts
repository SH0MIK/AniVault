// Ports includes/settings.php. The file-based API cache (CACHE_DIR glob of
// mal_*.json / jikan_*.json) doesn't exist on Workers -- that's replaced by
// Workers KV in mal-api.ts, so the cache-file-management methods
// (getApiCacheFiles/clearApiCacheFiles/getCacheStats) move there instead.
import { Db } from './db';

export interface BannerData {
  bannerEnabled: boolean;
  bannerMessage: string;
  bannerType: 'info' | 'success' | 'warning' | 'error';
}

/** Fetches the sitewide banner settings configured via admin/banner.php,
 * for use in every public-facing renderHeader() call. */
export async function getBannerData(db: Db): Promise<BannerData> {
  const settings = new Settings(db);
  const enabled = (await settings.get('banner_enabled', '0')) === '1';
  const message = (await settings.get('banner_message', '')) ?? '';
  const rawType = (await settings.get('banner_type', 'info')) ?? 'info';
  const type = (['info', 'success', 'warning', 'error'].includes(rawType) ? rawType : 'info') as BannerData['bannerType'];
  return { bannerEnabled: enabled && !!message, bannerMessage: message, bannerType: type };
}

// Module-level (not per-instance) cache, shared by every `new Settings(db)`
// created within the same Worker isolate. Call sites like getBannerData()
// and getImagePriority() each construct a fresh Settings instance per call
// (there's no per-request context to hang a shared one off), which used to
// mean a fresh, uncached `SELECT * FROM settings` every single time -- this
// was ~13-18k reads/day of the whole table just for banner + image-priority
// lookups. Since Workers isolates are reused across many requests, caching
// at module scope with a short TTL turns that into roughly one query per
// TTL window per isolate, while `set()` still updates it immediately so a
// change made in the admin panel doesn't wait out the TTL to take effect.
const SETTINGS_CACHE_TTL_MS = 30_000;
let moduleCache: Map<string, string> | null = null;
let moduleCacheLoadedAt = 0;

export class Settings {
  constructor(private db: Db) {}

  async load(): Promise<void> {
    if (moduleCache && Date.now() - moduleCacheLoadedAt < SETTINGS_CACHE_TTL_MS) return;
    try {
      const rows = await this.db.fetchAll<{ key: string; value: string }>('SELECT `key`, `value` FROM settings');
      const fresh = new Map<string, string>();
      for (const row of rows) fresh.set(row.key, row.value);
      moduleCache = fresh;
      moduleCacheLoadedAt = Date.now();
    } catch {
      // table may not exist yet -- keep whatever (possibly empty) cache we had
      moduleCache = moduleCache ?? new Map();
      moduleCacheLoadedAt = Date.now();
    }
  }

  async get(key: string, defaultValue: string | null = null): Promise<string | null> {
    await this.load();
    return moduleCache!.has(key) ? moduleCache!.get(key)! : defaultValue;
  }

  async set(key: string, value: string): Promise<void> {
    await this.db.query(
      "INSERT INTO settings (`key`, `value`) VALUES (?,?) ON CONFLICT(`key`) DO UPDATE SET `value`=excluded.value",
      [key, value]
    );
    if (!moduleCache) moduleCache = new Map();
    moduleCache.set(key, value);
  }

  async isApiCacheEnabled(apiCacheEnabledFlag: boolean): Promise<boolean> {
    await this.load();
    return apiCacheEnabledFlag && (await this.get('api_cache_disabled', '1')) !== '1';
  }
}
