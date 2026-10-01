import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { MalAPI } from '../../lib/mal-api';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';
import { renderLuluStreamAdmin } from '../../render/admin-lulustream';

export const adminLuluStreamServerRoutes = new Hono<{ Bindings: Env }>();

function validLuluUrl(value: string): boolean {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    return u.protocol === 'https:' && (host === 'lulust.com' || host.endsWith('.lulust.com'));
  } catch { return false; }
}
function esc(value: unknown): string {
  return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

adminLuluStreamServerRoutes.get('/admin/lulustream_servers.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating } = ctx;
  const selectedAnime = Number(c.req.query('anime') || 0) || 0;
  if (c.req.query('json') === '1') { const anime=Number(c.req.query('anime')||0), episode=Number(c.req.query('episode')||0); if(!anime||!episode)return c.json({error:'Missing anime or episode'},400); const rows=await db.fetchAll<any>('SELECT id,anime_id,episode_num,label,embed_url,is_active,updated_at FROM lulustream_servers WHERE anime_id=? AND episode_num=? ORDER BY id',[anime,episode]); return c.json({success:true,sources:rows}); }
  const seriesRows = await db.fetchAll<any>(
    'SELECT anime_id, COUNT(*) AS episode_count, MAX(updated_at) AS last_updated FROM lulustream_servers WHERE is_active=1 GROUP BY anime_id ORDER BY MAX(updated_at) DESC'
  );
  const mal = new MalAPI(c.env as any, c.env.API_CACHE, db);
  const series = await Promise.all(seriesRows.map(async (row:any) => {
    try {
      const a = (await mal.getAnime(Number(row.anime_id), true)).data;
      return { ...row, title:a?.title || ('Anime #' + row.anime_id), image:a?.images?.jpg?.large_image_url || a?.images?.jpg?.image_url || '', totalEps:Number(a?.episodes || 0) };
    } catch { return { ...row, title:'Anime #' + row.anime_id, image:'', totalEps:0 }; }
  }));
  const selected = selectedAnime ? series.find((s:any) => Number(s.anime_id) === selectedAnime) || null : null;
  const episodes = selectedAnime ? await db.fetchAll<any>(`SELECT episode_num, COUNT(*) AS source_count, GROUP_CONCAT(label, ' | ') AS sources, MAX(updated_at) AS updated_at FROM lulustream_servers WHERE anime_id=? AND is_active=1 GROUP BY episode_num ORDER BY episode_num DESC`, [selectedAnime]) : [];

  let html = renderAdminHeader({siteUrl,pageTitle:'LuluStream Servers',adminPage:'lulustream_servers',isOwner,impersonating});
  html += '<style>.ls{max-width:1050px;margin:auto;padding:1.25rem}.ls h1{margin:0}.ls-muted{color:var(--text-muted);font-size:.8rem}.ls-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem}.ls-card,.ls-detail{border:1px solid var(--border);border-radius:16px;background:rgba(12,14,21,.82);overflow:hidden}.ls-card{display:flex;text-decoration:none;color:inherit}.ls-art{width:105px;flex:0 0 105px;background:#111}.ls-art img{width:100%;height:100%;object-fit:cover}.ls-body{padding:1rem}.ls-pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:.2rem .45rem;color:var(--text-muted);font-size:.7rem;margin-top:.45rem}.ls-top{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin:0 0 1rem}.ls-btn{border:0;border-radius:10px;padding:.65rem .9rem;background:#7c3aed;color:#fff;font-weight:800;cursor:pointer}.ls-table{width:100%;border-collapse:collapse}.ls-table th,.ls-table td{padding:.7rem .9rem;border-bottom:1px solid rgba(255,255,255,.05);text-align:left;font-size:.78rem}.ls-table th{font-size:.68rem;color:var(--text-muted)}.ls-url{max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted)}.ls-actions button{margin-right:.35rem;border:1px solid var(--border);background:transparent;color:var(--text-primary);border-radius:8px;padding:.35rem .55rem;cursor:pointer}.ls-modal{position:fixed;inset:0;z-index:100000;display:none;place-items:center;background:rgba(0,0,0,.72);padding:1rem}.ls-modal.open{display:grid}.ls-box{width:min(600px,100%);padding:1.1rem;border:1px solid var(--border);border-radius:18px;background:#11141d}.ls-field{display:grid;gap:.3rem;margin:.7rem 0}.ls-field label{font-size:.74rem;color:var(--text-muted)}.ls-field input{width:100%;box-sizing:border-box}.ls-actions{display:flex;justify-content:flex-end;gap:.5rem;margin-top:1rem}</style>';
  html += '<div class="ls"><div class="ls-top"><div><h1>🎧 LuluStream Servers</h1><div class="ls-muted">One dynamic source per episode. Signed M3U8 URLs are resolved at playback time.</div></div><button class="ls-btn" id="ls-add">＋ Add Source</button></div>';
  if (selected) {
    html += '<div class="ls-detail"><div style="padding:1rem;border-bottom:1px solid var(--border)"><strong>' + esc(selected.title) + '</strong><div class="ls-muted">MAL #' + selected.anime_id + ' · ' + selected.episode_count + ' episodes</div></div><div style="overflow:auto"><table class="ls-table"><thead><tr><th>Episode</th><th>Label</th><th>Embed URL</th><th></th></tr></thead><tbody>';
    for (const e of episodes) {
      html += '<tr><td>' + Number(e.episode_num) + '</td><td>' + esc(e.label) + '</td><td><div class="ls-url">' + esc(e.embed_url) + '</div></td><td class="ls-actions"><button data-edit="' + esc(JSON.stringify(e)) + '">Edit</button><button data-del="' + Number(e.id) + '">Delete</button></td></tr>';
    }
    html += '</tbody></table></div></div>';
  } else {
    html += '<div class="ls-grid">';
    for (const s of series) html += '<a class="ls-card" href="' + siteUrl + '/admin/lulustream_servers.php?anime=' + Number(s.anime_id) + '"><div class="ls-art">' + (s.image ? '<img src="' + esc(s.image) + '" alt="">' : '') + '</div><div class="ls-body"><div class="ls-muted">MAL #' + Number(s.anime_id) + '</div><strong>' + esc(s.title) + '</strong><div><span class="ls-pill">' + Number(s.episode_count) + ' episodes · LuluStream</span></div></div></a>';
    html += '</div>';
  }
  html += '<div class="ls-modal" id="ls-modal"><div class="ls-box"><h2 id="ls-title">Add LuluStream Source</h2><form id="ls-form"><input id="ls-id" type="hidden"><div class="ls-field"><label>Anime / MAL ID</label><input id="ls-anime" type="number" min="1" required value="' + (selectedAnime || '') + '"></div><div class="ls-field"><label>Episode</label><input id="ls-ep" type="number" min="1" required></div><div class="ls-field"><label>Label</label><input id="ls-label" value="LuluStream" required></div><div class="ls-field"><label>LuluStream embed URL</label><input id="ls-url" type="url" placeholder="https://lulust.com/e/..." required><span class="ls-muted">Store the stable embed URL, not the temporary signed M3U8.</span></div><div class="ls-field"><label><input id="ls-active" type="checkbox" checked> Active source</label></div><div class="ls-actions"><button type="button" id="ls-cancel">Cancel</button><button class="ls-btn" id="ls-save">Save Source</button></div></form></div></div>';
  html += '<script>(function(){const site=' + JSON.stringify(siteUrl) + ',modal=document.getElementById("ls-modal"),by=id=>document.getElementById(id);function open(row){modal.classList.add("open");by("ls-id").value=row?.id||"";by("ls-anime").value=row?.anime_id||' + (selectedAnime || '""') + ';by("ls-ep").value=row?.episode_num||"";by("ls-label").value=row?.label||"LuluStream";by("ls-url").value=row?.embed_url||"";by("ls-active").checked=row?!!row.is_active:true;by("ls-title").textContent=row?"Edit LuluStream Source":"Add LuluStream Source";}function close(){modal.classList.remove("open")}document.getElementById("ls-add")?.addEventListener("click",()=>open());document.getElementById("ls-cancel")?.addEventListener("click",close);document.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>open(JSON.parse(b.dataset.edit))));document.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click",async()=>{if(!confirm("Delete this LuluStream source?"))return;const r=await fetch(site+"/admin/lulustream_servers.php?id="+b.dataset.del,{method:"DELETE"});const d=await r.json();if(!d.success)alert(d.error||"Delete failed");else location.reload();}));document.getElementById("ls-form")?.addEventListener("submit",async e=>{e.preventDefault();const body={id:+by("ls-id").value||0,anime_id:+by("ls-anime").value,episode_num:+by("ls-ep").value,label:by("ls-label").value.trim(),embed_url:by("ls-url").value.trim(),is_active:by("ls-active").checked?1:0};const r=await fetch(site+"/admin/lulustream_servers.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!d.success)return alert(d.error||"Save failed");location.href=site+"/admin/lulustream_servers.php?anime="+body.anime_id;});})();</script></div>';
  html += renderAdminFooter(siteUrl); await session.save(c,lifetime); return c.html(html);
});

