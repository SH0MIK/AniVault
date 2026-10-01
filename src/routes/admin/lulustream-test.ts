import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { Session } from '../../lib/session';
import { Db } from '../../lib/db';
import { Auth } from '../../lib/auth';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';
import { resolveLuluStream } from '../../lib/lulustream-resolver';

export const adminLuluStreamRoutes = new Hono<{ Bindings: Env }>();

adminLuluStreamRoutes.get('/admin/lulustream_test.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  if (!ctx) return c.redirect(c.env.SITE_URL + '/');
  const { session, lifetime, isOwner, impersonating } = ctx;
  let html = renderAdminHeader({
    siteUrl: c.env.SITE_URL,
    pageTitle: 'LuluStream Tester',
    adminPage: 'lulustream_test',
    isOwner,
    impersonating,
  });
  html += `
<div class="admin-header"><h1>🧪 LuluStream Resolver Tester</h1></div>
<div class="alert alert-info mb-2" style="font-size:.85rem">
  Standalone diagnostic only. This does not modify the watch page or production source selection.
</div>
<div class="card card-body mb-2">
  <div class="flex" style="gap:10px;flex-wrap:wrap">
    <input id="embedUrl" value="https://lulust.com/e/x0s4j0h7zykl" type="text"
      style="flex:1;min-width:280px;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-family:monospace;font-size:.85rem;padding:10px 12px">
    <button id="resolveBtn" class="btn btn-primary">Resolve</button>
  </div>
  <div id="status" class="text-muted mt-1" style="min-height:18px;font-size:.85rem"></div>
</div>
<pre id="result" class="card card-body" style="white-space:pre-wrap;word-break:break-all;font-size:.78rem;line-height:1.55;max-height:70vh;overflow:auto">Paste an embed URL and press Resolve.</pre>
<script>
const btn=document.getElementById('resolveBtn'), input=document.getElementById('embedUrl');
const status=document.getElementById('status'), result=document.getElementById('result');
function setStatus(t,ok){status.textContent=t;status.style.color=ok?'#2ecc71':'var(--accent)';}
async function resolve(){
  const url=input.value.trim();
  if(!url){setStatus('Enter a LuluStream embed URL.',false);return;}
  btn.disabled=true; setStatus('Resolving…');
  result.textContent='';
  try{
    const r=await fetch('lulustream_resolve.php?url='+encodeURIComponent(url));
    const data=await r.json();
    result.textContent=JSON.stringify(data,null,2);
    setStatus(r.ok?'Resolved ✓':'Resolver failed',r.ok);
  }catch(e){result.textContent=String(e);setStatus('Request failed',false);}
  finally{btn.disabled=false;}
}
btn.onclick=resolve;
input.addEventListener('keydown',e=>{if(e.key==='Enter')resolve();});
</script>`;
  html += renderAdminFooter(c.env.SITE_URL);
  await session.save(c, lifetime);
  return c.html(html);
});

adminLuluStreamRoutes.get('/admin/lulustream_resolve.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  if (!ctx) return c.json({ error: 'Forbidden' }, 403);
  const { session, lifetime } = ctx;
  const embedUrl = c.req.query('url');
  if (!embedUrl) {
    await session.save(c, lifetime);
    return c.json({ error: 'Missing ?url=' }, 400);
  }
  try {
    const result = await resolveLuluStream(embedUrl);
    await session.save(c, lifetime);
    return c.json({ success: true, ...result });
  } catch (e) {
    await session.save(c, lifetime);
    return c.json({
      success: false,
      provider: 'lulustream',
      embedUrl,
      error: e instanceof Error ? e.message : String(e),
    }, 502);
  }
});
