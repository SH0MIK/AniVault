export function playerScript(malId: number, epNum: number, siteUrl: string): string {
  return `<script>
(function(){
'use strict';

/* --- DOM References --- */
const root           = document.getElementById('senshi-player-root');
const vid            = document.getElementById('sp-video');
const spinner        = document.getElementById('sp-spinner');
const errBox         = document.getElementById('sp-error');
const errMsg         = document.getElementById('sp-err-msg');
const ambientCanvas  = document.getElementById('vh-ambient-canvas');
const burstBox       = document.getElementById('vh-center-burst-box');
const burstPlay      = burstBox?.querySelector('.vh-burst-play');
const burstPause     = burstBox?.querySelector('.vh-burst-pause');
const tapPillLeft    = document.getElementById('vh-tap-pill-left');
const tapPillRight   = document.getElementById('vh-tap-pill-right');
const subContainer   = document.getElementById('vh-sub-container');
const subText        = document.getElementById('vh-sub-text');
const subFileInput   = document.getElementById('vh-sub-file-input');

/* Top Bar */
const topTitle       = document.getElementById('vh-top-title');
const topBtnCast     = document.getElementById('vh-top-btn-cast');
const topBtnCaptions = document.getElementById('vh-top-btn-captions');
const topBtnSettings = document.getElementById('vh-top-btn-settings');

/* Center Controls */
const centerControls = document.getElementById('vh-center-controls');
const centerRewind   = document.getElementById('vh-center-rewind');
const centerPlay     = document.getElementById('vh-center-play');
const playIcon       = centerPlay?.querySelector('.vh-play-icon');
const pauseIcon      = centerPlay?.querySelector('.vh-pause-icon');
const centerForward  = document.getElementById('vh-center-forward');

/* Seekbar */
const seekContainer  = document.getElementById('vh-seek-container');
const seekTrack      = document.getElementById('vh-seek-track');
const seekBuf        = document.getElementById('vh-seek-buf');
const seekPlay       = document.getElementById('vh-seek-play');
const seekIntro      = document.getElementById('vh-seek-intro');
const seekOutro      = document.getElementById('vh-seek-outro');
const seekThumb      = document.getElementById('vh-seek-thumb');
const seekTooltip    = document.getElementById('vh-seek-tooltip');

/* Mini Progress */
const miniPlay       = document.getElementById('vh-mini-play');
const miniIntro      = document.getElementById('vh-mini-intro');
const miniOutro      = document.getElementById('vh-mini-outro');

/* Bottom Controls */
const btnVol         = document.getElementById('vh-btn-vol');
const volHighIcon    = btnVol?.querySelector('.vh-vol-high');
const volMuteIcon    = btnVol?.querySelector('.vh-vol-mute');
const volSlider      = document.getElementById('vh-vol-slider');
const timeCur        = document.getElementById('vh-time-cur');
const timeDur        = document.getElementById('vh-time-dur');
const btnCaptions    = document.getElementById('vh-btn-captions');
const capOnIcon      = btnCaptions?.querySelector('.vh-captions-on');
const capOffIcon     = btnCaptions?.querySelector('.vh-captions-off');
const btnSettings    = document.getElementById('vh-btn-settings');
const hdBadge        = document.getElementById('vh-hd-badge');
const btnPip         = document.getElementById('vh-btn-pip');
const btnFs          = document.getElementById('vh-btn-fs');
const btnFsMobile    = document.getElementById('vh-btn-fs-mobile');
const btnLock        = document.getElementById('vh-btn-lock');
const fsEnterIcon    = btnFs?.querySelector('.vh-fs-enter');
const fsExitIcon     = btnFs?.querySelector('.vh-fs-exit');

/* Settings Sheet */
const sheetBackdrop  = document.getElementById('vh-sheet-backdrop');
const sheetSurface   = document.getElementById('vh-sheet-surface');
const sheetPanel     = document.getElementById('vh-sheet-panel');
const headerBack     = document.getElementById('vh-header-back');
const headerSpacer   = document.getElementById('vh-header-spacer');
const headerTitle    = document.getElementById('vh-header-title');
const headerReset    = document.getElementById('vh-header-reset');
const headerClose    = document.getElementById('vh-header-close');

/* Menus */
const menuRoot       = document.getElementById('vh-menu-root');
const menuQuality    = document.getElementById('vh-menu-quality');
const menuSpeed      = document.getElementById('vh-menu-speed');
const menuCaptions   = document.getElementById('vh-menu-captions');
const menuSubStyle   = document.getElementById('vh-menu-sub-style');
const menuMore       = document.getElementById('vh-menu-more');
const menuSleep      = document.getElementById('vh-menu-sleep');

/* Labels & Options */
const lblQuality     = document.getElementById('vh-lbl-quality');
const lblSpeed       = document.getElementById('vh-lbl-speed');
const lblCaptions    = document.getElementById('vh-lbl-captions');
const lblSleep       = document.getElementById('vh-lbl-sleep');
const qualityOptions = document.getElementById('vh-quality-options');
const speedOptions   = document.getElementById('vh-speed-options');
const captionsOptions= document.getElementById('vh-captions-options');
const sleepOptions   = document.getElementById('vh-sleep-options');

/* Switches & Controls */
const swAutoplay     = document.getElementById('vh-sw-autoplay');
const swLoop         = document.getElementById('vh-sw-loop');
const swAmbient      = document.getElementById('vh-sw-ambient');
const swStableVol    = document.getElementById('vh-sw-stable-vol');
const swSubsync      = document.getElementById('vh-sw-subsync');
const subsyncCtrls   = document.getElementById('vh-subsync-controls');
const subOffsetMinus = document.getElementById('vh-sub-offset-minus');
const subOffsetPlus  = document.getElementById('vh-sub-offset-plus');
const subOffsetVal   = document.getElementById('vh-sub-offset-val');
const swShowMuted    = document.getElementById('vh-sw-show-muted');
const swIosMode      = document.getElementById('vh-sw-ios-mode');
const navLock        = document.getElementById('vh-nav-lock');
const lockOverlay    = document.getElementById('vh-lock-overlay');
const lockUnlockWrap = document.getElementById('vh-lock-unlock-wrap');
const btnUnlock      = document.getElementById('vh-btn-unlock');
const sleepOverlay   = document.getElementById('vh-sleep-ended-overlay');
const btnResumeSleep = document.getElementById('vh-btn-resume-sleep');

/* Subtitle Style Sliders */
const rangeSubH      = document.getElementById('vh-range-sub-h');
const valSubH        = document.getElementById('vh-val-sub-h');
const rangeSubV      = document.getElementById('vh-range-sub-v');
const valSubV        = document.getElementById('vh-val-sub-v');
const rangeSubSize   = document.getElementById('vh-range-sub-size');
const valSubSize     = document.getElementById('vh-val-sub-size');
const rangeSubBg     = document.getElementById('vh-range-sub-bg');
const valSubBg       = document.getElementById('vh-val-sub-bg');

/* Persistent Settings (VidHawk Storage Key) */
const STORAGE_KEY = 'vidhawk-player-settings';
let settings = {
  volume: 1,
  muted: false,
  speed: 1,
  autoplay: true,
  loop: false,
  ambient: true,
  stableVol: false,
  captionsEnabled: true,
  subSyncEnabled: false,
  subSyncOffset: 0,
  showWhenMuted: false,
  iosMode: false,
  subtitleHorizontal: 50,
  subtitlePosition: 88,
  subtitleSize: 22,
  subtitleBgOpacity: 50,
  subtitleColor: '#ffffff',
};

try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) settings = Object.assign(settings, JSON.parse(saved));
} catch(e) {}

function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch(e) {}
}

/* State */
let hls = null;
let currentM3u8 = null;
let introBand = null;
let outroBand = null;
let subTracks = [];
let activeSubIdx = -1;
let parsedCues = [];
let isScrubbing = false;
let idleTimer = null;
let sleepTimer = null;
let unlockHideTimer = null;
let ambientCtx = null;
let ambientRaf = null;
let audioCtx = null;
let compressorNode = null;
let sourceNode = null;
let currentMenu = 'settings-root';

/* Time Formatting */
function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const pad = n => String(n).padStart(2, '0');
  return (h > 0 ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s));
}

/* Activity & Inactivity Auto-Hide */
function resetInactivity() {
  root.classList.remove('vh-ui-hidden');
  clearTimeout(idleTimer);
  if (!vid.paused && sheetBackdrop?.style.display === 'none') {
    idleTimer = setTimeout(() => {
      if (!vid.paused && sheetBackdrop?.style.display === 'none' && !isScrubbing) {
        root.classList.add('vh-ui-hidden');
      }
    }, 2800);
  }
}

root.addEventListener('mousemove', resetInactivity);
root.addEventListener('touchstart', resetInactivity, { passive: true });
root.addEventListener('mouseleave', () => {
  if (!vid.paused && sheetBackdrop?.style.display === 'none' && !isScrubbing) {
    root.classList.add('vh-ui-hidden');
  }
});

/* Center Flash */
function flashBurst(isPause) {
  if (!burstBox) return;
  if (burstPlay) burstPlay.style.display = isPause ? 'none' : 'block';
  if (burstPause) burstPause.style.display = isPause ? 'block' : 'none';
  burstBox.classList.add('active');
  setTimeout(() => burstBox.classList.remove('active'), 320);
}

/* Play / Pause */
function togglePlay() {
  if (vid.paused) {
    vid.play().then(() => flashBurst(false)).catch(() => {});
  } else {
    vid.pause();
    flashBurst(true);
  }
  resetInactivity();
}

burstBox?.addEventListener('click', e => { e.stopPropagation(); togglePlay(); });
centerPlay?.addEventListener('click', e => { e.stopPropagation(); togglePlay(); });

vid.addEventListener('play', () => {
  root.classList.remove('vh-paused');
  if (playIcon) playIcon.style.display = 'none';
  if (pauseIcon) pauseIcon.style.display = 'block';
  startAmbient();
  resetInactivity();
});

vid.addEventListener('pause', () => {
  root.classList.add('vh-paused');
  if (playIcon) playIcon.style.display = 'block';
  if (pauseIcon) pauseIcon.style.display = 'none';
  if (burstPlay) burstPlay.style.display = 'block';
  if (burstPause) burstPause.style.display = 'none';
  stopAmbient();
  resetInactivity();
});

document.getElementById('sp-video-area')?.addEventListener('click', e => {
  if (sheetBackdrop && sheetBackdrop.style.display !== 'none') {
    closeSheet();
    return;
  }
  if (e.target.closest('.vh-bottom-container') || e.target.closest('.vh-top-bar') || e.target.closest('.vh-sheet-surface') || e.target.closest('#sp-error') || e.target.closest('.vh-lock-overlay')) {
    return;
  }
  togglePlay();
});

/* Double Tap 10s Seek Zones */
function triggerDoubleTap(side) {
  const pill = side === 'left' ? tapPillLeft : tapPillRight;
  if (!pill) return;
  pill.classList.add('active');
  setTimeout(() => pill.classList.remove('active'), 500);
}

function seekDelta(sec) {
  if (!Number.isFinite(vid.duration)) return;
  vid.currentTime = Math.min(Math.max(0, vid.currentTime + sec), vid.duration);
  triggerDoubleTap(sec > 0 ? 'right' : 'left');
  resetInactivity();
}

centerRewind?.addEventListener('click', e => { e.stopPropagation(); seekDelta(-10); });
centerForward?.addEventListener('click', e => { e.stopPropagation(); seekDelta(10); });

let lastTapTime = 0;
let lastTapX = 0;
document.getElementById('sp-video-area')?.addEventListener('touchend', e => {
  const now = Date.now();
  const touch = e.changedTouches[0];
  if (!touch) return;
  const rect = root.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const w = rect.width;

  if (now - lastTapTime < 320 && Math.abs(x - lastTapX) < 80) {
    if (x < w * 0.38) {
      seekDelta(-10);
    } else if (x > w * 0.62) {
      seekDelta(10);
    }
  }
  lastTapTime = now;
  lastTapX = x;
}, { passive: true });

/* Seekbar Scrubbing */
function getSeekPercent(e) {
  const rect = seekContainer.getBoundingClientRect();
  if (rect.width <= 0) return 0;
  const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
  const pos = (clientX - rect.left) / rect.width;
  return Math.min(100, Math.max(0, pos * 100));
}

function updateSeekUi(pct) {
  seekPlay.style.width = pct + '%';
  seekThumb.style.left = pct + '%';
  miniPlay.style.width = pct + '%';
  seekContainer.setAttribute('aria-valuenow', Math.round(pct));
}

seekContainer?.addEventListener('pointerdown', e => {
  e.stopPropagation();
  e.preventDefault();
  isScrubbing = true;
  seekContainer.classList.add('is-scrubbing');
  try { seekContainer.setPointerCapture(e.pointerId); } catch(err) {}
  const pct = getSeekPercent(e);
  updateSeekUi(pct);
  if (vid.duration) vid.currentTime = (pct / 100) * vid.duration;
});

seekContainer?.addEventListener('pointermove', e => {
  const pct = getSeekPercent(e);
  if (isScrubbing) {
    e.stopPropagation();
    updateSeekUi(pct);
    if (vid.duration) vid.currentTime = (pct / 100) * vid.duration;
  }
  if (seekTooltip && vid.duration) {
    const time = (pct / 100) * vid.duration;
    seekTooltip.textContent = formatTime(time);
    seekTooltip.style.left = pct + '%';
    seekTooltip.classList.add('active');
  }
});

function finishScrub(e) {
  if (isScrubbing) {
    isScrubbing = false;
    seekContainer.classList.remove('is-scrubbing');
    try { seekContainer.releasePointerCapture(e.pointerId); } catch(err) {}
    resetInactivity();
  }
}

seekContainer?.addEventListener('pointerup', finishScrub);
seekContainer?.addEventListener('pointercancel', finishScrub);
seekContainer?.addEventListener('pointerleave', () => {
  seekTooltip?.classList.remove('active');
});

/* Video Time & Progress */
vid.addEventListener('timeupdate', () => {
  if (!Number.isFinite(vid.duration) || vid.duration <= 0) return;
  const cur = vid.currentTime;
  const dur = vid.duration;

  if (!isScrubbing) {
    const pct = (cur / dur) * 100;
    updateSeekUi(pct);
  }

  if (timeCur) timeCur.textContent = formatTime(cur);
  if (timeDur) timeDur.textContent = formatTime(dur);

  if (introBand && cur >= introBand.start && cur < introBand.end) {
    vid.currentTime = introBand.end + 0.1;
  }
  if (outroBand && cur >= outroBand.start && cur < outroBand.end) {
    vid.currentTime = outroBand.end + 0.1;
  }

  renderCurrentSubtitle(cur);
});

vid.addEventListener('progress', () => {
  if (!vid.duration || vid.buffered.length === 0) return;
  const bufEnd = vid.buffered.end(vid.buffered.length - 1);
  const pct = (bufEnd / vid.duration) * 100;
  if (seekBuf) seekBuf.style.width = Math.min(100, pct) + '%';
});

vid.addEventListener('loadedmetadata', () => {
  if (timeDur) timeDur.textContent = formatTime(vid.duration);
  updateBands();
});

/* Intro / Outro Bands */
function updateBands() {
  if (!vid.duration || vid.duration <= 0) return;
  const dur = vid.duration;

  if (introBand) {
    const left = (introBand.start / dur) * 100;
    const width = ((introBand.end - introBand.start) / dur) * 100;
    if (seekIntro) {
      seekIntro.style.left = left + '%';
      seekIntro.style.width = width + '%';
      seekIntro.style.display = 'block';
    }
    if (miniIntro) {
      miniIntro.style.left = left + '%';
      miniIntro.style.width = width + '%';
      miniIntro.style.display = 'block';
    }
  }

  if (outroBand) {
    const left = (outroBand.start / dur) * 100;
    const width = ((outroBand.end - outroBand.start) / dur) * 100;
    if (seekOutro) {
      seekOutro.style.left = left + '%';
      seekOutro.style.width = width + '%';
      seekOutro.style.display = 'block';
    }
    if (miniOutro) {
      miniOutro.style.left = left + '%';
      miniOutro.style.width = width + '%';
      miniOutro.style.display = 'block';
    }
  }
}

/* Volume Controls */
function applyVolume(vol, muted, isAutoFallback) {
  vid.volume = vol;
  vid.muted = muted;
  // Tags a mute that was forced by the autoplay-blocked fallback (as
  // opposed to one the user actually chose via the mute button/slider/
  // keyboard) so a server switch can safely clear it — see
  // stopCurrentVideo() in watch-script1.ts. Any call to applyVolume()
  // that doesn't explicitly pass isAutoFallback=true (i.e. every real
  // user interaction) clears the tag.
  vid.dataset.autoMuted = (muted && isAutoFallback) ? '1' : '';

  // Only persist real, deliberate choices. A mute forced by a blocked
  // autoplay attempt is not something the user asked for — saving it
  // here previously meant every autoplay-block permanently wrote
  // muted:true to localStorage, silently overriding the user's next
  // manual unmute the moment the next switch also got autoplay-blocked
  // (which is most of them, since a switch's play() call happens after
  // an async fetch and often no longer counts as a fresh user gesture).
  if (!isAutoFallback) {
    settings.volume = vol;
    settings.muted = muted;
    saveSettings();
  }

  if (volSlider) volSlider.value = muted ? 0 : Math.round(vol * 100);
  const isZero = muted || vol === 0;
  if (volHighIcon) volHighIcon.style.display = isZero ? 'none' : 'block';
  if (volMuteIcon) volMuteIcon.style.display = isZero ? 'block' : 'none';

  if (settings.showWhenMuted && isZero && subTracks.length > 0 && activeSubIdx === -1) {
    setSubTrack(0);
  }
}

btnVol?.addEventListener('click', e => {
  e.stopPropagation();
  applyVolume(vid.volume, !vid.muted);
});

volSlider?.addEventListener('input', e => {
  e.stopPropagation();
  const v = Number(e.target.value) / 100;
  applyVolume(v, v === 0);
});

/* Subtitles (Parser, Rendering, Styling) */
function parseVtt(text) {
  const cues = [];
  const cleanText = String(text || '').replace(/\\r/g, '');
  const lines = cleanText.split(/\\n\\s*\\n/);
  const timeRe = /(\\d{1,2}:)?(\\d{2}):(\\d{2})[.,](\\d{3})\\s*-->\\s*(\\d{1,2}:)?(\\d{2}):(\\d{2})[.,](\\d{3})/;

  for (const block of lines) {
    const bLines = block.split('\\n').map(l => l.trim()).filter(Boolean);
    const timeIdx = bLines.findIndex(l => timeRe.test(l));
    if (timeIdx === -1) continue;

    const m = bLines[timeIdx].match(timeRe);
    if (!m) continue;

    const parseSeconds = (h, min, sec, ms) => {
      const hours = h ? parseInt(h.replace(':', ''), 10) : 0;
      return hours * 3600 + parseInt(min, 10) * 60 + parseInt(sec, 10) + parseInt(ms, 10) / 1000;
    };

    const start = parseSeconds(m[1], m[2], m[3], m[4]);
    const end = parseSeconds(m[5], m[6], m[7], m[8]);

    const cueText = bLines.slice(timeIdx + 1).join('<br>').replace(new RegExp('<(?!/?(i|b|u|font)\\\\b)[^>]+>', 'gi'), '');
    if (cueText) cues.push({ start, end, text: cueText });
  }
  return cues.sort((a, b) => a.start - b.start);
}

function renderCurrentSubtitle(time) {
  if (!settings.captionsEnabled || activeSubIdx === -1 || !parsedCues.length) {
    if (subText) subText.innerHTML = '';
    return;
  }

  const offset = settings.subSyncEnabled ? (settings.subSyncOffset || 0) : 0;
  const adjTime = time + offset;
  const active = parsedCues.find(c => adjTime >= c.start && adjTime <= c.end);

  if (active) {
    subText.innerHTML = active.text;
  } else {
    subText.innerHTML = '';
  }
}

function setSubTrack(idx) {
  activeSubIdx = idx;
  if (idx === -1) {
    settings.captionsEnabled = false;
    parsedCues = [];
    if (subText) subText.innerHTML = '';
    if (lblCaptions) lblCaptions.textContent = 'Off';
    if (capOnIcon) capOnIcon.style.display = 'none';
    if (capOffIcon) capOffIcon.style.display = 'block';
    topBtnCaptions?.querySelector('.vh-captions-on')?.setAttribute('style', 'display:none');
    topBtnCaptions?.querySelector('.vh-captions-off')?.removeAttribute('style');
  } else {
    settings.captionsEnabled = true;
    const track = subTracks[idx];
    if (track) {
      parsedCues = track.cues || [];
      if (lblCaptions) lblCaptions.textContent = track.label;
    }
    if (capOnIcon) capOnIcon.style.display = 'block';
    if (capOffIcon) capOffIcon.style.display = 'none';
    topBtnCaptions?.querySelector('.vh-captions-on')?.removeAttribute('style');
    topBtnCaptions?.querySelector('.vh-captions-off')?.setAttribute('style', 'display:none');
  }
  saveSettings();
  buildCaptionsMenu();
}

function applySubStyles() {
  if (!subContainer || !subText) return;
  subContainer.style.left = settings.subtitleHorizontal + '%';
  subContainer.style.top = settings.subtitlePosition + '%';
  subText.style.color = settings.subtitleColor;
  subText.style.fontSize = settings.subtitleSize + 'px';
  subText.style.backgroundColor = 'rgba(0, 0, 0, ' + (settings.subtitleBgOpacity / 100) + ')';

  if (valSubH) valSubH.textContent = settings.subtitleHorizontal + '%';
  if (valSubV) valSubV.textContent = settings.subtitlePosition + '%';
  if (valSubSize) valSubSize.textContent = settings.subtitleSize + 'px';
  if (valSubBg) valSubBg.textContent = settings.subtitleBgOpacity + '%';

  if (rangeSubH) rangeSubH.value = settings.subtitleHorizontal;
  if (rangeSubV) rangeSubV.value = settings.subtitlePosition;
  if (rangeSubSize) rangeSubSize.value = settings.subtitleSize;
  if (rangeSubBg) rangeSubBg.value = settings.subtitleBgOpacity;

  saveSettings();
}

rangeSubH?.addEventListener('input', e => { settings.subtitleHorizontal = Number(e.target.value); applySubStyles(); });
rangeSubV?.addEventListener('input', e => { settings.subtitlePosition = Number(e.target.value); applySubStyles(); });
rangeSubSize?.addEventListener('input', e => { settings.subtitleSize = Number(e.target.value); applySubStyles(); });
rangeSubBg?.addEventListener('input', e => { settings.subtitleBgOpacity = Number(e.target.value); applySubStyles(); });

headerReset?.addEventListener('click', e => {
  e.stopPropagation();
  settings.subtitleHorizontal = 50;
  settings.subtitlePosition = 88;
  settings.subtitleSize = 22;
  settings.subtitleBgOpacity = 50;
  applySubStyles();
});

btnCaptions?.addEventListener('click', e => {
  e.stopPropagation();
  if (settings.captionsEnabled && activeSubIdx !== -1) {
    setSubTrack(-1);
  } else if (subTracks.length > 0) {
    setSubTrack(0);
  }
});
topBtnCaptions?.addEventListener('click', e => { e.stopPropagation(); btnCaptions?.click(); });

/* Upload Subtitles File */
document.getElementById('vh-btn-upload-subs')?.addEventListener('click', e => {
  e.stopPropagation();
  subFileInput?.click();
});

subFileInput?.addEventListener('change', e => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const cues = parseVtt(ev.target.result);
    const lastDot = file.name.lastIndexOf('.');
    const cleanLabel = lastDot > 0 ? file.name.substring(0, lastDot) : file.name;
    subTracks.push({ label: cleanLabel, cues });
    buildCaptionsMenu();
    setSubTrack(subTracks.length - 1);
    closeSheet();
  };
  reader.readAsText(file);
});

function buildCaptionsMenu() {
  if (!captionsOptions) return;
  captionsOptions.innerHTML = '';

  const offBtn = document.createElement('button');
  offBtn.type = 'button';
  offBtn.className = 'vh-menu-item';
  offBtn.innerHTML = '<span class="vh-menu-label">Turn off captions</span>' + (!settings.captionsEnabled || activeSubIdx === -1 ? '<svg class="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : '');
  offBtn.onclick = () => { setSubTrack(-1); closeSheet(); };
  captionsOptions.appendChild(offBtn);

  subTracks.forEach((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vh-menu-item';
    b.innerHTML = '<span class="vh-menu-label">' + t.label + '</span>' + (settings.captionsEnabled && activeSubIdx === i ? '<svg class="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : '');
    b.onclick = () => { setSubTrack(i); closeSheet(); };
    captionsOptions.appendChild(b);
  });
}

swSubsync?.addEventListener('click', e => {
  e.stopPropagation();
  settings.subSyncEnabled = !settings.subSyncEnabled;
  swSubsync.classList.toggle('active', settings.subSyncEnabled);
  if (subsyncCtrls) subsyncCtrls.style.display = settings.subSyncEnabled ? 'flex' : 'none';
  saveSettings();
});

subOffsetMinus?.addEventListener('click', e => {
  e.stopPropagation();
  settings.subSyncOffset = Math.round(((settings.subSyncOffset || 0) - 0.5) * 10) / 10;
  if (subOffsetVal) subOffsetVal.textContent = (settings.subSyncOffset >= 0 ? '+' : '') + settings.subSyncOffset.toFixed(1) + 's';
  saveSettings();
});

subOffsetPlus?.addEventListener('click', e => {
  e.stopPropagation();
  settings.subSyncOffset = Math.round(((settings.subSyncOffset || 0) + 0.5) * 10) / 10;
  if (subOffsetVal) subOffsetVal.textContent = (settings.subSyncOffset >= 0 ? '+' : '') + settings.subSyncOffset.toFixed(1) + 's';
  saveSettings();
});

swShowMuted?.addEventListener('click', e => {
  e.stopPropagation();
  settings.showWhenMuted = !settings.showWhenMuted;
  swShowMuted.classList.toggle('active', settings.showWhenMuted);
  saveSettings();
});

swIosMode?.addEventListener('click', e => {
  e.stopPropagation();
  settings.iosMode = !settings.iosMode;
  swIosMode.classList.toggle('active', settings.iosMode);
  saveSettings();
});

document.getElementById('vh-btn-auto-translate')?.addEventListener('click', e => {
  e.stopPropagation();
  alert("Auto-translate isn't available yet");
});

/* Settings Sheet */
function openSheet() {
  sheetBackdrop.style.display = 'flex';
  sheetBackdrop.classList.remove('is-leaving');
  sheetSurface.classList.remove('is-leaving');
  navigateTo('settings-root', 'forward');
}

function closeSheet() {
  sheetBackdrop.classList.add('is-leaving');
  sheetSurface.classList.add('is-leaving');
  setTimeout(() => {
    sheetBackdrop.style.display = 'none';
  }, 220);
}

btnSettings?.addEventListener('click', e => { e.stopPropagation(); openSheet(); });
topBtnSettings?.addEventListener('click', e => { e.stopPropagation(); openSheet(); });
headerClose?.addEventListener('click', e => { e.stopPropagation(); closeSheet(); });
sheetBackdrop?.addEventListener('click', closeSheet);

function navigateTo(menuId, direction) {
  sheetPanel.dataset.dir = direction || 'forward';
  currentMenu = menuId;

  const menus = [menuRoot, menuQuality, menuSpeed, menuCaptions, menuSubStyle, menuMore, menuSleep];
  menus.forEach(m => { if (m) m.style.display = 'none'; });

  const titles = {
    'settings-root': 'Settings',
    'settings-quality': 'Quality',
    'settings-speed': 'Playback speed',
    'settings-captions': 'Captions',
    'settings-sub-style': 'Subtitle Style',
    'settings-more': 'More',
    'settings-sleep': 'Sleep timer',
  };

  if (headerTitle) headerTitle.textContent = titles[menuId] || 'Settings';
  const isRoot = menuId === 'settings-root';
  const isSubStyle = menuId === 'settings-sub-style';
  if (headerBack) headerBack.style.display = isRoot ? 'none' : 'flex';
  if (headerSpacer) headerSpacer.style.display = isRoot ? 'block' : 'none';
  if (headerReset) headerReset.style.display = isSubStyle ? 'block' : 'none';

  const target = {
    'settings-root': menuRoot,
    'settings-quality': menuQuality,
    'settings-speed': menuSpeed,
    'settings-captions': menuCaptions,
    'settings-sub-style': menuSubStyle,
    'settings-more': menuMore,
    'settings-sleep': menuSleep,
  }[menuId];

  if (target) target.style.display = 'block';
}

headerBack?.addEventListener('click', e => {
  e.stopPropagation();
  if (currentMenu === 'settings-sub-style') {
    navigateTo('settings-captions', 'back');
  } else if (currentMenu === 'settings-sleep') {
    navigateTo('settings-more', 'back');
  } else {
    navigateTo('settings-root', 'back');
  }
});

document.getElementById('vh-nav-quality')?.addEventListener('click', () => navigateTo('settings-quality', 'forward'));
document.getElementById('vh-nav-speed')?.addEventListener('click', () => navigateTo('settings-speed', 'forward'));
document.getElementById('vh-nav-captions')?.addEventListener('click', () => navigateTo('settings-captions', 'forward'));
document.getElementById('vh-nav-sub-style')?.addEventListener('click', () => navigateTo('settings-sub-style', 'forward'));
document.getElementById('vh-nav-more')?.addEventListener('click', () => navigateTo('settings-more', 'forward'));
document.getElementById('vh-nav-sleep')?.addEventListener('click', () => navigateTo('settings-sleep', 'forward'));

function lockPlayer() {
  root.setAttribute('data-locked', 'true');
  if (lockOverlay) lockOverlay.style.display = 'block';
  if (lockUnlockWrap) {
    lockUnlockWrap.classList.add('active');
    clearTimeout(unlockHideTimer);
    unlockHideTimer = setTimeout(() => {
      lockUnlockWrap.classList.remove('active');
    }, 3200);
  }
}

navLock?.addEventListener('click', () => {
  closeSheet();
  lockPlayer();
});

btnLock?.addEventListener('click', e => {
  e.stopPropagation();
  lockPlayer();
});

topBtnCast?.addEventListener('click', e => {
  e.stopPropagation();
  if (vid.remote && vid.remote.prompt) {
    vid.remote.prompt().catch(() => {});
  }
});

lockOverlay?.addEventListener('click', () => {
  if (lockUnlockWrap) {
    lockUnlockWrap.classList.add('active');
    clearTimeout(unlockHideTimer);
    unlockHideTimer = setTimeout(() => {
      lockUnlockWrap.classList.remove('active');
    }, 3200);
  }
});

btnUnlock?.addEventListener('click', e => {
  e.stopPropagation();
  root.removeAttribute('data-locked');
  if (lockOverlay) lockOverlay.style.display = 'none';
  if (lockUnlockWrap) lockUnlockWrap.classList.remove('active');
  resetInactivity();
});

/* Quality Switching (HLS Levels) */
function buildQualityMenu() {
  if (!qualityOptions) return;
  qualityOptions.innerHTML = '';

  const levels = (hls && hls.levels) ? hls.levels : [];
  const curLvl = hls ? hls.currentLevel : -1;

  const autoBtn = document.createElement('button');
  autoBtn.type = 'button';
  autoBtn.className = 'vh-menu-item';
  autoBtn.innerHTML = '<span class="vh-menu-label">Auto</span>' + (curLvl === -1 ? '<svg class="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : '');
  autoBtn.onclick = () => {
    if (hls) hls.currentLevel = -1;
    if (lblQuality) lblQuality.textContent = 'Auto';
    closeSheet();
  };
  qualityOptions.appendChild(autoBtn);

  const sorted = levels.map((lvl, idx) => ({ lvl, idx })).sort((a, b) => (b.lvl.height || 0) - (a.lvl.height || 0));
  sorted.forEach(({ lvl, idx }) => {
    const h = lvl.height || Math.round(lvl.bitrate / 1000) + 'k';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vh-menu-item';
    b.innerHTML = '<span class="vh-menu-label">' + h + 'p</span>' + (curLvl === idx ? '<svg class="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : '');
    b.onclick = () => {
      if (hls) hls.currentLevel = idx;
      if (lblQuality) lblQuality.textContent = h + 'p';
      closeSheet();
    };
    qualityOptions.appendChild(b);
  });

  const isHd = levels.some(l => (l.height || 0) >= 720);
  if (hdBadge) hdBadge.style.display = isHd ? 'block' : 'none';
}

/* Speed Switching */
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
function buildSpeedMenu() {
  if (!speedOptions) return;
  speedOptions.innerHTML = '';

  SPEEDS.forEach(spd => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vh-menu-item';
    const label = spd === 1 ? 'Normal' : spd + 'x';
    b.innerHTML = '<span class="vh-menu-label">' + label + '</span>' + (settings.speed === spd ? '<svg class="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : '');
    b.onclick = () => {
      vid.playbackRate = spd;
      settings.speed = spd;
      saveSettings();
      if (lblSpeed) lblSpeed.textContent = label;
      buildSpeedMenu();
      closeSheet();
    };
    speedOptions.appendChild(b);
  });
}

/* Sleep Timer */
const SLEEP_OPTIONS = [
  { id: 'off', label: 'Off', min: 0 },
  { id: '10m', label: '10 minutes', min: 10 },
  { id: '15m', label: '15 minutes', min: 15 },
  { id: '20m', label: '20 minutes', min: 20 },
  { id: '30m', label: '30 minutes', min: 30 },
  { id: '45m', label: '45 minutes', min: 45 },
  { id: '60m', label: '60 minutes', min: 60 },
  { id: 'end', label: 'End of episode', min: -1 }
];

let selectedSleepId = 'off';

function buildSleepMenu() {
  if (!sleepOptions) return;
  sleepOptions.innerHTML = '';

  SLEEP_OPTIONS.forEach(opt => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vh-menu-item';
    b.innerHTML = '<span class="vh-menu-label">' + opt.label + '</span>' + (selectedSleepId === opt.id ? '<svg class="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : '');
    b.onclick = () => {
      selectedSleepId = opt.id;
      clearTimeout(sleepTimer);
      if (lblSleep) lblSleep.textContent = opt.id === 'off' ? 'Off' : (opt.min > 0 ? opt.min + 'm' : 'End');
      if (opt.min > 0) {
        sleepTimer = setTimeout(() => {
          vid.pause();
          if (sleepOverlay) sleepOverlay.style.display = 'flex';
        }, opt.min * 60 * 1000);
      }
      buildSleepMenu();
      navigateTo('settings-more', 'back');
    };
    sleepOptions.appendChild(b);
  });
}

btnResumeSleep?.addEventListener('click', () => {
  if (sleepOverlay) sleepOverlay.style.display = 'none';
  selectedSleepId = 'off';
  if (lblSleep) lblSleep.textContent = 'Off';
  vid.play().catch(()=>{});
});

/* Toggles */
swAutoplay?.addEventListener('click', e => {
  e.stopPropagation();
  settings.autoplay = !settings.autoplay;
  swAutoplay.classList.toggle('active', settings.autoplay);
  saveSettings();
});

swLoop?.addEventListener('click', e => {
  e.stopPropagation();
  settings.loop = !settings.loop;
  vid.loop = settings.loop;
  swLoop.classList.toggle('active', settings.loop);
  saveSettings();
});

swAmbient?.addEventListener('click', e => {
  e.stopPropagation();
  settings.ambient = !settings.ambient;
  swAmbient.classList.toggle('active', settings.ambient);
  ambientCanvas?.classList.toggle('active', settings.ambient);
  if (settings.ambient && !vid.paused) startAmbient(); else stopAmbient();
  saveSettings();
});

swStableVol?.addEventListener('click', e => {
  e.stopPropagation();
  settings.stableVol = !settings.stableVol;
  swStableVol.classList.toggle('active', settings.stableVol);
  toggleStableVolume(settings.stableVol);
  saveSettings();
});

function toggleStableVolume(on) {
  if (on) {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        compressorNode = audioCtx.createDynamicsCompressor();
        compressorNode.threshold.setValueAtTime(-24, audioCtx.currentTime);
        compressorNode.knee.setValueAtTime(30, audioCtx.currentTime);
        compressorNode.ratio.setValueAtTime(12, audioCtx.currentTime);
        compressorNode.attack.setValueAtTime(0.003, audioCtx.currentTime);
        compressorNode.release.setValueAtTime(0.25, audioCtx.currentTime);
        sourceNode = audioCtx.createMediaElementSource(vid);
        sourceNode.connect(compressorNode);
        compressorNode.connect(audioCtx.destination);
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch(err) {
      console.warn('Stable volume error', err);
    }
  }
}

/* Ambient Glow Loop */
function renderAmbient() {
  if (!settings.ambient || vid.paused || !ambientCanvas) return;
  if (!ambientCtx) ambientCtx = ambientCanvas.getContext('2d', { alpha: false });
  if (ambientCtx && vid.videoWidth > 0) {
    ambientCanvas.width = 32;
    ambientCanvas.height = 18;
    ambientCtx.drawImage(vid, 0, 0, 32, 18);
  }
  ambientRaf = requestAnimationFrame(renderAmbient);
}

function startAmbient() {
  if (!settings.ambient) return;
  ambientCanvas?.classList.add('active');
  cancelAnimationFrame(ambientRaf);
  ambientRaf = requestAnimationFrame(renderAmbient);
}

function stopAmbient() {
  cancelAnimationFrame(ambientRaf);
}

/* Fullscreen & Picture in Picture */
function isFs() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
}

function lockScreenOrientation() {
  try {
    if (window.screen?.orientation?.lock) {
      window.screen.orientation.lock('landscape').catch(() => {});
    }
  } catch(e) {}
}

function unlockScreenOrientation() {
  try {
    if (window.screen?.orientation?.unlock) {
      window.screen.orientation.unlock();
    }
  } catch(e) {}
}

function toggleFs() {
  if (!isFs()) {
    const r = root.requestFullscreen?.() || root.webkitRequestFullscreen?.() || root.mozRequestFullScreen?.();
    if (r && typeof r.then === 'function') {
      r.then(lockScreenOrientation).catch(() => {});
    } else {
      lockScreenOrientation();
    }
    if (vid && typeof vid.webkitEnterFullscreen === 'function') {
      try { vid.webkitEnterFullscreen(); } catch(e) {}
    }
  } else {
    unlockScreenOrientation();
    document.exitFullscreen?.() || document.webkitExitFullscreen?.() || document.mozCancelFullScreen?.();
  }
}

btnFs?.addEventListener('click', e => { e.stopPropagation(); toggleFs(); });
btnFsMobile?.addEventListener('click', e => { e.stopPropagation(); toggleFs(); });

function onFsChange() {
  const fs = isFs();
  root.setAttribute('data-player-fullscreen', fs ? 'true' : 'false');
  document.querySelectorAll('.vh-fs-enter').forEach(el => el.style.display = fs ? 'none' : 'block');
  document.querySelectorAll('.vh-fs-exit').forEach(el => el.style.display = fs ? 'block' : 'none');
  if (topTitle) {
    topTitle.textContent = fs ? (topTitle.dataset.fulltitle || '') : '';
  }
  if (fs) {
    lockScreenOrientation();
  } else {
    unlockScreenOrientation();
  }
}

document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);

btnPip?.addEventListener('click', async e => {
  e.stopPropagation();
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (document.pictureInPictureEnabled) {
      await vid.requestPictureInPicture();
    }
  } catch(err) {}
});

/* Keyboard Hotkeys */
window.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  const k = e.key.toLowerCase();

  switch(k) {
    case ' ':
    case 'k':
      e.preventDefault();
      togglePlay();
      break;
    case 'arrowleft':
    case 'j':
      e.preventDefault();
      seekDelta(-10);
      break;
    case 'arrowright':
    case 'l':
      e.preventDefault();
      seekDelta(10);
      break;
    case 'arrowup':
      e.preventDefault();
      applyVolume(Math.min(1, vid.volume + 0.1), false);
      break;
    case 'arrowdown':
      e.preventDefault();
      applyVolume(Math.max(0, vid.volume - 0.1), vid.volume <= 0.1);
      break;
    case 'm':
      e.preventDefault();
      applyVolume(vid.volume, !vid.muted);
      break;
    case 'f':
      e.preventDefault();
      toggleFs();
      break;
    case 'c':
      e.preventDefault();
      btnCaptions?.click();
      break;
    default:
      if (k >= '0' && k <= '9' && vid.duration) {
        e.preventDefault();
        vid.currentTime = (parseInt(k) / 10) * vid.duration;
      }
      break;
  }
});

/* HLS Stream Loader */
function loadHLS(m3u8Url) {
  if (!m3u8Url) {
    if (spinner) spinner.classList.add('hide');
    if (errMsg) errMsg.textContent = 'No stream URL provided.';
    if (errBox) errBox.classList.add('show');
    return;
  }

  currentM3u8 = m3u8Url;
  if (spinner) spinner.classList.remove('hide');
  if (errBox) errBox.classList.remove('show');

  if (hls) {
    try { hls.destroy(); } catch(e) {}
    hls = null;
  }

  if (window.Hls && window.Hls.isSupported()) {
    hls = new window.Hls({
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 90,
      capLevelToPlayerSize: false,
    });

    hls.loadSource(m3u8Url);
    hls.attachMedia(vid);

    hls.on(window.Hls.Events.MANIFEST_PARSED, (evt, data) => {
      if (spinner) spinner.classList.add('hide');
      buildQualityMenu();
      if (settings.autoplay) {
        vid.play().catch(() => { applyVolume(vid.volume, true, true); vid.play().catch(() => {}); });
      }
    });

    hls.on(window.Hls.Events.LEVEL_SWITCHED, (evt, data) => {
      const lvl = hls.levels[data.level];
      if (lvl && lblQuality && hls.currentLevel === -1) {
        lblQuality.textContent = 'Auto (' + (lvl.height || 0) + 'p)';
      }
    });

    hls.on(window.Hls.Events.ERROR, (evt, data) => {
      if (data.fatal) {
        if (spinner) spinner.classList.add('hide');
        switch (data.type) {
          case window.Hls.ErrorTypes.NETWORK_ERROR:
            hls.startLoad();
            break;
          case window.Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            hls.destroy();
            if (errBox) errBox.classList.add('show');
            break;
        }
      }
    });
  } else if (vid.canPlayType('application/vnd.apple.mpegurl')) {
    vid.src = m3u8Url;
    vid.addEventListener('loadedmetadata', () => {
      if (spinner) spinner.classList.add('hide');
      if (settings.autoplay) vid.play().catch(() => {});
    });
    vid.addEventListener('error', () => {
      if (spinner) spinner.classList.add('hide');
      if (errBox) errBox.classList.add('show');
    });
  } else {
    if (spinner) spinner.classList.add('hide');
    if (errMsg) errMsg.textContent = 'HLS streaming is not supported on this browser.';
    if (errBox) errBox.classList.add('show');
  }
}

/* Init Defaults */
applyVolume(settings.volume, settings.muted);
applySubStyles();
buildSpeedMenu();
buildSleepMenu();
if (swAutoplay) swAutoplay.classList.toggle('active', settings.autoplay);
if (swLoop) swLoop.classList.toggle('active', settings.loop);
if (swAmbient) swAmbient.classList.toggle('active', settings.ambient);
if (swStableVol) swStableVol.classList.toggle('active', settings.stableVol);
if (swSubsync) swSubsync.classList.toggle('active', settings.subSyncEnabled);
if (subsyncCtrls) subsyncCtrls.style.display = settings.subSyncEnabled ? 'flex' : 'none';
if (subOffsetVal) subOffsetVal.textContent = (settings.subSyncOffset >= 0 ? '+' : '') + (settings.subSyncOffset || 0).toFixed(1) + 's';
if (swShowMuted) swShowMuted.classList.toggle('active', settings.showWhenMuted);
if (swIosMode) swIosMode.classList.toggle('active', settings.iosMode);
root.classList.add('vh-paused');

/* Public API (SenshiPlayer compatibility for AniVault) */
window.SenshiPlayer = {
  load: function(url) {
    if (!url) return;
    if (url.includes('.mp4') || (!url.includes('.m3u8') && !url.includes('/hls/'))) {
      if (hls) { try { hls.destroy(); } catch(e) {} hls = null; }
      vid.src = url;
      vid.load();
      if (settings.autoplay) {
        const p = vid.play();
        if (p && p.catch) {
          p.catch(() => {
            applyVolume(vid.volume, true, true);
            vid.play().catch(() => {});
          });
        }
      }
    } else {
      loadHLS(url);
    }
  },
  loadWithSubs: function(url, subs, intro, outro) {
    introBand = intro || null;
    outroBand = outro || null;
    subTracks = [];
    activeSubIdx = -1;

    if (Array.isArray(subs) && subs.length > 0) {
      let pending = subs.length;
      subs.forEach((s, i) => {
        fetch(s.url)
          .then(r => r.text())
          .then(txt => {
            subTracks[i] = { label: s.label || s.lang || ('Track ' + (i + 1)), cues: parseVtt(txt) };
          })
          .catch(() => {})
          .finally(() => {
            pending--;
            if (pending <= 0) {
              subTracks = subTracks.filter(Boolean);
              buildCaptionsMenu();
              if (settings.captionsEnabled && subTracks.length > 0) {
                setSubTrack(0);
              }
            }
          });
      });
    }

    if (url && (url.includes('.mp4') || (!url.includes('.m3u8') && !url.includes('/hls/')))) {
      if (hls) { try { hls.destroy(); } catch(e) {} hls = null; }
      vid.src = url;
      vid.load();
      if (settings.autoplay) {
        const p = vid.play();
        if (p && p.catch) {
          p.catch(() => {
            applyVolume(vid.volume, true, true);
            vid.play().catch(() => {});
          });
        }
      }
    } else {
      loadHLS(url);
    }
  },
  retry: function() {
    const errBox = document.getElementById('sp-error');
    if (errBox) errBox.classList.remove('show');
    const spinEl = document.getElementById('sp-spinner');
    if (spinEl) spinEl.classList.remove('hide');

    if (typeof window.retryCurrentServer === 'function') {
      window.retryCurrentServer();
      return;
    }
    if (currentM3u8) {
      loadHLS(currentM3u8);
    } else if (vid && vid.src) {
      vid.load();
      vid.play().catch(() => {});
    }
  },
  destroy: function() {
    if (hls) {
      try { hls.destroy(); } catch(e) {}
      hls = null;
    }
    stopAmbient();
    clearTimeout(idleTimer);
    clearTimeout(sleepTimer);
  }
};

})();
</script>`;
}
