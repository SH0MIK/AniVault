// Admin-only experiment: resolve + play a turbovidhls.com/turboviplay.com
// embed straight from this Worker's own network, instead of the Railway
// scraper API. Google throttles/blocks lh3.googleusercontent.com direct
// links (the storage turbovid's fake-HLS wraps) from Railway's IP range —
// this page exists purely to find out whether Cloudflare's egress fares
// any better. Nothing here touches the real watch page or any production
// streaming path; it's a standalone diagnostic tool, admin-gated like
// every other page under /admin/.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { Db } from '../../lib/db';
import { Session } from '../../lib/session';
import { Auth } from '../../lib/auth';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';
import { resolveTurbovidCF, rewriteHlsPlaylistCF } from '../../lib/turbovid-resolver-cf';

export const adminTurbovidRoutes = new Hono<{ Bindings: Env }>();

function proxiedHlsUrl(base: string, url: string, ref?: string): string {
  const refParam = ref ? `&ref=${encodeURIComponent(ref)}` : '';
  return `${base}?url=${encodeURIComponent(url)}${refParam}`;
}

// ── admin/turbovid_test.php — the tester page itself ───────────────────────
adminTurbovidRoutes.get('/admin/turbovid_test.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { session, lifetime, isOwner, impersonating } = ctx;

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Turbovid Tester (CF)', adminPage: 'turbovid_test', isOwner, impersonating });
  html += `
<div class="admin-header"><h1>🧪 Turbovid Tester — Cloudflare Egress</h1></div>
<div class="alert alert-info mb-2" style="font-size:0.85rem;">
  This resolves + proxies entirely from this Worker (Cloudflare's network), not the Railway scraper API.
  It exists to test whether Google's rate-limit on <code>lh3.googleusercontent.com</code> direct links
  (which turbovid's fake-HLS wraps) applies to Cloudflare's egress the same way it does to Railway's.
  Standalone diagnostic — doesn't touch the real watch page.
</div>

<div class="card card-body mb-2">
  <div class="flex" style="gap:10px;flex-wrap:wrap;">
    <input type="text" id="embedUrl" placeholder="https://turbovidhls.com/t/&lt;hash&gt;"
      style="flex:1;min-width:260px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-family:monospace;font-size:0.85rem;padding:10px 12px;">
    <button id="resolveBtn" class="btn btn-primary">Resolve &amp; Play (Proxied)</button>
    <button id="directBtn" class="btn btn-ghost">Play Direct (No Proxy)</button>
  </div>
  <div id="status" class="text-muted mt-1" style="font-size:0.85rem;min-height:18px;"></div>
</div>

<div class="card card-body mb-2" style="padding:0;overflow:hidden;">
  <div id="embedPreview" style="background:#000;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;">
    <span class="text-muted" style="font-size:0.85rem;">Paste an embed URL above and hit Resolve</span>
  </div>
</div>

<div id="embedSubBar" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:1rem;"></div>
<div id="meta" class="text-muted" style="font-family:monospace;font-size:0.78rem;line-height:1.8;word-break:break-all;"></div>

<script src="https://cdn.jsdelivr.net/npm/hls.js@~1/dist/hls.min.js"></script>
<script>
function h(v){return String(v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function setStatus(t,cls){const el=document.getElementById('status');el.textContent=t||'';el.className='text-muted mt-1'+(cls?' '+cls:'');el.style.color=cls==='error'?'var(--accent)':cls==='ok'?'#2ecc71':'';}

function renderSubtitleBar(video, subtitles) {
  const bar = document.getElementById('embedSubBar');
  bar.innerHTML = '';
  const subs = Array.isArray(subtitles) ? subtitles.filter(s => s && s.url) : [];
  if (!subs.length) return;
  subs.forEach((sub, i) => {
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = sub.lang || ('Track ' + (i+1));
    track.srclang = (sub.lang || 'en').slice(0,2).toLowerCase();
    track.src = sub.url;
    video.appendChild(track);
  });
  const setActive = (btn) => bar.querySelectorAll('button').forEach(b => b.classList.toggle('btn-primary', b===btn));
  const offBtn = document.createElement('button');
  offBtn.className = 'btn btn-ghost btn-sm'; offBtn.textContent = 'Off';
  offBtn.onclick = () => { [...video.textTracks].forEach(t => t.mode='disabled'); setActive(offBtn); };
  bar.appendChild(offBtn);
  subs.forEach((sub, i) => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm'; btn.textContent = sub.lang || ('Track ' + (i+1));
    btn.onclick = () => { [...video.textTracks].forEach((t,idx) => t.mode = idx===i?'showing':'disabled'); setActive(btn); };
    bar.appendChild(btn);
  });
  setActive(offBtn);
}

function unwrapFlixSegmentBytes(buf) {
  const bytes = new Uint8Array(buf);
  const isWebp = bytes.length >= 12 && bytes[0]===0x52 && bytes[1]===0x49 && bytes[2]===0x46 && bytes[3]===0x46 && bytes[8]===0x57 && bytes[9]===0x45 && bytes[10]===0x42 && bytes[11]===0x50;
  const isPng = bytes.length >= 8 && bytes[0]===0x89 && bytes[1]===0x50 && bytes[2]===0x4e && bytes[3]===0x47 && bytes[4]===0x0d && bytes[5]===0x0a && bytes[6]===0x1a && bytes[7]===0x0a;
  if (!isWebp && !isPng) return buf;
  const offset = isWebp ? 12 : 8;
  const payload = bytes.slice(offset);
  if (payload[0] === 0x47) return payload.buffer; // already a valid MPEG-TS sync byte, no XOR needed
  const mask = [157,42,241,71,179,142,92,112,166,25,228,59,216,98,15,197];
  for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 15];
  return payload.buffer;
}

// Optional fragment-unwrapping loader retained for debugging unusual
// fake-HLS sources. TurboVid direct playback currently uses hls.js's native
// loader first; the HAR showed no fragment requests with the previous
// forced loader combination, so forcing this loader can hide the real HLS
// scheduling/parsing problem.
class FlixUnwrapLoader {
  constructor(config) { this.config = config; this.stats = { aborted:false, loaded:0, total:0, retry:0, chunkCount:0, bwEstimate:0, loading:{start:0,first:0,end:0}, parsing:{start:0,end:0}, buffering:{start:0,first:0,end:0} }; }
  load(context, config, callbacks) {
    const start = performance.now();
    this._aborted = false;
    fetch(context.url)
      .then((res) => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.arrayBuffer(); })
      .then((buf) => {
        if (this._aborted) return;
        const first = performance.now();
        const unwrapped = unwrapFlixSegmentBytes(buf);
        const end = performance.now();
        this.stats.loading = { start, first, end };
        this.stats.loaded = this.stats.total = unwrapped.byteLength;
        callbacks.onSuccess({ url: context.url, data: unwrapped }, this.stats, context, null);
      })
      .catch((err) => {
        if (this._aborted) return;
        callbacks.onError({ code: 0, text: err.message }, context, null, this.stats);
      });
  }
  abort() { this._aborted = true; }
  destroy() {}
}

// hls.js treats a media playlist without #EXT-X-ENDLIST as a live stream
// and polls forever waiting for new segments — turbovid's inner playlists
// are static/VOD but appear to omit that tag, so hls.js gets stuck at the
// "live edge" replaying the same last few segments forever. Patch it in
// client-side: append ENDLIST to any playlist that has segments
// (#EXTINF) but is missing it. No-op for master/variant playlists (they
// only list #EXT-X-STREAM-INF entries, no #EXTINF, so this never touches
// them) and no-op for a playlist that already has ENDLIST.
class FixEndlistLoader extends Hls.DefaultConfig.loader {
  load(context, config, callbacks) {
    const originalSuccess = callbacks.onSuccess;
    callbacks.onSuccess = (response, stats, ctx, networkDetails) => {
      let data = response.data;
      if (typeof data === 'string' && data.includes('#EXTM3U') && !data.includes('#EXT-X-ENDLIST')) {
        const isMaster = data.includes('#EXT-X-STREAM-INF') || data.includes('#EXT-X-I-FRAME-STREAM-INF');
        const isMedia = data.includes('#EXTINF') ||
          data.includes('#EXT-X-TARGETDURATION') ||
          data.includes('#EXT-X-MEDIA-SEQUENCE') ||
          data.includes('#EXT-X-PART:') ||
          data.includes('#EXT-X-MAP:');
        if (!isMaster && isMedia) {
          data = data.trimEnd() + String.fromCharCode(10) + '#EXT-X-ENDLIST' + String.fromCharCode(10);
          response = { ...response, data };
        }
      }
      originalSuccess(response, stats, ctx, networkDetails);
    };
    super.load(context, config, callbacks);
  }
}

function renderPlayer(data, direct) {
  const ep = document.getElementById('embedPreview');
  document.getElementById('embedSubBar').innerHTML = '';
  if (window._cfHls) { try { window._cfHls.destroy(); } catch(e) {} window._cfHls = null; }

  // Direct mode: hand the browser the RAW m3u8 (turbosplayer.com), no proxy
  // in the loop at all — segments get fetched straight from the viewer's
  // own IP (avoids Google's datacenter-IP 429), and unwrapped client-side
  // via FlixUnwrapLoader since they're disguised as PNG/WebP.
  // Subtitles stay proxied either way — they're small text files, not the
  // thing under test; only the video path matters here.
  const hlsUrl = direct ? data.m3u8 : (data.hlsProxyUrl || data.m3u8);
  if (!hlsUrl) { ep.innerHTML = '<span style="color:var(--accent);font-size:0.85rem;">No m3u8 in the resolved response</span>'; return; }

  ep.innerHTML = '<video id="turbovidCfPreview" controls playsinline crossorigin="anonymous" style="width:100%;height:100%;"></video>';
  const video = document.getElementById('turbovidCfPreview');

  if (window.Hls && Hls.isSupported()) {
    // Start with hls.js' native loaders. The HAR showed that the old
    // custom fragment/playlist loaders never reached a media fragment:
    // the player kept re-requesting a g263 master/media URL instead.
    // Native hls.js handles redirects, byte ranges, init maps, retries,
    // and fragment scheduling correctly. Keep the unwrap code available
    // above for experiments, but do not force it onto TurboVid streams.
    const hlsConfig = { enableWorker: true, backBufferLength: 90, debug: true };
    const hls = new Hls(hlsConfig);
    window._cfHls = hls;
    let retryCount = 0; const MAX_RETRIES = 4;
    hls.loadSource(hlsUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      setStatus('Manifest parsed ✓ — ' + (hls.levels?.length || 0) + ' quality level(s); loading media playlist…', 'ok');
      if (Array.isArray(hls.levels) && hls.levels.length > 0) hls.currentLevel = hls.levels.length - 1;
      video.play().catch(() => {});
    });
    hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
      const details = data?.details;
      const count = details?.fragments?.length || 0;
      const live = details?.live ? 'live' : 'VOD';
      setStatus('Media playlist loaded ✓ — ' + count + ' fragment(s), ' + live + '; waiting for fragment…', 'ok');
    });
    hls.on(Hls.Events.FRAG_LOADING, (_, data) => {
      const url = data?.frag?.url || '';
      setStatus('Loading media fragment… ' + (url ? url.split('/').pop() : ''), 'ok');
    });
    hls.on(Hls.Events.FRAG_LOADED, (_, data) => {
      retryCount = 0;
      const len = data?.payload?.byteLength || 0;
      setStatus('Media fragment loaded ✓' + (len ? ' (' + Math.round(len/1024) + ' KB)' : ''), 'ok');
    });
    hls.on(Hls.Events.ERROR, (event, errData) => {
      const httpStatus = errData && errData.response && errData.response.code;
      if (httpStatus === 429) {
        retryCount++;
        if (retryCount > MAX_RETRIES) { setStatus('Cloudflare egress is ALSO rate-limited (HTTP 429) after ' + MAX_RETRIES + ' retries.', 'error'); try { hls.destroy(); } catch(e) {} return; }
        setStatus('429 from upstream — backing off, retry ' + retryCount + '/' + MAX_RETRIES + '…');
        setTimeout(() => { try { hls.startLoad(); } catch(e) {} }, 2500 * retryCount);
        return;
      }
      if (errData && errData.fatal) {
        console.error('[TurboVid HLS fatal]', errData);
        switch (errData.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            retryCount++;
            if (retryCount > MAX_RETRIES) {
              setStatus((direct
                ? 'Network errors after ' + MAX_RETRIES + ' retries in DIRECT mode (with unwrap loader active) — check console for the actual fetch/decode error.'
                : 'Network errors after ' + MAX_RETRIES + ' retries — giving up.'), 'error');
              try { hls.destroy(); } catch(e) {}
              return;
            }
            setTimeout(() => { try { hls.startLoad(); } catch(e) {} }, 1500 * retryCount);
            break;
          case Hls.ErrorTypes.MEDIA_ERROR: hls.recoverMediaError(); break;
          default: try { hls.destroy(); } catch(e) {} break;
        }
      }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = hlsUrl;
  } else {
    ep.innerHTML = '<span style="color:var(--accent);font-size:0.85rem;">HLS not supported in this browser</span>';
    return;
  }

  renderSubtitleBar(video, data.subtitles);
  document.getElementById('meta').innerHTML =
    '<div><b>Mode:</b> ' + (direct ? 'DIRECT (no proxy — browser fetches from turbosplayer/googleusercontent directly)' : 'PROXIED (through this Worker)') + '</div>' +
    '<div><b>Title:</b> ' + h(data.title || '—') + '</div>' +
    '<div><b>Embed:</b> ' + h(data.embedUrl || '—') + '</div>' +
    '<div><b>m3u8:</b> ' + h(data.m3u8 || '—') + '</div>' +
    '<div><b>Referer used:</b> ' + h(data.referer || '—') + '</div>' +
    '<div><b>Subtitles:</b> ' + ((data.subtitles||[]).length ? data.subtitles.map(s=>h(s.lang)).join(', ') : 'none') + '</div>';
}

document.getElementById('resolveBtn').addEventListener('click', () => resolveEmbed(false));
document.getElementById('directBtn').addEventListener('click', () => resolveEmbed(true));
document.getElementById('embedUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') resolveEmbed(false); });

async function resolveEmbed(direct) {
  const url = document.getElementById('embedUrl').value.trim();
  if (!url) { setStatus('Paste an embed URL first', 'error'); return; }
  const resolveBtn = document.getElementById('resolveBtn');
  const directBtn = document.getElementById('directBtn');
  resolveBtn.disabled = true; directBtn.disabled = true;
  setStatus(direct ? 'Resolving (will play DIRECT, no proxy)…' : 'Resolving via Cloudflare…');
  document.getElementById('meta').innerHTML = '';
  try {
    const res = await fetch('turbovid_resolve.php?url=' + encodeURIComponent(url));
    const data = await res.json();
    if (!res.ok) { setStatus(data.error || ('Request failed (' + res.status + ')'), 'error'); return; }
    setStatus('Resolved ✓' + (direct ? ' — playing direct, watch console for CORS errors' : ''), 'ok');
    renderPlayer(data, direct);
  } catch (e) {
    setStatus('Network error: ' + e.message, 'error');
  } finally {
    resolveBtn.disabled = false; directBtn.disabled = false;
  }
}
</script>`;
  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});

