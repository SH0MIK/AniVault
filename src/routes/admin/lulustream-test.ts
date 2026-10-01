import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';
import { resolveLuluStream } from '../../lib/lulustream-resolver';
import { PLAYER_CSS } from '../../render/player-css';
import { playerBody } from '../../render/player-body';
import { playerScript } from '../../render/player-script';

export const adminLuluStreamRoutes = new Hono<{ Bindings: Env }>();

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36';

function isAllowedLuluHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'lulust.com'
    || host.endsWith('.lulust.com')
    || host === 'luluvdo.com'
    || host.endsWith('.luluvdo.com')
    || host === 'tnmr.org'
    || host.endsWith('.tnmr.org')
    || host.endsWith('.cdn-tnmr.org');
}

function proxyUrl(url: string, origin: string): string {
  return `${origin}/admin/lulustream_proxy.php?url=${encodeURIComponent(url)}`;
}

function rewriteHlsPlaylist(manifest: string, baseUrl: string, origin: string): string {
  const lines = manifest.split(/\r?\n/);
  return lines.map((line) => {
    let rewritten = line.replace(/URI="([^"]+)"/g, (_match, rawUrl: string) => {
      const absolute = withInheritedQuery(rawUrl, baseUrl);
      return `URI="${proxyUrl(absolute, origin)}"`;
    });

    if (rewritten.trim() && !rewritten.trim().startsWith('#')) {
      const absolute = withInheritedQuery(rewritten.trim(), baseUrl);
      rewritten = proxyUrl(absolute, origin);
    }

    return rewritten;
  }).join('\n');
}

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
      bodyPreview: text.slice(0, 1200),
      bodyLength: text.length,
      manifestLines: text.split(/\r?\n/).filter(Boolean).slice(0, 250),
      nonTagUris: text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).slice(0, 100),
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

function extractHlsUris(manifest: string, baseUrl: string) {
  const mediaUris = [...manifest.matchAll(/#EXT-X-MEDIA:[^\r\n]*URI="([^"]+\.m3u8(?:\?[^"]*)?)"/gi)]
    .map((m) => withInheritedQuery(m[1], baseUrl));

  const variantUris: string[] = [];
  const lines = manifest.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
      const next = lines.slice(i + 1).find((line) => !line.startsWith('#'));
      if (next) variantUris.push(withInheritedQuery(next, baseUrl));
    }
  }

  return {
    mediaUris: [...new Set(mediaUris)],
    variantUris: [...new Set(variantUris)],
  };
}

function extractFirstSegment(manifest: string, baseUrl: string) {
  const lines = manifest.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (!line.startsWith('#') && !/\.m3u8(?:\?|$)/i.test(line)) {
      return withInheritedQuery(line, baseUrl);
    }
  }
  return null;
}

