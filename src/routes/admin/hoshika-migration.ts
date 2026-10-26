import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { h } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';
import { linkVerifiedLegacyMalId } from '../../lib/anime-identity';

export const adminHoshikaMigrationRoutes = new Hono<{ Bindings: Env }>();

type IdMapItem = { sourceId?: number | string; shortId?: number | string; slug?: string };

adminHoshikaMigrationRoutes.on(['GET', 'POST'], '/admin/hoshika_migration.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx || !ctx.isOwner || ctx.impersonating) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating } = ctx;

  if (c.req.method === 'POST') {
    const body: any = await c.req.json().catch(() => ({}));
    try {
      if (body.action !== 'bulk_map') throw new Error('Unknown action.');

      if (!c.env.HOSHIKA_API_KEY) throw new Error('HOSHIKA_API_KEY is not configured.');

      // Gather distinct positive legacy IDs from existing user/catalog references.
      // Find pending IDs in one D1 query. Per-ID lookups can exceed Cloudflare's
      // D1 API-request limit when the catalog contains thousands of legacy IDs.
      const candidatesRows = await db.fetchAll<{ anime_id: number | string }>(`
        SELECT ids.anime_id
        FROM (
          SELECT anime_id FROM anime_list
          UNION SELECT anime_id FROM watch_history
          UNION SELECT anime_id FROM favorites
          UNION SELECT anime_id FROM lulustream_servers
        ) ids
        WHERE CAST(ids.anime_id AS INTEGER) > 0
          AND NOT EXISTS (
            SELECT 1 FROM anime_identity_map m
            WHERE CAST(m.legacy_mal_id AS TEXT) = CAST(ids.anime_id AS TEXT)
               OR m.hoshika_short_id = CAST(ids.anime_id AS TEXT)
          )
        ORDER BY CAST(ids.anime_id AS INTEGER)
      `);
      const candidates = candidatesRows
        .map(r => Number(r.anime_id))
        .filter(id => Number.isSafeInteger(id) && id > 0);
      const totalIds = await db.count(`
        SELECT COUNT(*) AS cnt FROM (
          SELECT anime_id FROM anime_list
          UNION SELECT anime_id FROM watch_history
          UNION SELECT anime_id FROM favorites
          UNION SELECT anime_id FROM lulustream_servers
        )
      `);

      // Keep batches small because each verified mapping currently performs
      // several safety checks/writes against D1.
      const batch = candidates.slice(0, 100);
      if (!batch.length) {
        await session.save(c, lifetime);
        return c.json({ ok: true, message: 'No unmapped MAL IDs found. Everything in the current ID set is already mapped or there is nothing to map.', totalIds, pending: 0, mapped: 0, missing: 0, conflicts: 0, remaining: 0 });
      }

      const response = await fetch('https://hoshika.app/api/v1/ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Hoshika-Key': c.env.HOSHIKA_API_KEY },
        body: JSON.stringify({ source: 'mal', type: 'anime', ids: batch }),
      });
      if (!response.ok) throw new Error(`Hoshika ID mapping request failed (HTTP ${response.status}).`);
      const responseText = await response.text();
      let payload: any;
      try {
        payload = JSON.parse(responseText);
      } catch {
        const contentType = response.headers.get('content-type') || 'unknown content type';
        const preview = responseText.trim().slice(0, 180).replace(/\\s+/g, ' ');
        throw new Error(
          `Hoshika returned non-JSON data (HTTP ${response.status}, ${contentType}).` +
          (preview ? ` Response starts with: ${preview}` : ' The response body was empty.')
        );
      }
      if (payload?.ok !== true || !Array.isArray(payload.items) || !Array.isArray(payload.missing)) {
        const detail = typeof payload?.error === 'string' ? payload.error : '';
        throw new Error(detail || 'Hoshika returned an unexpected ID mapping response.');
      }

      const returned = new Map<number, IdMapItem>();
      for (const item of payload.items as IdMapItem[]) {
        const sourceId = Number(item.sourceId), shortId = Number(item.shortId);
        if (Number.isSafeInteger(sourceId) && sourceId > 0 && Number.isSafeInteger(shortId) && shortId > 0 && batch.includes(sourceId)) {
          returned.set(sourceId, item);
        }
      }

      let mapped = 0, conflicts = 0;
      for (const [malId, item] of returned) {
        const ok = await linkVerifiedLegacyMalId(db, Number(item.shortId), malId);
        if (ok) mapped++;
        else conflicts++;
      }
      const missing = payload.missing.map((v: any) => Number(v)).filter((v: number) => Number.isSafeInteger(v) && batch.includes(v)).length;
      const resolved = new Set([...returned.keys(), ...payload.missing.map((v: any) => Number(v))]);
      const remaining = Math.max(0, candidates.length - resolved.size);
      await session.save(c, lifetime);
      return c.json({
        ok: true,
        message: 'Batch complete. Verified mappings were saved; missing IDs were left untouched.',
        totalIds: uniqueIds.length,
        pending: candidates.length,
        batchSize: batch.length,
        mapped,
        missing,
        conflicts,
        remaining,
      });
    } catch (error: any) {
      await session.save(c, lifetime);
      return c.json({ ok: false, error: error?.message || 'Hoshika migration failed.' }, 400);
    }
  }

  const stats = await db.fetchOne<any>(`
    SELECT
      (SELECT COUNT(*) FROM (
        SELECT anime_id FROM anime_list UNION SELECT anime_id FROM watch_history
        UNION SELECT anime_id FROM favorites UNION SELECT anime_id FROM lulustream_servers
      )) AS total_ids,
      (SELECT COUNT(*) FROM anime_identity_map WHERE verified=1 AND legacy_mal_id IS NOT NULL) AS verified_mappings,
      (SELECT COUNT(*) FROM (
        SELECT anime_id FROM anime_list UNION SELECT anime_id FROM watch_history
        UNION SELECT anime_id FROM favorites UNION SELECT anime_id FROM lulustream_servers
      ) ids WHERE NOT EXISTS (
        SELECT 1 FROM anime_identity_map m
        WHERE CAST(m.legacy_mal_id AS TEXT)=CAST(ids.anime_id AS TEXT)
           OR m.hoshika_short_id=CAST(ids.anime_id AS TEXT)
      )) AS unmapped
  `);

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Hoshika ID Migration', adminPage: 'hoshika_migration', isOwner, impersonating });
  html += `
<style>
.hm-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px}.hm-stat{background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:14px}.hm-stat b{display:block;font-size:1.55rem}.hm-stat span,.hm-muted{font-size:.84rem;color:var(--text-muted)}.hm-panel{background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:18px;margin-bottom:16px}
</style>
<div class="admin-header"><div><h1>Hoshika ID Migration</h1><p class="text-muted">Bulk-map existing MAL anime IDs to Hoshika shortIds.</p></div><span class="badge badge-default">Owner only</span></div>
<div class="alert alert-warning mb-3">This tool only saves verified ID mappings. It does not rewrite anime lists, watch history, favorites, or streaming records. IDs missing from Hoshika remain unchanged.</div>
<div class="hm-stats">
 <div class="hm-stat"><b>${Number(stats?.total_ids||0).toLocaleString()}</b><span>Distinct IDs in saved data</span></div>
 <div class="hm-stat"><b>${Number(stats?.verified_mappings||0).toLocaleString()}</b><span>Verified MAL mappings</span></div>
 <div class="hm-stat"><b>${Number(stats?.unmapped||0).toLocaleString()}</b><span>IDs needing mapping</span></div>
</div>
<div class="hm-panel">
 <h2>Bulk map from Hoshika</h2>
 <p class="hm-muted">Uses your server-side X-Hoshika-Key and POST /api/v1/ids with source=mal, type=anime. Processes up to 1,000 IDs per click. You can repeat it until no unmapped IDs remain.</p>
 <p class="hm-muted">MAL IDs are read from anime_list, watch_history, favorites, and LuluStream server records. Hoshika's missing IDs are reported but never deleted.</p>
 <button class="btn btn-primary" id="hm-run">Map next batch (up to 1,000 IDs)</button>
 <div id="hm-status" class="hm-muted" style="margin-top:12px" aria-live="polite"></div>
</div>
<script>
(function(){
 const button=document.getElementById('hm-run'), status=document.getElementById('hm-status');
 button.addEventListener('click',async()=>{
   if(!confirm('Ask Hoshika to map the next batch of up to 1,000 existing MAL anime IDs and save verified mappings?'))return;
   button.disabled=true;status.textContent='Requesting mappings from Hoshika…';
   try{
     const response=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({action:'bulk_map'})});
     const responseText=await response.text();
     let data;
     try{data=JSON.parse(responseText);}catch{
       const contentType=response.headers.get('content-type')||'unknown content type';
       const preview=responseText.trim().slice(0,180).replace(/\\s+/g,' ');
       throw new Error('AniVault returned non-JSON data (HTTP '+response.status+', '+contentType+').'+(preview?' Response starts with: '+preview:' The response body was empty.'));
     }
     if(!response.ok||!data.ok)throw new Error(data.error||('Migration request failed (HTTP '+response.status+').'));
     status.textContent=data.message+' Mapped: '+data.mapped+' · Missing: '+data.missing+' · Conflicts: '+data.conflicts+' · Remaining: '+data.remaining+'. Refresh the page to update the counters.';
     if(data.remaining>0)button.textContent='Map next batch (up to 1,000 IDs)';
     else button.textContent='No pending batch reported';
   }catch(error){status.textContent=error.message||'Migration failed.';}
   finally{button.disabled=false;}
 });
})();
</script>
`;
  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});