adminLuluStreamServerRoutes.post('/admin/lulustream_servers.php', async (c) => {
  const ctx=await buildAdminCtx(c); if(!ctx)return c.json({error:'Forbidden'},403);
  const body:any=(c.req.header('content-type')||'').includes('application/json') ? await c.req.json().catch(()=>null) : await c.req.parseBody().catch(()=>null);
  const id=Number(body?.id||0), animeId=Number(body?.anime_id||0), ep=Number(body?.episode_num||0), label=String(body?.label||'LuluStream').trim()||'LuluStream', url=String(body?.embed_url||'').trim(), active=Number(body?.is_active?1:0);
  if(!animeId||!ep||!validLuluUrl(url))return c.json({error:'Use an HTTPS lulust.com embed URL'},400);
  if(id) await ctx.db.query("UPDATE lulustream_servers SET anime_id=?,episode_num=?,label=?,embed_url=?,is_active=?,updated_at=datetime('now') WHERE id=?",[animeId,ep,label,url,active,id]);
  else await ctx.db.query("INSERT INTO lulustream_servers (anime_id,episode_num,label,embed_url,is_active,updated_at) VALUES (?,?,?,?,?,datetime('now')) ON CONFLICT(anime_id,episode_num) DO UPDATE SET label=excluded.label,embed_url=excluded.embed_url,is_active=excluded.is_active,updated_at=datetime('now')",[animeId,ep,label,url,active]);
  return c.json({success:true});
});

adminLuluStreamServerRoutes.delete('/admin/lulustream_servers.php', async (c) => { const ctx=await buildAdminCtx(c); if(!ctx)return c.json({error:'Forbidden'},403); const id=Number(c.req.query('id')||0); if(!id)return c.json({error:'Missing id'},400); await ctx.db.query('DELETE FROM lulustream_servers WHERE id=?',[id]); return c.json({success:true}); });