// VidHawk / Enma 4 Player DOM Tree for AniVault
import { h } from '../lib/helpers';

export interface PlayerBodyParams {
  title: string;
  epNum: number;
  currentEpTitle: string | null;
  prevEpNum: number | null;
  nextEpNum: number | null;
  watchBase: string;
  epNums: number[];
  curEp: number;
  totalEpsN: number;
  episodesWatched?: number;
}

function renderEpGrid(epNums: number[], curEp: number, watchBase: string, totalEpsN: number, episodesWatched: number): string {
  if (epNums.length === 0) return '';
  const visibleCount = 24;
  const hasMore = epNums.length > visibleCount;
  let out = `<div class="sp-ep-divider"><span>All Episodes${totalEpsN > 0 ? ' · ' + totalEpsN + ' eps' : ''}</span></div>`;
  out += '<div class="sp-ep-grid" id="sp-ep-grid">';
  epNums.forEach((n, i) => {
    const isWatched = episodesWatched > 0 && n <= episodesWatched;
    const cls = 'sp-ep-chip' + (n === curEp ? ' current' : '') + (isWatched ? ' watched' : '') + (i >= visibleCount ? ' sp-ep-extra' : '');
    out += `<a class="${cls}" href="${h(watchBase + n)}">${n}</a>`;
  });
  out += '</div>';
  if (hasMore) {
    const extra = epNums.length - visibleCount;
    out += `<button class="sp-ep-more" id="sp-ep-more-btn" type="button" data-more-count="${extra}"><span id="sp-ep-more-label">Show More (${extra})</span><svg viewBox="0 0 24 24"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg></button>`;
  }
  return out;
}

