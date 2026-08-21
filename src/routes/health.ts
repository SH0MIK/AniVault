// Health/status surface for status.anivault.co to poll. Every check here is
// read-only and deliberately avoids the MalAPI/season code path that took
// the whole site down when the KV daily put() quota was hit (see incident:
// "Something went wrong" on GET / while KV writes were failing) — a status
// check must never itself contribute to that kind of outage.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { SCANNER_LAST_RUN_KV_KEY } from './admin/episode-scanner';

export const healthRoutes = new Hono<{ Bindings: Env }>();

const DUB_REFRESH_KV_KEY = 'dub_status_last_refresh';
const DUB_REFRESH_INTERVAL_MS = 20 * 60 * 60 * 1000; // ~daily, see scheduled.ts
const SCANNER_INTERVAL_MS = 60 * 60 * 1000; // hourly cron
const SCANNER_SLACK_MS = 30 * 60 * 1000; // allow for a missed/late tick
const SEASON_CACHE_KEY = 'anilist_season_now';
const SEASON_CACHE_SLACK_MS = 24 * 60 * 60 * 1000; // generous fallback TTL, see mal-api.ts

interface CheckResult {
  ok: boolean;
  label: string;
  detail: string;
  ms?: number;
  badges?: { label: string; value: string }[];
  // Critical checks failing mean AniVault itself is down (red/"Outages").
  // Non-critical checks failing (background jobs, external APIs) degrade
  // the experience but don't mean the site is down (amber/"Degraded").
  critical: boolean;
}

function relativeTime(ms: number | null): string {
  if (ms === null) return 'never';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

async function checkDatabase(env: Env): Promise<CheckResult> {
  const start = Date.now();
  try {
    const db = new Db(env.DB);
    await db.fetchOne('SELECT 1 as ok');
    return { ok: true, label: 'Database', detail: 'D1 is accepting queries.', ms: Date.now() - start, critical: true };
  } catch (err: any) {
    return { ok: false, label: 'Database', detail: String(err?.message ?? err), ms: Date.now() - start, critical: true };
  }
}

async function checkCache(env: Env): Promise<CheckResult> {
  const start = Date.now();
  try {
    // Read-only — never a put(), so this can never itself contribute to the
    // daily KV write quota being exhausted.
    await env.API_CACHE.get('healthz_probe');
    return { ok: true, label: 'Cache', detail: 'KV is reachable for reads.', ms: Date.now() - start, critical: true };
  } catch (err: any) {
    return { ok: false, label: 'Cache', detail: String(err?.message ?? err), ms: Date.now() - start, critical: true };
  }
}

async function checkEpisodeScanner(env: Env, db: Db): Promise<CheckResult> {
  try {
    const lastRunRaw = await env.API_CACHE.get(SCANNER_LAST_RUN_KV_KEY);
    const lastRunMs = lastRunRaw ? Number(lastRunRaw) : null;
    const alive = lastRunMs !== null && Date.now() - lastRunMs < SCANNER_INTERVAL_MS + SCANNER_SLACK_MS;
    const tracked = await db.count('SELECT COUNT(*) as cnt FROM episode_air_cache');
    return {
      ok: alive,
      label: 'Episode Scanner',
      detail: alive ? 'Automatic episode sync is running on schedule.' : 'No scan recorded in the expected window.',
      badges: [
        { label: 'Last run', value: relativeTime(lastRunMs) },
        { label: 'Tracked titles', value: String(tracked) },
      ],
      critical: false,
    };
  } catch (err: any) {
    return { ok: false, label: 'Episode Scanner', detail: String(err?.message ?? err), critical: false };
  }
}

async function checkDubRefresh(env: Env): Promise<CheckResult> {
  try {
    const lastRaw = await env.API_CACHE.get(DUB_REFRESH_KV_KEY);
    const lastMs = lastRaw ? Number(lastRaw) : null;
    const alive = lastMs !== null && Date.now() - lastMs < DUB_REFRESH_INTERVAL_MS + SCANNER_SLACK_MS;
    return {
      ok: alive,
      label: 'Dub Status Refresh',
      detail: alive ? 'Dub availability data is refreshed on schedule.' : 'Dub refresh is overdue.',
      badges: [{ label: 'Last refresh', value: relativeTime(lastMs) }],
      critical: false,
    };
  } catch (err: any) {
    return { ok: false, label: 'Dub Status Refresh', detail: String(err?.message ?? err), critical: false };
  }
}

async function checkAniListSeasonCache(env: Env): Promise<CheckResult> {
  try {
    const cached = await env.API_CACHE.get(SEASON_CACHE_KEY);
    if (!cached) {
      return { ok: false, label: 'AniList Season Cache', detail: 'No cached season data found.', critical: false };
    }
    // The cached payload doesn't carry its own write timestamp, so this is a
    // presence check rather than a freshness check.
    return {
      ok: true,
      label: 'AniList Season Cache',
      detail: 'Populated by a GitHub Actions relay — AniList blocks Cloudflare Workers\u2019 IPs directly, so this isn\u2019t probed live.',
      badges: [{ label: 'Cache', value: 'present' }],
      critical: false,
    };
  } catch (err: any) {
    return { ok: false, label: 'AniList Season Cache', detail: String(err?.message ?? err), critical: false };
  }
}

async function probeExternal(url: string, init?: RequestInit): Promise<{ ok: boolean; ms: number; detail: string }> {
  const start = Date.now();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(t);
    return { ok: res.ok, ms: Date.now() - start, detail: res.ok ? 'Responding normally.' : `Responded with HTTP ${res.status}.` };
  } catch (err: any) {
    clearTimeout(t);
    const reason = err?.name === 'AbortError' ? 'Timed out.' : String(err?.message ?? err);
    return { ok: false, ms: Date.now() - start, detail: reason };
  }
}

