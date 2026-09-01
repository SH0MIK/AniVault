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

function switchToServer(serverName, audio = currentAudio) {
    const pw = document.getElementById('watch-player-wrap');
    if (!pw) return;

    // ── AnimeHeaven (MP4) ────────────────────────────────────────────────
    if (serverName === 'animeheaven') {
        switchToAnimeHeaven(audio);
        currentServer = serverName;
        currentAudio  = audio;
        updateActiveServerButton(serverName, audio);
        return;
    }

    // ── Anikoto providers (HLS + subtitles) ────────────────────────────────
    if (serverName.startsWith('anikoto-')) {
        const providerName = serverName.slice('anikoto-'.length);
        switchToAnikoto(providerName, audio);
        currentServer = serverName;
        currentAudio  = audio;
        updateActiveServerButton(serverName, audio);
        return;
    }

    // ── DesiDub Hindi Dub / raw sources ────────────────────────────────────
    // Key shape: "desidub:<dub|raw>:<provider name>" — the middle segment is
    // the real type sent to the scraper API, independent of which UI tab
    // ("dub") the button lives under.
    if (serverName.startsWith('desidub:')) {
        const parts = serverName.split(':');
        const realType = parts[1];
        const providerName = parts.slice(2).join(':');
        switchToDesidub(providerName, realType);
        currentServer = serverName;
        currentAudio  = audio;
        updateActiveServerButton(serverName, audio);
        return;
    }
}

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

// ── Server button clicks ──────────────────────────────────────────────────
document.querySelectorAll('.server-tab-panel').forEach(panel => {
    panel.addEventListener('click', e => {
        const btn = e.target.closest('.server-btn');
        if (!btn) return;
        const serverName = btn.dataset.server;
        const audio = panel.dataset.audio;
        switchToServer(serverName, audio);
    });
});

