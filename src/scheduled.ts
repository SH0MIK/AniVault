import type { Env } from './index';
import { Db } from './lib/db';
import { MalAPI } from './lib/mal-api';
import { EpisodeAir } from './lib/episode-air';
import { DubStatus } from './lib/dub-status';
import { Settings } from './lib/settings';
import { SCANNER_LAST_RUN_KV_KEY } from './routes/admin/episode-scanner';

const DUB_REFRESH_KV_KEY = 'dub_status_last_refresh';
const DUB_REFRESH_INTERVAL_MS = 20 * 60 * 60 * 1000; // ~daily, with slack

const ANILIST_SEASON_REFRESH_KV_KEY = 'anilist_season_last_refresh';
const ANILIST_SEASON_REFRESH_INTERVAL_MS = 55 * 60 * 1000; // just under the season cache's own 2h KV TTL, with slack for a missed tick

const ART_CACHE_WARM_INTERVAL_MS = 20 * 60 * 1000; // every ~20 min
const ART_CACHE_WARM_BATCH = 15; // stays well inside a single invocation's subrequest budget alongside everything else in this file
const ART_CACHE_WARM_KV_KEY = 'art_cache_last_warm';

// Home/grid rows (top, upcoming, watch-now, curated hero banners) resolve
// art cache-only now (see isList/liveFetch in mal-api.ts) so a cold cache
// entry just shows blank instead of live-fetching from the scraper and
// risking the Worker's per-request subrequest limit (see the 500 this
// fixed — the whole home page went down after a cache-key rename cleared
// every art cache entry at once). This warms those same entries in the
// background instead, a small batch at a time, so blank posters fill in
// within a tick or two of a cache miss rather than staying blank forever.
async function warmArtCache(db: Db, mal: MalAPI, env: Env, limit: number): Promise<number> {
  const ids = new Set<number>();

  try {
    const [seasonal, top, upcoming] = await Promise.all([
      mal.getAniListSeasonNow(),
      mal.getTopAnime('bypopularity', 1),
      mal.getSeasonUpcoming(),
    ]);
    for (const a of (seasonal.data ?? []).slice(0, 12)) if (a.mal_id) ids.add(a.mal_id);
    for (const a of (top.data ?? []).slice(0, 12)) if (a.mal_id) ids.add(a.mal_id);
    for (const a of (upcoming.data ?? []).slice(0, 8)) if (a.mal_id) ids.add(a.mal_id);
  } catch (err: any) {
    console.warn('[scheduled] art cache warm: failed to gather seasonal/top/upcoming ids (continuing):', String(err?.message ?? err));
  }

  try {
    const rows = await db.fetchAll<{ anime_id: number }>(
      'SELECT DISTINCT anime_id FROM episode_videos WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 24'
    );
    for (const r of rows) ids.add(r.anime_id);
  } catch (err: any) {
    console.warn('[scheduled] art cache warm: failed to gather watch-now ids (continuing):', String(err?.message ?? err));
  }

  try {
    const rows = await db.fetchAll<{ anime_id: number }>('SELECT anime_id FROM home_hero_banners');
    for (const r of rows) ids.add(r.anime_id);
  } catch (err: any) {
    console.warn('[scheduled] art cache warm: failed to gather hero banner ids (continuing):', String(err?.message ?? err));
  }

  let warmed = 0;
  for (const id of ids) {
    if (warmed >= limit) break;
    const cached = await env.API_CACHE.get(`scraper_art_${id}`);
    if (cached) continue; // already warm -- doesn't count against the batch limit
    await mal.getScraperArt(id, true).catch(() => {});
    warmed++;
  }
  return warmed;
}

