export function watchScript1(params: {
  anilistId: number | null; epNum: number; resumeParam: number; animeId: number;
  siteUrl: string; qSub: any[]; qDub: any[]; isLoggedIn: boolean;
}): string {
  const { anilistId, epNum, resumeParam, animeId, siteUrl, qSub, qDub, isLoggedIn } = params;
  return `<script>
console.log('[AniVault player] SCRIPT VERSION: debug-v3 (video lifecycle logging)');
const anilistId = ${JSON.stringify(anilistId)};
const epNum = ${epNum};
const resumeTime = ${resumeParam};
const ANIME_ID = ${animeId};
const SITE_URL = '${siteUrl}';
let currentServer = 'animeheaven';
let currentAudio  = 'sub';

// If the browser restores this page from the back/forward cache (bfcache),
// no script re-runs and the player is left holding whatever half-dead
// state it was in when the user left — which can look identical to the
// "reload shows an endless spinner" symptom. Force a real reload so every
// visit always starts from a clean, freshly-fetched state.
window.addEventListener('pageshow', function (e) {
    if (e.persisted) location.reload();
});

// ── AnimeHeaven request de-duplication ────────────────────────────────────
// AnimeHeaven hands out a single-use session token per request — fetching
// it twice for the same audio track (once to probe it, once to actually
// load it) invalidates the first one, which is what caused "plays, then
// errors/stalls a moment later". This used to be guarded by a fragile
// 8-second timing window; that guess held up on a cold first load but
// missed on reload once connections were warm and the two calls raced
// each other. This guarantees only ONE real network request per audio
// track is ever in flight or recently completed — anything else (the
// probe, the activation, a retry) just reuses it.
window._animeheavenReq = window._animeheavenReq || {};
function fetchAnimeHeavenOnce(audio) {
    const store = window._animeheavenReq;
    const rec = store[audio];
    if (rec && (rec.pending || (Date.now() - rec.ts) < 8000)) return rec.promise;
    const newRec = { pending: true, ts: Date.now(), promise: null };
    newRec.promise = fetch(\`\${SITE_URL}/api/animeheaven_stream.php?anime=\${ANIME_ID}&ep=\${epNum}&audio=\${audio}\`)
        .then(r => r.json())
        .then(d => { newRec.pending = false; newRec.ts = Date.now(); return d; })
        .catch(e => { newRec.pending = false; newRec.ts = Date.now(); throw e; });
    store[audio] = newRec;
    return newRec.promise;
}

// ── Visible error surfacing ──────────────────────────────────────────────
// Any uncaught JS error used to just leave the "Finding the best server..."
// skeleton spinning forever with zero feedback. This writes the real error
// straight into that box (and the console) so a broken deploy is obvious
// instead of looking identical to a slow/dead backend.
function _showFatalClientError(msg) {
    console.error('[AniVault player]', msg);
    var fs = document.getElementById('wp-finding-server');
    if (fs) {
        fs.innerHTML = '<div class="wpfs-text" style="color:#7c3aed;max-width:320px;text-align:center;">Player script error:<br><span style="font-size:0.8em;opacity:.85;">' + String(msg).replace(/</g,'&lt;') + '</span></div>';
    }
    var pw = document.getElementById('watch-player-wrap');
    if (pw && !fs) {
        pw.innerHTML = '<div style="padding:1rem;color:#7c3aed;text-align:center;">Player script error: ' + String(msg).replace(/</g,'&lt;') + '</div>';
    }
}
window.addEventListener('error', function(e) {
    _showFatalClientError((e && e.message) || 'Unknown script error');
});

function buildMegaplayUrl(audio) {
    let url = \`https://megaplay.buzz/stream/mal/${animeId}/${epNum}/\${audio}\`;
    if (resumeTime) url += \`?t=\${resumeTime}\`;
    return url;
}

// Stops whatever is currently playing so its audio can't keep going in
// the background while we fetch the next server (or while an error is
// shown because the fetch failed). Call this FIRST, before doing
// anything else, in every switchTo* function.
function stopCurrentVideo() {
    const vid = document.getElementById('sp-video');
    if (vid) {
        try { vid.pause(); } catch(e) {}
        vid.removeAttribute('src');
        try { vid.load(); } catch(e) {}
    }
    if (window.SenshiPlayer && window.SenshiPlayer.destroy) {
        try { window.SenshiPlayer.destroy(); } catch(e) {}
    }
}

function updateActiveServerButton(serverName, audio) {
    document.querySelectorAll('.server-btn').forEach(b => b.classList.remove('active'));
    // Only activate buttons inside the matching tab panel
    const panel = document.getElementById('tab-panel-' + audio);
    if (!panel) return;
    const btn = panel.querySelector(\`.server-btn[data-server="\${serverName}"]\`);
    if (btn) btn.classList.add('active');
}

// ── AnimeHeaven (MP4 via fetch, plays in the custom player) ──────────────
function switchToAnimeHeaven(audio) {
    const pw = document.getElementById('watch-player-wrap');
    if (!pw) return;

    // Stop whatever's currently playing FIRST so its audio doesn't keep
    // running underneath the loading spinner / error state below.
    stopCurrentVideo();

    // Detach player node first so innerHTML='' doesn't destroy it
    const sp = document.getElementById('senshi-player-root');
    if (sp && sp.parentNode) sp.parentNode.removeChild(sp);

    pw.style.opacity = '0';
    if (pw._senshiHls) { pw._senshiHls.destroy(); pw._senshiHls = null; }

    // Restore shell to player mode
    pw.style.aspectRatio  = 'unset';
    pw.style.overflow     = 'visible';
    pw.style.background   = 'transparent';
    pw.style.borderRadius = '14px';
    pw.innerHTML = '';

    // Show a loading state in the player
    if (sp) {
        sp.style.cssText = 'display:block;width:100%;';
        pw.appendChild(sp);
    }
    pw.style.opacity = '1';

    // Show spinner in player while fetching
    if (window.SenshiPlayer) {
        // Signal player to show loading spinner
        const spinEl = document.getElementById('sp-spinner');
        if (spinEl) spinEl.classList.remove('hide');
        const errEl = document.getElementById('sp-error');
        if (errEl) errEl.classList.remove('show');
        const preplay = document.getElementById('sp-preplay');
        if (preplay) preplay.classList.add('hide');
    }

    function applyAnimeHeavenResult(d) {
        console.log('[AniVault player] applying AnimeHeaven result', d);
        function fail(msg) {
            console.error('[AniVault player] AnimeHeaven FAIL:', msg, '| readyState=' + vid.readyState, 'networkState=' + vid.networkState, 'currentTime=' + vid.currentTime, 'error=' + JSON.stringify(vid.error && { code: vid.error.code, message: vid.error.message }));
            const errMsg = document.getElementById('sp-err-msg');
            if (errMsg) errMsg.textContent = msg;
            const errEl = document.getElementById('sp-error');
            if (errEl) errEl.classList.add('show');
            const spinEl = document.getElementById('sp-spinner');
            if (spinEl) spinEl.classList.add('hide');
        }
        if (d.error || !d.mp4) {
            fail(d.error ? \`AnimeHeaven: \${d.error}\` : 'No stream URL returned.');
            return;
        }
        // Load MP4 directly into the custom player's video element
        const vid = document.getElementById('sp-video');
        if (!vid) { fail('Player element missing (sp-video not found).'); return; }

        // The spinner used to get hidden immediately after vid.src was set,
        // regardless of whether the media actually loaded — so a CORS
        // block, a 403 from the proxy, or a decode error looked identical
        // to "it's playing" (paused-looking black frame, no error, no
        // spinner). These listeners tie the spinner/error UI to what the
        // <video> element itself reports instead of firing blind.
        let settled = false;
        let stallTimer = null;
        function clearStallTimer() { if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; } }
        function cleanup() {
            clearStallTimer();
            vid.removeEventListener('playing', onPlaying);
            vid.removeEventListener('error', onError);
            vid.removeEventListener('waiting', onWaiting);
            vid.removeEventListener('stalled', onWaiting);
            vid.removeEventListener('timeupdate', clearStallTimer);
            vid.removeEventListener('playing', clearStallTimer);
        }
        const onPlaying = () => {
            console.log('[AniVault player] AnimeHeaven <video> "playing" fired — playback started OK');
            settled = true; spinEl_hide(); cleanupErrorOnly();
            const preplayEl = document.getElementById('sp-preplay');
            if (preplayEl) preplayEl.classList.add('hide');
        };
        function cleanupErrorOnly() { vid.removeEventListener('error', onError); }
        const onError = () => {
            console.error('[AniVault player] AnimeHeaven <video> "error" event fired, settled=' + settled);
            if (!settled) {
                const code = vid.error ? vid.error.code : 0;
                fail('AnimeHeaven: video failed to load (code ' + code + '). The proxy link may be dead/expired or blocked by CORS — try another server.');
            } else {
                fail('AnimeHeaven: video stalled and did not recover. Try another server.');
            }
            cleanup();
        };
        // Once playback genuinely starts, a 'waiting'/'stalled' event that
        // never resolves (no 'playing' or 'timeupdate' within 10s) means
        // the underlying MP4 link died mid-stream — surface that instead
        // of leaving the spinner running forever.
        const onWaiting = () => {
            console.log('[AniVault player] AnimeHeaven <video> "waiting/stalled" fired, settled=' + settled + ', readyState=' + vid.readyState);
            if (!settled) return; // still in the initial start-up phase, handled by onError's 12s check below
            clearStallTimer();
            stallTimer = setTimeout(() => {
                console.error('[AniVault player] AnimeHeaven stall watchdog fired — no recovery within 10s');
                fail('AnimeHeaven: video stalled and did not recover. Try another server.');
                cleanup();
            }, 10000);
        };
        function spinEl_hide() {
            const spinEl = document.getElementById('sp-spinner');
            if (spinEl) spinEl.classList.add('hide');
        }
        vid.addEventListener('playing', onPlaying);
        vid.addEventListener('error', onError);
        vid.addEventListener('waiting', onWaiting);
        vid.addEventListener('stalled', onWaiting);
        vid.addEventListener('timeupdate', clearStallTimer);
        vid.addEventListener('playing', clearStallTimer);
        vid.addEventListener('loadstart', () => console.log('[AniVault player] <video> loadstart'));
        vid.addEventListener('loadedmetadata', () => console.log('[AniVault player] <video> loadedmetadata, duration=' + vid.duration));
        vid.addEventListener('canplay', () => console.log('[AniVault player] <video> canplay, readyState=' + vid.readyState));
        setTimeout(() => {
            console.log('[AniVault player] 12s start-up check: settled=' + settled + ', readyState=' + vid.readyState + ', networkState=' + vid.networkState + ', currentTime=' + vid.currentTime);
            if (!settled && vid.readyState === 0) onError();
        }, 12000);

        console.log('[AniVault player] setting <video> src to AnimeHeaven proxy URL and calling play()');
        vid.src = d.mp4;
        vid.load();
        vid.play().then(() => {
            console.log('[AniVault player] <video>.play() promise resolved');
        }).catch(err => {
            console.error('[AniVault player] <video>.play() promise rejected:', err && err.name, err && err.message);
            // Browsers block programmatic autoplay unless the page has
            // recent user-gesture context — on a fresh navigation the tap
            // that got you here counts, but on a reload that context is
            // gone, so play() gets rejected even though the video is fully
            // loaded and ready (readyState 4). Previously nothing handled
            // this: the spinner only hid on the 'playing' event, which
            // never fires if play() never actually starts — so it just
            // spun forever with a perfectly good video sitting paused
            // underneath. Surface the (already-built, previously unused)
            // tap-to-play overlay instead.
            if (err && err.name === 'NotAllowedError') {
                spinEl_hide();
                const preplayEl = document.getElementById('sp-preplay');
                const ppBtn = document.getElementById('sp-pp-btn');
                if (preplayEl) {
                    preplayEl.classList.remove('hide');
                    const startPlayback = () => {
                        vid.play().then(() => {
                            console.log('[AniVault player] tap-to-play succeeded');
                        }).catch(err2 => {
                            console.error('[AniVault player] tap-to-play also failed:', err2 && err2.name, err2 && err2.message);
                        });
                    };
                    (ppBtn || preplayEl).addEventListener('click', startPlayback, { once: true });
                }
            }
        });
        // Hide HLS badge since this is MP4
        const badge = document.getElementById('sp-hls-badge');
        if (badge) badge.textContent = 'MP4';
    }

    // Fetch MP4 URL — goes through fetchAnimeHeavenOnce so this always
    // reuses the probe's in-flight/recent request instead of firing a
    // second one, no matter how the timing lines up on this particular load.
    fetchAnimeHeavenOnce(audio)
        .then(applyAnimeHeavenResult)
        .catch(() => {
            const errMsg = document.getElementById('sp-err-msg');
            if (errMsg) errMsg.textContent = 'Could not reach stream server.';
            const errEl = document.getElementById('sp-error');
            if (errEl) errEl.classList.add('show');
            const spinEl = document.getElementById('sp-spinner');
            if (spinEl) spinEl.classList.add('hide');
        });
}

// ── Anikoto (HLS via fetch for a specific provider, with subtitles) ──────
function switchToAnikoto(providerName, audio) {
    const pw = document.getElementById('watch-player-wrap');
    if (!pw) return;

    // Stop whatever's currently playing FIRST so its audio doesn't keep
    // running underneath the loading spinner / error state below.
    stopCurrentVideo();

    const sp = document.getElementById('senshi-player-root');
    if (sp && sp.parentNode) sp.parentNode.removeChild(sp);

    pw.style.opacity = '0';

    pw.style.aspectRatio  = 'unset';
    pw.style.overflow     = 'visible';
    pw.style.background   = 'transparent';
    pw.style.borderRadius = '14px';
    pw.innerHTML = '';

    if (sp) {
        sp.style.cssText = 'display:block;width:100%;';
        pw.appendChild(sp);
    }
    pw.style.opacity = '1';

    if (window.SenshiPlayer) window.SenshiPlayer.destroy();
    const spinEl = document.getElementById('sp-spinner');
    if (spinEl) spinEl.classList.remove('hide');
    const errEl = document.getElementById('sp-error');
    if (errEl) errEl.classList.remove('show');
    const preplay = document.getElementById('sp-preplay');
    if (preplay) preplay.classList.add('hide');
    const badge = document.getElementById('sp-hls-badge');
    if (badge) badge.textContent = 'HLS';

    function applyAnikotoResult(d) {
        if (d.error || !d.m3u8) {
            const errMsg = document.getElementById('sp-err-msg');
            if (errMsg) errMsg.textContent = d.error ? \`Anikoto (\${providerName}): \${d.error}\` : 'No stream URL returned.';
            if (errEl) errEl.classList.add('show');
            if (spinEl) spinEl.classList.add('hide');
            return;
        }
        // Anikoto's stream doesn't embed subtitles in the m3u8 itself
        // (unlike Senshi) — they come back as a separate \`subtitles\`
        // array that has to be attached as external <track> elements.
        if (window.SenshiPlayer && window.SenshiPlayer.loadWithSubs) {
            window.SenshiPlayer.loadWithSubs(d.m3u8, d.subtitles || []);
        } else if (window.SenshiPlayer) {
            window.SenshiPlayer.load(d.m3u8);
        } else {
            const vid = document.getElementById('sp-video');
            if (vid) { vid.src = d.m3u8; vid.load(); vid.play().catch(()=>{}); }
        }
    }

    // Reuse the probe's response if we have one from the last few
    // seconds, instead of hitting the scraper again for the same
    // provider — requesting the same provider twice back-to-back is
    // what was causing "plays, then errors a moment later" (the embed
    // host invalidating a session/token it just handed out).
    window._anikotoCache = window._anikotoCache || {};
    const cacheKey = audio + '::' + providerName;
    const cached = window._anikotoCache[cacheKey];
    if (cached && (Date.now() - cached.ts) < 8000) {
        delete window._anikotoCache[cacheKey];
        applyAnikotoResult(cached.data);
        return;
    }

    fetch(\`${siteUrl}/api/anikoto_stream.php?anime=${animeId}&ep=${epNum}&audio=\${audio}&server=\${encodeURIComponent(providerName)}\`)
        .then(r => r.json())
        .then(applyAnikotoResult)
        .catch(() => {
            const errMsg = document.getElementById('sp-err-msg');
            if (errMsg) errMsg.textContent = 'Could not reach stream server.';
            if (errEl) errEl.classList.add('show');
            if (spinEl) spinEl.classList.add('hide');
        });
}

// ── DesiDub (Hindi Dub HLS/MP4, or raw embed-only sources) ────────────────
// realType is 'dub' (VidMoly/StreamRuby/Mirror/other HLS-capable hosts) or
// 'raw' (embed-only hosts like Abyss/CLOUD the scraper couldn't resolve to
// a direct stream — those get dropped straight into a plain iframe below
// instead of the custom SenshiPlayer).
function switchToDesidub(providerName, realType) {
    const pw = document.getElementById('watch-player-wrap');
    if (!pw) return;

    stopCurrentVideo();

    const sp = document.getElementById('senshi-player-root');
    if (sp && sp.parentNode) sp.parentNode.removeChild(sp);

    pw.style.opacity = '0';
    pw.style.aspectRatio  = 'unset';
    pw.style.overflow     = 'visible';
    pw.style.background   = 'transparent';
    pw.style.borderRadius = '14px';
    pw.innerHTML = '';

    if (sp) {
        sp.style.cssText = 'display:block;width:100%;';
        pw.appendChild(sp);
    }
    pw.style.opacity = '1';

    if (window.SenshiPlayer) window.SenshiPlayer.destroy();
    const spinEl = document.getElementById('sp-spinner');
    if (spinEl) spinEl.classList.remove('hide');
    const errEl = document.getElementById('sp-error');
    if (errEl) errEl.classList.remove('show');
    const preplay = document.getElementById('sp-preplay');
    if (preplay) preplay.classList.add('hide');

    function fail(msg) {
        const errMsg = document.getElementById('sp-err-msg');
        if (errMsg) errMsg.textContent = msg;
        if (errEl) errEl.classList.add('show');
        if (spinEl) spinEl.classList.add('hide');
    }

    function applyDesidubResult(d) {
        if (d.error) { fail(\`DesiDub (\${providerName}): \${d.error}\`); return; }

        // Raw/embed-only source — no direct stream was extracted, so this
        // one plays back as a real iframe instead of the custom player.
        if (d.iframeOnly && d.embedUrl) {
            pw.innerHTML = \`<iframe id="main-player-iframe" src="\${d.embedUrl}" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share" allowfullscreen loading="lazy"></iframe>\`;
            pw.style.opacity = '1';
            return;
        }

        const badge = document.getElementById('sp-hls-badge');
        if (d.m3u8) {
            if (badge) badge.textContent = 'HLS';
            if (window.SenshiPlayer && window.SenshiPlayer.loadWithSubs) {
                window.SenshiPlayer.loadWithSubs(d.m3u8, d.subtitles || []);
            } else if (window.SenshiPlayer) {
                window.SenshiPlayer.load(d.m3u8);
            } else {
                const vid = document.getElementById('sp-video');
                if (vid) { vid.src = d.m3u8; vid.load(); vid.play().catch(() => {}); }
            }
            return;
        }
        if (d.mp4) {
            if (badge) badge.textContent = 'MP4';
            const vid = document.getElementById('sp-video');
            if (!vid) { fail('Player element missing (sp-video not found).'); return; }
            vid.src = d.mp4;
            vid.load();
            vid.play().catch(err => {
                if (err && err.name === 'NotAllowedError') {
                    if (spinEl) spinEl.classList.add('hide');
                    const preplayEl = document.getElementById('sp-preplay');
                    const ppBtn = document.getElementById('sp-pp-btn');
                    if (preplayEl) {
                        preplayEl.classList.remove('hide');
                        (ppBtn || preplayEl).addEventListener('click', () => vid.play().catch(() => {}), { once: true });
                    }
                }
            });
            return;
        }
        fail('No stream URL returned.');
    }

    // Same reuse-the-probe-response pattern as Anikoto — avoids requesting
    // the same provider twice back-to-back right after the probe found it.
    window._desidubCache = window._desidubCache || {};
    const cacheKey = realType + '::' + providerName.toLowerCase().trim();
    const cached = window._desidubCache[cacheKey];
    if (cached && (Date.now() - cached.ts) < 8000) {
        delete window._desidubCache[cacheKey];
        applyDesidubResult(cached.data);
        return;
    }

    fetch(\`${siteUrl}/api/desidub_stream.php?anime=${animeId}&ep=${epNum}&audio=\${realType}&server=\${encodeURIComponent(providerName)}\`)
        .then(r => r.json())
        .then(applyDesidubResult)
        .catch(() => fail('Could not reach stream server.'));
}

// ── Dynamic quality switcher ──────────────────────────────────────────────
// Only shown when the active server exposed more than one resolution
// (the sources with a single adaptive HLS master rarely need this — it's
// mainly AniWaves/AniZone/WatchAnimeWorld/ReAnime/DesiDub, which can hand
// back separate per-resolution URLs). Index 0 is always already the
// highest quality (sorted server-side) and is what's playing by default;
// this just lets you drop down from it.
function clearDynQualityRow() {
    const row = document.getElementById('dyn-quality-row');
    if (row) row.remove();
}
function renderQualityRow(qualities, onPick) {
    clearDynQualityRow();
    if (!qualities || qualities.length < 2) return;
    const panel = document.getElementById('server-grid');
    if (!panel || !panel.parentNode) return;
    const row = document.createElement('div');
    row.id = 'dyn-quality-row';
    row.className = 'wp-quality-row';
    const lbl = document.createElement('span');
    lbl.className = 'wpc-label';
    lbl.textContent = 'Quality';
    row.appendChild(lbl);
    const wrap = document.createElement('div');
    wrap.className = 'wpc-quals';
    qualities.forEach((q, i) => {
        const b = document.createElement('button');
        b.className = 'wpc-q' + (i === 0 ? ' on' : '');
        b.textContent = q.label || ('Q' + (i + 1));
        b.addEventListener('click', function() {
            wrap.querySelectorAll('.wpc-q').forEach(x => x.classList.remove('on'));
            b.classList.add('on');
            onPick(q);
        });
        wrap.appendChild(b);
    });
    row.appendChild(wrap);
    panel.parentNode.insertBefore(row, panel);
}

// ── ReAnime / AnimeNoSub / AniWaves / AniZone / WatchAnimeWorld ───────────
// Playback rendering is shared (identical HLS/MP4/iframe/quality-switcher
// logic regardless of source) but the actual network calls now go straight
// to each source's own dedicated *_stream.php route and its own cache
// namespace — no shared source_stream.php dispatch endpoint anymore.
const STREAM_ENDPOINT = {
    reanime: 'reanime_stream.php',
    animenosub: 'animenosub_stream.php',
    aniwaves: 'aniwaves_stream.php',
    anizone: 'anizone_stream.php',
    watchanimeworld: 'watchanimeworld_stream.php',
};
function switchToGenericSource(source, providerName, realType, langKey) {
    const pw = document.getElementById('watch-player-wrap');
    if (!pw) return;

    stopCurrentVideo();
    clearDynQualityRow();

    const sp = document.getElementById('senshi-player-root');
    if (sp && sp.parentNode) sp.parentNode.removeChild(sp);

    pw.style.opacity = '0';
    pw.style.aspectRatio  = 'unset';
    pw.style.overflow     = 'visible';
    pw.style.background   = 'transparent';
    pw.style.borderRadius = '14px';
    pw.innerHTML = '';

    if (sp) {
        sp.style.cssText = 'display:block;width:100%;';
        pw.appendChild(sp);
    }
    pw.style.opacity = '1';

    if (window.SenshiPlayer) window.SenshiPlayer.destroy();
    const spinEl = document.getElementById('sp-spinner');
    if (spinEl) spinEl.classList.remove('hide');
    const errEl = document.getElementById('sp-error');
    if (errEl) errEl.classList.remove('show');
    const preplay = document.getElementById('sp-preplay');
    if (preplay) preplay.classList.add('hide');

    function fail(msg) {
        const errMsg = document.getElementById('sp-err-msg');
        if (errMsg) errMsg.textContent = msg;
        if (errEl) errEl.classList.add('show');
        if (spinEl) spinEl.classList.add('hide');
    }

    function loadUrl(url, isMp4, subs) {
        const badge = document.getElementById('sp-hls-badge');
        if (isMp4) {
            if (badge) badge.textContent = 'MP4';
            const vid = document.getElementById('sp-video');
            if (!vid) { fail('Player element missing (sp-video not found).'); return; }
            vid.src = url;
            vid.load();
            vid.play().catch(err => {
                if (err && err.name === 'NotAllowedError') {
                    if (spinEl) spinEl.classList.add('hide');
                    const preplayEl = document.getElementById('sp-preplay');
                    const ppBtn = document.getElementById('sp-pp-btn');
                    if (preplayEl) {
                        preplayEl.classList.remove('hide');
                        (ppBtn || preplayEl).addEventListener('click', () => vid.play().catch(() => {}), { once: true });
                    }
                }
            });
            return;
        }
        if (badge) badge.textContent = 'HLS';
        if (window.SenshiPlayer && window.SenshiPlayer.loadWithSubs) {
            window.SenshiPlayer.loadWithSubs(url, subs || []);
        } else if (window.SenshiPlayer) {
            window.SenshiPlayer.load(url);
        } else {
            const vid = document.getElementById('sp-video');
            if (vid) { vid.src = url; vid.load(); vid.play().catch(() => {}); }
        }
    }

    function applyResult(d) {
        if (d.error) { fail(\`\${source} (\${providerName}): \${d.error}\`); return; }

        if (d.iframeOnly && d.embedUrl) {
            pw.innerHTML = \`<iframe id="main-player-iframe" src="\${d.embedUrl}" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share" allowfullscreen loading="lazy"></iframe>\`;
            pw.style.opacity = '1';
            return;
        }

        const subs = d.subtitles || [];
        // Already sorted highest-first server-side — [0] is "top quality as
        // top priority", the rest populate the manual switcher below.
        const qualities = Array.isArray(d.qualities) ? d.qualities : [];
        const top = qualities.length ? (qualities[0].hlsProxyUrl || qualities[0].url) : null;
        const initialUrl = top || d.m3u8 || d.mp4;
        const initialIsMp4 = !!(!top && d.mp4 && !d.m3u8);

        if (!initialUrl) { fail('No stream URL returned.'); return; }
        loadUrl(initialUrl, initialIsMp4, subs);

        if (qualities.length > 1) {
            renderQualityRow(qualities, function(q) {
                const url = q.hlsProxyUrl || q.url;
                if (url) loadUrl(url, false, subs);
            });
        }
    }

    // Per-source cache namespace (window._reanimeCache, window._anizoneCache,
    // etc.) — set by that source's own checkXProvider function below, keyed
    // the same way there and here so a successful probe can be reused
    // without firing a second identical request at the embed host.
    const cacheKey = [realType, langKey || '', providerName.toLowerCase().trim()].join('::');
    const cacheName = '_' + source + 'Cache';
    window[cacheName] = window[cacheName] || {};
    const cached = window[cacheName][cacheKey];
    if (cached && (Date.now() - cached.ts) < 8000) {
        delete window[cacheName][cacheKey];
        applyResult(cached.data);
        return;
    }

    const endpoint = STREAM_ENDPOINT[source];
    let url = \`${siteUrl}/api/\${endpoint}?anime=${animeId}&ep=${epNum}&audio=\${realType}&server=\${encodeURIComponent(providerName)}\`;
    if (langKey) url += \`&lang=\${encodeURIComponent(langKey)}\`;
    fetch(url)
        .then(r => r.json())
        .then(applyResult)
        .catch(() => fail('Could not reach stream server.'));
}

// Note: the old key-based switchToServer(serverName, audio) dispatcher and
// its retryCurrentServer hook used to live here. Both are now defined
// inside probeAndRenderServers below as playSource()/window.retryCurrentServer
// — buttons are fixed source names now ('anizone', 'anikoto', ...) instead
// of dynamic provider-embedded keys, and every button carries its own
// fallback-to-another-source logic that this simpler dispatcher didn't need
// to know about.

// Gate buttons — sign in / join popup
['wg-play','wg-play2'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', function() { requireLogin('login'); });
});
['wg-signin','wg-signin2'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', function() { requireLogin('login'); });
});
['wg-signup','wg-signup2'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', function() { requireLogin('signup'); });
});

// ── Tab switching ─────────────────────────────────────────────────────────
document.querySelectorAll('.server-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.server-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.server-tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-panel-' + tab.dataset.tab)?.classList.add('active');
    });
});

// ── Every server button is now fixed and permanent ───────────────────────
// Old behaviour: a button only ever appeared once its own probe proved it
// worked — so one flaky check anywhere meant that server just silently
// never showed up ("servers keep missing"). New behaviour: every button in
// watch.ts is rendered up front and never removed. Each source is searched
// for this anime/episode independently and in parallel in the background.
// If a button's OWN source doesn't have this episode, that button quietly
// plays whatever OTHER source does have it instead — the button itself
// (its label, its position, the fact that it's the one showing "active")
// never changes. Multi Dub is the one exception: those buttons are still
// discovered dynamically and never substitute one language for another,
// since a silent language swap would be actively misleading.
(function probeAndRenderServers() {
    // The server tab panels only exist for logged-in users with a video
    // (see the Auth::check() && ($video || $megaplayEmbed) guard above).
    // For everyone else #watch-player-wrap holds the sign-in gate — don't
    // touch it, and don't bother hitting the (auth-gated) stream endpoints.
    if (!document.getElementById('tab-panel-sub') && !document.getElementById('tab-panel-dub')) return;

  try {
    const SITE  = '${siteUrl}';
    const ANIME = ${animeId};
    const EP    = ${epNum};
    console.log('[AniVault player] probing servers on', SITE, 'anime', ANIME, 'ep', EP);

    // Plain fetch() has no timeout — force a hard ceiling per request so a
    // hung upstream host can't leave that one source stuck "checking"
    // forever while every other button has long since settled.
    function fetchJsonTimeout(url, ms = 15000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ms);
        return fetch(url, { signal: controller.signal }).then(r => r.json()).finally(() => clearTimeout(timer));
    }

    const ENDPOINT = {
        anikoto: 'anikoto_stream.php',
        reanime: 'reanime_stream.php',
        animenosub: 'animenosub_stream.php',
        aniwaves: 'aniwaves_stream.php',
        anizone: 'anizone_stream.php',
        watchanimeworld: 'watchanimeworld_stream.php',
    };
    const SOURCE_LABELS = {
        anizone: 'AniZone', anikoto: 'Anikoto', animeheaven: 'AnimeHeaven',
        reanime: 'ReAnime', aniwaves: 'AniWaves', watchanimeworld: 'WatchAnimeWorld',
        animenosub: 'AnimeNoSub', desidub: 'DesiDub',
    };

    function langBucket(lang) {
        const l = (lang || '').toLowerCase();
        if (/^en|eng|english/.test(l)) return 'en';
        if (/^hi|hin|hindi/.test(l)) return 'hindi';
        return 'multi';
    }
    function prettyLang(lang) {
        const l = (lang || '').toLowerCase();
        const known = { eng: 'English', en: 'English', hin: 'Hindi', hi: 'Hindi', tam: 'Tamil', ta: 'Tamil', tel: 'Telugu', te: 'Telugu', mal: 'Malayalam', ml: 'Malayalam', kan: 'Kannada', kn: 'Kannada', spa: 'Spanish', es: 'Spanish', ger: 'German', deu: 'German', de: 'German', por: 'Portuguese', pt: 'Portuguese', fre: 'French', fra: 'French', fr: 'French', ita: 'Italian', it: 'Italian', tha: 'Thai', th: 'Thai' };
        return known[l] || (lang ? lang.charAt(0).toUpperCase() + lang.slice(1) : 'Dub');
    }

    // Fetch a source's provider list, with retry — shared by every generic
    // source (Anikoto/ReAnime/AniWaves/AniZone/WatchAnimeWorld).
    function fetchList(source, realAudio, attempt = 1) {
        return fetchJsonTimeout(\`\${SITE}/api/\${ENDPOINT[source]}?anime=\${ANIME}&ep=\${EP}&audio=\${realAudio}\`)
            .then(d => (d.servers || []))
            .catch(() => [])
            .then(list => {
                if (list.length > 0 || attempt >= 3) return list;
                return new Promise(res => setTimeout(res, attempt * 1300)).then(() => fetchList(source, realAudio, attempt + 1));
            });
    }
    // Checks one specific provider against the real stream endpoint (same
    // network call switchToX would make to actually play it).
    function checkProvider(source, provider, realAudio, lang, attempt = 1) {
        let url = \`\${SITE}/api/\${ENDPOINT[source]}?anime=\${ANIME}&ep=\${EP}&audio=\${realAudio}&server=\${encodeURIComponent(provider)}\`;
        if (lang) url += \`&lang=\${encodeURIComponent(lang)}\`;
        return fetchJsonTimeout(url, 20000).then(d => {
            const ok = !d.error && !!(d.m3u8 || d.mp4 || d.iframeOnly);
            if (ok) return { ok: true, provider, lang: lang || null };
            if (attempt >= 2) return { ok: false };
            return checkProvider(source, provider, realAudio, lang, attempt + 1);
        }).catch(() => (attempt < 2 ? checkProvider(source, provider, realAudio, lang, attempt + 1) : { ok: false }));
    }

    // RESULT[uiAudio][source] settles to {ok:true, provider, lang} or
    // {ok:false} once that source's own search is done. A button whose own
    // source came back {ok:false} is never hidden — playSource() below just
    // hands it whichever OTHER source in the same bucket succeeded.
    const RESULT   = { sub: {}, dub: {}, hindi: {} };
    const WATCHERS = { sub: [], dub: [], hindi: [] };
    function setResult(uiAudio, source, val) {
        RESULT[uiAudio][source] = val;
        const key = source === 'animeheaven' ? 'animeheaven' : \`\${source}:\${uiAudio}\`;
        const btn = document.querySelector(\`.server-btn[data-server="\${key}"]\`);
        if (btn) btn.classList.remove('pending');
        WATCHERS[uiAudio].slice().forEach(fn => fn());
    }

    // ── AnimeHeaven (sub-only, single fixed stream, no provider list) ─────
    function probeAnimeHeaven() {
        fetchAnimeHeavenOnce('sub').then(d => {
            const ok = !d.error && !!d.mp4;
            console.log('[AniVault player] animeheaven sub', ok ? 'OK' : 'FAILED', d);
            setResult('sub', 'animeheaven', ok ? { ok: true, provider: null, lang: null } : { ok: false });
        }).catch(e => { console.error('[AniVault player] animeheaven fetch threw', e); setResult('sub', 'animeheaven', { ok: false }); });
    }

    // ── Anikoto / ReAnime / AniWaves / AnimeNoSub (English-only sources) ──
    function probeSimpleSource(source, uiAudio, realAudio) {
        fetchList(source, realAudio).then(list => {
            const filtered = list.filter(s => !s.type || s.type === realAudio);
            if (!filtered.length) { setResult(uiAudio, source, { ok: false }); return; }
            Promise.all(filtered.map(s => checkProvider(source, s.name, realAudio, null)))
                .then(results => {
                    console.log('[AniVault player]', source, uiAudio, results);
                    setResult(uiAudio, source, results.find(r => r.ok) || { ok: false });
                });
        });
    }

    // ── AniZone / WatchAnimeWorld — multi-language dub: splits into the
    // English Dub tab, the Hindi Dub group, and the Multi Dub group ───────
    function probeMultiLangSource(source) {
        fetchList(source, 'sub').then(list => {
            if (!list.length) { setResult('sub', source, { ok: false }); return; }
            Promise.all(list.map(s => checkProvider(source, s.name, 'sub', null)))
                .then(results => setResult('sub', source, results.find(r => r.ok) || { ok: false }));
        });
        fetchList(source, 'dub').then(list => {
            const enList    = list.filter(s => langBucket(s.lang) === 'en');
            const hindiList = list.filter(s => langBucket(s.lang) === 'hindi');
            const multiList = list.filter(s => langBucket(s.lang) === 'multi');

            if (!enList.length) setResult('dub', source, { ok: false });
            else Promise.all(enList.map(s => checkProvider(source, s.name, 'dub', s.lang)))
                .then(results => setResult('dub', source, results.find(r => r.ok) || { ok: false }));

            if (!hindiList.length) setResult('hindi', source, { ok: false });
            else Promise.all(hindiList.map(s => checkProvider(source, s.name, 'dub', s.lang)))
                .then(results => setResult('hindi', source, results.find(r => r.ok) || { ok: false }));

            // Multi Dub stays dynamic and per-language on purpose — mixing
            // languages via fallback would silently hand someone a stream
            // in the wrong language, so every Multi Dub button is its own
            // real, individually-verified server with no substitute.
            multiList.forEach(s => {
                checkProvider(source, s.name, 'dub', s.lang).then(r => {
                    if (r.ok) insertMultiDubBtn(source, s);
                });
            });
        });
    }

    // ── DesiDub (Hindi-only: 'dub' = HLS/MP4-capable hosts, 'raw' = embed-only) ─
    function probeDesidub() {
        const chains = ['dub', 'raw'];
        Promise.all(chains.map(realType =>
            fetch(\`\${SITE}/api/desidub_stream.php?anime=\${ANIME}&ep=\${EP}&audio=\${realType}\`)
                .then(r => r.json()).then(d => (d.servers || []).filter(s => s.type === realType)).catch(() => [])
                .then(list => Promise.all(list.map(s =>
                    fetch(\`\${SITE}/api/desidub_stream.php?anime=\${ANIME}&ep=\${EP}&audio=\${realType}&server=\${encodeURIComponent(s.name)}\`)
                        .then(r => r.json())
                        .then(d => ({ ok: !d.error && !!(d.m3u8 || d.mp4 || d.iframeOnly), provider: s.name, realType }))
                        .catch(() => ({ ok: false }))
                )))
        )).then(chainResults => {
            const all = chainResults.reduce((a, b) => a.concat(b), []);
            console.log('[AniVault player] desidub hindi', all);
            setResult('hindi', 'desidub', all.find(r => r.ok) || { ok: false });
        });
    }

    // ── Multi Dub group rendering (unchanged intent: only ever shows a
    // language you can actually verify — never a fallback substitute) ────
    const multiSeen = new Set();
    function insertMultiDubBtn(source, s) {
        const key = \`\${source}:multi:\${(s.lang || '').toLowerCase()}:\${s.name.toLowerCase().trim()}\`;
        if (multiSeen.has(key)) return;
        multiSeen.add(key);
        const grp  = document.getElementById('dub-multi-group');
        const body = document.getElementById('servers-dub-multi-body');
        const loading = document.getElementById('servers-dub-multi-loading');
        if (!grp || !body) return;
        grp.style.display = '';
        if (loading) loading.remove();
        const btn = document.createElement('button');
        btn.className = 'server-btn';
        btn.dataset.server = key;
        btn.textContent = \`\${SOURCE_LABELS[source]} (\${prettyLang(s.lang)})\`;
        window._multiDubData = window._multiDubData || {};
        window._multiDubData[key] = { source, provider: s.name, lang: s.lang };
        body.appendChild(btn);
    }

    // ── Fixed priority order per bucket — used only to pick a fallback
    // when a button's own source has nothing, never to hide a button. ────
    const SUB_ORDER   = ['anizone', 'anikoto', 'animeheaven', 'reanime', 'aniwaves', 'watchanimeworld', 'animenosub'];
    const DUB_ORDER   = ['anizone', 'anikoto', 'reanime', 'aniwaves', 'watchanimeworld', 'animenosub'];
    const HINDI_ORDER = ['anizone', 'watchanimeworld', 'desidub'];
    function orderFor(uiAudio) { return uiAudio === 'sub' ? SUB_ORDER : uiAudio === 'dub' ? DUB_ORDER : HINDI_ORDER; }
    function bucketSettled(uiAudio) { return orderFor(uiAudio).every(src => RESULT[uiAudio][src] !== undefined); }
    function bestAvailable(uiAudio, preferSource) {
        const own = RESULT[uiAudio][preferSource];
        if (own && own.ok) return { source: preferSource, result: own };
        for (const src of orderFor(uiAudio)) {
            const r = RESULT[uiAudio][src];
            if (r && r.ok) return { source: src, result: r };
        }
        return null;
    }
    function realAudioFor(uiAudio) { return uiAudio === 'hindi' ? 'dub' : uiAudio; }

    function showBucketEmpty() {
        const pw = document.getElementById('watch-player-wrap');
        if (pw) pw.innerHTML = '<div style="display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;height:100%;min-height:240px;color:var(--text-muted);font-family:var(--font-body);text-align:center;padding:1rem;"><div>No working servers found for this episode.</div><button onclick="location.reload()" style="padding:8px 16px;border-radius:8px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;font:inherit;">Try Again</button></div>';
    }
    function showNoStreamForBucket() {
        const errMsg = document.getElementById('sp-err-msg');
        const errEl  = document.getElementById('sp-error');
        const spinEl = document.getElementById('sp-spinner');
        if (errMsg) errMsg.textContent = 'No servers currently have this episode available.';
        if (errEl) errEl.classList.add('show');
        if (spinEl) spinEl.classList.add('hide');
    }

    let playbackStarted = false;
    let activeButton = null; // { source, uiAudio }
    const overallWatchdog = setTimeout(() => { if (!playbackStarted) showBucketEmpty(); }, 25000);

    // Plays \`source\` inside \`uiAudio\`'s tab — using its own result if it has
    // one, otherwise the best other source in the same bucket. The clicked/
    // default button stays exactly as it was; only what plays underneath it
    // changes.
    function playSource(source, uiAudio) {
        activeButton = { source, uiAudio };
        const tabId = uiAudio === 'hindi' ? 'dub' : uiAudio;
        document.querySelectorAll('.server-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
        document.querySelectorAll('.server-tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-panel-' + tabId));
        document.querySelectorAll('.server-btn').forEach(b => b.classList.remove('active'));
        const key = source === 'animeheaven' ? 'animeheaven' : \`\${source}:\${uiAudio}\`;
        const btn = document.querySelector(\`.server-btn[data-server="\${key}"]\`);
        if (btn) btn.classList.add('active');

        let extraUnwatch = null;
        function cleanup() {
            const i = WATCHERS[uiAudio].indexOf(stop);
            if (i > -1) WATCHERS[uiAudio].splice(i, 1);
            if (extraUnwatch) extraUnwatch();
        }
        function playPicked(pickedSource, result, forAudio) {
            playbackStarted = true;
            clearTimeout(overallWatchdog);
            console.log('[AniVault player] playing', pickedSource, 'for button', source, '(' + uiAudio + ')', 'audio bucket', forAudio);
            if (pickedSource === 'animeheaven') switchToAnimeHeaven('sub');
            else if (pickedSource === 'anikoto') switchToAnikoto(result.provider, realAudioFor(forAudio));
            else if (pickedSource === 'desidub') switchToDesidub(result.provider, result.realType || 'dub');
            else switchToGenericSource(pickedSource, result.provider, realAudioFor(forAudio), result.lang || null);
            currentServer = source;
            currentAudio  = tabId;
        }
        function attempt() {
            const pick = bestAvailable(uiAudio, source);
            if (pick) { playPicked(pick.source, pick.result, uiAudio); return true; }
            if (!bucketSettled(uiAudio)) return false;
            if (!playbackStarted) {
                const otherAudio = uiAudio === 'sub' ? 'dub' : 'sub';
                if (!bucketSettled(otherAudio)) {
                    if (!extraUnwatch) {
                        WATCHERS[otherAudio].push(stop);
                        extraUnwatch = () => { const j = WATCHERS[otherAudio].indexOf(stop); if (j > -1) WATCHERS[otherAudio].splice(j, 1); };
                    }
                    return false;
                }
                const otherPick = bestAvailable(otherAudio, orderFor(otherAudio)[0]);
                if (otherPick) { playPicked(otherPick.source, otherPick.result, otherAudio); return true; }
                showBucketEmpty();
                return true;
            }
            showNoStreamForBucket();
            return true;
        }
        function stop() {
            if (!(activeButton && activeButton.source === source && activeButton.uiAudio === uiAudio)) { cleanup(); return; }
            if (attempt()) cleanup();
        }
        if (!attempt()) WATCHERS[uiAudio].push(stop);
    }
    window.playSource = playSource;

    window.retryCurrentServer = function() {
        console.log('[AniVault player] retryCurrentServer called', activeButton);
        if (window._anikotoCache) window._anikotoCache = {};
        if (window._animeHeavenCache) window._animeHeavenCache = {};
        if (activeButton) playSource(activeButton.source, activeButton.uiAudio);
    };

    // ── Button clicks ───────────────────────────────────────────────────
    document.querySelectorAll('.server-tab-panel').forEach(panel => {
        panel.addEventListener('click', e => {
            const btn = e.target.closest('.server-btn');
            if (!btn) return;
            const key = btn.dataset.server;
            if (window._multiDubData && window._multiDubData[key]) {
                const m = window._multiDubData[key];
                document.querySelectorAll('.server-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeButton = null;
                playbackStarted = true;
                clearTimeout(overallWatchdog);
                if (m.source === 'anizone' || m.source === 'watchanimeworld') switchToGenericSource(m.source, m.provider, 'dub', m.lang);
                return;
            }
            if (key === 'animeheaven') { playSource('animeheaven', 'sub'); return; }
            const parts = key.split(':');
            playSource(parts[0], parts[1]);
        });
    });

    // Kick off every source's search immediately, in parallel — every
    // button is already visible, this just fills in what each one plays.
    probeAnimeHeaven();
    probeSimpleSource('anikoto', 'sub', 'sub');
    probeSimpleSource('anikoto', 'dub', 'dub');
    probeSimpleSource('reanime', 'sub', 'sub');
    probeSimpleSource('reanime', 'dub', 'dub');
    probeSimpleSource('aniwaves', 'sub', 'sub');
    probeSimpleSource('aniwaves', 'dub', 'dub');
    probeSimpleSource('animenosub', 'sub', 'sub');
    probeSimpleSource('animenosub', 'dub', 'dub');
    probeMultiLangSource('anizone');
    probeMultiLangSource('watchanimeworld');
    probeDesidub();

    // Default landing: AniZone, Sub tab — plays the moment ANY sub source
    // resolves ok, under the AniZone button, and never swaps mid-playback.
    playSource('anizone', 'sub');
  } catch (e) {
    _showFatalClientError('probeAndRenderServers crashed: ' + (e && e.message ? e.message : e));
  }
})();

var _ws={sub:${JSON.stringify(qSub)},dub:${JSON.stringify(qDub)}};
var _wa='sub';
function switchWatchQuality(b,i){
    document.querySelectorAll('.wpc-q').forEach(function(x){x.classList.remove('on');});
    b.classList.add('on');
    var s=_ws[_wa]||[];
    var w=document.getElementById('watch-player-wrap');
    w.style.opacity='0';
    setTimeout(function(){
        w.innerHTML=s[i]?s[i].embed:'';
        w.style.opacity='1';
        var f=w.querySelector('iframe');
        if(f&&!f.id)f.id='main-player-iframe';
    },200);
}

function filterEps(q){
  var rows=document.querySelectorAll('.ep-item');
  var s=q.toLowerCase().trim();
  if (s) {
    // Active search overrides the range picker -- search across every
    // episode, not just the currently selected chunk.
    rows.forEach(function(r){r.style.display=(r.getAttribute('data-s')||'').includes(s)?'':'none';});
    return;
  }
  // Search cleared -- go back to showing only the active range chunk
  // (or everything, if this show never needed a range picker).
  var chunks = window.__epChunks;
  if (!chunks || !chunks.length) {
    rows.forEach(function(r){r.style.display='';});
    return;
  }
  var chunk = chunks[window.__epActiveChunk || 0] || chunks[0];
  var lo = chunk[0], hi = chunk[chunk.length - 1];
  rows.forEach(function(r){
    var n = parseInt(r.getAttribute('data-ep-num') || '0', 10);
    r.style.display = (n >= lo && n <= hi) ? '' : 'none';
  });
}

(function initEpRangePicker(){
  var chunks = window.__epChunks;
  if (!chunks || !chunks.length) return;
  var toggle = document.getElementById('ep-range-toggle');
  var modal  = document.getElementById('ep-range-modal');
  var close  = document.getElementById('ep-range-close');
  var label  = document.getElementById('ep-range-label');
  if (!toggle || !modal) return;

  function closeModal(){ modal.classList.remove('open'); }

  function selectChunk(idx){
    window.__epActiveChunk = idx;
    var chunk = chunks[idx];
    var lo = chunk[0], hi = chunk[chunk.length - 1];
    document.querySelectorAll('.ep-item').forEach(function(r){
      var n = parseInt(r.getAttribute('data-ep-num') || '0', 10);
      r.style.display = (n >= lo && n <= hi) ? '' : 'none';
    });
    if (label) label.textContent = 'Episodes ' + lo + '\u2013' + hi;
    document.querySelectorAll('.ep-range-row').forEach(function(row, i){
      row.classList.toggle('active', i === idx);
    });
    var search = document.getElementById('ep-search');
    if (search) search.value = '';
    closeModal();
  }

  toggle.onclick = function(){ modal.classList.add('open'); };
  if (close) close.onclick = closeModal;
  modal.onclick = function(e){ if (e.target === modal) closeModal(); };
  document.querySelectorAll('.ep-range-row').forEach(function(row){
    row.onclick = function(){ selectChunk(parseInt(row.getAttribute('data-range-idx'), 10)); };
  });
})();

(function(){
  var animeId=${animeId};
  function applyThumb(n,url){
    var w=document.querySelector('.ep-thumb-box[data-ep="'+n+'"]');
    if(!w)return;
    var img=w.querySelector('.ep-thumb-img');
    if(!img)return;
    var t=new Image();t.onload=function(){img.src=url;img.classList.add('vis');};t.src=url;
  }
  // Episode-list thumbnails: an admin-saved override wins where one exists
  // (episode_overrides.image_url via the Episode Thumbnails admin panel),
  // otherwise the server fills it in with a live lookup against our own
  // scraper API (see api-episode-override.ts's ?all=1 handler). Same
  // response shape either way, so this client code doesn't need to care
  // which source a given thumbnail came from.
  async function loadThumbs(){
    try{var ov=await fetch('/api/episode_override.php?anime_id='+animeId+'&all=1');if(ov.ok){var od=await ov.json();(od.overrides||[]).forEach(function(o){if(o.image_url)applyThumb(o.episode_num,o.image_url);});}}catch(e){}
  }
  setTimeout(loadThumbs,300);
})();

</script>
`;
}
