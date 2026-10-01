import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';
import { resolveLuluStream } from '../../lib/lulustream-resolver';

export const adminLuluStreamRoutes = new Hono<{ Bindings: Env }>();

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36';

function withInheritedQuery(value: string, base: string): string {
  const url = new URL(value, base);
  const parent = new URL(base);
  if (!url.search && parent.search) url.search = parent.search;
  return url.toString();
}

async function probe(url: string, referer: string) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
        'Referer': referer,
        'Origin': 'https://lulust.com',
      },
      redirect: 'follow',
    });
    const text = await res.text();
    return {
      requestedUrl: url,
      finalUrl: res.url || url,
      status: res.status,
      ok: res.ok,
      contentType: res.headers.get('content-type'),
      contentLength: res.headers.get('content-length'),
      elapsedMs: Date.now() - started,
      bodyPreview: text.slice(0, 1000),
      looksLikeHls: /#EXTM3U/.test(text),
      looksBlocked: res.status === 401 || res.status === 403 || /access denied|forbidden|blocked|cloudflare/i.test(text),
    };
  } catch (e) {
    return {
      requestedUrl: url,
      status: null,
      ok: false,
      elapsedMs: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
      looksBlocked: false,
    };
  }
}

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
<div class="admin-header"><h1>🧪 LuluStream CDN Tester</h1></div>
<div class="alert alert-info mb-2" style="font-size:.85rem">
  Standalone diagnostic only. This does not modify the watch page or production source selection.
</div>
<div class="card card-body mb-2">
  <div class="flex" style="gap:10px;flex-wrap:wrap">
    <input id="embedUrl" value="https://lulust.com/e/x0s4j0h7zykl" type="text"
      style="flex:1;min-width:280px;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-family:monospace;font-size:.85rem;padding:10px 12px">
    <button id="resolveBtn" class="btn btn-primary">Test CDN</button>
  </div>
  <div id="status" class="text-muted mt-1" style="min-height:18px;font-size:.85rem"></div>
</div>
<pre id="result" class="card card-body" style="white-space:pre-wrap;word-break:break-all;font-size:.78rem;line-height:1.55;max-height:70vh;overflow:auto">Paste an embed URL and press Test CDN.</pre>
<script>
const btn=document.getElementById('resolveBtn'), input=document.getElementById('embedUrl');
const status=document.getElementById('status'), result=document.getElementById('result');
function setStatus(t,ok){status.textContent=t;status.style.color=ok?'#2ecc71':'var(--accent)';}
async function resolve(){
  const url=input.value.trim();
  if(!url){setStatus('Enter a LuluStream embed URL.',false);return;}
  btn.disabled=true; setStatus('Resolving and probing CDN…');
  result.textContent='';
  try{
    const r=await fetch('lulustream_cdn_test.php?url='+encodeURIComponent(url));
    const data=await r.json();
    result.textContent=JSON.stringify(data,null,2);
    setStatus(r.ok?'Diagnostic complete ✓':'Diagnostic failed',r.ok);
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

adminLuluStreamRoutes.get('/admin/lulustream_cdn_test.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  if (!ctx) return c.json({ error: 'Forbidden' }, 403);
  const { session, lifetime } = ctx;
  const embedUrl = c.req.query('url');
  if (!embedUrl) {
    await session.save(c, lifetime);
    return c.json({ error: 'Missing ?url=' }, 400);
  }

  try {
    const resolved = await resolveLuluStream(embedUrl);
    const master = await probe(resolved.video.url, resolved.referer);

    let child = null;
    if (master.ok && master.bodyPreview) {
      const lines = master.bodyPreview.split(/\\r?\\n/);
      const firstUri = lines.find((line) => line && !line.startsWith('#'));
      if (firstUri) {
        const childUrl = withInheritedQuery(firstUri.trim(), master.finalUrl);
        child = await probe(childUrl, resolved.referer);
      }
    }

    await session.save(c, lifetime);
    return c.json({
      success: true,
      provider: 'lulustream',
      embedUrl: resolved.embedUrl,
      title: resolved.title,
      cdnHost: new URL(resolved.video.url).hostname,
      master,
      child,
      extractedTracks: {
        audio: resolved.audio.length,
        subtitles: resolved.subtitles.length,
      },
      diagnosis: master.status === 403
        ? 'CDN returned HTTP 403 for the master playlist from the Worker.'
        : master.status === 401
          ? 'CDN returned HTTP 401 for the master playlist from the Worker.'
          : master.ok && master.looksLikeHls
            ? 'Master playlist is reachable from the Worker; if playback still fails, inspect child playlist/segment responses.'
            : 'Master playlist did not return a usable HLS manifest.',
    });
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