// Runs on Cloudflare Cron Triggers (see [triggers] in wrangler.toml) —
// hourly "0 * * * *" and daily "0 3 * * *" both point at this handler.
//
// Deliberately NOT dispatching on the exact event.cron string: Cloudflare's
// dashboard "Trigger Now" test button doesn't reliably echo back the
// schedule string, so an exact match can silently always take the "else"
// branch and the daily job never runs even though the trigger fires. Every
// tick instead checks "has it actually been ~a day since dub data was last
// refreshed?" via a KV timestamp, and does that refresh if so — self-healing
// regardless of which schedule fired or how it was invoked.
//
// AniList season/banner refreshes use the same "check a KV timestamp, refresh
// if due" shape. These used to be relayed through an external GitHub Action
// (.github/workflows/anilist-cache.yml) because graphql.anilist.co blocks
// Cloudflare Workers' IP ranges outright — but MalAPI's AniList calls now
// route through our own Railway scraper (an ordinary HTTPS call, unaffected
// by that block), so this Worker's own cron can do the refresh directly.
// The GitHub Action can be retired once this has run cleanly for a few days.
export async function handleScheduled(env: Env, cron?: string): Promise<void> {
  const db = new Db(env.DB);
  const mal = new MalAPI(env, env.API_CACHE, db);

  const lastRefreshRaw = await env.API_CACHE.get(DUB_REFRESH_KV_KEY);
  const lastRefresh = lastRefreshRaw ? parseInt(lastRefreshRaw, 10) : 0;
  const dubRefreshDue = !lastRefresh || (Date.now() - lastRefresh) > DUB_REFRESH_INTERVAL_MS;

  if (dubRefreshDue) {
    const results = await DubStatus.refresh(db);
    console.log('[scheduled] dub_status refresh (cron=' + (cron ?? 'n/a') + '): ' + results.map((r) => `${r.lang}=${r.ok ? r.count : 'FAILED'}`).join(', '));
    try {
      await env.API_CACHE.put(DUB_REFRESH_KV_KEY, String(Date.now()));
    } catch (err: any) {
      console.warn('[scheduled] failed to write dub refresh timestamp (continuing):', String(err?.message ?? err));
    }
  }

  const lastSeasonRefreshRaw = await env.API_CACHE.get(ANILIST_SEASON_REFRESH_KV_KEY);
  const lastSeasonRefresh = lastSeasonRefreshRaw ? parseInt(lastSeasonRefreshRaw, 10) : 0;
  const seasonRefreshDue = !lastSeasonRefresh || (Date.now() - lastSeasonRefresh) > ANILIST_SEASON_REFRESH_INTERVAL_MS;

  if (seasonRefreshDue) {
    const ok = await mal.refreshAniListSeasonCache();
    console.log(`[scheduled] anilist season refresh (cron=${cron ?? 'n/a'}): ${ok ? 'ok' : 'FAILED'}`);
    if (ok) {
      try {
        await env.API_CACHE.put(ANILIST_SEASON_REFRESH_KV_KEY, String(Date.now()));
      } catch (err: any) {
        console.warn('[scheduled] failed to write anilist season refresh timestamp (continuing):', String(err?.message ?? err));
      }
    }
  }

  const refreshed = await EpisodeAir.refreshStale(db, env, mal, 20);
  console.log(`[scheduled] episode_air_cache (cron=${cron ?? 'n/a'}): refreshed ${refreshed} stale entr${refreshed === 1 ? 'y' : 'ies'}`);

  const lastArtWarmRaw = await env.API_CACHE.get(ART_CACHE_WARM_KV_KEY);
  const lastArtWarm = lastArtWarmRaw ? parseInt(lastArtWarmRaw, 10) : 0;
  const artWarmDue = !lastArtWarm || (Date.now() - lastArtWarm) > ART_CACHE_WARM_INTERVAL_MS;

  if (artWarmDue) {
    const warmed = await warmArtCache(db, mal, env, ART_CACHE_WARM_BATCH);
    console.log(`[scheduled] art cache warm (cron=${cron ?? 'n/a'}): warmed ${warmed} entr${warmed === 1 ? 'y' : 'ies'}`);
    try {
      await env.API_CACHE.put(ART_CACHE_WARM_KV_KEY, String(Date.now()));
    } catch (err: any) {
      console.warn('[scheduled] failed to write art cache warm timestamp (continuing):', String(err?.message ?? err));
    }
  }

  // Currently-airing scanner — separate from the stale-cache sweep above.
  // That sweep just chases whatever's oldest (airing or not); this targets
  // the current season specifically, gated by the toggle/interval set on
  // admin/episode_scanner.php.
  const settings = new Settings(db);
  const scannerEnabled = (await settings.get('episode_scanner_auto_enabled', '1')) === '1';
  if (scannerEnabled) {
    const intervalMinutes = parseInt((await settings.get('episode_scanner_interval_minutes', '60')) ?? '60', 10) || 60;
    const lastRunRaw = await env.API_CACHE.get(SCANNER_LAST_RUN_KV_KEY);
    const lastRun = lastRunRaw ? parseInt(lastRunRaw, 10) : 0;
    const due = !lastRun || (Date.now() - lastRun) > intervalMinutes * 60 * 1000;
    if (due) {
      // Smaller batch than the manual scanner's 40 — Cron Triggers have their own duration
      // limits too, and since this reruns every `intervalMinutes`, a smaller batch each tick
      // still covers the whole candidate list over a few ticks without risking a mid-run kill.
      const result = await EpisodeAir.scanCurrentlyAiring(db, env, mal, 15);
      console.log(`[scheduled] episode scanner (cron=${cron ?? 'n/a'}): updated ${result.updated}/${result.scanned} (of ${result.candidates} candidates)`);
      try {
        await env.API_CACHE.put(SCANNER_LAST_RUN_KV_KEY, String(Date.now()));
      } catch (err: any) {
        console.warn('[scheduled] failed to write scanner last-run timestamp (continuing):', String(err?.message ?? err));
      }
    }
  }
}