export function playerBody(p: PlayerBodyParams): string {
  const { title, epNum, currentEpTitle, prevEpNum, nextEpNum, watchBase, epNums, curEp, totalEpsN, episodesWatched } = p;
  const epGridHtml = renderEpGrid(epNums, curEp, watchBase, totalEpsN, episodesWatched ?? 0);
  const fullTitle = `${title}${currentEpTitle && currentEpTitle !== 'TBA' ? ' — ' + currentEpTitle : ' — Ep ' + epNum}`;

  return `<!-- ══════════════ VIDHAWK / ENMA 4 HLS PLAYER ══════════════ -->
<div id="senshi-player-root" class="relative z-20 h-full w-full bg-black">

  <div id="sp-video-area">

    <!-- Video Element -->
    <video id="sp-video" playsinline preload="metadata"></video>

    <!-- Tap-to-play fallback holder if autoplay restricted -->
    <div id="sp-preplay" class="hide" style="display:none;">
      <button id="sp-pp-btn" aria-label="Play" style="display:none;"></button>
    </div>

    <!-- Subtitle Container -->
    <div id="vh-sub-container" class="vh-sub-container">
      <div id="vh-sub-text" class="vh-sub-text"></div>
    </div>

    <!-- Spinner (LoaderCircle) -->
    <div id="sp-spinner" class="hide">
      <svg class="h-10 w-10 animate-spin text-white/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
      </svg>
    </div>

    <!-- Error Overlay -->
    <div id="sp-error">
      <div class="flex h-11 w-11 items-center justify-center rounded-full border border-red-500/30 bg-red-500/15">
        <svg class="h-6 w-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" x2="12" y1="8" y2="12"></line><line x1="12" x2="12.01" y1="16" y2="16"></line></svg>
      </div>
      <h3 class="text-base font-bold text-white">Server unavailable</h3>
      <p class="text-[13px] leading-relaxed text-white/60" id="sp-err-msg">Streaming server is down. Try again later.</p>
      <button class="mt-2 rounded-full bg-white px-5 py-2 text-xs font-semibold text-black hover:bg-white/90" onclick="SenshiPlayer.retry()">Try Again</button>
    </div>



    <!-- Top & Bottom Gradient Scrims -->
    <div class="vh-gradient-overlay" aria-hidden="true"></div>

    <!-- Main Interactive UI Layer -->
    <div class="vh-main-ui" id="vh-main-ui">

      <!-- Top Header Bar -->
      <div class="vh-top-bar">
        <div class="vh-top-scrim" aria-hidden="true"></div>
        <!-- Title only displayed in Fullscreen (VidHawk exact behavior) -->
        <span id="vh-top-title" class="vh-top-title" data-fulltitle="${h(fullTitle)}"></span>
        <span class="vh-top-spacer"></span>
        <!-- Mobile/Touch Quick Controls Pill (Hidden on Desktop) -->
        <div class="vh-top-mobile-ctrls vh-glass" id="vh-top-mobile-ctrls">
          <button type="button" aria-label="Cast" class="vh-btn h-8 w-8" id="vh-top-btn-cast">
            <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"></path><path d="M2 12a9 9 0 0 1 8 8"></path><path d="M2 16a5 5 0 0 1 4 4"></path><line x1="2" x2="2.01" y1="20" y2="20"></line></svg>
          </button>
          <button type="button" aria-label="Captions" class="vh-btn h-8 w-8" id="vh-top-btn-captions">
            <svg class="vh-captions-on h-[18px] w-[18px]" style="display:none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="14" x="3" y="5" rx="2" ry="2"></rect><path d="M7 15h4M15 15h2M7 11h2M13 11h4"></path></svg>
            <svg class="vh-captions-off h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 5H19a2 2 0 0 1 2 2v8.5"></path><path d="M17 11h-.5"></path><path d="M19 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2"></path><path d="m2 2 20 20"></path><path d="M7 11h4"></path><path d="M7 15h2.5"></path></svg>
          </button>
          <button type="button" aria-label="Settings" class="vh-btn h-8 w-8" id="vh-top-btn-settings">
            <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"></path><circle cx="12" cy="12" r="3"></circle></svg>
          </button>
        </div>
      </div>

      <!-- Center Controls Cluster (Mobile: Rewind 10s, 56px Play/Pause, Forward 10s) -->
      <div class="vh-center-controls" id="vh-center-controls">
        <button type="button" aria-label="Rewind 10 seconds" id="vh-center-rewind" class="vh-btn vh-center-rewind">
          <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
        </button>
        <button type="button" aria-label="Play" id="vh-center-play" class="vh-btn vh-center-play vh-glass">
          <svg class="vh-play-icon h-7 w-7 fill-current" viewBox="0 0 24 24"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"></path></svg>
          <svg class="vh-pause-icon h-7 w-7 fill-current" viewBox="0 0 24 24" style="display:none;"><rect x="14" y="3" width="5" height="18" rx="1"></rect><rect x="5" y="3" width="5" height="18" rx="1"></rect></svg>
        </button>
        <button type="button" aria-label="Forward 10 seconds" id="vh-center-forward" class="vh-btn vh-center-forward">
          <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg>
        </button>
      </div>

      <!-- Bottom Controls Bar (Seekbar + Floating Pill Islands) -->
      <div class="vh-bottom-container" id="vh-bottom-container">

        <!-- Seekbar (lf component) -->
        <div class="vh-seek-container group/seek" id="vh-seek-container" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="vh-seek-track" id="vh-seek-track">
            <div class="vh-seek-buffered" id="vh-seek-buf" style="width:0%"></div>
            <div class="vh-seek-played" id="vh-seek-play" style="width:0%"></div>
            <div class="vh-seek-intro-band" id="vh-seek-intro" style="display:none"></div>
            <div class="vh-seek-outro-band" id="vh-seek-outro" style="display:none"></div>
          </div>
          <div class="vh-seek-thumb" id="vh-seek-thumb" style="left:0%"></div>
          <div class="vh-seek-tooltip" id="vh-seek-tooltip">0:00</div>
        </div>

        <!-- Bottom Controls Row: Floating Pill Islands -->
        <div class="vh-bottom-row">

          <!-- Left Pill Island (Volume + Time) -->
          <div class="vh-bottom-left">

            <!-- Volume Pill Island -->
            <div class="group/vol vh-glass vh-vol-pill">
              <button type="button" id="vh-btn-vol" aria-label="Mute" class="vh-btn h-8 w-8 sm:h-9 sm:w-9">
                <svg class="vh-vol-high h-4 w-4 sm:h-[18px] sm:w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"></path>
                  <path d="M16 9a5 5 0 0 1 0 6"></path>
                  <path d="M19.364 18.364a9 9 0 0 0 0-12.728"></path>
                </svg>
                <svg class="vh-vol-mute h-4 w-4 sm:h-[18px] sm:w-[18px]" style="display:none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"></path>
                  <line x1="22" x2="16" y1="9" y2="15"></line>
                  <line x1="16" x2="22" y1="9" y2="15"></line>
                </svg>
              </button>
              <input type="range" min="0" max="100" step="1" value="100" id="vh-vol-slider" aria-label="Volume" class="vh-vol-slider">
            </div>

            <!-- Time Display Pill -->
            <span class="vh-glass vh-time-pill">
              <span id="vh-time-cur">0:00</span> / <span id="vh-time-dur">0:00</span>
            </span>

          </div>

          <!-- Desktop Right Pill Island -->
          <div class="vh-glass vh-bottom-right vh-desktop-only">

            <!-- Next Episode Button (if available) -->
            ${nextEpNum !== null ? `
            <button type="button" id="vh-btn-next-ep" aria-label="Next Episode" title="Next Episode" class="vh-btn h-9 w-9" onclick="location.href='${h(watchBase + nextEpNum)}'">
              <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
            </button>` : ''}

            <!-- Captions Button -->
            <button type="button" id="vh-btn-captions" aria-label="Turn on captions" class="vh-btn h-9 w-9">
              <svg class="vh-captions-on h-[18px] w-[18px]" style="display:none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="14" x="3" y="5" rx="2" ry="2"></rect>
                <path d="M7 15h4M15 15h2M7 11h2M13 11h4"></path>
              </svg>
              <svg class="vh-captions-off h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.5 5H19a2 2 0 0 1 2 2v8.5"></path>
                <path d="M17 11h-.5"></path>
                <path d="M19 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2"></path>
                <path d="m2 2 20 20"></path>
                <path d="M7 11h4"></path>
                <path d="M7 15h2.5"></path>
              </svg>
            </button>

            <!-- Settings Button with HD Badge -->
            <button type="button" id="vh-btn-settings" aria-label="Settings" class="vh-btn relative h-9 w-9">
              <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              <span id="vh-hd-badge" class="vh-hd-badge" style="display:none;">HD</span>
            </button>

            <!-- Picture-in-picture Button -->
            <button type="button" id="vh-btn-pip" aria-label="Picture-in-picture" class="vh-btn h-9 w-9">
              <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h4"></path>
                <rect width="10" height="7" x="12" y="13" rx="2"></rect>
              </svg>
            </button>

            <!-- Fullscreen Button -->
            <button type="button" id="vh-btn-fs" aria-label="Fullscreen" class="vh-btn h-9 w-9">
              <svg class="vh-fs-enter h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3"></path>
                <path d="M21 8V5a2 2 0 0 0-2-2h-3"></path>
                <path d="M3 16v3a2 2 0 0 0 2 2h3"></path>
                <path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>
              </svg>
              <svg class="vh-fs-exit h-[18px] w-[18px]" style="display:none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3"></path>
                <path d="M21 8h-3a2 2 0 0 1-2-2V3"></path>
                <path d="M3 16h3a2 2 0 0 1 2 2v3"></path>
                <path d="M16 21v-3a2 2 0 0 1 2-2h3"></path>
              </svg>
            </button>

          </div>

          <!-- Mobile Right Pill Island (Lock + Fullscreen) -->
          <div class="vh-glass vh-bottom-right vh-mobile-only">
            <!-- Lock Screen Button -->
            <button type="button" id="vh-btn-lock" aria-label="Lock screen" title="Lock screen" class="vh-btn h-8 w-8">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </button>

            <!-- Fullscreen Button -->
            <button type="button" id="vh-btn-fs-mobile" aria-label="Fullscreen" class="vh-btn h-8 w-8">
              <svg class="vh-fs-enter h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3"></path>
                <path d="M21 8V5a2 2 0 0 0-2-2h-3"></path>
                <path d="M3 16v3a2 2 0 0 0 2 2h3"></path>
                <path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>
              </svg>
              <svg class="vh-fs-exit h-4 w-4" style="display:none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3"></path>
                <path d="M21 8h-3a2 2 0 0 1-2-2V3"></path>
                <path d="M3 16h3a2 2 0 0 1 2 2v3"></path>
                <path d="M16 21v-3a2 2 0 0 1 2-2h3"></path>
              </svg>
            </button>
          </div>

        </div>

        </div>

      </div>

    </div><!-- /vh-main-ui -->

    <!-- Mini 3px Progress Bar (Visible when UI is auto-hidden) -->
    <div class="vh-mini-progress">
      <div class="vh-mini-track">
        <div class="vh-mini-played" id="vh-mini-play" style="width:0%"></div>
        <div class="vh-mini-intro" id="vh-mini-intro" style="display:none"></div>
        <div class="vh-mini-outro" id="vh-mini-outro" style="display:none"></div>
      </div>
    </div>

    <!-- Sleep Timer Ended Overlay -->
    <div class="vh-sleep-ended-overlay" id="vh-sleep-ended-overlay" style="display:none;">
      <svg class="h-8 w-8 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
      <p class="text-sm font-semibold text-white">Sleep timer ended</p>
      <p class="text-xs text-white/55">Playback paused. Keep watching?</p>
      <button type="button" class="mt-1 rounded-full bg-white px-4 py-2 text-xs font-bold text-black hover:bg-white/90" id="vh-btn-resume-sleep">Resume watching</button>
    </div>

    <!-- Lock Screen Unlock Pill (Mobile) -->
    <div class="vh-lock-overlay" id="vh-lock-overlay" style="display:none;">
      <div class="vh-lock-unlock-wrap" id="vh-lock-unlock-wrap">
        <button type="button" id="vh-btn-unlock" class="vh-glass flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold tracking-wide text-white">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
          Unlock
        </button>
      </div>
    </div>

    <!-- ═══ OFFICIAL VIDHAWK SETTINGS SHEET ═══ -->
    <div class="vh-sheet-backdrop" id="vh-sheet-backdrop" style="display:none;">
      <div class="vh-sheet-surface" id="vh-sheet-surface" onclick="event.stopPropagation()">

        <!-- Sheet Header (lu component) -->
        <div id="vh-sheet-header" class="vh-sheet-header">
          <button type="button" id="vh-header-back" aria-label="Back" class="vh-btn h-8 w-8" style="display:none;">
            <svg class="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"></path></svg>
          </button>
          <span id="vh-header-spacer" class="w-8"></span>
          <span id="vh-header-title" class="vh-header-title">Settings</span>
          <button type="button" id="vh-header-reset" class="vh-header-reset" style="display:none;">Reset</button>
          <button type="button" id="vh-header-close" aria-label="Close" class="vh-btn h-8 w-8">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
          </button>
        </div>

        <!-- Sheet Panel Viewport (data-dir='forward' / 'back') -->
        <div class="vh-sheet-panel" id="vh-sheet-panel" data-dir="forward">

          <!-- 1. ROOT MENU -->
          <div id="vh-menu-root" class="p-1.5">
            <!-- Audio (if available) -->
            <div id="vh-nav-audio-wrap" style="display:none;">
              <button type="button" class="vh-menu-item" id="vh-nav-audio">
                <span class="vh-menu-icon"><svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"></path><path d="M16 9a5 5 0 0 1 0 6"></path><path d="M19.364 18.364a9 9 0 0 0 0-12.728"></path></svg></span>
                <span class="vh-menu-label">Audio</span>
                <span id="vh-lbl-audio" class="vh-menu-value">Sub</span>
                <svg class="vh-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>
              </button>
            </div>

            <!-- Quality -->
            <button type="button" class="vh-menu-item" id="vh-nav-quality">
              <span class="vh-menu-icon"><svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="21" x2="14" y1="4" y2="4"></line><line x1="10" x2="3" y1="4" y2="4"></line><line x1="21" x2="12" y1="12" y2="12"></line><line x1="8" x2="3" y1="12" y2="12"></line><line x1="21" x2="16" y1="20" y2="20"></line><line x1="12" x2="3" y1="20" y2="20"></line><line x1="14" x2="14" y1="2" y2="6"></line><line x1="8" x2="8" y1="10" y2="14"></line><line x1="16" x2="16" y1="18" y2="22"></line></svg></span>
              <span class="vh-menu-label">Quality</span>
              <span id="vh-lbl-quality" class="vh-menu-value">Auto</span>
              <svg class="vh-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>
            </button>

            <!-- Playback Speed -->
            <button type="button" class="vh-menu-item" id="vh-nav-speed">
              <span class="vh-menu-icon"><svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m12 14 4-4"></path><path d="M3.34 19a10 10 0 1 1 17.32 0"></path></svg></span>
              <span class="vh-menu-label">Playback speed</span>
              <span id="vh-lbl-speed" class="vh-menu-value">Normal</span>
              <svg class="vh-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>
            </button>

            <!-- Captions -->
            <button type="button" class="vh-menu-item" id="vh-nav-captions">
              <span class="vh-menu-icon"><svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="14" x="3" y="5" rx="2" ry="2"></rect><path d="M7 15h4M15 15h2M7 11h2M13 11h4"></path></svg></span>
              <span class="vh-menu-label">Captions</span>
              <span id="vh-lbl-captions" class="vh-menu-value">Off</span>
              <svg class="vh-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>
            </button>

            <!-- Lock Screen (Mobile only) -->
            <button type="button" class="vh-menu-item" id="vh-nav-lock" style="display:none;">
              <span class="vh-menu-icon"><svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></span>
              <span class="vh-menu-label">Lock screen</span>
            </button>

            <!-- More -->
            <button type="button" class="vh-menu-item" id="vh-nav-more">
              <span class="vh-menu-icon"><svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"></path><circle cx="12" cy="12" r="3"></circle></svg></span>
              <span class="vh-menu-label">More</span>
              <svg class="vh-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>
            </button>
          </div>

          <!-- 2. QUALITY SUBMENU -->
          <div id="vh-menu-quality" class="p-1.5" style="display:none;">
            <div id="vh-quality-options"></div>
          </div>

          <!-- 3. SPEED SUBMENU -->
          <div id="vh-menu-speed" class="p-1.5" style="display:none;">
            <div id="vh-speed-options"></div>
          </div>

          <!-- 4. CAPTIONS SUBMENU -->
          <div id="vh-menu-captions" class="p-1.5" style="display:none;">
            <div id="vh-captions-options"></div>
            <!-- Upload subtitles -->
            <button type="button" class="vh-menu-item" id="vh-btn-upload-subs">
              <span class="vh-menu-icon"><svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" x2="12" y1="3" y2="15"></line></svg></span>
              <span class="vh-menu-label">Upload subtitles</span>
              <span class="vh-menu-value">.vtt / .srt / .ass</span>
            </button>
            <div class="vh-divider"></div>
            <!-- Sub sync row -->
            <div class="vh-toggle-row">
              <div class="min-w-0">
                <p class="text-sm font-medium text-white">Sub sync</p>
                <p class="mt-0.5 text-[11px] leading-snug text-white/40">Nudge soft subs to match dub timing.</p>
              </div>
              <button type="button" role="switch" id="vh-sw-subsync" class="vh-switch-btn" aria-label="Sub sync"><span class="vh-switch-dot"></span></button>
            </div>
            <!-- Sub sync offset controls (visible when Sub sync is enabled) -->
            <div id="vh-subsync-controls" class="vh-offset-row" style="display:none;">
              <span class="text-xs text-white/50">Offset</span>
              <div class="flex items-center gap-2">
                <button type="button" id="vh-sub-offset-minus" class="vh-offset-btn">−0.5s</button>
                <span id="vh-sub-offset-val" class="vh-offset-val">+0.0s</span>
                <button type="button" id="vh-sub-offset-plus" class="vh-offset-btn">+0.5s</button>
              </div>
            </div>
            <div class="vh-divider"></div>
            <!-- Subtitle Style Link -->
            <button type="button" class="vh-menu-item" id="vh-nav-sub-style">
              <span class="vh-menu-icon"><svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="21" x2="14" y1="4" y2="4"></line><line x1="10" x2="3" y1="4" y2="4"></line><line x1="21" x2="12" y1="12" y2="12"></line><line x1="8" x2="3" y1="12" y2="12"></line><line x1="21" x2="16" y1="20" y2="20"></line><line x1="12" x2="3" y1="20" y2="20"></line><line x1="14" x2="14" y1="2" y2="6"></line><line x1="8" x2="8" y1="10" y2="14"></line><line x1="16" x2="16" y1="18" y2="22"></line></svg></span>
              <span class="vh-menu-label">Subtitle style</span>
              <svg class="vh-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>
            </button>
            <!-- Auto-translate row -->
            <button type="button" class="vh-menu-item" id="vh-btn-auto-translate">
              <span class="vh-menu-label">Auto-translate</span>
            </button>
            <!-- Show when muted row -->
            <div class="vh-toggle-row">
              <div class="min-w-0">
                <p class="text-sm font-medium text-white">Show when muted</p>
                <p class="mt-0.5 text-[11px] leading-snug text-white/40">Captions turn on automatically whenever you mute the video.</p>
              </div>
              <button type="button" role="switch" id="vh-sw-show-muted" class="vh-switch-btn" aria-label="Show captions when muted"><span class="vh-switch-dot"></span></button>
            </div>
            <!-- iOS mode row -->
            <div class="vh-toggle-row">
              <div class="min-w-0">
                <p class="text-sm font-medium text-white">iOS mode</p>
                <p class="mt-0.5 text-[11px] leading-snug text-white/40">Force native Safari subtitles off in fullscreen (iPhone / iPad).</p>
              </div>
              <button type="button" role="switch" id="vh-sw-ios-mode" class="vh-switch-btn" aria-label="iOS mode"><span class="vh-switch-dot"></span></button>
            </div>
          </div>

          <!-- 5. SUBTITLE STYLE SUBMENU -->
          <div id="vh-menu-sub-style" class="py-1" style="display:none;">
            <!-- Horizontal slider -->
            <div class="vh-slider-row">
              <div class="mb-2 flex items-center justify-between gap-3">
                <span class="text-sm font-medium text-white">Horizontal</span>
                <span id="vh-val-sub-h" class="text-sm tabular-nums text-white/70">0%</span>
              </div>
              <input type="range" id="vh-range-sub-h" min="0" max="100" step="1" value="0" class="w-full accent-cyan-400" aria-label="Horizontal">
            </div>
            <!-- Vertical slider -->
            <div class="vh-slider-row">
              <div class="mb-2 flex items-center justify-between gap-3">
                <span class="text-sm font-medium text-white">Vertical</span>
                <span id="vh-val-sub-v" class="text-sm tabular-nums text-white/70">90%</span>
              </div>
              <input type="range" id="vh-range-sub-v" min="0" max="100" step="1" value="90" class="w-full accent-cyan-400" aria-label="Vertical">
            </div>
            <!-- Size slider -->
            <div class="vh-slider-row">
              <div class="mb-2 flex items-center justify-between gap-3">
                <span class="text-sm font-medium text-white">Size</span>
                <span id="vh-val-sub-size" class="text-sm tabular-nums text-white/70">22px</span>
              </div>
              <input type="range" id="vh-range-sub-size" min="12" max="48" step="1" value="22" class="w-full accent-cyan-400" aria-label="Size">
            </div>
            <!-- Background slider -->
            <div class="vh-slider-row">
              <div class="mb-2 flex items-center justify-between gap-3">
                <span class="text-sm font-medium text-white">Background</span>
                <span id="vh-val-sub-bg" class="text-sm tabular-nums text-white/70">50%</span>
              </div>
              <input type="range" id="vh-range-sub-bg" min="0" max="100" step="1" value="50" class="w-full accent-cyan-400" aria-label="Background">
            </div>
          </div>

          <!-- 6. MORE SUBMENU -->
          <div id="vh-menu-more" class="p-1.5" style="display:none;">
            <!-- Autoplay -->
            <div class="vh-toggle-row">
              <span class="flex items-center gap-4 text-sm font-normal text-white">
                <svg class="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"></path></svg>
                Autoplay
              </span>
              <button type="button" role="switch" id="vh-sw-autoplay" class="vh-switch-btn active" aria-label="Autoplay"><span class="vh-switch-dot"></span></button>
            </div>
            <!-- Loop video -->
            <div class="vh-toggle-row">
              <span class="flex items-center gap-4 text-sm font-normal text-white">
                <svg class="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"></path><path d="M3 11v-1a4 4 0 0 1 4-4h14"></path><path d="m7 22-4-4 4-4"></path><path d="M21 13v1a4 4 0 0 1-4 4H3"></path></svg>
                Loop video
              </span>
              <button type="button" role="switch" id="vh-sw-loop" class="vh-switch-btn" aria-label="Loop video"><span class="vh-switch-dot"></span></button>
            </div>
            <!-- Ambient mode -->
            <div class="vh-toggle-row">
              <span class="flex items-center gap-4 text-sm font-normal text-white">
                <svg class="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path><path d="M20 3v4"></path><path d="M22 5h-4"></path><path d="M4 17v2"></path><path d="M5 18H3"></path></svg>
                Ambient mode
              </span>
              <button type="button" role="switch" id="vh-sw-ambient" class="vh-switch-btn active" aria-label="Ambient mode"><span class="vh-switch-dot"></span></button>
            </div>
            <!-- Stable volume -->
            <div class="vh-toggle-row">
              <span class="flex items-center gap-4 text-sm font-normal text-white">
                <svg class="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"></path><path d="M16 9a5 5 0 0 1 0 6"></path><path d="M19.364 18.364a9 9 0 0 0 0-12.728"></path></svg>
                Stable volume
              </span>
              <button type="button" role="switch" id="vh-sw-stable-vol" class="vh-switch-btn" aria-label="Stable volume"><span class="vh-switch-dot"></span></button>
            </div>
            <!-- Sleep timer link -->
            <button type="button" class="vh-menu-item" id="vh-nav-sleep">
              <span class="vh-menu-icon"><svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></span>
              <span class="vh-menu-label">Sleep timer</span>
              <span id="vh-lbl-sleep" class="vh-menu-value">Off</span>
              <svg class="vh-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>
            </button>
            <!-- Help and feedback link -->
            <button type="button" class="vh-menu-item" id="vh-nav-help" onclick="window.open('/request','_blank','noopener,noreferrer')">
              <span class="vh-menu-icon"><svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg></span>
              <span class="vh-menu-label">Help and feedback</span>
            </button>
          </div>

          <!-- 7. SLEEP TIMER SUBMENU -->
          <div id="vh-menu-sleep" class="p-1.5" style="display:none;">
            <div id="vh-sleep-options"></div>
          </div>

        </div>

      </div>
    </div><!-- /vh-sheet-backdrop -->

    <!-- Hidden Subtitle Upload Input -->
    <input type="file" id="vh-sub-file-input" accept=".vtt,.srt,.ass,.ssa,text/vtt,application/x-subrip" style="display:none;">

  </div><!-- /sp-video-area -->

  <!-- Episode Grid below player -->
  <div id="sp-panel">
    ${epGridHtml}
  </div>

</div><!-- /senshi-player-root -->
`;
}