// ── admin/turbovid_resolve.php — resolve embed → m3u8 + subtitles ─────────
adminTurbovidRoutes.get('/admin/turbovid_resolve.php', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  if (!auth.isAdmin()) { await session.save(c, lifetime); return c.json({ error: 'Forbidden' }, 403); }

  const embedUrl = c.req.query('url');
  if (!embedUrl) { await session.save(c, lifetime); return c.json({ error: 'Missing ?url=' }, 400); }
  if (!/^https?:\/\//i.test(embedUrl)) { await session.save(c, lifetime); return c.json({ error: '?url must be absolute http(s)' }, 400); }

  const result = await resolveTurbovidCF(embedUrl);
  await session.save(c, lifetime);
  if (!result) return c.json({ error: 'Failed to resolve turbovid embed' }, 502);
  if (!result.m3u8) return c.json({ error: 'No m3u8 found in embed page', embedUrl, title: result.title }, 502);

  const base = new URL(c.req.url);
  const hlsProxyBase = `${base.origin}/admin/turbovid_hls_proxy.php`;
  const subProxyBase = `${base.origin}/admin/turbovid_subtitle_proxy.php`;

  return c.json({
    embedUrl: result.embedUrl,
    m3u8: result.m3u8,
    hlsProxyUrl: proxiedHlsUrl(hlsProxyBase, result.m3u8, result.referer),
    subtitles: result.subtitles.map((s) => ({ lang: s.lang, url: proxiedHlsUrl(subProxyBase, s.url, result.referer) })),
    poster: result.poster,
    title: result.title,
    referer: result.referer,
    type: result.type,
  });
});