async function probeSegment(url: string, referer: string) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': '*/*',
        'Range': 'bytes=0-1023',
        'Referer': referer,
        'Origin': 'https://lulust.com',
      },
      redirect: 'follow',
    });
    const bytes = new Uint8Array(await res.arrayBuffer());
    return {
      requestedUrl: url,
      finalUrl: res.url || url,
      status: res.status,
      ok: res.ok,
      contentType: res.headers.get('content-type'),
      contentLength: res.headers.get('content-length'),
      contentRange: res.headers.get('content-range'),
      elapsedMs: Date.now() - started,
      bytesReceived: bytes.byteLength,
      looksBlocked: res.status === 401 || res.status === 403,
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
    <button id="playBtn" class="btn btn-secondary" type="button">▶ Play Test</button>
  </div>
  <div id="status" class="text-muted mt-1" style="min-height:18px;font-size:.85rem"></div>
</div>
<div class="card card-body" style="padding:12px">
  <div class="flex" style="justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px">
    <strong style="font-size:.85rem">Diagnostic Output</strong>
    <button id="copyBtn" class="btn btn-secondary" type="button" disabled>📋 Copy JSON</button>
  </div>
  <pre id="result" style="white-space:pre-wrap;word-break:break-all;font-size:.78rem;line-height:1.55;max-height:70vh;overflow:auto;margin:0">Paste an embed URL and press Test CDN.</pre>
</div>
<script>
const btn=document.getElementById('resolveBtn'), playBtn=document.getElementById('playBtn'), copyBtn=document.getElementById('copyBtn'), input=document.getElementById('embedUrl');
const status=document.getElementById('status'), result=document.getElementById('result');
let lastJson='';
function setStatus(t,ok){status.textContent=t;status.style.color=ok?'#2ecc71':'var(--accent)';}
async function resolve(){
  const url=input.value.trim();
  if(!url){setStatus('Enter a LuluStream embed URL.',false);return;}
  btn.disabled=true; setStatus('Resolving and probing CDN…');
  result.textContent='';
  try{
    const r=await fetch('lulustream_cdn_test.php?url='+encodeURIComponent(url));
    const data=await r.json();
    lastJson=JSON.stringify(data,null,2);
    result.textContent=lastJson;
    copyBtn.disabled=false;
    setStatus(r.ok?'Diagnostic complete ✓':'Diagnostic failed',r.ok);
  }catch(e){result.textContent=String(e);setStatus('Request failed',false);}
  finally{btn.disabled=false;}
}
copyBtn.onclick=async()=>{
  if(!lastJson)return;
  try{
    await navigator.clipboard.writeText(lastJson);
    const old=copyBtn.textContent;
    copyBtn.textContent='✓ Copied';
    setTimeout(()=>copyBtn.textContent=old,1500);
  }catch(e){
    const ta=document.createElement('textarea');
    ta.value=lastJson; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    copyBtn.textContent='✓ Copied';
    setTimeout(()=>copyBtn.textContent='📋 Copy JSON',1500);
  }
};
btn.onclick=resolve;
playBtn.onclick=()=>{const url=input.value.trim();if(url)location.href='lulustream_play.php?url='+encodeURIComponent(url);};
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

    let variant = null;
    let audio = null;
    let segment = null;
    let hls = { mediaUris: [] as string[], variantUris: [] as string[] };

    if (master.ok && master.looksLikeHls) {
      hls = extractHlsUris(master.manifestLines.join('\n'), master.finalUrl);
      if (!hls.variantUris.length && master.nonTagUris?.length) {
        hls.variantUris = master.nonTagUris.filter((uri) => /\.m3u8(?:\?|$)/i.test(uri)).map((uri) => withInheritedQuery(uri, master.finalUrl));
      }

      const variantUrl = hls.variantUris[0];
      if (variantUrl) {
        variant = await probe(variantUrl, resolved.referer);
        if (variant.ok && variant.looksLikeHls) {
          const segmentUrl = extractFirstSegment(variant.manifestLines?.join('\n') || variant.bodyPreview, variant.finalUrl);
          if (segmentUrl) segment = await probeSegment(segmentUrl, resolved.referer);
        }
      }

      const audioUrl = hls.mediaUris[0];
      if (audioUrl) audio = await probe(audioUrl, resolved.referer);
    }

    await session.save(c, lifetime);
    return c.json({
      success: true,
      provider: 'lulustream',
      embedUrl: resolved.embedUrl,
      title: resolved.title,
      cdnHost: new URL(resolved.video.url).hostname,
      master,
      hls,
      variant,
      audio,
      segment,
      extractedTracks: {
        audio: resolved.audio.length,
        subtitles: resolved.subtitles.length,
      },
      diagnosis: !master.ok
        ? 'Master playlist request failed; CDN access is the first failure point.'
        : !master.looksLikeHls
          ? 'Master request succeeded but did not return an HLS playlist.'
          : !hls.variantUris.length
            ? 'Master has no #EXT-X-STREAM-INF video variant; inspect the extracted audio playlists.'
            : !variant?.ok
              ? 'Master is reachable, but the first video variant playlist failed.'
              : !segment?.ok
                ? 'Video variant is reachable, but the first media segment failed.'
                : 'Master → video variant → media segment all respond successfully from the Worker.' 
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


adminLuluStreamRoutes.get('/admin/lulustream_play.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  if (!ctx) return c.redirect(c.env.SITE_URL + '/');
  const { session, lifetime, isOwner, impersonating } = ctx;
  const embedUrl = c.req.query('url');

  if (!embedUrl) {
    await session.save(c, lifetime);
    return c.html('<h1>Missing ?url=</h1>', 400);
  }

  try {
    const resolved = await resolveLuluStream(embedUrl);
    const origin = new URL(c.req.url).origin;
    const playbackUrl = proxyUrl(resolved.video.url, origin);
    const subtitles = resolved.subtitles.map((track) => ({
      ...track,
      url: proxyUrl(track.url, origin),
    }));

    let html = renderAdminHeader({
      siteUrl: c.env.SITE_URL,
      pageTitle: 'LuluStream Playback Test',
      adminPage: 'lulustream_test',
      isOwner,
      impersonating,
    });

    const safeTitle = (resolved.title || 'LuluStream').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch] || ch));

    const player = playerBody({
      title: resolved.title || 'LuluStream',
      epNum: 1,
      currentEpTitle: 'LuluStream Test',
      prevEpNum: null,
      nextEpNum: null,
      watchBase: c.env.SITE_URL + '/watch?anime=0&ep=',
      epNums: [1],
      curEp: 1,
      totalEpsN: 1,
      episodesWatched: 0,
    });

    const audioPanel = `
<div class="card card-body mt-2" style="padding:12px">
  <div style="font-size:.85rem;font-weight:700;margin-bottom:8px">Audio Tracks</div>
  <div id="lulu-audio-tracks" style="display:flex;flex-wrap:wrap;gap:8px">
    <span id="lulu-audio-status" class="text-muted" style="font-size:.8rem">Waiting for HLS audio tracks…</span>
  </div>
</div>
<div class="card card-body mt-2" style="padding:12px">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px">
    <strong style="font-size:.85rem">Resolver JSON</strong>
    <button id="lulu-copy-json" class="btn btn-secondary" type="button">📋 Copy JSON</button>
  </div>
  <pre id="lulu-json" style="white-space:pre-wrap;word-break:break-all;font-size:.76rem;line-height:1.5;max-height:55vh;overflow:auto;margin:0"></pre>
</div>`;

    const safeJson = JSON.stringify({
      success: true,
      provider: 'lulustream',
      embedUrl: resolved.embedUrl,
      title: resolved.title,
      video: resolved.video,
      audio: resolved.audio,
      subtitles: resolved.subtitles,
      referer: resolved.referer,
    });

    html += `
<div class="admin-header">
  <h1>▶ LuluStream Watch Player Test</h1>
</div>
<div class="alert alert-info mb-2" style="font-size:.85rem">
  This is the real AniVault watch player UI. Production <code>watch.ts</code> is untouched.
</div>
<div class="card card-body mb-2">
  <strong>${safeTitle}</strong>
  <div class="text-muted mt-1" style="font-size:.8rem;word-break:break-all">${embedUrl.replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch] || ch))}</div>
</div>
<div id="lulu-player-test" style="width:100%;background:#000;border-radius:12px;overflow:hidden">
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700&family=Exo+2:wght@400;500;600&display=swap" rel="stylesheet">
  <style>${PLAYER_CSS}</style>
  ${player}
</div>
${audioPanel}
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.min.js"></script>
${playerScript(0, 1, c.env.SITE_URL)}
<script>
(function(){
  const source=${JSON.stringify(playbackUrl)};
  const subs=${JSON.stringify(subtitles)};
  const jsonEl=document.getElementById('lulu-json');
  const audioEl=document.getElementById('lulu-audio-tracks');
  const statusEl=document.getElementById('lulu-audio-status');
  const rawJson=${JSON.stringify(safeJson)};
  jsonEl.textContent=JSON.stringify(JSON.parse(rawJson),null,2);

  function renderAudioTracks(tracks){
    audioEl.innerHTML='';
    if(!Array.isArray(tracks)||!tracks.length){
      const empty=document.createElement('span');
      empty.className='text-muted';
      empty.style.fontSize='.8rem';
      empty.textContent='No HLS audio tracks detected.';
      audioEl.appendChild(empty);
      return;
    }
    tracks.forEach((track,i)=>{
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='btn btn-secondary';
      btn.textContent=(track.name||track.lang||('Audio '+(i+1)))+(track.lang?' · '+track.lang.toUpperCase():'');
      btn.dataset.index=String(track.index);
      btn.onclick=function(){
        if(window.SenshiPlayer && window.SenshiPlayer.setAudioTrack(Number(this.dataset.index))){
          [...audioEl.querySelectorAll('button')].forEach(b=>b.classList.remove('btn-primary'));
          this.classList.add('btn-primary');
          statusEl.textContent='Selected: '+(track.name||track.lang||('Audio '+(i+1)));
        }
      };
      if(track.default) btn.classList.add('btn-primary');
      audioEl.appendChild(btn);
    });
    statusEl.textContent=tracks.length+' audio track(s) detected';
  }

  window.addEventListener('anivault:audio-tracks-ready',function(e){
    renderAudioTracks(e.detail && e.detail.tracks ? e.detail.tracks : []);
  });

  document.getElementById('lulu-copy-json')?.addEventListener('click',async function(){
    try{
      await navigator.clipboard.writeText(jsonEl.textContent);
      const old=this.textContent; this.textContent='✓ Copied';
      setTimeout(()=>this.textContent=old,1500);
    }catch(e){}
  });

  if(window.SenshiPlayer){
    window.SenshiPlayer.loadWithSubs(source,subs);
    setTimeout(function(){
      const tracks=window.SenshiPlayer.getAudioTracks ? window.SenshiPlayer.getAudioTracks() : [];
      if(tracks.length) renderAudioTracks(tracks);
    },1000);
  }
})();
</script>`;
    html += renderAdminFooter(c.env.SITE_URL);
    await session.save(c, lifetime);
    return c.html(html);
  } catch (e) {
    await session.save(c, lifetime);
    return c.html(`<h1>LuluStream resolve failed</h1><pre>${String(e).replace(/[&<>]/g, '')}</pre>`, 502);
  }
});
adminLuluStreamRoutes.get('/admin/lulustream_proxy.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  if (!ctx) return c.json({ error: 'Forbidden' }, 403);
  const { session, lifetime } = ctx;
  const rawUrl = c.req.query('url');

  if (!rawUrl) {
    await session.save(c, lifetime);
    return c.json({ error: 'Missing ?url=' }, 400);
  }

  try {
    const target = new URL(rawUrl);
    if (!isAllowedLuluHost(target.hostname)) {
      await session.save(c, lifetime);
      return c.json({ error: 'Target host is not allowed' }, 403);
    }

    const range = c.req.header('Range');
    const headers: Record<string, string> = {
      'User-Agent': UA,
      'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
      'Referer': 'https://lulust.com/',
      'Origin': 'https://lulust.com',
    };
    if (range) headers.Range = range;

    const upstream = await fetch(target.toString(), {
      headers,
      redirect: 'follow',
    });

    const contentType = upstream.headers.get('content-type') || '';
    const isPlaylist = /#EXTM3U|mpegurl/i.test(contentType);

    if (isPlaylist) {
      const manifest = await upstream.text();
      if (!upstream.ok) {
        await session.save(c, lifetime);
        return new Response(manifest, {
          status: upstream.status,
          headers: { 'Content-Type': contentType || 'text/plain; charset=utf-8' },
        });
      }

      const rewritten = rewriteHlsPlaylist(manifest, upstream.url || target.toString(), new URL(c.req.url).origin);
      await session.save(c, lifetime);
      return new Response(rewritten, {
        status: upstream.status,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const responseHeaders = new Headers();
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    responseHeaders.set('Cache-Control', 'no-store');
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    await session.save(c, lifetime);
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (e) {
    await session.save(c, lifetime);
    return c.json({
      error: e instanceof Error ? e.message : String(e),
    }, 502);
  }
});
