import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { h } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';

export const adminTurbovidServerRoutes = new Hono<{ Bindings: Env }>();

adminTurbovidServerRoutes.get('/admin/turbovid_servers.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating } = ctx;
  const animeId = parseInt(c.req.query('anime') || '0', 10) || 0;
  const epNum = parseInt(c.req.query('ep') || '0', 10) || 0;
  const rows = animeId && epNum ? await db.fetchAll<any>('SELECT * FROM turbovid_servers WHERE anime_id=? AND episode_num=? ORDER BY audio_group, language, id',[animeId,epNum]) : [];
  let html = renderAdminHeader({siteUrl,pageTitle:'TurboVid Servers',adminPage:'turbovid_servers',isOwner,impersonating});
  html += '<div class="admin-header"><div><h1>🎬 TurboVid Servers</h1><p class="text-muted">Attach TurboVid embeds to specific anime episodes.</p></div></div>';
  html += '<div class="card card-body mb-2"><div class="grid-2" style="gap:1rem;">'+
    '<div><label class="ep-editor-label">Anime ID *</label><input id="tv-anime" type="number" min="1" class="form-control" placeholder="MAL ID" value="'+(animeId||'')+'"></div>'+
    '<div><label class="ep-editor-label">Episode *</label><input id="tv-ep" type="number" min="1" class="form-control" placeholder="Episode" value="'+(epNum||'')+'"></div></div>'+
    '<p class="text-muted" style="font-size:.78rem;margin:.65rem 0 0;">Save one TurboVid source per audio group/language.</p></div>';
  html += '<div class="card card-body mb-2"><h2 style="margin-bottom:.8rem;">Add / update source</h2>'+
    '<div style="display:grid;gap:.8rem;">'+
    '<div><label class="ep-editor-label">Group *</label><select id="tv-group" class="form-control">'+
      '<option value="sub">Sub — AV-sub</option><option value="dub">Dub (English) — AV-dub</option><option value="hindi">Dub (Hindi) — AV-hindi</option><option value="multi">Multi Dub — AV-{language}</option></select></div>'+
    '<div id="tv-lang-wrap" style="display:none"><label class="ep-editor-label">Language *</label><input id="tv-lang" class="form-control" placeholder="Tamil, Telugu, Spanish…"></div>'+
    '<div><label class="ep-editor-label">TurboVid embed URL *</label><input id="tv-url" type="url" class="form-control" placeholder="https://turbovidhls.com/t/..."></div>'+
    '<label style="display:flex;gap:.5rem;align-items:center;font-size:.85rem"><input id="tv-active" type="checkbox" checked> Active</label>'+
    '<button id="tv-save" class="btn btn-primary" onclick="saveTurbo()">Save TurboVid Server</button></div></div>';
  html += '<div class="card" style="overflow:auto"><table class="data-table"><thead><tr><th>Group</th><th>Language</th><th>Button</th><th>Embed</th><th>Status</th><th>Action</th></tr></thead><tbody>'+
    (rows.length ? rows.map((r:any)=>'<tr id="tv-row-'+r.id+'"><td>'+h(r.audio_group)+'</td><td>'+h(r.language||'—')+'</td><td><strong>'+h(r.audio_group==='multi'?'AV-'+r.language:r.audio_group==='sub'?'AV-sub':r.audio_group==='hindi'?'AV-hindi':'AV-dub')+'</strong></td><td style="max-width:360px;word-break:break-all;font-size:.75rem">'+h(r.embed_url)+'</td><td>'+(r.is_active?'<span class="badge badge-watching">Active</span>':'<span class="badge badge-dropped">Hidden</span>')+'</td><td><button class="btn btn-sm btn-danger" onclick="deleteTurbo('+r.id+')">Delete</button></td></tr>').join(''):'<tr><td colspan="6" class="text-center text-muted" style="padding:2rem">No TurboVid servers saved for this episode.</td></tr>')+'</tbody></table></div>';
  html += '<script>'+
    'const groupEl=document.getElementById("tv-group"),langWrap=document.getElementById("tv-lang-wrap");'+
    'groupEl.addEventListener("change",()=>langWrap.style.display=groupEl.value==="multi"?"":"none");'+
    'async function saveTurbo(){const anime_id=+document.getElementById("tv-anime").value,episode_num=+document.getElementById("tv-ep").value,audio_group=groupEl.value,language=document.getElementById("tv-lang").value.trim(),embed_url=document.getElementById("tv-url").value.trim(),is_active=document.getElementById("tv-active").checked?1:0;if(!anime_id||!episode_num||!embed_url){alert("Anime ID, episode and URL are required.");return;}if(audio_group==="multi"&&!language){alert("Enter the Multi Dub language.");return;}const b=document.getElementById("tv-save");b.disabled=true;try{const r=await fetch("'+siteUrl+'/admin/turbovid_servers.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({anime_id,episode_num,audio_group,language,embed_url,is_active})});const d=await r.json();if(!d.success)throw new Error(d.error||"Save failed");location.href="'+siteUrl+'/admin/turbovid_servers.php?anime="+anime_id+"&ep="+episode_num;}catch(e){alert(e.message);b.disabled=false;}}'+
    'async function deleteTurbo(id){if(!confirm("Delete this TurboVid server?"))return;const r=await fetch("'+siteUrl+'/admin/turbovid_servers.php?id="+id,{method:"DELETE"});const d=await r.json();if(d.success)location.reload();else alert(d.error||"Delete failed");}'+
  '</script>';
  html += renderAdminFooter(siteUrl);
  await session.save(c,lifetime);
  return c.html(html);
});

async function adminOnly(c:any){ return await buildAdminCtx(c); }

adminTurbovidServerRoutes.post('/admin/turbovid_servers.php', async (c) => {
  const ctx=await adminOnly(c); if(!ctx)return c.json({error:'Forbidden'},403);
  const body:any=await c.req.json().catch(()=>null);
  const animeId=Number(body?.anime_id||0),ep=Number(body?.episode_num||0),group=String(body?.audio_group||''),lang=String(body?.language||'').trim(),url=String(body?.embed_url||'').trim();
  if(!animeId||!ep||!/^https?:\/\//i.test(url)||!['sub','dub','hindi','multi'].includes(group)||(group==='multi'&&!lang))return c.json({error:'Invalid source data'},400);
  await ctx.db.query("INSERT INTO turbovid_servers (anime_id,episode_num,audio_group,language,label,embed_url,is_active,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(anime_id,episode_num,audio_group,language) DO UPDATE SET label=excluded.label,embed_url=excluded.embed_url,is_active=excluded.is_active,updated_at=datetime('now')",[animeId,ep,group,lang,group==='multi'?'AV-'+lang:group==='sub'?'AV-sub':group==='hindi'?'AV-hindi':'AV-dub',url,Number(body?.is_active?1:0)]);
  return c.json({success:true});
});

adminTurbovidServerRoutes.delete('/admin/turbovid_servers.php', async (c) => {
  const ctx=await adminOnly(c); if(!ctx)return c.json({error:'Forbidden'},403);
  const id=Number(c.req.query('id')||0); if(!id)return c.json({error:'Missing id'},400);
  await ctx.db.query('DELETE FROM turbovid_servers WHERE id=?',[id]); return c.json({success:true});
});