// ── admin/turbovid_hls_proxy.php — proxy m3u8/segments via CF egress ──────
adminTurbovidRoutes.get('/admin/turbovid_hls_proxy.php', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  if (!auth.isAdmin()) { await session.save(c, lifetime); return c.json({ error: 'Forbidden' }, 403); }
  await session.save(c, lifetime);

  const url = c.req.query('url');
  const ref = c.req.query('ref');
  if (!url) return c.json({ error: 'Missing ?url=' }, 400);
  if (!/^https?:\/\//i.test(url)) return c.json({ error: '?url must be absolute http(s)' }, 400);

  try {
    const range = c.req.header('range');
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
        Accept: '*/*',
        ...(ref ? { Referer: ref } : {}),
        ...(range ? { Range: range } : {}),
      },
    });

    if (!upstream.ok && upstream.status !== 206) {
      return c.json({ error: 'Upstream fetch failed', status: upstream.status }, (upstream.status as any) || 502);
    }

    const contentType = upstream.headers.get('content-type') || '';
    const isPlaylist = url.includes('.m3u8') || contentType.toLowerCase().includes('mpegurl');

    if (isPlaylist) {
      const text = await upstream.text();
      if (!text.trim().startsWith('#EXTM3U')) {
        return c.json({ error: 'Upstream did not return a valid m3u8 playlist', body: text.slice(0, 300) }, 502);
      }
      const base = new URL(c.req.url);
      const rewritten = rewriteHlsPlaylistCF(`${base.origin}/admin/turbovid_hls_proxy.php`, text, url, ref ?? undefined);
      return new Response(rewritten, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      });
    }

    const body = await upstream.arrayBuffer();
    const headers: Record<string, string> = {
      'Content-Type': contentType || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=30',
    };
    const acceptRanges = upstream.headers.get('accept-ranges');
    const contentRange = upstream.headers.get('content-range');
    if (acceptRanges) headers['Accept-Ranges'] = acceptRanges;
    if (contentRange) headers['Content-Range'] = contentRange;

    return new Response(body, { status: upstream.status, headers });
  } catch (e: any) {
    return c.json({ error: 'HLS proxy failed', detail: e?.message || String(e) }, 502);
  }
});

// ── admin/turbovid_subtitle_proxy.php — proxy .vtt with open CORS ─────────
adminTurbovidRoutes.get('/admin/turbovid_subtitle_proxy.php', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  if (!auth.isAdmin()) { await session.save(c, lifetime); return c.json({ error: 'Forbidden' }, 403); }
  await session.save(c, lifetime);

  const url = c.req.query('url');
  const ref = c.req.query('ref');
  if (!url) return c.json({ error: 'Missing ?url=' }, 400);

  try {
    const upstream = await fetch(url, { headers: ref ? { Referer: ref } : {} });
    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'text/vtt',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e: any) {
    return c.json({ error: 'Subtitle proxy failed', detail: e?.message || String(e) }, 502);
  }
});
