import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { h } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';
import { getHoshikaAnimeById, searchHoshikaAnime } from '../../lib/hoshika-api';
import { linkVerifiedLegacyMalId, rememberHoshikaIdentity } from '../../lib/anime-identity';

export const adminHoshikaMigrationRoutes = new Hono<{ Bindings: Env }>();

adminHoshikaMigrationRoutes.on(['GET', 'POST'], '/admin/hoshika_migration.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx || !ctx.isOwner || ctx.impersonating) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating } = ctx;

  if (c.req.method === 'POST') {
    const body: any = await c.req.json().catch(() => ({}));
    try {
      if (body.action === 'search') {
        const legacyId = Number(body.legacy_id);
        if (!Number.isSafeInteger(legacyId) || legacyId <= 0) throw new Error('Invalid legacy ID.');
        const row = await db.fetchOne<any>(
          `SELECT anime_id, MAX(NULLIF(anime_title,'')) AS title FROM (
             SELECT anime_id, anime_title FROM anime_list WHERE anime_id=?
             UNION ALL SELECT anime_id, anime_title FROM watch_history WHERE anime_id=?
             UNION ALL SELECT anime_id, anime_title FROM favorites WHERE anime_id=?
           ) GROUP BY anime_id LIMIT 1`, [legacyId, legacyId, legacyId]);
        const searchTitle = String(body.title || row?.title || '').trim();
        if (!searchTitle) throw new Error('Enter the anime title to search Hoshika for this saved LuluStream ID.');
        const results = await searchHoshikaAnime(searchTitle, 12, c.env.HOSHIKA_API_KEY);
        await session.save(c, lifetime);
        return c.json({ ok: true, legacyId, title: searchTitle, results: results.map(a => ({
          shortId: a.shortId, title: a.title, titleEnglish: a.titleEnglish, titleRomaji: a.titleRomaji,
          poster: a.poster, year: a.year, format: a.type || a.raw?.format || ''
        })) });
      }
      if (body.action === 'approve') {
        const legacyId = Number(body.legacy_id);
        const shortId = String(body.short_id ?? '').trim();
        if (!Number.isSafeInteger(legacyId) || legacyId <= 0 || !/^\d+$/.test(shortId)) throw new Error('Invalid ID values.');
        const anime = await getHoshikaAnimeById(shortId, c.env.HOSHIKA_API_KEY);
        if (!anime || String(anime.shortId) !== shortId) throw new Error('Hoshika could not verify that shortId.');
        const conflict = await db.fetchOne<any>(
          'SELECT hoshika_short_id, legacy_mal_id FROM anime_identity_map WHERE legacy_mal_id=? OR hoshika_short_id=?',
          [legacyId, shortId]);
        if (conflict && (String(conflict.hoshika_short_id) !== shortId || (conflict.legacy_mal_id != null && Number(conflict.legacy_mal_id) !== legacyId))) {
          throw new Error('This ID conflicts with an existing mapping. Resolve the conflict first.');
        }
        await rememberHoshikaIdentity(db, { shortId, id: anime.id, slug: anime.slug, title: anime.title });
        if (!await linkVerifiedLegacyMalId(db, shortId, legacyId)) throw new Error('Could not save mapping because another mapping conflicts.');
        await session.save(c, lifetime);
        return c.json({ ok: true, message: 'Verified mapping saved: ' + legacyId + ' → ' + shortId + ' (' + anime.title + ').' });
      }
      if (body.action === 'apply') {
        const mappings = await db.fetchAll<{ legacy_mal_id: number; hoshika_short_id: string; title: string }>(
          'SELECT legacy_mal_id, hoshika_short_id, title FROM anime_identity_map WHERE verified=1 AND legacy_mal_id IS NOT NULL AND title IS NOT NULL AND title != \'\' AND CAST(legacy_mal_id AS TEXT) != hoshika_short_id AND (EXISTS (SELECT 1 FROM anime_list a WHERE CAST(a.anime_id AS TEXT)=CAST(anime_identity_map.legacy_mal_id AS TEXT) AND LOWER(TRIM(a.anime_title))=LOWER(TRIM(anime_identity_map.title))) OR EXISTS (SELECT 1 FROM watch_history w WHERE CAST(w.anime_id AS TEXT)=CAST(anime_identity_map.legacy_mal_id AS TEXT) AND LOWER(TRIM(w.anime_title))=LOWER(TRIM(anime_identity_map.title))) OR EXISTS (SELECT 1 FROM favorites f WHERE CAST(f.anime_id AS TEXT)=CAST(anime_identity_map.legacy_mal_id AS TEXT) AND LOWER(TRIM(f.anime_title))=LOWER(TRIM(anime_identity_map.title)))) ORDER BY legacy_mal_id LIMIT 100');
        let listUpdated = 0, historyUpdated = 0, favoritesUpdated = 0;
        for (const m of mappings) {
          const oldId = Number(m.legacy_mal_id), newId = Number(m.hoshika_short_id), verifiedTitle = String(m.title || '').trim();
          if (!Number.isSafeInteger(oldId) || !Number.isSafeInteger(newId) || oldId <= 0 || newId <= 0) continue;
          const list = await db.query('UPDATE anime_list SET anime_id=? WHERE anime_id=? AND LOWER(TRIM(anime_title))=LOWER(TRIM(?)) AND NOT EXISTS (SELECT 1 FROM anime_list target WHERE target.user_id=anime_list.user_id AND target.anime_id=?)', [newId, oldId, verifiedTitle, newId]);
          listUpdated += Number(list.meta?.changes ?? 0);
          const hist = await db.query('UPDATE watch_history SET anime_id=? WHERE anime_id=? AND LOWER(TRIM(anime_title))=LOWER(TRIM(?)) AND NOT EXISTS (SELECT 1 FROM watch_history target WHERE target.user_id=watch_history.user_id AND target.anime_id=?)', [newId, oldId, verifiedTitle, newId]);
          historyUpdated += Number(hist.meta?.changes ?? 0);
          const fav = await db.query('UPDATE favorites SET anime_id=? WHERE anime_id=? AND LOWER(TRIM(anime_title))=LOWER(TRIM(?)) AND NOT EXISTS (SELECT 1 FROM favorites target WHERE target.user_id=favorites.user_id AND target.anime_id=?)', [newId, oldId, verifiedTitle, newId]);
          favoritesUpdated += Number(fav.meta?.changes ?? 0);
        }
        await session.save(c, lifetime);
        return c.json({ ok: true, message: 'Applied verified mappings to core user data. Duplicate conflicts were skipped.', listUpdated, historyUpdated, favoritesUpdated, mappingsProcessed: mappings.length });
      }
      throw new Error('Unknown action.');
    } catch (error: any) {
      await session.save(c, lifetime);
      return c.json({ ok: false, error: error?.message || 'Migration action failed.' }, 400);
    }
  }

  const page = Math.max(1, Math.min(10000, Number(c.req.query('page') || 1)));
  const limit = 40, offset = (page - 1) * limit;
  const counts = await db.fetchOne<any>(`
    SELECT
      (SELECT COUNT(*) FROM (SELECT anime_id FROM anime_list UNION SELECT anime_id FROM watch_history UNION SELECT anime_id FROM favorites UNION SELECT anime_id FROM lulustream_servers)) AS total_ids,
      (SELECT COUNT(*) FROM anime_identity_map WHERE verified=1 AND legacy_mal_id IS NOT NULL) AS verified_mappings,
      (SELECT COUNT(*) FROM (SELECT anime_id FROM anime_list UNION SELECT anime_id FROM watch_history UNION SELECT anime_id FROM favorites UNION SELECT anime_id FROM lulustream_servers) ids
       WHERE NOT EXISTS (SELECT 1 FROM anime_identity_map m WHERE CAST(m.legacy_mal_id AS TEXT)=CAST(ids.anime_id AS TEXT) OR m.hoshika_short_id=CAST(ids.anime_id AS TEXT))) AS unmapped
  `);
  const rows = await db.fetchAll<any>(`
    SELECT ids.anime_id, MAX(ids.title) AS title, SUM(ids.uses) AS uses
    FROM (
      SELECT anime_id, MAX(NULLIF(anime_title,'')) AS title, COUNT(*) AS uses FROM anime_list GROUP BY anime_id
      UNION ALL SELECT anime_id, MAX(NULLIF(anime_title,'')) AS title, COUNT(*) AS uses FROM watch_history GROUP BY anime_id
      UNION ALL SELECT anime_id, MAX(NULLIF(anime_title,'')) AS title, COUNT(*) AS uses FROM favorites GROUP BY anime_id
      UNION ALL SELECT anime_id, NULL AS title, COUNT(*) AS uses FROM lulustream_servers GROUP BY anime_id
    ) ids
    WHERE NOT EXISTS (SELECT 1 FROM anime_identity_map m WHERE CAST(m.legacy_mal_id AS TEXT)=CAST(ids.anime_id AS TEXT) OR m.hoshika_short_id=CAST(ids.anime_id AS TEXT))
    GROUP BY ids.anime_id ORDER BY uses DESC, ids.anime_id ASC LIMIT ? OFFSET ?
  `, [limit, offset]);

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Hoshika ID Migration', adminPage: 'hoshika_migration', isOwner, impersonating });
  html += `
<style>
.hm-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px}.hm-stat{background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:14px}.hm-stat b{display:block;font-size:1.55rem}.hm-stat span,.hm-muted{font-size:.82rem;color:var(--text-muted)}.hm-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)}.hm-results{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;margin-top:14px}.hm-candidate{border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--bg-card)}.hm-candidate img{width:62px;height:88px;object-fit:cover;border-radius:6px;float:left;margin-right:10px}@media(max-width:600px){.hm-row{align-items:flex-start;flex-direction:column}}
</style>
<div class="admin-header"><div><h1>Hoshika ID Migration</h1><p class="text-muted">Review legacy IDs, verify Hoshika matches, then migrate user data.</p></div><span class="badge badge-default">Owner only</span></div>
<div class="alert alert-warning mb-3">Review each title and poster carefully. Approving a match saves an identity mapping; applying mappings is a separate action.</div>
<div class="hm-stats">
 <div class="hm-stat"><b>${Number(counts?.total_ids||0).toLocaleString()}</b><span>Distinct IDs in user data</span></div>
 <div class="hm-stat"><b>${Number(counts?.verified_mappings||0).toLocaleString()}</b><span>Verified mappings</span></div>
 <div class="hm-stat"><b>${Number(counts?.unmapped||0).toLocaleString()}</b><span>IDs needing review</span></div>
</div>
<div class="card card-body mb-3"><h2>Hoshika candidate review</h2><p class="hm-muted">Searches using the saved title. Nothing changes until you approve a candidate.</p><div id="hm-results"></div></div>
<div class="card card-body mb-3"><h2>Apply verified mappings</h2><p class="hm-muted">Updates anime_list, watch_history and favorites for rows whose saved title matches the verified Hoshika title. Up to 100 mappings per click; duplicate rows and title mismatches are skipped.</p><button class="btn btn-danger" id="hm-apply">Apply verified mappings</button><p id="hm-apply-status" class="hm-muted"></p></div>
<div class="card card-body"><h2>Unmapped anime IDs</h2><p class="hm-muted">Includes saved LuluStream anime IDs. For LuluStream-only entries, enter the anime title when searching. Page ${page} · showing ${rows.length} IDs, ordered by number of records.</p>
${rows.map((r:any)=>`<div class="hm-row"><div><strong>${h(r.title||'Unknown title')}</strong><div class="hm-muted">ID ${h(String(r.anime_id))} · ${Number(r.uses||0)} references</div></div><button class="btn btn-secondary btn-sm hm-find" data-id="${h(String(r.anime_id))}" data-title="${h(String(r.title||''))}">Search Hoshika</button></div>`).join('')}
<div style="display:flex;gap:8px;margin-top:14px">${page>1?`<a class="btn btn-ghost" href="?page=${page-1}">Previous</a>`:''}<a class="btn btn-ghost" href="?page=${page+1}">Next page</a></div></div>
<script>
(function(){
 const box=document.getElementById('hm-results');
 async function req(payload){const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Request failed');return d;}
 function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
 async function find(id,title){if(!title){title=prompt('Enter the anime title for legacy ID '+id+' so Hoshika can be searched:','');if(!title||!title.trim())return;}box.innerHTML='<p class="hm-muted">Searching Hoshika for '+esc(title||id)+'…</p>';try{const d=await req({action:'search',legacy_id:id,title:title.trim()});box.innerHTML='<h3>Matches for '+esc(d.title)+' (legacy ID '+id+')</h3><div class="hm-results">'+d.results.map(a=>'<div class="hm-candidate">'+(a.poster?'<img src="'+esc(a.poster)+'" alt="">':'')+'<strong>'+esc(a.title||a.titleEnglish||a.titleRomaji||'Untitled')+'</strong><p class="hm-muted">Hoshika shortId: '+esc(a.shortId)+(a.year?' · '+a.year:'')+'</p><div style="clear:both"></div><button class="btn btn-primary btn-sm hm-approve" data-legacy="'+id+'" data-short="'+esc(a.shortId)+'">Approve match</button></div>').join('')+'</div>';if(!d.results.length)box.insertAdjacentHTML('beforeend','<p class="hm-muted">No matches returned. Leave this ID unmapped if uncertain.</p>');}catch(e){box.innerHTML='<p class="hm-muted">'+esc(e.message)+'</p>';}}
 document.querySelectorAll('.hm-find').forEach(b=>b.addEventListener('click',()=>find(b.dataset.id,b.dataset.title)));
 box.addEventListener('click',async e=>{const b=e.target.closest('.hm-approve');if(!b)return;if(!confirm('Approve mapping '+b.dataset.legacy+' → '+b.dataset.short+'? Check title/poster first.'))return;b.disabled=true;try{const d=await req({action:'approve',legacy_id:b.dataset.legacy,short_id:b.dataset.short});b.textContent='Approved';b.insertAdjacentHTML('afterend','<p class="hm-muted">'+esc(d.message)+'</p>');}catch(err){alert(err.message);b.disabled=false;}});
 document.getElementById('hm-apply').addEventListener('click',async()=>{if(!confirm('Apply verified mappings to anime_list, watch_history and favorites?'))return;const s=document.getElementById('hm-apply-status');s.textContent='Applying…';try{const d=await req({action:'apply'});s.textContent=d.message+' Updated: '+d.listUpdated+' list rows, '+d.historyUpdated+' history rows, '+d.favoritesUpdated+' favorites.';}catch(e){s.textContent=e.message;}});
})();
</script>
`;
  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});
