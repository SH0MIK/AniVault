export const PLAYER_CSS = `
/* ══════════════════════════════════════════════════════════════════════════
   OFFICIAL VIDHAWK / ENMA 4 CSS — PIXEL FOR PIXEL REPLICA
   ══════════════════════════════════════════════════════════════════════════ */
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap');

:root {
  --vh-ios-fade-ms: 220ms;
  --vh-ios-sheet-ms: 320ms;
  --vh-ios-panel-ms: 260ms;
  --vh-ios-ease: cubic-bezier(0.32, 0.72, 0, 1);
}

/* ── Utility shims for VidHawk class names used in player body ─────────── */
.h-3   { height: 0.75rem; }
.h-3\.5 { height: 0.875rem; }
.h-4   { height: 1rem; }
.h-4\.5 { height: 1.125rem; }
.h-6   { height: 1.5rem; }
.h-7   { height: 1.75rem; }
.h-8   { height: 2rem; }
.h-9   { height: 2.25rem; }
.h-10  { height: 2.5rem; }
.h-11  { height: 2.75rem; }
.h-14  { height: 3.5rem; }
.h-16  { height: 4rem; }
.h-full { height: 100%; }
.h-screen { height: 100dvh; }
.w-3   { width: 0.75rem; }
.w-3\.5 { width: 0.875rem; }
.w-4   { width: 1rem; }
.w-6   { width: 1.5rem; }
.w-7   { width: 1.75rem; }
.w-8   { width: 2rem; }
.w-9   { width: 2.25rem; }
.w-10  { width: 2.5rem; }
.w-11  { width: 2.75rem; }
.w-16  { width: 4rem; }
.w-full { width: 100%; }
.w-screen { width: 100vw; }

/* h-[18px] w-[18px] arbitrary Tailwind values used by VidHawk icons */
[class*="h-\\[18px\\]"], .vh-btn > svg:first-child { width: 18px; height: 18px; }
.h-\[18px\] { height: 18px; }
.w-\[18px\] { width: 18px; }

.fill-current { fill: currentColor; }
.shrink-0 { flex-shrink: 0; }
.relative { position: relative; }
.z-20 { z-index: 20; }
.z-30 { z-index: 30; }
.bg-black { background-color: #000; }
.text-white { color: #fff; }
.font-bold { font-weight: 700; }
.font-semibold { font-weight: 600; }
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }
.text-xs { font-size: 0.75rem; line-height: 1rem; }
.text-base { font-size: 1rem; line-height: 1.5rem; }
.leading-relaxed { line-height: 1.625; }
.tracking-wide { letter-spacing: 0.025em; }
.mt-1 { margin-top: 0.25rem; }
.mt-2 { margin-top: 0.5rem; }
.px-4 { padding-left: 1rem; padding-right: 1rem; }
.px-5 { padding-left: 1.25rem; padding-right: 1.25rem; }
.py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
.px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
.px-3\.5 { padding-left: 0.875rem; padding-right: 0.875rem; }
.py-1\.5 { padding-top: 0.375rem; padding-bottom: 0.375rem; }
.rounded-full { border-radius: 9999px; }
.flex { display: flex; }
.inline-flex { display: inline-flex; }
.items-center { align-items: center; }
.justify-center { justify-content: center; }
.gap-1\.5 { gap: 0.375rem; }
.gap-2 { gap: 0.5rem; }
.gap-3 { gap: 0.75rem; }
.gap-4 { gap: 1rem; }
.min-w-0 { min-width: 0; }
.overflow-hidden { overflow: hidden; }
.text-center { text-align: center; }
.absolute { position: absolute; }
.inset-0 { inset: 0; }
.p-1\.5 { padding: 0.375rem; }
.p-2 { padding: 0.5rem; }
.p-3 { padding: 0.75rem; }
.p-4 { padding: 1rem; }
.py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
.flex-col { flex-direction: column; }
.flex-1 { flex: 1 1 0%; }
.pointer-events-none { pointer-events: none; }
.select-none { user-select: none; -webkit-user-select: none; }
.tabular-nums { font-variant-numeric: tabular-nums; }
.whitespace-nowrap { white-space: nowrap; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.w-72 { width: 18rem; }
.max-h-56 { max-height: 14rem; }
.max-h-80 { max-height: 20rem; }

/* Animate-spin for spinner */
@keyframes spin { to { transform: rotate(360deg); } }
.animate-spin { animation: spin 1s linear infinite; }

/* Pulse for server toast */
@keyframes pulse { 50% { opacity: 0.5; } }
.animate-pulse { animation: pulse 2s cubic-bezier(0.4,0,0.6,1) infinite; }

/* accent-cyan-400 */
.accent-cyan-400 { accent-color: #22d3ee; }

/* p-1.5 shorthand for submenu panels */
#vh-menu-root, #vh-menu-quality, #vh-menu-speed,
#vh-menu-captions, #vh-menu-more, #vh-menu-sleep { padding: 0.375rem; }
#vh-menu-sub-style { padding-block: 0.25rem; }


#senshi-player-root,
#watch-player,
[data-vh-player] {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background-color: #000000;
  font-family: 'Manrope', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #ffffff;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
  border-radius: 12px;
}

#senshi-player-root:fullscreen,
#senshi-player-root:-webkit-full-screen,
#watch-player:fullscreen,
#watch-player:-webkit-full-screen,
[data-player-fullscreen="true"] {
  width: 100vw !important;
  height: 100dvh !important;
  max-width: none !important;
  max-height: none !important;
  border-radius: 0 !important;
  aspect-ratio: auto !important;
}

/* VidHawk Frosted Glass Utility Token (nB) */
.vh-glass {
  border: 1px solid rgba(255, 255, 255, 0.15);
  background-color: rgba(0, 0, 0, 0.65);
  color: rgba(255, 255, 255, 0.9);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  backface-visibility: hidden;
  transform: translateZ(0);
}

.vh-ctrl-glass {
  backface-visibility: hidden;
  transform: translateZ(0);
}

/* Video Surface */
#sp-video-area {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
}

#sp-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

/* Scrim Gradients - bottom controls shadow only when UI active */
.vh-gradient-overlay {
  pointer-events: none;
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  height: 140px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.25) 50%, transparent 100%);
  opacity: 0;
  transition: opacity 200ms cubic-bezier(0.32, 0.72, 0, 1);
  z-index: 25;
}

#senshi-player-root:not(.vh-ui-hidden) .vh-gradient-overlay {
  opacity: 1;
}

.vh-top-scrim {
  pointer-events: none;
  position: absolute;
  inset-inline: 0;
  top: 0;
  height: 70px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.45) 0%, transparent 100%);
  opacity: 0;
  transition: opacity 200ms cubic-bezier(0.32, 0.72, 0, 1);
}

#senshi-player-root:not(.vh-ui-hidden) .vh-top-scrim {
  opacity: 1;
}

/* Main UI Container */
.vh-main-ui {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: opacity 200ms cubic-bezier(0.32, 0.72, 0, 1);
}

/* UI Hidden State */
.vh-ui-hidden .vh-gradient-overlay,
.vh-ui-hidden .vh-main-ui {
  opacity: 0 !important;
  pointer-events: none !important;
}

/* Mini Progress Bar when UI is hidden */
.vh-mini-progress {
  pointer-events: none;
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  z-index: 42;
  padding-inline: 12px;
  padding-bottom: 10px;
  opacity: 0;
  transition: opacity 200ms ease;
}

.vh-ui-hidden .vh-mini-progress {
  opacity: 1;
}

.vh-mini-track {
  position: relative;
  height: 3px;
  width: 100%;
  overflow: hidden;
  border-radius: 9999px;
  background-color: rgba(255, 255, 255, 0.2);
}

.vh-mini-played {
  position: absolute;
  inset-block: 0;
  left: 0;
  background-color: rgba(255, 255, 255, 0.55);
}

.vh-mini-intro {
  position: absolute;
  inset-block: 0;
  background-color: #38bdf8;
}

.vh-mini-outro {
  position: absolute;
  inset-block: 0;
  background-color: #fbbf24;
}

/* Top Bar */
.vh-top-bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 8px 12px;
  z-index: 45;
}

.vh-top-title {
  position: relative;
  z-index: 1;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-left: 4px;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.85);
  display: none;
}

#senshi-player-root:fullscreen .vh-top-title,
#senshi-player-root:-webkit-full-screen .vh-top-title,
[data-player-fullscreen="true"] .vh-top-title {
  display: block !important;
}

.vh-top-spacer {
  position: relative;
  z-index: 1;
  flex: 1;
}

.vh-top-mobile-ctrls {
  position: relative;
  z-index: 1;
  display: none;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
  border-radius: 9999px;
  padding: 2px 6px;
}

/* ─── VidHawk Seekbar (lf component) ───────────────────────────────────── */
.vh-seek-container {
  position: relative;
  display: flex;
  width: 100%;
  touch-action: none;
  align-items: center;
  user-select: none;
  -webkit-user-select: none;
  height: 14px;
  cursor: pointer;
}

.vh-seek-track {
  pointer-events: none;
  position: absolute;
  inset-inline: 0;
  overflow: hidden;
  border-radius: 9999px;
  background-color: rgba(255, 255, 255, 0.25);
  height: 2.5px;
  transition: height 100ms ease;
}

.vh-seek-container:hover .vh-seek-track,
.vh-seek-container.is-scrubbing .vh-seek-track {
  height: 3.5px;
}

.vh-seek-buffered {
  position: absolute;
  inset-block: 0;
  left: 0;
  background-color: rgba(255, 255, 255, 0.35);
}

.vh-seek-played {
  position: absolute;
  inset-block: 0;
  left: 0;
  background-color: #ffffff;
}

.vh-seek-intro-band {
  position: absolute;
  inset-block: 0;
  z-index: 1;
  background-color: #38bdf8;
}

.vh-seek-outro-band {
  position: absolute;
  inset-block: 0;
  z-index: 1;
  background-color: #fbbf24;
}

.vh-seek-thumb {
  pointer-events: none;
  position: absolute;
  transform: translate(-50%, 0);
  border-radius: 9999px;
  background-color: #ffffff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
  height: 12px;
  width: 12px;
  transition: width 100ms ease, height 100ms ease;
}

.vh-seek-container:hover .vh-seek-thumb,
.vh-seek-container.is-scrubbing .vh-seek-thumb {
  height: 14px;
  width: 14px;
}

/* Hover time tooltip */
.vh-seek-tooltip {
  pointer-events: none;
  position: absolute;
  bottom: 20px;
  transform: translateX(-50%);
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background-color: rgba(0, 0, 0, 0.85);
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #fff;
  opacity: 0;
  transition: opacity 120ms ease;
  white-space: nowrap;
}

.vh-seek-tooltip.active {
  opacity: 1;
}

/* ─── Control Buttons (ll component) ───────────────────────────────────── */
.vh-btn {
  display: inline-flex;
  height: 36px;
  width: 36px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  color: rgba(255, 255, 255, 0.9);
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: background-color 150ms ease, transform 100ms ease;
}

.vh-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.vh-btn:active {
  background-color: rgba(255, 255, 255, 0.14);
  transform: scale(0.95);
}

.vh-btn.active {
  color: #ffffff;
}

/* Center Controls */
.vh-center-controls {
  pointer-events: none;
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 32px;
}

@media (min-width: 640px) {
  .vh-center-controls {
    gap: 48px;
  }
}

.vh-center-rewind,
.vh-center-forward {
  height: 44px;
  width: 44px;
  background: transparent;
  pointer-events: auto;
}

.vh-center-play {
  height: 56px;
  width: 56px;
  border-radius: 9999px;
  pointer-events: auto;
}



/* Bottom Container */
.vh-bottom-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 12px 12px 12px;
}

.vh-bottom-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.vh-bottom-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.vh-vol-pill {
  display: flex;
  align-items: center;
  border-radius: 9999px;
}

.vh-vol-slider {
  margin-right: 8px;
  height: 4px;
  width: 0;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.3);
  accent-color: #ffffff;
  opacity: 0;
  transition: width 150ms ease, opacity 150ms ease;
}

.group\/vol:hover .vh-vol-slider,
.group\/vol:focus-within .vh-vol-slider {
  width: 64px !important;
  opacity: 1 !important;
}

.vh-time-pill {
  border-radius: 9999px;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}

.vh-bottom-right {
  display: flex;
  align-items: center;
  gap: 2px;
  border-radius: 9999px;
  padding: 2px 6px;
}

.vh-hd-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  border-radius: 2px;
  background-color: #ffffff;
  padding: 1px 3px;
  font-size: 7px;
  font-weight: 700;
  line-height: 1;
  color: #000000;
}

/* ─── Responsive Desktop vs Mobile Switch (VidHawk ti logic) ────────────── */
@media (hover: hover) and (pointer: fine) and (min-width: 640px) {
  .vh-center-controls {
    display: none !important;
  }
  .vh-top-mobile-ctrls {
    display: none !important;
  }
  .vh-mobile-only {
    display: none !important;
  }
  .vh-desktop-only {
    display: flex !important;
  }
}

@media not all and (hover: hover) and (pointer: fine) and (min-width: 640px) {
  .vh-center-controls {
    display: flex !important;
  }
  .vh-top-mobile-ctrls {
    display: flex !important;
  }
  .vh-mobile-only {
    display: flex !important;
  }
  .vh-desktop-only {
    display: none !important;
  }
  #vh-nav-lock {
    display: flex !important;
  }
  .vh-vol-slider {
    display: none !important;
  }
  .vh-vol-pill {
    padding: 0 !important;
  }
  .vh-time-pill {
    padding: 6px 10px !important;
  }
  .vh-bottom-container {
    gap: 8px !important;
    padding: 2px 10px 10px 10px !important;
  }
}

@media (max-width: 639px) {
  .vh-center-controls {
    display: flex !important;
  }
  .vh-top-mobile-ctrls {
    display: flex !important;
  }
  .vh-mobile-only {
    display: flex !important;
  }
  .vh-desktop-only {
    display: none !important;
  }
  .vh-vol-slider {
    display: none !important;
  }
}

/* ─── Lock Screen Mode ─────────────────────────────────────────────────── */
#senshi-player-root[data-locked="true"] .vh-main-ui,
#senshi-player-root[data-locked="true"] .vh-gradient-overlay,
#senshi-player-root[data-locked="true"] .vh-mini-progress {
  display: none !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

#senshi-player-root[data-locked="true"] #vh-lock-overlay {
  display: block !important;
}

.vh-lock-overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.vh-lock-unlock-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 16px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 300ms ease;
}

.vh-lock-unlock-wrap.active {
  opacity: 1;
  pointer-events: auto;
}

/* ─── VidHawk Settings Sheet (Exact classes & animation) ────────────────── */
.vh-sheet-backdrop {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  background: rgba(0, 0, 0, 0.45);
  animation: vh-sheet-backdrop-in var(--vh-ios-fade-ms) ease-out both;
}

@media (min-width: 640px) {
  .vh-sheet-backdrop {
    flex-direction: row;
    align-items: flex-end;
    justify-content: flex-end;
    padding: 12px;
    padding-bottom: 4.75rem;
  }
}

.vh-sheet-backdrop.is-leaving {
  animation: vh-sheet-backdrop-out var(--vh-ios-fade-ms) ease-in both;
}

.vh-sheet-surface {
  display: flex;
  max-height: 80%;
  width: 100%;
  flex-direction: column;
  overflow: hidden;
  border-top-left-radius: 22px;
  border-top-right-radius: 22px;
  padding-bottom: env(safe-area-inset-bottom, 0);
  border: 1px solid rgba(255, 255, 255, 0.15);
  background-color: rgba(0, 0, 0, 0.75);
  color: #ffffff;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  animation: vh-sheet-up-in var(--vh-ios-sheet-ms) var(--vh-ios-ease) both;
  will-change: transform;
}

@media (min-width: 640px) {
  .vh-sheet-surface {
    max-height: min(85%, calc(100% - 5.5rem));
    width: 288px;
    border-radius: 22px;
    animation-name: vh-sheet-pop-in;
  }
}

.vh-sheet-surface.is-leaving {
  animation: vh-sheet-up-out 300ms var(--vh-ios-ease) both;
}

@media (min-width: 640px) {
  .vh-sheet-surface.is-leaving {
    animation-name: vh-sheet-pop-out;
  }
}

.vh-sheet-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.5);
  padding: 10px 8px;
  backdrop-filter: blur(24px);
}

.vh-header-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

.vh-header-reset {
  flex-shrink: 0;
  padding-inline: 8px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  color: #22d3ee;
  background: none;
  border: none;
  cursor: pointer;
}

.vh-header-reset:hover {
  color: #67e8f9;
}

.vh-sheet-panel {
  flex: auto;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  -webkit-mask-image: linear-gradient(rgba(0, 0, 0, 0) 0, #000 0.75rem);
  mask-image: linear-gradient(rgba(0, 0, 0, 0) 0, #000 0.75rem);
}

.vh-sheet-panel::-webkit-scrollbar {
  display: none;
}

.vh-sheet-panel[data-dir="forward"] {
  animation: vh-panel-forward var(--vh-ios-panel-ms) var(--vh-ios-ease) both;
  will-change: transform, opacity;
}

.vh-sheet-panel[data-dir="back"] {
  animation: vh-panel-back var(--vh-ios-panel-ms) var(--vh-ios-ease) both;
  will-change: transform, opacity;
}

/* Keyframes */
@keyframes vh-sheet-backdrop-in { 0% { opacity: 0; } to { opacity: 1; } }
@keyframes vh-sheet-backdrop-out { 0% { opacity: 1; } to { opacity: 0; } }
@keyframes vh-sheet-up-in { 0% { transform: translateY(110%); } to { transform: translate(0, 0); } }
@keyframes vh-sheet-up-out { 0% { transform: translate(0, 0); } to { transform: translateY(110%); } }
@keyframes vh-sheet-pop-in { 0% { opacity: 0; transform: translateY(10px) scale(0.96); } to { opacity: 1; transform: translate(0, 0) scale(1); } }
@keyframes vh-sheet-pop-out { 0% { opacity: 1; transform: translate(0, 0) scale(1); } to { opacity: 0; transform: translateY(8px) scale(0.97); } }
@keyframes vh-panel-forward { 0% { opacity: 0.35; transform: translateX(14%); } to { opacity: 1; transform: translate(0, 0); } }
@keyframes vh-panel-back { 0% { opacity: 0.35; transform: translateX(-10%); } to { opacity: 1; transform: translate(0, 0); } }

/* ─── Menu Rows (ld component) ─────────────────────────────────────────── */
.vh-menu-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 16px;
  border-radius: 12px;
  padding: 10px 12px;
  text-align: left;
  font-size: 14px;
  background: none;
  border: none;
  color: #ffffff;
  cursor: pointer;
  transition: background-color 150ms ease;
}

.vh-menu-item:hover {
  background-color: rgba(255, 255, 255, 0.06);
}

.vh-menu-item:active {
  background-color: rgba(255, 255, 255, 0.1);
}

.vh-menu-icon {
  display: flex;
  height: 20px;
  width: 20px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  color: #ffffff;
}

.vh-menu-label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 400;
}

.vh-menu-value {
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.vh-menu-chevron {
  height: 16px;
  width: 16px;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.35);
}

.vh-divider {
  margin-block: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.vh-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: 8px;
  padding: 10px 12px;
}

/* Offset Row */
.vh-offset-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
}

.vh-offset-btn {
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background-color: rgba(255, 255, 255, 0.08);
  padding: 4px 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  transition: background-color 150ms ease;
}

.vh-offset-btn:hover {
  background-color: rgba(255, 255, 255, 0.14);
}

.vh-offset-val {
  min-width: 3.5rem;
  text-align: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.8);
}

/* Slider Row (lc component) */
.vh-slider-row {
  padding: 10px 12px;
}

/* ─── VidHawk Switch Toggle (lo component) ──────────────────────────────── */
.vh-switch-btn {
  position: relative;
  height: 24px;
  width: 44px;
  flex-shrink: 0;
  border-radius: 9999px;
  background-color: rgba(255, 255, 255, 0.2);
  border: none;
  cursor: pointer;
  transition: background-color 150ms ease;
  padding: 0;
}

.vh-switch-btn.active {
  background-color: #ffffff;
}

.vh-switch-dot {
  position: absolute;
  top: 2px;
  left: 2px;
  height: 20px;
  width: 20px;
  border-radius: 9999px;
  background-color: #000000;
  transition: transform 150ms ease;
}

.vh-switch-btn.active .vh-switch-dot {
  transform: translateX(20px);
}

/* ─── Subtitles Layer (Exact VidHawk Styling) ──────────────────────────── */
.vh-sub-container {
  pointer-events: none;
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding-inline: 16px;
  padding-bottom: 56px;
}

.vh-sub-text {
  max-width: 85%;
  text-align: center;
  line-height: 1.375;
  word-break: break-word;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

/* ─── Sleep Timer Ended Overlay ────────────────────────────────────────── */
.vh-sleep-ended-overlay {
  position: absolute;
  inset: 0;
  z-index: 45;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background-color: rgba(0, 0, 0, 0.85);
  padding: 24px;
  text-align: center;
  color: #ffffff;
}

/* ─── Lock Screen Overlay ──────────────────────────────────────────────── */
.vh-lock-overlay {
  position: absolute;
  inset: 0;
  z-index: 35;
}

.vh-lock-unlock-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 16px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 300ms ease;
}

.vh-lock-unlock-wrap.active {
  opacity: 1;
  pointer-events: auto;
}

/* Spinner */
#sp-spinner {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  pointer-events: none;
  z-index: 35;
  transition: opacity 250ms ease;
}

#sp-spinner.hide {
  display: none !important;
  opacity: 0;
}

/* Error */
#sp-error {
  position: absolute;
  inset: 0;
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.9);
  z-index: 45;
  padding: 24px;
  text-align: center;
}

#sp-error.show {
  display: flex;
}

/* ─── Episode Panel Below Player (sp-panel / sp-ep-* classes) ───────────── */
#senshi-player-root {
  border-radius: 0;
}

#sp-panel {
  padding: 16px 0 8px 0;
}

.sp-ep-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.35);
}

.sp-ep-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
}

.sp-ep-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
  gap: 6px;
  margin-top: 4px;
  overflow: hidden;
}

.sp-ep-grid.sp-ep-expanded {
  max-height: 152px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  padding-right: 3px;
}

.sp-ep-chip {
  display: block;
  padding: 7px 2px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 7px;
  text-align: center;
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.45);
  cursor: pointer;
  text-decoration: none;
  transition: all 0.15s ease;
}

.sp-ep-chip:hover {
  border-color: rgba(255, 255, 255, 0.25);
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.sp-ep-chip.current {
  border-color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.sp-ep-chip.watched:not(.current) {
  background: rgba(0, 0, 0, 0.3);
  border-color: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.2);
}

.sp-ep-chip.sp-ep-extra {
  display: none;
}

.sp-ep-grid.sp-ep-expanded .sp-ep-chip.sp-ep-extra {
  display: block;
}

.sp-ep-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin-top: 10px;
  padding: 9px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.15s ease;
}

.sp-ep-more:hover {
  border-color: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.sp-ep-more svg {
  width: 12px;
  height: 12px;
  fill: currentColor;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.sp-ep-more.sp-expanded svg {
  transform: rotate(180deg);
}
`;

