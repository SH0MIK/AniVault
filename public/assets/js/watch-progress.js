// ══════════════════════════════════════════════════════════════
//  watch-progress.js  — Watch time tracker + resume logic
//
//  HOW TO USE ON YOUR WATCH PAGE:
//  ─────────────────────────────
//  1. Add this script after app.js in your watch page's <head>/<body>.
//  2. Call WatchProgress.init({ animeId, episodeNum, iframe }) once
//     the player iframe is ready. Example:
//
//     WatchProgress.init({
//       animeId:     123,          // MAL anime ID
//       episodeNum:  5,            // current episode number
//       iframe:      document.getElementById('player-iframe'),
//       animeTitle:  'One Piece',
//       animeImage:  'https://...',
//       epTitle:     'Episode 5 Title',
//       epThumb:     'https://...',
//     });
//
//  3. The script auto-saves every 5 s and restores on next visit.
// ══════════════════════════════════════════════════════════════

const WatchProgress = (() => {
  const SAVE_INTERVAL  = 30000; // save every 30 seconds
  const RESUME_THRESH  = 30;    // don't resume if < 30 s into the episode
  const COMPLETE_RATIO = 0.92;  // mark as "complete" when 92 % watched

  let _cfg         = null;
  let _watchTime   = 0;   // seconds watched (current session position)
  let _duration    = 0;   // total seconds (set once player reports it)
  let _saveTimer   = null;
  let _pollTimer   = null;
  let _resumed     = false;
  let _lastSavedTime = 0;

  // ── Format seconds as "22m left" / "1h 4m left" ──────────
  function fmtLeft(secondsLeft) {
    if (!secondsLeft || secondsLeft <= 0) return '';
    const m = Math.round(secondsLeft / 60);
    if (m <= 0) return '';
    if (m < 60) return `${m}m left`;
    return `${Math.floor(m / 60)}h ${m % 60}m left`;
  }

  function fmtTime(seconds) {
    if (!seconds || seconds <= 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${m}:${String(s).padStart(2,'0')}`;
  }

  // ── Persist progress to server ────────────────────────────
  async function save(force = false) {
    if (!_cfg || !window.__loggedIn) return;
    const currentTime = Math.floor(_watchTime);
    // Avoid duplicate/near-identical progress writes (e.g. visibility + unload).
    if (!force && currentTime < 5) return;
    if (!force && Math.abs(currentTime - _lastSavedTime) < 25) return;
    try {
      await fetch((window.__siteUrl || '') + '/api/watch_history.php', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:           'save_progress',
          anime_id:         _cfg.animeId,
          episode_num:      _cfg.episodeNum,
          watch_time:       currentTime,
          episode_duration: Math.floor(_duration),
          anime_title:      _cfg.animeTitle || '',
          anime_image:      _cfg.animeImage || '',
          ep_title:         _cfg.epTitle    || '',
          ep_thumb:         _cfg.epThumb    || '',
        }),
      });
      _lastSavedTime = currentTime;
    } catch (e) { /* silent — don't disrupt playback */ }
  }

  // ── Load saved progress from server ──────────────────────
  async function loadSaved() {
    if (!window.__loggedIn) return { watch_time: 0, episode_duration: 0 };
    try {
      const res  = await fetch((window.__siteUrl || '') + '/api/watch_history.php', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:      'get_progress',
          anime_id:    _cfg.animeId,
          episode_num: _cfg.episodeNum,
        }),
      });
      const data = await res.json();
      return data.success ? data : { watch_time: 0, episode_duration: 0 };
    } catch (e) { return { watch_time: 0, episode_duration: 0 }; }
  }

  // ── Poll the iframe for current time via postMessage ──────
  // Most embed players (Plyr, Video.js, native <video>) support this.
  // For iframes that expose window.postMessage or contentWindow.
  function startPolling() {
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(() => {
      // Try to read from a <video> element directly if same-origin
      const video = _cfg.iframe?.contentDocument?.querySelector('video');
      if (video) {
        if (!_duration && video.duration && isFinite(video.duration)) {
          _duration = video.duration;
          // Attempt resume (only once)
          if (!_resumed) tryResume(video);
        }
        if (!video.paused) {
          _watchTime = video.currentTime;
          updateTimeOverlay();
        }
        return;
      }

      // Cross-origin: post a time-request message and listen for response
      try {
        _cfg.iframe?.contentWindow?.postMessage({ type: 'getCurrentTime' }, '*');
      } catch (_) {}
    }, 1000);

    // Listen for player postMessage responses (e.g. Plyr, custom players)
    window.addEventListener('message', onPlayerMessage);
  }

  function onPlayerMessage(e) {
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    // Plyr sends { type:'timeupdate', detail:{ currentTime, duration } }
    if (d.type === 'timeupdate' && d.detail) {
      _watchTime = d.detail.currentTime || _watchTime;
      if (!_duration && d.detail.duration) {
        _duration = d.detail.duration;
        if (!_resumed) tryResume(null, _watchTime);
      }
      updateTimeOverlay();
    }
    // Generic { currentTime, duration }
    if (typeof d.currentTime === 'number') {
      _watchTime = d.currentTime;
      if (!_duration && d.duration) {
        _duration = d.duration;
        if (!_resumed) tryResume(null, _watchTime);
      }
      updateTimeOverlay();
    }
  }

  // ── Show "Xm left" badge on the player ────────────────────
  function updateTimeOverlay() {
    const el = document.getElementById('wp-time-overlay');
    if (!el || !_duration) return;
    const left = _duration - _watchTime;
    el.textContent = fmtLeft(left);
    el.style.display = left > 60 ? 'block' : 'none';
  }

  // ── Seek player to saved position ─────────────────────────
  function tryResume(video, currentTime) {
    _resumed = true;
    const saved = _cfg._savedTime || 0;
    if (!saved || saved < RESUME_THRESH) return;
    if (_duration && saved / _duration > COMPLETE_RATIO) return; // episode basically done

    if (video) {
      video.currentTime = saved;
      return;
    }
    // postMessage seek for cross-origin players
    try {
      _cfg.iframe?.contentWindow?.postMessage({ type: 'seek', time: saved }, '*');
    } catch (_) {}
    showResumeToast(saved);
  }

  function showResumeToast(savedTime) {
    if (typeof showToast === 'function') {
      showToast(`▶ Resumed from ${fmtTime(savedTime)}`, 'success');
    }
  }

  // ── Public API ─────────────────────────────────────────────
  async function init(cfg) {
    _cfg       = cfg;
    _watchTime = 0;
    _duration  = 0;
    _resumed   = false;
    _lastSavedTime = 0;

    // Load saved position before starting
    const saved = await loadSaved();
    _cfg._savedTime = saved.watch_time || 0;
    _lastSavedTime = _cfg._savedTime;
    if (saved.episode_duration) _duration = saved.episode_duration;

    // Start auto-save
    if (_saveTimer) clearInterval(_saveTimer);
    _saveTimer = setInterval(save, SAVE_INTERVAL);

    // Save on tab close / navigate away
    window.addEventListener('beforeunload', () => save(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') save(true);
    });

    // Start polling the player iframe
    startPolling();

    // If saved time > threshold, show the resume toast immediately
    if (_cfg._savedTime >= RESUME_THRESH) {
      // Give the iframe 2 s to load then attempt seek
      setTimeout(() => {
        const video = _cfg.iframe?.contentDocument?.querySelector('video');
        tryResume(video || null, _cfg._savedTime);
      }, 2000);
    }
  }

  return { init, save, fmtLeft, fmtTime };
})();


// ══════════════════════════════════════════════════════════════
//  History card progress rendering
//  Call renderHistoryProgress() after history cards are in the DOM.
//  Each card must have these data attributes:
//    data-watch-time="<seconds>"
//    data-episode-duration="<seconds>"
//  And the time badge element:
//    <span class="hist-time-left"></span>
// ══════════════════════════════════════════════════════════════

function renderHistoryProgress() {
  document.querySelectorAll('.history-card[data-watch-time]').forEach(card => {
    const watchTime = parseInt(card.dataset.watchTime       || '0');
    const duration  = parseInt(card.dataset.episodeDuration || '0');
    if (!duration || !watchTime) return;

    const pct     = Math.min(100, Math.round(watchTime / duration * 100));
    const left    = duration - watchTime;
    const leftStr = WatchProgress.fmtLeft(left);

    // Inject progress bar
    let bar = card.querySelector('.hist-progress-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'hist-progress-bar';
      bar.innerHTML = '<div class="hist-progress-fill"></div>';
      // Insert at bottom of thumbnail wrapper
      const thumb = card.querySelector('.hist-thumb-wrap, .ep-thumb, .anime-card-poster');
      if (thumb) thumb.appendChild(bar);
    }
    bar.querySelector('.hist-progress-fill').style.width = pct + '%';

    // Inject "Xm left" badge
    if (leftStr) {
      let badge = card.querySelector('.hist-time-left');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'hist-time-left';
        const thumb = card.querySelector('.hist-thumb-wrap, .ep-thumb, .anime-card-poster');
        if (thumb) thumb.appendChild(badge);
      }
      badge.textContent = leftStr;
    }

    // Click: navigate to episode URL and pass resume time via sessionStorage
    const epUrl = card.dataset.epUrl || card.querySelector('a')?.href;
    if (epUrl && watchTime >= 30) {
      card.style.cursor = 'pointer';
      card.addEventListener('click', (e) => {
        e.preventDefault();
        // Store resume info so the watch page can pick it up on load
        sessionStorage.setItem('wp_resume', JSON.stringify({
          url:       epUrl,
          watchTime: watchTime,
          animeId:   card.dataset.animeId,
          epNum:     card.dataset.epNum,
        }));
        window.location.href = epUrl;
      }, { once: true });
    }
  });
}

// ── Auto-resume from sessionStorage (runs on watch page load) ─
(function autoResumeFromSession() {
  const raw = sessionStorage.getItem('wp_resume');
  if (!raw) return;
  try {
    const info = JSON.parse(raw);
    if (!info.watchTime || info.watchTime < 30) return;
    // Match current page URL
    if (window.location.href.includes(info.url) || info.url.includes(window.location.pathname)) {
      // Store on window so WatchProgress.init() can read it
      window.__wpResumeTime = info.watchTime;
      sessionStorage.removeItem('wp_resume');
    }
  } catch (_) {}
})();

document.addEventListener('DOMContentLoaded', () => {
  renderHistoryProgress();
});