// ── Probe every server live and only show ones that actually work ───────
// Hits the real stream endpoints for this anime/episode (not just a
// provider listing) so broken/404 servers never show up as clickable.
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

    function makeBtn(serverKey, label, badge) {
        const btn = document.createElement('button');
        btn.className = 'server-btn';
        btn.dataset.server = serverKey;
        btn.innerHTML = badge ? \`\${label} <span class="ad-badge">\${badge}</span>\` : label;
        return btn;
    }

    // Same reuse-the-probe-response pattern as Anikoto below — hitting
    // animeheaven_stream.php twice back-to-back (once here to confirm it
    // works, then again when switchToAnimeHeaven actually loads it) was
    // invalidating the session/token AnimeHeaven hands out, so the button
    // would show up, auto-activate, then immediately error out with
    // "Could not reach stream server." Switching servers and back masked
    // it because that's just a single fresh request outside the race.
    function checkAnimeHeaven(audio) {
        return fetchAnimeHeavenOnce(audio)
            .then(d => {
                const ok = !d.error && !!d.mp4;
                console.log('[AniVault player] animeheaven', audio, ok ? 'OK' : 'FAILED', d);
                return ok;
            }).catch(e => { console.error('[AniVault player] animeheaven fetch threw', e); return false; });
    }
    // Same pattern as AnimeHeaven's probe above, but for Anikoto (which also returns subtitles,
    // handled separately in switchToAnikoto/loadWithSubs — no change needed
    // to the discovery/probing logic here).
    function fetchAnikotoList(audio, attempt = 1) {
        return fetch(\`\${SITE}/api/anikoto_stream.php?anime=\${ANIME}&ep=\${EP}&audio=\${audio}\`)
            .then(r => r.json())
            .then(d => { console.log('[AniVault player] anikoto list', audio, 'attempt', attempt, d); return (d.servers || []).filter(s => s.type === audio); })
            .catch(e => { console.error('[AniVault player] anikoto list fetch threw', audio, e); return []; })
            .then(list => {
                if (list.length > 0 || attempt >= 3) return list;
                return new Promise(res => setTimeout(res, attempt * 1500))
                    .then(() => fetchAnikotoList(audio, attempt + 1));
            });
    }
    function checkAnikotoProvider(provider, audio) {
        return fetch(\`\${SITE}/api/anikoto_stream.php?anime=\${ANIME}&ep=\${EP}&audio=\${audio}&server=\${encodeURIComponent(provider)}\`)
            .then(r => r.json()).then(d => {
                const ok = !d.error && !!d.m3u8;
                console.log('[AniVault player] anikoto', provider, audio, ok ? 'OK' : 'FAILED', d);
                // Stash the response so the auto-activated first play
                // (triggered right below in markServerFound) can reuse it
                // instead of firing a second identical request at the
                // scraper for the same provider — some embed hosts hand
                // out session/token-locked links that don't survive being
                // requested twice in a row.
                if (ok) {
                    window._anikotoCache = window._anikotoCache || {};
                    window._anikotoCache[audio + '::' + provider.toLowerCase().trim()] = { data: d, ts: Date.now() };
                }
                return ok;
            }).catch(() => false);
    }

    // ── Incremental probing ───────────────────────────────────────────────
    // Every server check below runs independently (no Promise.all gate).
    // The instant ANY server for the active "sub" tab is confirmed, its
    // button is rendered AND playback starts immediately — everything else
    // keeps probing in the background and just slots its button in next to
    // it whenever it finishes. If sub comes up completely empty, we fall
    // back to whatever's already working (or shows up next) on dub.
    let playbackStarted = false;
    let subPending = 0, dubPending = 0;
    let subHasAny  = false, dubHasAny  = false;

    function setSearching(audio, stillSearching) {
        const loading = document.getElementById('servers-' + audio + '-loading');
        if (!loading) return;
        if (stillSearching) {
            // Collapse the 3-bar skeleton down to a single "still looking"
            // pill once real buttons are already showing next to it.
            loading.innerHTML = '<span class="server-skel"><span class="server-skel-dot"></span><span class="server-skel-bar" style="width:80px"></span></span>';
        } else {
            const hasAny = audio === 'sub' ? subHasAny : dubHasAny;
            if (hasAny) loading.remove();
            else { loading.className = 'no-servers-msg'; loading.textContent = 'No working servers found'; }
        }
    }

    function activateButton(audio, key) {
        playbackStarted = true;
        _clearOverallWatchdog();
        document.querySelectorAll('.server-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === audio));
        document.querySelectorAll('.server-tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-panel-' + audio));
        const btn = document.querySelector(\`#tab-panel-\${audio} .server-btn[data-server="\${key}"]\`);
        if (btn) btn.classList.add('active');
        switchToServer(key, audio);
    }

    function showNoServersAtAll(msg) {
        const pw = document.getElementById('watch-player-wrap');
        if (pw) pw.innerHTML = \`<div style="display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;height:100%;min-height:240px;color:var(--text-muted);font-family:var(--font-body);text-align:center;padding:1rem;"><div>\${msg || 'No working servers found for this episode.'}</div><button onclick="location.reload()" style="padding:8px 16px;border-radius:8px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;font:inherit;">Try Again</button></div>\`;
    }

    // Hard overall cap — the individual probes (especially fetchAnikotoList's
    // retry/backoff loop) have no client-side timeout of their own and can
    // legitimately take a while if the scraper backend is slow, but the
    // "Finding the best server..." screen should never sit there forever
    // with no feedback. If nothing has started playing within 25s, give up
    // and show a clear message + retry button instead of an endless spinner.
    const _overallWatchdog = setTimeout(() => {
        if (!playbackStarted) showNoServersAtAll('Servers are taking longer than usual to respond. The stream backend may be slow or down right now.');
    }, 25000);
    const _clearOverallWatchdog = () => clearTimeout(_overallWatchdog);

    function markServerFound(audio, key, label, badge) {
        const panel   = document.getElementById('tab-panel-' + audio);
        const loading = document.getElementById('servers-' + audio + '-loading');
        if (!panel || panel.querySelector(\`.server-btn[data-server="\${key}"]\`)) return;

        const btn = makeBtn(key, label, badge);
        if (loading) panel.insertBefore(btn, loading); else panel.appendChild(btn);

        if (audio === 'sub') {
            subHasAny = true;
            if (!playbackStarted) activateButton('sub', key);
        } else {
            dubHasAny = true;
            // Sub already came up empty by the time this dub result landed
            // (or never had a chance) — play this one instead of waiting.
            if (!playbackStarted && subPending === 0 && !subHasAny) activateButton('dub', key);
        }
    }

    function subTaskDone() {
        subPending--;
        if (subPending === 0) {
            setSearching('sub', false);
            // Sub fully exhausted with nothing working — fall back to a
            // dub server that's already been found, if any.
            if (!playbackStarted && !subHasAny && dubHasAny) {
                const firstBtn = document.querySelector('#tab-panel-dub .server-btn');
                if (firstBtn) activateButton('dub', firstBtn.dataset.server);
            }
            if (dubPending === 0 && !subHasAny && !dubHasAny && !playbackStarted) { _clearOverallWatchdog(); showNoServersAtAll(); }
        } else if (subHasAny) {
            setSearching('sub', true);
        }
    }
    function dubTaskDone() {
        dubPending--;
        if (dubPending === 0) {
            setSearching('dub', false);
            if (subPending === 0 && !subHasAny && !dubHasAny && !playbackStarted) { _clearOverallWatchdog(); showNoServersAtAll(); }
        } else if (dubHasAny) {
            setSearching('dub', true);
        }
    }

    // AnimeHeaven(sub) + Anikoto-list(sub) = 2 sub tasks.
    // Anikoto-list(dub) = 1 dub task. AnimeHeaven is sub-only
    // (api/animeheaven_stream.php ignores the audio param), so it never
    // contributes a dub task.
    // Senshi and Miruro have been removed — only AnimeHeaven and Anikoto
    // are probed and shown on the watch page now.
    subPending = 2;
    dubPending = 1;

    // ── SERVER DISPLAY NAMES ─────────────────────────────────────────────────
    // Change any value here to rename that button on the watch page.
    const SERVER_NAMES = {
        animeheaven:  'Eden',
        kiwi:         'Jade',
        bonk:         'Bash',
        bee:          'Hex',
        bun:          'Puff',
        twin:         'Echo',
        ally:         'Pact',
        moo:          'Haze',
        cog:          'Gear',
        pewe:         'Wren',
        nun:          'Veil',
        telli:        'Flux',
        hop:          'Dart',
        animedunya:   'Dune',
    };

    checkAnimeHeaven('sub').then(ok => { if (ok) markServerFound('sub', 'animeheaven', SERVER_NAMES.animeheaven); subTaskDone(); });

    fetchAnikotoList('sub').then(list => {
        list.map(s => s.name).forEach(p => {
            const pKey = p.toLowerCase().trim();
            subPending++;
            checkAnikotoProvider(p, 'sub').then(ok => {
                if (ok) markServerFound('sub', \`anikoto-\${pKey}\`, SERVER_NAMES[pKey] ?? ('AK-' + (pKey.charAt(0).toUpperCase() + pKey.slice(1))));
                subTaskDone();
            });
        });
        subTaskDone();
    });

    fetchAnikotoList('dub').then(list => {
        list.map(s => s.name).forEach(p => {
            const pKey = p.toLowerCase().trim();
            dubPending++;
            checkAnikotoProvider(p, 'dub').then(ok => {
                if (ok) markServerFound('dub', \`anikoto-\${pKey}\`, SERVER_NAMES[pKey] ?? ('AK-' + (pKey.charAt(0).toUpperCase() + pKey.slice(1))));
                dubTaskDone();
            });
        });
        dubTaskDone();
    });

    // ── DesiDub Hindi Dub + raw sources ────────────────────────────────────
    // Kept entirely separate from the sub/dub autoplay bookkeeping above —
    // it renders into its own labeled group under the Dub tab (see
    // watch.ts markup) and never auto-activates; English sub/dub still wins
    // autoplay, Hindi Dub is opt-in via click. Priority within the group:
    // VidMoly, then StreamRuby, then any Mirror variant(s), then any other
    // HLS/MP4-capable host, and raw (embed-only) sources always last.
    let hindiPending = 2;
    let hindiHasAny  = false;

    function hindiTaskDone() {
        hindiPending--;
        if (hindiPending === 0) {
            const loading = document.getElementById('servers-dub-hindi-loading');
            if (hindiHasAny) {
                if (loading) loading.remove();
            } else {
                const grp = document.getElementById('dub-hindi-group');
                if (grp) grp.remove();
            }
        }
    }

    function fetchDesidubList(audio, attempt = 1) {
        return fetch(\`\${SITE}/api/desidub_stream.php?anime=\${ANIME}&ep=\${EP}&audio=\${audio}\`)
            .then(r => r.json())
            .then(d => { console.log('[AniVault player] desidub list', audio, 'attempt', attempt, d); return (d.servers || []).filter(s => s.type === audio); })
            .catch(e => { console.error('[AniVault player] desidub list fetch threw', audio, e); return []; })
            .then(list => {
                if (list.length > 0 || attempt >= 2) return list;
                return new Promise(res => setTimeout(res, 1200)).then(() => fetchDesidubList(audio, attempt + 1));
            });
    }
    function checkDesidubProvider(provider, audio) {
        return fetch(\`\${SITE}/api/desidub_stream.php?anime=\${ANIME}&ep=\${EP}&audio=\${audio}&server=\${encodeURIComponent(provider)}\`)
            .then(r => r.json()).then(d => {
                const ok = !d.error && !!(d.m3u8 || d.mp4 || d.iframeOnly);
                console.log('[AniVault player] desidub', provider, audio, ok ? 'OK' : 'FAILED', d);
                if (ok) {
                    window._desidubCache = window._desidubCache || {};
                    window._desidubCache[audio + '::' + provider.toLowerCase().trim()] = { data: d, ts: Date.now() };
                }
                return ok;
            }).catch(() => false);
    }
    // VidMoly > StreamRuby > Mirror > MuseMirror > any other HLS/MP4-capable
    // host > raw/embed-only sources (always last, badged "Embed" in the UI).
    // "muse" is checked before the generic "mirror" match since MuseMirror's
    // name also contains the substring "mirror".
    function desidubMeta(name, type) {
        const n = (name || '').toLowerCase();
        if (type === 'raw') return { badge: 'Embed', priority: 100 };
        if (n.includes('vidmoly') || n.includes('vmoly')) return { badge: null, priority: 1 };
        if (n.includes('ruby')) return { badge: null, priority: 2 };
        if (n.includes('muse')) return { badge: null, priority: 4 };
        if (n.includes('mirror')) return { badge: null, priority: 3 };
        return { badge: null, priority: 5 };
    }
    function insertDesidubBtn(key, label, badge, priority) {
        const body = document.getElementById('servers-dub-hindi-body');
        const loading = document.getElementById('servers-dub-hindi-loading');
        if (!body || body.querySelector(\`.server-btn[data-server="\${key}"]\`)) return;
        const grp = document.getElementById('dub-hindi-group');
        if (grp) grp.style.display = '';
        const btn = makeBtn(key, label, badge);
        btn.dataset.priority = priority;
        const siblings = Array.from(body.querySelectorAll('.server-btn'));
        const next = siblings.find(b => parseInt(b.dataset.priority, 10) > priority);
        if (next) body.insertBefore(btn, next);
        else if (loading) body.insertBefore(btn, loading);
        else body.appendChild(btn);
        hindiHasAny = true;
    }

    ['dub', 'raw'].forEach(function(realType) {
        fetchDesidubList(realType).then(list => {
            list.forEach(s => {
                hindiPending++;
                checkDesidubProvider(s.name, realType).then(ok => {
                    if (ok) {
                        const meta = desidubMeta(s.name, realType);
                        insertDesidubBtn('desidub:' + realType + ':' + s.name, s.name, meta.badge, meta.priority);
                    }
                    hindiTaskDone();
                });
            });
            hindiTaskDone();
        });
    });
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
