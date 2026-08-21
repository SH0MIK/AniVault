// Lightweight health probe for status.anivault.co to poll. Deliberately does
// NOT touch MalAPI/season code — that's the exact path that took the whole
// site down when the KV daily put() quota was hit (see incident: "Something
// went wrong" on GET / while KV writes were failing). This route only does
// cheap, read-only checks so it stays up even when other subsystems are
// degraded, and it never returns a non-200 for a downstream API problem —
// only for AniVault's own DB/KV being unreachable.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';

export const healthRoutes = new Hono<{ Bindings: Env }>();

healthRoutes.get('/healthz', async (c) => {
  const checks: Record<string, { ok: boolean; error?: string }> = {};

  try {
    const db = new Db(c.env.DB);
    await db.fetchOne('SELECT 1 as ok');
    checks.db = { ok: true };
  } catch (err: any) {
    checks.db = { ok: false, error: String(err?.message ?? err) };
  }

  try {
    // Read-only probe — never a put(), so this can never itself contribute
    // to the daily KV write quota being exhausted.
    await c.env.API_CACHE.get('healthz_probe');
    checks.kv = { ok: true };
  } catch (err: any) {
    checks.kv = { ok: false, error: String(err?.message ?? err) };
  }

  const allOk = Object.values(checks).every((v) => v.ok);
  return c.json(
    { status: allOk ? 'ok' : 'degraded', checks, timestamp: new Date().toISOString() },
    allOk ? 200 : 503
  );
});
