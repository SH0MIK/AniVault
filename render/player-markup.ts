// Ports the markup section of pages/player.php (the Senshi HLS player's
// HTML), split around the episode-chips loop which needed real control flow
// rather than a ternary substitution. Parts A and C are extracted verbatim
// from the PHP source with only its <?= ?> tags swapped for TS template
// expressions; the middle (episode grid + "Show More" button) is hand-written
// since it's a real foreach loop, not a one-line interpolation.
import { h } from '../lib/helpers';

export interface PlayerMarkupProps {
  prevEpNum: number | null;
  nextEpNum: number | null;
  title: string;
  epNum: number;
  currentEpInfo: { title?: string } | null;
  watchBase: string;
  epNums: number[];
  curEp: number;
  totalEpsN: number;
}

export function renderPlayerMarkup(p: PlayerMarkupProps): string {
  const { prevEpNum, nextEpNum, title, epNum, currentEpInfo, watchBase, epNums, curEp, totalEpsN } = p;

  const partA = `<!-- ══════════════ PLAYER HTML ══════════════ -->
<div id="senshi-player-root">

  <!-- HUD corners -->
  <div class="sp-corner tl" aria-hidden="true"></div>
  <div class="sp-corner tr" aria-hidden="true"></div>
  <div class="sp-corner bl" aria-hidden="true"></div>
  <div class="sp-corner br" aria-hidden="true"></div>

  <div id="sp-video-area">

    <!-- Video element -->
    <video id="sp-video" playsinline preload="metadata"></video>

    <!-- Spinner -->
    <div id="sp-spinner"><div class="sp-spin"></div></div>

    <!-- Error -->
    <div id="sp-error">
      <div class="sp-err-icon">⚠️</div>
      <div class="sp-err-title">Stream Unavailable</div>
      <p class="sp-err-msg" id="sp-err-msg">Could not load the stream.</p>
      <button class="sp-err-retry" onclick="SenshiPlayer.retry()">Try Again</button>
    </div>

    <!-- Pre-play overlay -->
    <div id="sp-preplay" class="hide">
      <div id="sp-pp-bg"></div>
      <div id="sp-pp-vignette"></div>
      <button id="sp-pp-btn" aria-label="Play">
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      </button>
    </div>

    <!-- Centre play/pause + episode skip -->
    <div id="sp-center">
      <button type="button" class="sp-cr-btn sp-cr-side${prevEpNum === null ? ' disabled' : ''}" id="sp-cr-prev-btn"
         data-href="${prevEpNum !== null ? h(watchBase + prevEpNum) : ''}" aria-label="Previous Episode" data-tip="Previous Episode">
        <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
      </button>
      <button class="sp-cr-btn" id="sp-cr-btn">
        <svg id="sp-cr-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      </button>
      <button type="button" class="sp-cr-btn sp-cr-side${nextEpNum === null ? ' disabled' : ''}" id="sp-cr-next-btn"
         data-href="${nextEpNum !== null ? h(watchBase + nextEpNum) : ''}" aria-label="Next Episode" data-tip="Next Episode">
        <svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zm-10 12 8.5-6L6 6v12z"/></svg>
      </button>
    </div>

    <!-- Double-tap zones -->
    <div class="sp-zone" id="sp-zone-l">
      <div class="sp-zone-lbl">
        <svg viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>
        -5s
      </div>
    </div>
    <div class="sp-zone" id="sp-zone-r">
      <div class="sp-zone-lbl">
        <svg viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
        +10s
      </div>
    </div>

    <!-- Subtitle layer -->
    <div id="sp-sub-tokens"></div>
    <div id="sp-sub-layer"></div>

    <!-- Keyboard shortcut overlay -->
    <div id="sp-sc-overlay">
      <div>
        <div style="font-family:'Orbitron',monospace;font-size:.65rem;font-weight:700;letter-spacing:.14em;color:rgba(124,58,237,.5);text-transform:uppercase;text-align:center;margin-bottom:.9rem">Keyboard Shortcuts</div>
        <div class="sp-sc-grid">
          <span class="sp-sc-key">Space / K</span><span class="sp-sc-desc">Play / Pause</span>
          <span class="sp-sc-key">← / →</span><span class="sp-sc-desc">Seek ±10 seconds</span>
          <span class="sp-sc-key">↑ / ↓</span><span class="sp-sc-desc">Volume ±10%</span>
          <span class="sp-sc-key">M</span><span class="sp-sc-desc">Mute / Unmute</span>
          <span class="sp-sc-key">F</span><span class="sp-sc-desc">Fullscreen</span>
          <span class="sp-sc-key">Shift + N</span><span class="sp-sc-desc">Next episode</span>
          <span class="sp-sc-key">Shift + P</span><span class="sp-sc-desc">Previous episode</span>
          <span class="sp-sc-key">?</span><span class="sp-sc-desc">This overlay</span>
        </div>
        <div style="text-align:center;margin-top:1rem">
          <button onclick="document.getElementById('sp-sc-overlay').classList.remove('show')"
            style="background:none;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.45);padding:.3rem .9rem;border-radius:6px;cursor:pointer;font-size:.72rem;">Close</button>
        </div>
      </div>
    </div>

    <!-- Top bar -->
    <div id="sp-topbar">
      <div>
        <div class="sp-top-title">${h(title || '')}</div>
        <div class="sp-top-ep">Episode ${epNum || 0}${currentEpInfo?.title && currentEpInfo.title !== 'TBA' ? ' — ' + h(currentEpInfo.title) : ''}</div>
      </div>
      <div class="sp-top-right">
        <button class="sp-btn xs" id="sp-help-btn" data-tip="Shortcuts (?)">
          <svg viewBox="0 0 24 24"><path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/></svg>
        </button>
        <span id="sp-hls-badge">HLS</span>
      </div>
    </div>

    <!-- Controls -->
    <div id="sp-controls">
      <!-- Progress -->
      <div id="sp-prog-area">
        <div id="sp-prog-track">
          <div id="sp-prog-buf"></div>
          <div id="sp-prog-fill"></div>
          <div id="sp-prog-thumb"></div>
        </div>
        <div id="sp-prog-tip">0:00</div>
      </div>
      <!-- Bottom row -->
      <div class="sp-btm">
        <button class="sp-btn" id="sp-play-btn" data-tip="Play (Space)">
          <svg id="sp-play-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <button class="sp-btn sm" id="sp-back-btn" data-tip="Back 10s (←)">
          <svg viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>
        </button>
        <button class="sp-btn sm" id="sp-fwd-btn" data-tip="Fwd 10s (→)">
          <svg viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
        </button>
        <div class="sp-vol-wrap">
          <button class="sp-btn sm" id="sp-mute-btn" data-tip="Mute (M)">
            <svg id="sp-vol-icon" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
          </button>
          <input type="range" class="sp-vol-slider" id="sp-vol" min="0" max="1" step="0.05" value="1">
        </div>
        <span class="sp-time" id="sp-time">0:00<span class="sp-time-sep">/</span>0:00</span>
        <div class="sp-spacer"></div>
        <!-- Settings (opens overlay menu) -->
        <button class="sp-btn sm" id="sp-set-btn" data-tip="Settings">
          <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
        </button>
        <button class="sp-btn sm" id="sp-fs-btn" data-tip="Fullscreen (F)">
          <svg id="sp-fs-icon" viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
        </button>
      </div>
    </div>

    <!-- Settings menu (video overlay) -->
    <div class="sp-menu" id="sp-set-menu">
      <div class="sp-tab-bar">
        <button class="sp-tab active" data-stab="quality">
          <svg viewBox="0 0 24 24"><path d="M15.5 5H11l-4 8h3.5L8 19l10-9h-4z"/></svg>Quality
        </button>
        <button class="sp-tab" data-stab="speed">
          <svg viewBox="0 0 24 24"><path d="M13 2.05v2.02c3.95.49 7 3.85 7 7.93 0 3.21-1.81 6-4.72 7.72L13 17v5h5l-1.22-1.22C19.91 19.07 22 15.76 22 12c0-5.18-3.95-9.45-9-9.95zm-2 0C5.95 2.55 2 6.82 2 12c0 3.76 2.09 7.07 5.22 8.78L6 22h5v-5l-2.28 2.28C7.06 18.15 6 15.2 6 12c0-4.08 3.05-7.44 7-7.93V2.05z"/></svg>Speed
        </button>
        <button class="sp-tab" data-stab="subs">
          <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-10 7H8v-1H6v2h2v1H6v1h2v-1h2v-3zm7 0h-2v-1h-2v2h2v1h-2v1h2v-1h2v-3z"/></svg>Subs
        </button>
      </div>
      <div class="sp-tab-panel" id="sp-stab-quality">
        <div id="sp-qual-list">
          <div class="sp-menu-item active" data-level="-1">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
            Auto
          </div>
        </div>
      </div>
      <div class="sp-tab-panel sp-tab-hidden" id="sp-stab-speed">
        <div class="sp-speed-grid">
          <button class="sp-speed-opt" data-speed="0.25">0.25×</button>
          <button class="sp-speed-opt" data-speed="0.5">0.5×</button>
          <button class="sp-speed-opt" data-speed="0.75">0.75×</button>
          <button class="sp-speed-opt active" data-speed="1">Normal</button>
          <button class="sp-speed-opt" data-speed="1.25">1.25×</button>
          <button class="sp-speed-opt" data-speed="1.5">1.5×</button>
          <button class="sp-speed-opt" data-speed="1.75">1.75×</button>
          <button class="sp-speed-opt" data-speed="2">2×</button>
        </div>
      </div>
      <div class="sp-tab-panel sp-tab-hidden" id="sp-stab-subs">
        <!-- Track list: populated by JS; "Disable" always first -->
        <div id="sp-sub-list">
          <div class="sp-sub-item" id="sp-sub-disable">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/></svg>
            Disable
          </div>
        </div>
        <!-- Edit Style accordion -->
        <button class="sp-sub-edit-btn" id="sp-sub-edit-btn">
          Edit Style
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
        </button>
        <div class="sp-sub-style-wrap" id="sp-sub-style-wrap">
          <div class="sp-sub-panel">
            <label><span>Size</span><input type="range" id="sp-sub-size" min="70" max="180" value="100" step="5"></label>
            <label><span>Position</span><input type="range" id="sp-sub-pos" min="5" max="35" value="14" step="1"></label>
            <label><span>Background</span>
              <select id="sp-sub-bg">
                <option value="rgba(0,0,0,0.72)">Dark box</option>
                <option value="rgba(0,0,0,0)">No box</option>
                <option value="rgba(0,0,0,0.95)">Black box</option>
                <option value="rgba(30,30,90,0.8)">Blue box</option>
              </select>
            </label>
            <label><span>Font</span>
              <select id="sp-sub-font">
                <option value="Arial,sans-serif">Arial</option>
                <option value="'Georgia',serif">Georgia</option>
                <option value="'Trebuchet MS',sans-serif">Trebuchet</option>
                <option value="'Courier New',monospace">Monospace</option>
              </select>
            </label>
            <label><span>Color</span>
              <input type="color" id="sp-sub-color" value="#ffffff" style="width:36px;height:22px;padding:0;border:none;background:none;cursor:pointer;">
            </label>
          </div>
        </div>
      </div>
    </div>

  </div><!-- /#sp-video-area -->

  <!-- Single floating tooltip for info strip (JS-positioned, never clipped) -->
  <div id="sp-istat-float-tip"></div>

  <!-- ══ PANEL (below video) ══ -->
  <div id="sp-panel">

    <!-- Info strip -->
    <div id="sp-info-strip">
      <div class="sp-istat" data-tip="Resolution">
        <!-- Resolution icon -->
        <svg viewBox="0 0 24 24"><path d="M1 5v14h22V5H1zm20 12H3V7h18v10zm-8-9h-2v2H9v2h2v2h2v-2h2v-2h-2z"/></svg>
        <span class="sp-istat-val" id="sp-i-res">—</span>
      </div>
      <div class="sp-istat-sep"></div>
      <div class="sp-istat" data-tip="Bitrate">
        <!-- Bitrate / signal icon -->
        <svg viewBox="0 0 24 24"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4 2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>
        <span class="sp-istat-val" id="sp-i-br">—</span>
      </div>
      <div class="sp-istat-sep"></div>
      <div class="sp-istat" data-tip="Buffer">
        <!-- Buffer icon -->
        <svg viewBox="0 0 24 24"><path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61-1.42-1.42c-1.75-1.75-4.65-1.75-6.4 0L9.79 7.39C11.38 5.8 13.56 5 15.73 5s4.35.8 5.94 2.39L21.03 7.39zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7zm0-16C6.48 4 2 8.48 2 14s4.48 10 10 10 10-4.48 10-10S17.52 4 12 4z"/></svg>
        <span class="sp-istat-val" id="sp-i-buf">—</span>
      </div>
      <div class="sp-istat-sep"></div>
      <div class="sp-istat" data-tip="Codec">
        <!-- Codec icon -->
        <svg viewBox="0 0 24 24"><path d="M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>
        <span class="sp-istat-val" id="sp-i-codec">—</span>
      </div>
      <div class="sp-istat-sep"></div>
      <div class="sp-istat" data-tip="Level">
        <!-- Level icon -->
        <svg viewBox="0 0 24 24"><path d="M4 14h4v-4H4v4zm0 5h4v-4H4v4zM4 9h4V5H4v4zm5 5h12v-4H9v4zm0 5h12v-4H9v4zM9 5v4h12V5H9z"/></svg>
        <span class="sp-istat-val" id="sp-i-lvl">—</span>
      </div>
      <div class="sp-istat-sep"></div>
      <div class="sp-istat" data-tip="Dropped Frames">
        <!-- Dropped frames icon -->
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
        <span class="sp-istat-val" id="sp-i-drop">0</span>
      </div>
    </div>

    <!-- Tabs -->
    <div id="sp-panel-tabs">
      <button class="sp-ptab active" data-ptab="eps">Episodes</button>
      <button class="sp-ptab" data-ptab="quality">Quality</button>
      <button class="sp-ptab" data-ptab="speed">Speed</button>
      <button class="sp-ptab" data-ptab="stats">Stats</button>
      <button class="sp-ptab" data-ptab="keys">Keys</button>
    </div>
    <div id="sp-panel-body">

      <!-- Episodes -->
      <div class="sp-psec active" id="sp-ptab-eps">
        
        <!-- Prev / Next navigation -->
        <div class="sp-ep-nav">
          <a class="sp-ep-nav-btn${prevEpNum === null ? ' disabled' : ''}"
             href="${prevEpNum !== null ? h(watchBase + prevEpNum) : '#'}">
            <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
            <div class="sp-ep-nav-lbl">
              <small>Previous</small>
              ${prevEpNum !== null ? 'Ep ' + prevEpNum : 'None'}
            </div>
          </a>
          <a class="sp-ep-nav-btn next${nextEpNum === null ? ' disabled' : ''}"
             href="${nextEpNum !== null ? h(watchBase + nextEpNum) : '#'}">
            <div class="sp-ep-nav-lbl">
              <small>Next</small>
              ${nextEpNum !== null ? 'Ep ' + nextEpNum : 'None'}
            </div>
            <svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zm2.5-6 8.5 6V6z"/></svg>
          </a>
        </div>
        `;
  const partC = `      </div>

      <!-- Quality -->
      <div class="sp-psec" id="sp-ptab-quality">
        <div class="sp-qual-grid" id="sp-panel-qual-list">
          <div class="sp-qopt active" data-level="-1"><div class="sp-qopt-lbl">Auto</div><div class="sp-qopt-sub">Adaptive</div></div>
        </div>
      </div>

      <!-- Speed -->
      <div class="sp-psec" id="sp-ptab-speed">
        <div class="sp-spd-grid">
          <div class="sp-sopt" data-spd="0.25">0.25×</div>
          <div class="sp-sopt" data-spd="0.5">0.5×</div>
          <div class="sp-sopt" data-spd="0.75">0.75×</div>
          <div class="sp-sopt active" data-spd="1">1×</div>
          <div class="sp-sopt" data-spd="1.25">1.25×</div>
          <div class="sp-sopt" data-spd="1.5">1.5×</div>
          <div class="sp-sopt" data-spd="1.75">1.75×</div>
          <div class="sp-sopt" data-spd="2">2×</div>
        </div>
      </div>

      <!-- Stats -->
      <div class="sp-psec" id="sp-ptab-stats">
        <div class="sp-stat-bar">
          <div class="sp-stat-item">Segments <span id="sp-s-segs">0</span></div>
          <div class="sp-stat-item">Protocol <span>HLS</span></div>
          <div class="sp-stat-item">Network <span id="sp-s-net">—</span></div>
        </div>
        <div style="font-family:'Orbitron',monospace;font-size:.44rem;letter-spacing:.18em;color:var(--sp-text-muted);text-transform:uppercase;margin-bottom:6px">Buffer Health</div>
        <div id="sp-buf-chart"></div>
      </div>

      <!-- Keys -->
      <div class="sp-psec" id="sp-ptab-keys">
        <div class="sp-keys-grid">
          <div class="sp-key-row"><span class="sp-kbd">Space</span><span class="sp-key-desc">Play / Pause</span></div>
          <div class="sp-key-row"><span class="sp-kbd">← →</span><span class="sp-key-desc">Seek ±10s</span></div>
          <div class="sp-key-row"><span class="sp-kbd">↑ ↓</span><span class="sp-key-desc">Volume ±10%</span></div>
          <div class="sp-key-row"><span class="sp-kbd">M</span><span class="sp-key-desc">Mute toggle</span></div>
          <div class="sp-key-row"><span class="sp-kbd">F</span><span class="sp-key-desc">Fullscreen</span></div>
          <div class="sp-key-row"><span class="sp-kbd">?</span><span class="sp-key-desc">Shortcuts</span></div>
          <div class="sp-key-row"><span class="sp-kbd">0–9</span><span class="sp-key-desc">Seek to %</span></div>
          <div class="sp-key-row"><span class="sp-kbd">K</span><span class="sp-key-desc">Play / Pause</span></div>
        </div>
      </div>

    </div>
  </div>

</div><!-- /#senshi-player-root -->

<!-- HLS.js -->`;

  let middle = '';
  if (epNums.length > 0) {
    const visibleCount = 24;
    const hasMore = epNums.length > visibleCount;

    middle += `
        <div class="sp-ep-divider">
          <span>All Episodes${totalEpsN > 0 ? ' · ' + totalEpsN + ' eps' : ''}</span>
        </div>
        <div class="sp-ep-grid" id="sp-ep-grid">
          ${epNums.map((n, i) => `<a class="sp-ep-chip${n === curEp ? ' current' : ''}${i >= visibleCount ? ' sp-ep-extra' : ''}" href="${h(watchBase + n)}">${n}</a>`).join('')}
        </div>`;

    if (hasMore) {
      const extra = epNums.length - visibleCount;
      middle += `
        <button class="sp-ep-more" id="sp-ep-more-btn" type="button" data-more-count="${extra}">
          <span id="sp-ep-more-label">Show More (${extra})</span>
          <svg viewBox="0 0 24 24"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
        </button>`;
    }
  }

  return partA + middle + partC;
}
