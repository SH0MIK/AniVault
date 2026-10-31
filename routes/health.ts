// Health/status surface for status.anivault.co to poll. Every check here is
// read-only and deliberately avoids the MalAPI/season code path that took
// the whole site down when the KV daily put() quota was hit (see incident:
// "Something went wrong" on GET / while KV writes were failing) — a status
// check must never itself contribute to that kind of outage.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';

export const healthRoutes = new Hono<{ Bindings: Env }>();


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

  const [database, cache] = await Promise.all([
    checkDatabase(env),
    checkCache(env),
  ]);

  const externalChecks: Record<string, { ok: boolean; label: string; configured: boolean; critical: boolean; ms?: number; detail: string }> = {};

  // Hoshika is the only anime catalog source in the migration branch.
  const hoshika = await probeExternal('https://hoshika.app/api/v1/search?q=Naruto&limit=1', {
    headers: { Accept: 'application/json', ...(env.HOSHIKA_API_KEY ? { 'X-Hoshika-Key': env.HOSHIKA_API_KEY } : {}) },
  });
  externalChecks.hoshika = { ...hoshika, label: 'Hoshika API', configured: true, critical: false };


  if (env.TMDB_API_KEY) {
    const tmdb = await probeExternal(`https://api.themoviedb.org/3/configuration?api_key=${env.TMDB_API_KEY}`);
    externalChecks.tmdb = { ...tmdb, label: 'TMDB API', configured: true, critical: false };
  } else {
    externalChecks.tmdb = { ok: true, label: 'TMDB API', configured: false, critical: false, detail: 'Not configured on this environment.' };
  }

  const checks = { database, cache };
  const criticalOk = database.ok && cache.ok;
  const anyDegraded = Object.values(externalChecks).some((e) => e.configured && !e.ok);

  const status = !criticalOk ? 'down' : anyDegraded ? 'degraded' : 'ok';

  return c.json(
    { status, checks, external: externalChecks, timestamp: new Date().toISOString() },
    !criticalOk ? 503 : 200
  );
});
