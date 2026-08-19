import type { Env } from './index';
import { Db } from './lib/db';
import { MalAPI } from './lib/mal-api';
import { EpisodeAir } from './lib/episode-air';
import { DubStatus } from './lib/dub-status';
import { Settings } from './lib/settings';
import { SCANNER_LAST_RUN_KV_KEY } from './routes/admin/episode-scanner';

const DUB_REFRESH_KV_KEY = 'dub_status_last_refresh';
const DUB_REFRESH_INTERVAL_MS = 20 * 60 * 60 * 1000; // ~daily, with slack

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
// Note: this does NOT handle the AniList season cache — that's relayed
// through GitHub Actions instead (.github/workflows/anilist-cache.yml)
// because graphql.anilist.co blocks Cloudflare Workers' IP ranges. Both
// Jikan and raw.githubusercontent.com (used here) are unaffected by that.
export async function handleScheduled(env: Env, cron?: string): Promise<void> {
  const db = new Db(env.DB);
  const mal = new MalAPI(env, env.API_CACHE, db);

  const lastRefreshRaw = await env.API_CACHE.get(DUB_REFRESH_KV_KEY);
  const lastRefresh = lastRefreshRaw ? parseInt(lastRefreshRaw, 10) : 0;
  const dubRefreshDue = !lastRefresh || (Date.now() - lastRefresh) > DUB_REFRESH_INTERVAL_MS;

  if (dubRefreshDue) {
    const results = await DubStatus.refresh(db);
    console.log('[scheduled] dub_status refresh (cron=' + (cron ?? 'n/a') + '): ' + results.map((r) => `${r.lang}=${r.ok ? r.count : 'FAILED'}`).join(', '));
    await env.API_CACHE.put(DUB_REFRESH_KV_KEY, String(Date.now()));
  }

  const refreshed = await EpisodeAir.refreshStale(db, env, mal, 20);
  console.log(`[scheduled] episode_air_cache (cron=${cron ?? 'n/a'}): refreshed ${refreshed} stale entr${refreshed === 1 ? 'y' : 'ies'}`);

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
      await env.API_CACHE.put(SCANNER_LAST_RUN_KV_KEY, String(Date.now()));
    }
  }
}