healthRoutes.get('/healthz', async (c) => {
  const env = c.env;
  const db = new Db(env.DB);

  const [database, cache, episodeScanner, dubRefresh, seasonCache] = await Promise.all([
    checkDatabase(env),
    checkCache(env),
    checkEpisodeScanner(env, db),
    checkDubRefresh(env),
    checkAniListSeasonCache(env),
  ]);

  const externalChecks: Record<string, { ok: boolean; label: string; configured: boolean; critical: boolean; ms?: number; detail: string }> = {};

  const jikan = await probeExternal('https://api.jikan.moe/v4/anime/1');
  externalChecks.jikan = { ...jikan, label: 'Jikan API', configured: true, critical: false };

  if (env.MAL_CLIENT_ID) {
    const mal = await probeExternal('https://api.myanimelist.net/v2/anime/1?fields=id', {
      headers: { 'X-MAL-CLIENT-ID': env.MAL_CLIENT_ID },
    });
    externalChecks.mal = { ...mal, label: 'MyAnimeList API', configured: true, critical: false };
  } else {
    externalChecks.mal = { ok: true, label: 'MyAnimeList API', configured: false, critical: false, detail: 'Not configured on this environment.' };
  }

  if (env.TMDB_API_KEY) {
    const tmdb = await probeExternal(`https://api.themoviedb.org/3/configuration?api_key=${env.TMDB_API_KEY}`);
    externalChecks.tmdb = { ...tmdb, label: 'TMDB API', configured: true, critical: false };
  } else {
    externalChecks.tmdb = { ok: true, label: 'TMDB API', configured: false, critical: false, detail: 'Not configured on this environment.' };
  }

  const checks = { database, cache, episodeScanner, dubRefresh, seasonCache };
  const criticalOk = database.ok && cache.ok;
  const anyDegraded =
    !episodeScanner.ok ||
    !dubRefresh.ok ||
    !seasonCache.ok ||
    Object.values(externalChecks).some((e) => e.configured && !e.ok);

  const status = !criticalOk ? 'down' : anyDegraded ? 'degraded' : 'ok';

  return c.json(
    { status, checks, external: externalChecks, timestamp: new Date().toISOString() },
    !criticalOk ? 503 : 200
  );
});
