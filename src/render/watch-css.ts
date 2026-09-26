export const WATCH_CSS = `/* ═══════════════════════════════════════════════════════════
   ANIVAULT WATCH PAGE — ULTRA PREMIUM v2
═══════════════════════════════════════════════════════════ */

.av-ambient {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}
.av-ambient-img {
  position: absolute;
  inset: -5%;
  background-image: var(--hero-img);
  background-size: cover;
  background-position: center;
  filter: blur(60px) saturate(0.5) brightness(0.12);
  transform: scale(1.05);
  animation: ambientDrift 18s ease-in-out infinite alternate;
}
@keyframes ambientDrift {
  0%   { transform: scale(1.05) translate(0,0); }
  100% { transform: scale(1.12) translate(-1%,1%); }
}
.av-ambient-overlay {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 60% at 50% 0%, rgba(124,58,237,0.04) 0%, transparent 70%),
    linear-gradient(180deg, rgba(10,11,14,0.1) 0%, rgba(10,11,14,0.75) 45%, #0a0b0e 85%);
}

.wp-page {
  position: relative;
  z-index: 1;
  max-width: 1460px;
  margin: 0 auto;
  padding: 0 1.5rem 4rem;
}

.wp-crumb {
  display: flex;
  align-items: center;
  gap: .45rem;
  padding: 1.1rem 0 .9rem;
  font-size: .75rem;
  color: var(--text-muted);
  letter-spacing: .01em;
}
.wp-crumb a { color: var(--text-muted); text-decoration: none; transition: color .15s; }
.wp-crumb a:hover { color: rgba(124,58,237,.9); }
.wp-crumb .sep { opacity: .3; font-size: .65rem; }
.wp-crumb .now { color: var(--text-secondary); }

.wp-grid {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 1.75rem;
  align-items: start;
}

/* PLAYER ZONE */
.wp-player-zone { position: relative; }

.wp-player-glow {
  position: absolute;
  inset: -2px;
  border-radius: 16px;
  background: var(--accent);
  opacity: 0;
  filter: blur(20px);
  z-index: -1;
  transition: opacity .6s ease;
  pointer-events: none;
}
.wp-player-zone:hover .wp-player-glow { opacity: .08; }

.wp-player-shell {
  background: #000;
  border-radius: 16px;
  overflow: hidden;
  position: relative;
  aspect-ratio: 16/9;
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 0 0 1px rgba(0,0,0,.5), 0 2px 0 rgba(255,255,255,0.06) inset, 0 32px 96px rgba(0,0,0,.9), 0 8px 32px rgba(0,0,0,.6);
  animation: playerReveal .55s cubic-bezier(0.16,1,0.3,1) both;
}
@keyframes playerReveal {
  from { opacity: 0; transform: translateY(12px) scale(0.99); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.wp-player-shell iframe { width:100%; height:100%; display:block; border:none; }

.wp-player-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: .65rem;
  color: var(--text-muted);
  font-size: .78rem;
  font-weight: 600;
  letter-spacing: .03em;
  background: #000;
}
.wp-player-loading-ring {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 2.5px solid rgba(255,255,255,.12);
  border-top-color: var(--accent);
  box-shadow: 0 0 14px rgba(124,58,237,.25);
  animation: wpfsSpin .75s linear infinite;
}

.wp-player-accent-line {
  height: 2px;
  background: linear-gradient(90deg, transparent 0%, var(--accent) 30%, rgba(124,58,237,.4) 70%, transparent 100%);
  border-radius: 0 0 2px 2px;
  opacity: .6;
}

/* Server probing loading state — shown while we live-check which servers actually work */
.wp-finding-server {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  min-height: 320px;
  width: 100%;
}
.wpfs-ring {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 2.5px solid transparent;
  border-top-color: var(--accent);
  border-bottom-color: rgba(124,58,237,.2);
  box-shadow: 0 0 14px rgba(124,58,237,.35);
  animation: wpfsSpin .75s linear infinite;
}
@keyframes wpfsSpin { to { transform: rotate(360deg); } }
.wpfs-text {
  font-family: var(--font-body);
  font-size: .82rem;
  font-weight: 600;
  letter-spacing: .03em;
  color: var(--text-muted);
}
.wpfs-dots span { animation: wpfsDot 1.2s infinite; opacity: 0; }
.wpfs-dots span:nth-child(2) { animation-delay: .2s; }
.wpfs-dots span:nth-child(3) { animation-delay: .4s; }
@keyframes wpfsDot { 0%,100% { opacity: 0; } 50% { opacity: 1; } }

/* Server panel skeleton placeholders — shown while probing, before real buttons exist */
.server-skel-group { display: flex; flex-wrap: wrap; gap: .4rem; }
.server-skel {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: .3rem;
  padding: .3rem .8rem .3rem .55rem;
  border-radius: 9px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  overflow: hidden;
}
.server-skel-dot { width:6px; height:6px; border-radius:50%; background: rgba(255,255,255,.14); flex-shrink:0; }
.server-skel-bar { height: 10px; border-radius: 4px; background: rgba(255,255,255,.09); }
.server-skel::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(124,58,237,.14), transparent);
  animation: serverSkelShimmer 1.5s ease-in-out infinite;
}
@keyframes serverSkelShimmer { 0% { transform: translateX(-120%); } 100% { transform: translateX(120%); } }

/* SERVER CARD */
@keyframes liveDot {
  0%,100% { opacity:1; transform:scale(1); }
  50%      { opacity:.45; transform:scale(.65); }
}

.wp-controls {
  display: flex;
  flex-direction: column;
  gap: .75rem;
  margin-top: .6rem;
  padding: .75rem;
  background: rgba(22,26,34,0.95);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px;
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}

/* Controls top bar - NO underline */
.wp-controls-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 0;
}
.wpc-label {
  font-size: .72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .09em;
  color: var(--text-muted);
}
.wpc-hint {
  font-size: .65rem;
  color: var(--text-muted);
  opacity: .5;
  letter-spacing: .02em;
}

/* Quality selector */
.wp-quality-row {
  display: flex;
  align-items: center;
  gap: .75rem;
  flex-wrap: wrap;
}
.wpc-quals {
  display: flex;
  gap: .4rem;
  flex-wrap: wrap;
}
.wpc-q {
  padding: .3rem .85rem;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.1);
  background: #0f0f0f;
  color: var(--text-secondary);
  font-size: .72rem;
  font-weight: 600;
  cursor: pointer;
  transition: all .2s cubic-bezier(.4,0,.2,1);
  font-family: var(--font-body);
}
.wpc-q:hover { border-color: rgba(124,58,237,.5); color: #c4b5fd; background: rgba(124,58,237,.08); }
.wpc-q.on { background: rgba(124,58,237,.18); border-color: #7c3aed; color: #c4b5fd; box-shadow: 0 0 0 1px rgba(124,58,237,.3); }

.server-panel {
  background: rgba(12,14,20,0.93);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 14px;
  overflow: hidden;
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
  box-shadow: 0 4px 28px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.04);
}

.server-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: .5rem .8rem;
  border-bottom: 1px solid rgba(255,255,255,.05);
}
.server-panel-lbl {
  display: flex;
  align-items: center;
  gap: .38rem;
  font-size: .65rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: var(--text-muted);
}
.server-panel-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 7px rgba(34,197,94,.9);
  animation: liveDot 2s ease-in-out infinite;
  flex-shrink: 0;
}
.server-panel-hint {
  font-size: .6rem;
  color: var(--text-muted);
  opacity: .4;
  letter-spacing: .02em;
}

/* Server Panel — SUB/DUB tabs (Anivexa-style pill segmented toggle) */
.server-panel-body {
  padding: 0;
  display: flex;
  flex-direction: column;
}
.server-tabs {
  display: inline-flex;
  align-self: flex-start;
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 999px;
  padding: 3px;
  margin: .7rem .85rem 0;
}
.server-tab {
  padding: .35rem .95rem;
  font-size: .68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .08em;
  cursor: pointer;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  transition: all .2s cubic-bezier(.4,0,.2,1);
  font-family: var(--font-body);
}
.server-tab.active {
  background: #7c3aed;
  color: #fff;
  box-shadow: 0 2px 10px rgba(124,58,237,.4);
}
.server-tab[data-tab="dub"].active { background: #2563eb; box-shadow: 0 2px 10px rgba(37,99,235,.4); }
.server-tab-panel {
  display: none;
  padding: .7rem .85rem;
  flex-wrap: wrap;
  gap: .5rem;
  align-items: center;
}
.server-tab-panel.active           { display: flex; }
.server-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: .35rem;
  padding: .35rem .85rem .35rem .6rem;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.08);
  background: #0f0f0f;
  color: var(--text-secondary);
  font-size: .75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all .22s cubic-bezier(.16,1,.3,1);
  font-family: var(--font-body);
  white-space: nowrap;
  user-select: none;
}
.server-btn::before {
  content: '';
  width: 6px; height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: all .22s;
}
.server-btn[data-server="animeheaven"]::before{ background:#22c55e; box-shadow:0 0 5px rgba(34,197,94,.6); }
.server-btn[data-server^="anikoto-"]::before { background:#c084fc; box-shadow:0 0 5px rgba(192,132,252,.6); }
.server-btn:hover {
  background: rgba(255,255,255,.09);
  border-color: rgba(255,255,255,.17);
  color: var(--text-primary);
  transform: translateY(-1px);
  box-shadow: 0 2px 10px rgba(0,0,0,.3);
}
.server-btn[data-server="animeheaven"].active {
  background: rgba(34,197,94,.14); border-color: rgba(34,197,94,.55);
  color: #22c55e; box-shadow: 0 0 16px rgba(34,197,94,.2), inset 0 1px 0 rgba(34,197,94,.12);
}
.server-btn[data-server^="anikoto-"].active { background:rgba(192,132,252,.14); border-color:rgba(192,132,252,.55); color:#c084fc; box-shadow:0 0 16px rgba(192,132,252,.2),inset 0 1px 0 rgba(192,132,252,.12); }

/* DesiDub (Hindi Dub / raw embed sources) — kept visually distinct from the
   English dub servers above via its own accent color + a labeled group. */
.server-btn[data-server^="desidub:"]::before { background:#f97316; box-shadow:0 0 5px rgba(249,115,22,.6); }
.server-btn[data-server^="desidub:"].active { background:rgba(249,115,22,.14); border-color:rgba(249,115,22,.55); color:#f97316; box-shadow:0 0 16px rgba(249,115,22,.2),inset 0 1px 0 rgba(249,115,22,.12); }

/* ReAnime / AnimeNoSub / AniWaves / AniZone / WatchAnimeWorld — the 5
   sources added once the scraper backend had all 8 providers working. Each
   gets its own accent color, same active/hover treatment as the originals. */
.server-btn[data-server^="reanime:"]::before          { background:#38bdf8; box-shadow:0 0 5px rgba(56,189,248,.6); }
.server-btn[data-server^="reanime:"].active           { background:rgba(56,189,248,.14); border-color:rgba(56,189,248,.55); color:#38bdf8; box-shadow:0 0 16px rgba(56,189,248,.2),inset 0 1px 0 rgba(56,189,248,.12); }
.server-btn[data-server^="animenosub:"]::before       { background:#facc15; box-shadow:0 0 5px rgba(250,204,21,.6); }
.server-btn[data-server^="animenosub:"].active        { background:rgba(250,204,21,.14); border-color:rgba(250,204,21,.55); color:#facc15; box-shadow:0 0 16px rgba(250,204,21,.2),inset 0 1px 0 rgba(250,204,21,.12); }
.server-btn[data-server^="aniwaves:"]::before         { background:#f472b6; box-shadow:0 0 5px rgba(244,114,182,.6); }
.server-btn[data-server^="aniwaves:"].active          { background:rgba(244,114,182,.14); border-color:rgba(244,114,182,.55); color:#f472b6; box-shadow:0 0 16px rgba(244,114,182,.2),inset 0 1px 0 rgba(244,114,182,.12); }
.server-btn[data-server^="anizone:"]::before          { background:#818cf8; box-shadow:0 0 5px rgba(129,140,248,.6); }
.server-btn[data-server^="anizone:"].active           { background:rgba(129,140,248,.14); border-color:rgba(129,140,248,.55); color:#818cf8; box-shadow:0 0 16px rgba(129,140,248,.2),inset 0 1px 0 rgba(129,140,248,.12); }
.server-btn[data-server^="watchanimeworld:"]::before  { background:#2dd4bf; box-shadow:0 0 5px rgba(45,212,191,.6); }
.server-btn[data-server^="watchanimeworld:"].active   { background:rgba(45,212,191,.14); border-color:rgba(45,212,191,.55); color:#2dd4bf; box-shadow:0 0 16px rgba(45,212,191,.2),inset 0 1px 0 rgba(45,212,191,.12); }

/* Fixed server buttons (always rendered, one per source — see
   stream-sources.ts) — same accent colors as above but keyed off
   data-fixed-key, since data-server on these holds the stable
   "fixed:<key>" click/highlight key rather than the real provider key
   the button ends up actually playing (which can be a DIFFERENT source
   entirely once same-group fallback kicks in). */
.server-btn[data-fixed-key="anizone"]::before          { background:#818cf8; box-shadow:0 0 5px rgba(129,140,248,.6); }
.server-btn[data-fixed-key="anizone"].active           { background:rgba(129,140,248,.14); border-color:rgba(129,140,248,.55); color:#818cf8; box-shadow:0 0 16px rgba(129,140,248,.2),inset 0 1px 0 rgba(129,140,248,.12); }
.server-btn[data-fixed-key="anikoto"]::before          { background:#c084fc; box-shadow:0 0 5px rgba(192,132,252,.6); }
.server-btn[data-fixed-key="anikoto"].active           { background:rgba(192,132,252,.14); border-color:rgba(192,132,252,.55); color:#c084fc; box-shadow:0 0 16px rgba(192,132,252,.2),inset 0 1px 0 rgba(192,132,252,.12); }
.server-btn[data-fixed-key="animeheaven"]::before      { background:#22c55e; box-shadow:0 0 5px rgba(34,197,94,.6); }
.server-btn[data-fixed-key="animeheaven"].active       { background:rgba(34,197,94,.14); border-color:rgba(34,197,94,.55); color:#22c55e; box-shadow:0 0 16px rgba(34,197,94,.2),inset 0 1px 0 rgba(34,197,94,.12); }
.server-btn[data-fixed-key="reanime"]::before          { background:#38bdf8; box-shadow:0 0 5px rgba(56,189,248,.6); }
.server-btn[data-fixed-key="reanime"].active           { background:rgba(56,189,248,.14); border-color:rgba(56,189,248,.55); color:#38bdf8; box-shadow:0 0 16px rgba(56,189,248,.2),inset 0 1px 0 rgba(56,189,248,.12); }
.server-btn[data-fixed-key="aniwaves"]::before         { background:#f472b6; box-shadow:0 0 5px rgba(244,114,182,.6); }
.server-btn[data-fixed-key="aniwaves"].active          { background:rgba(244,114,182,.14); border-color:rgba(244,114,182,.55); color:#f472b6; box-shadow:0 0 16px rgba(244,114,182,.2),inset 0 1px 0 rgba(244,114,182,.12); }
.server-btn[data-fixed-key="watchanimeworld"]::before  { background:#2dd4bf; box-shadow:0 0 5px rgba(45,212,191,.6); }
.server-btn[data-fixed-key="watchanimeworld"].active   { background:rgba(45,212,191,.14); border-color:rgba(45,212,191,.55); color:#2dd4bf; box-shadow:0 0 16px rgba(45,212,191,.2),inset 0 1px 0 rgba(45,212,191,.12); }
.server-btn[data-fixed-key="animenosub"]::before       { background:#facc15; box-shadow:0 0 5px rgba(250,204,21,.6); }
.server-btn[data-fixed-key="animenosub"].active        { background:rgba(250,204,21,.14); border-color:rgba(250,204,21,.55); color:#facc15; box-shadow:0 0 16px rgba(250,204,21,.2),inset 0 1px 0 rgba(250,204,21,.12); }
.server-btn[data-fixed-key="desidub"]::before          { background:#f97316; box-shadow:0 0 5px rgba(249,115,22,.6); }
.server-btn[data-fixed-key="desidub"].active           { background:rgba(249,115,22,.14); border-color:rgba(249,115,22,.55); color:#f97316; box-shadow:0 0 16px rgba(249,115,22,.2),inset 0 1px 0 rgba(249,115,22,.12); }

.server-btn-row { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }

/* Still resolving in the background — dimmed + small spinner, not
   clickable yet. Every fixed button starts in this state the instant
   the page loads (it's server-rendered, not injected later). */
.server-btn-pending { opacity: .45; cursor: default; pointer-events: none; }
.server-btn-spin {
  width: 9px; height: 9px; border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,.25);
  border-top-color: rgba(255,255,255,.75);
  display: none;
  animation: server-btn-spin-anim .7s linear infinite;
}
.server-btn-pending .server-btn-spin { display: inline-block; }
@keyframes server-btn-spin-anim { to { transform: rotate(360deg); } }

/* Resolved, but this source itself had nothing for this episode — the
   button is silently playing a different (working) source from the same
   group instead. Label stays the same on purpose; this is just a subtle
   hint for anyone who looks closely, via title="" set client-side. */
.server-btn-fallback { box-shadow: inset 0 0 0 1px rgba(255,255,255,.14); }

/* Resolved, and NOTHING in this button's whole fallback group worked for
   this episode (exceedingly rare — every source in the group is down or
   missing this episode). Shown disabled rather than removed, since the
   spec is "buttons always exist". */
.server-btn-dead { opacity: .3; cursor: not-allowed; pointer-events: none; text-decoration: line-through; }

/* Multi Dub group — same nested-group treatment as Hindi Dub above it. */
#dub-multi-group { border-top: 1px dashed rgba(255,255,255,.08); }

.server-group {
  flex-basis: 100%;
  display: flex;
  flex-direction: column;
  gap: .45rem;
  margin-top: .35rem;
  padding-top: .6rem;
  border-top: 1px dashed rgba(255,255,255,.08);
}
.server-group-label {
  font-size: .62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: var(--text-muted);
  opacity: .55;
}
.server-group-body {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
  align-items: center;
}

/* Small inline pill used inside a .server-btn — e.g. the "Embed" badge on
   raw/iframe-only sources that couldn't be resolved to a direct stream. */
.ad-badge {
  font-size: .56rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
  padding: .1rem .35rem;
  border-radius: 999px;
  background: rgba(255,255,255,.08);
  color: var(--text-muted);
  line-height: 1.5;
}
.server-btn[data-server^="desidub:raw:"] .ad-badge {
  background: rgba(249,115,22,.14);
  color: #f97316;
}

/* "No servers found" placeholder (class name kept as-is; used for both
   audio tabs regardless of which provider was being probed) */
.no-servers-msg {
  font-size: .7rem;
  color: var(--text-muted);
  opacity: .4;
  padding: .1rem .2rem;
}

/* Mobile styles */
@media (max-width: 980px) {
  .server-tab-panel { padding: .5rem .6rem; gap: .35rem; }
  .server-btn { padding: .25rem .45rem; font-size: .68rem; gap: .2rem; }
}

/* TITLE CARD */
.wp-info {
  margin-top: 1rem;
  background: rgba(22,26,34,0.85);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 16px;
  overflow: hidden;
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  animation: cardReveal .5s .1s cubic-bezier(0.16,1,0.3,1) both;
}
@keyframes cardReveal {
  from { opacity:0; transform:translateY(10px); }
  to   { opacity:1; transform:translateY(0); }
}
.wp-info-banner {
  height: 3px;
  background: linear-gradient(90deg, var(--accent) 0%, rgba(124,58,237,.2) 60%, transparent 100%);
}
.wp-info-head { padding: 1rem .6rem .75rem; }
.wp-ep-chip {
  display: inline-flex;
  align-items: center;
  gap: .3rem;
  padding: .15rem .7rem;
  border-radius: 20px;
  background: rgba(124,58,237,.1);
  border: 1px solid rgba(124,58,237,.2);
  color: var(--accent);
  font-size: .67rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .1em;
  margin-bottom: .6rem;
}
.wp-ep-chip::before {
  content: '';
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--accent);
  animation: chipBlink 2s ease-in-out infinite;
}
@keyframes chipBlink {
  0%,100% { opacity:1; } 50% { opacity:.3; }
}
.wp-ep-title {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.3;
  margin-bottom: .35rem;
  font-family: var(--font-display);
  letter-spacing: -.01em;
}
.wp-ep-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: .5rem .8rem;
  font-size: .76rem;
  color: var(--text-muted);
}
.wp-ep-meta a { color:var(--accent); text-decoration:none; font-weight:600; }
.wp-ep-meta a:hover { text-decoration:underline; }
.wp-ep-meta .dot { opacity:.3; }
.ep-tag {
  display:inline-flex;
  align-items:center;
  padding:.1rem .45rem;
  border-radius:5px;
  font-size:.67rem;
  font-weight:700;
  letter-spacing:.03em;
}
.ep-tag.filler { background:rgba(245,200,66,.1); color:var(--gold); border:1px solid rgba(245,200,66,.2); }
.ep-tag.recap  { background:rgba(164,155,254,.1); color:var(--purple); border:1px solid rgba(164,155,254,.2); }
.wp-actions {
  display: flex;
  align-items: center;
  gap: .45rem;
  padding: .75rem .6rem;
  flex-wrap: wrap;
}
.wp-act-btn {
  display: inline-flex; align-items:center; gap:.35rem;
  padding: .35rem .85rem;
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,.09);
  background: rgba(255,255,255,.04);
  color: var(--text-secondary);
  font-size: .76rem; font-weight:600;
  cursor:pointer;
  transition: all .18s;
  font-family: var(--font-body);
  text-decoration: none;
}
.wp-act-btn:hover {
  background: rgba(255,255,255,.1);
  border-color: rgba(255,255,255,.2);
  color: var(--text-primary);
  transform: translateY(-1px);
}
.wp-act-btn svg { width:13px; height:13px; fill:currentColor; }
.wp-act-btn.primary {
  background: rgba(124,58,237,.12);
  border-color: rgba(124,58,237,.25);
  color: var(--accent);
}
.wp-act-btn.primary:hover { background:var(--accent); color:#fff; border-color:var(--accent); }
.wp-prog-wrap {
  padding: .75rem .6rem;
  display: none;
}
.wp-prog-header {
  display:flex; justify-content:space-between; align-items:center;
  margin-bottom: .5rem;
}
.wp-prog-lbl { font-size:.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--text-muted); }
.wp-prog-time { font-size:.72rem; color:var(--text-secondary); font-variant-numeric:tabular-nums; }
.wp-prog-track {
  height:4px;
  background:rgba(255,255,255,.07);
  border-radius:4px;
  overflow:hidden;
  position:relative;
}
.wp-prog-fill {
  height:100%;
  background: linear-gradient(90deg, var(--accent), rgba(124,58,237,.7));
  border-radius:4px;
  width:0%;
  transition: width .6s ease;
  position: relative;
}
.wp-prog-fill::after {
  content:'';
  position:absolute; right:0; top:50%;
  transform:translateY(-50%);
  width:8px; height:8px;
  border-radius:50%;
  background:#fff;
  box-shadow: 0 0 6px rgba(124,58,237,.8);
  opacity:0;
  transition:opacity .3s;
}
.wp-prog-wrap:hover .wp-prog-fill::after { opacity:1; }

.wp-nav {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: .6rem;
  margin-top: .7rem;
}
.wp-nav-btn {
  display: flex;
  align-items: center;
  gap: .55rem;
  padding: .65rem 1.2rem;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.08);
  background: #0f0f0f;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: .82rem;
  font-weight: 700;
  transition: all .22s cubic-bezier(.16,1,.3,1);
  min-width: 0;
  position: relative;
  overflow: hidden;
}
.wp-nav-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--accent);
  opacity: 0;
  transition: opacity .2s;
}
.wp-nav-btn:hover { border-color:rgba(124,58,237,.25); color:var(--text-primary); transform:translateY(-2px); }
.wp-nav-btn:hover::before { opacity: .05; }
.wp-nav-btn.next { justify-content:flex-end; text-align:right; }
.wp-nav-btn svg { width:15px; height:15px; fill:currentColor; flex-shrink:0; position:relative; }
.wp-nav-inner { min-width:0; position:relative; }
.wp-nav-lbl { font-size:.67rem; color:var(--text-muted); font-weight:400; display:block; letter-spacing:.03em; text-transform:uppercase; }
.wp-nav-ep { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block; }
.wp-nav-btn.disabled { opacity:.3; pointer-events:none; }

/* EPISODE CARD (Sidebar) */
.wp-sidebar {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  position: sticky;
  top: 1rem;
  align-self: start;
}
.wp-anime-card {
  background: rgba(22,26,34,0.85);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 16px;
  overflow: hidden;
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  animation: cardReveal .5s .05s cubic-bezier(0.16,1,0.3,1) both;
}
.wp-anime-banner {
  position:relative;
  height:110px;
  overflow:hidden;
}
.wp-anime-banner-bg {
  position:absolute; inset:-8px;
  background-size:cover; background-position:center;
  filter:blur(12px) brightness(.35) saturate(.7);
  transform:scale(1.1);
}
.wp-anime-banner-grad {
  position:absolute; inset:0;
  background:linear-gradient(to bottom, transparent 30%, rgba(22,26,34,.9) 100%);
}
.wp-anime-poster {
  position:absolute;
  bottom:-18px; left:1rem;
  width:60px;
  border-radius:8px;
  border:2px solid rgba(22,26,34,1);
  box-shadow:0 4px 20px rgba(0,0,0,.6);
  object-fit:cover;
}
.wp-anime-body {
  padding: 1.4rem 1rem .9rem;
}
.wp-anime-title {
  font-size:.92rem; font-weight:700;
  line-height:1.3; margin-bottom:.2rem;
}
.wp-anime-title a { color:var(--text-primary); text-decoration:none; }
.wp-anime-title a:hover { color:var(--accent); }
.wp-anime-sub { font-size:.73rem; color:var(--text-muted); margin-bottom:.65rem; }
.wp-score-row {
  display:flex; align-items:center; gap:.5rem;
  margin-bottom:.65rem;
}
.wp-score {
  display:inline-flex; align-items:center; gap:.3rem;
  font-size:.85rem; font-weight:800; color:var(--gold);
  font-family:var(--font-display);
}
.wp-score svg { width:13px; height:13px; fill:var(--gold); }
.wp-score-bar-wrap { flex:1; height:3px; background:rgba(255,255,255,.07); border-radius:3px; overflow:hidden; }
.wp-score-bar { height:100%; background:linear-gradient(90deg,var(--gold),rgba(245,200,66,.4)); border-radius:3px; }
.wp-genres {
  display:flex; flex-wrap:wrap; gap:.3rem;
}
.wp-genre {
  padding:.16rem .55rem;
  border-radius:20px;
  border:1px solid rgba(255,255,255,.08);
  background:rgba(255,255,255,.03);
  font-size:.67rem; font-weight:600; color:var(--text-muted);
  transition:all .15s;
}
.wp-genre:hover { border-color:rgba(124,58,237,.3); color:var(--accent); }

.wp-ep-card {
  background: rgba(22,26,34,0.85);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 16px;
  overflow: hidden;
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  animation: cardReveal .5s .15s cubic-bezier(0.16,1,0.3,1) both;
}
.wp-ep-head {
  display:flex; align-items:center; justify-content:space-between;
  padding:.65rem .6rem;
  border-bottom:1px solid rgba(255,255,255,.05);
}
.wp-ep-ttl {
  font-size:.68rem; font-weight:800;
  text-transform:uppercase; letter-spacing:.1em;
  color:var(--text-muted);
}
.wp-ep-count {
  font-size:.72rem; font-weight:700;
  color:var(--accent);
}
.ep-range-wrap {
  padding:.55rem .6rem;
  border-bottom:1px solid rgba(255,255,255,.05);
}
.ep-range-wrap .ep-range-btn {
  width:100%;
  justify-content:space-between;
  font-size:.78rem;
  padding:.45rem .8rem;
  background: rgba(255,255,255,.05);
}
.wp-ep-search-wrap {
  padding:.5rem .6rem;
  border-bottom:1px solid rgba(255,255,255,.05);
  position:relative;
}
.wp-ep-search-ico {
  position:absolute; left:1.05rem; top:50%;
  transform:translateY(-50%);
  width:13px; height:13px;
  opacity:.35;
  pointer-events:none;
}
.wp-ep-search-ico svg { width:13px; height:13px; fill:var(--text-muted); }
.wp-ep-search {
  width:100%;
  background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.08);
  border-radius:9px;
  padding:.35rem .5rem .35rem 1.75rem;
  color:var(--text-primary);
  font-size:.77rem;
  font-family:var(--font-body);
  outline:none;
  transition:border-color .15s, background .15s;
}
.wp-ep-search::placeholder { color:var(--text-muted); }
.wp-ep-search:focus {
  border-color:rgba(124,58,237,.35);
  background:rgba(255,255,255,.07);
}
.wp-ep-list {
  max-height:510px;
  overflow-y:auto;
  scrollbar-width:thin;
  scrollbar-color:rgba(255,255,255,.08) transparent;
}
.wp-ep-list::-webkit-scrollbar { width:3px; }
.wp-ep-list::-webkit-scrollbar-thumb { background:rgba(255,255,255,.08); border-radius:3px; }
.ep-item {
  display:flex;
  align-items:center;
  gap:.45rem;
  padding:.4rem .6rem;
  border-bottom:1px solid rgba(255,255,255,.04);
  text-decoration:none;
  color:var(--text-primary);
  transition:background .12s;
  cursor:default;
  position:relative;
}
.ep-item:last-child { border-bottom:none; }
.ep-item.playable { cursor:pointer; }
.ep-item.playable:hover { background:rgba(255,255,255,.04); }
.ep-item.active {
  background:rgba(124,58,237,.07);
  border-left:2px solid var(--accent);
  padding-left:calc(.6rem - 2px);
}
.ep-item.active::before {
  content:'';
  position:absolute;
  inset:0;
  background:linear-gradient(90deg, rgba(124,58,237,.06), transparent);
  pointer-events:none;
}
.ep-item.watched:not(.active) {
  background:rgba(0,0,0,.28);
}
.ep-item.watched:not(.active):hover {
  background:rgba(0,0,0,.36);
}
.ep-item.watched:not(.active) .ep-thumb-box {
  opacity:.55;
}
.ep-item.watched:not(.active) .ep-num-txt,
.ep-item.watched:not(.active) .ep-title-txt {
  color:var(--text-muted);
  opacity:.65;
}
.ep-item.watched .ep-thumb-box::after {
  content:'✓';
  position:absolute;
  top:2px; right:2px;
  width:14px; height:14px;
  border-radius:50%;
  background:rgba(0,0,0,.65);
  color:#8f8f8f;
  font-size:.55rem;
  font-weight:700;
  display:flex; align-items:center; justify-content:center;
  z-index:1;
}
.ep-thumb-box {
  width:72px; height:42px;
  border-radius:6px;
  flex-shrink:0;
  background:rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.07);
  overflow:hidden;
  position:relative;
}
.ep-thumb-box img {
  width:100%; height:100%;
  object-fit:cover;
  opacity:0;
  transition:opacity .3s;
}
.ep-thumb-box img.vis { opacity:1; }
.ep-play-ov {
  position:absolute; inset:0;
  display:flex; align-items:center; justify-content:center;
  background:rgba(0,0,0,.5);
  opacity:0;
  transition:opacity .15s;
}
.ep-item.active .ep-play-ov { opacity:1; background:rgba(124,58,237,.35); }
.ep-item.playable:hover .ep-play-ov { opacity:1; }
.ep-play-ov svg { width:13px; height:13px; fill:#fff; }
.ep-num-fallback { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:.65rem; font-weight:700; color:var(--text-muted); }
.ep-meta { flex:1; min-width:0; }
.ep-num-txt { font-size:.62rem; color:var(--text-muted); font-weight:600; margin-bottom:1px; }
.ep-title-txt {
  font-size:.74rem; font-weight:600;
  overflow:hidden; display:-webkit-box;
  -webkit-line-clamp:2; -webkit-box-orient:vertical;
  line-height:1.3;
  color:var(--text-muted);
  white-space:normal;
}
.ep-item.playable .ep-title-txt { color:var(--text-secondary); }
.ep-item.active .ep-title-txt { color:var(--accent); font-weight:700; }
.ep-live-dot {
  width:6px; height:6px;
  border-radius:50%;
  background:var(--accent);
  flex-shrink:0;
  animation:liveDot 1.4s ease-in-out infinite;
}

.wp-chars {
  margin-top: 1rem;
  background: rgba(22,26,34,0.85);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 16px;
  overflow: hidden;
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  animation: cardReveal .5s .2s cubic-bezier(0.16,1,0.3,1) both;
}
.wp-chars-head {
  display:flex; justify-content:space-between; align-items:center;
  padding:.65rem .6rem;
  border-bottom:1px solid rgba(255,255,255,.05);
}
.wp-chars-ttl {
  font-size:.68rem; font-weight:800;
  text-transform:uppercase; letter-spacing:.1em;
  color:var(--text-muted);
}
.wp-chars-head a { font-size:.73rem; color:var(--accent); text-decoration:none; font-weight:600; }
.wp-chars-head a:hover { text-decoration:underline; }
.char-grid-v2 {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px,1fr));
}
.char-v2 {
  position: relative;
  display: flex; flex-direction:column; align-items:center;
  padding: .75rem .4rem .65rem;
  text-decoration: none; color: var(--text-primary);
  border-right:1px solid rgba(255,255,255,.05);
  border-bottom:1px solid rgba(255,255,255,.05);
  overflow:hidden;
  transition: background .15s;
}
.char-v2::after {
  content:'';
  position:absolute;
  inset:0;
  background:radial-gradient(ellipse 80% 80% at 50% 100%, rgba(124,58,237,.15), transparent);
  opacity:0;
  transition:opacity .2s;
}
.char-v2:hover { background:rgba(255,255,255,.03); }
.char-v2:hover::after { opacity:1; }
.char-v2-img-wrap {
  position:relative;
  width:48px; height:60px;
  border-radius:8px;
  margin-bottom:6px;
  overflow:hidden;
  flex-shrink:0;
}
.char-v2-img {
  width:100%; height:100%;
  object-fit:cover;
  display:block;
  transition:transform .3s ease;
}
.char-v2:hover .char-v2-img { transform:scale(1.07); }
.char-v2-role-badge {
  position:absolute;
  bottom:0; left:0; right:0;
  padding:2px 0;
  background:rgba(0,0,0,.6);
  font-size:.48rem;
  font-weight:700;
  color:rgba(255,255,255,.7);
  text-align:center;
  text-transform:uppercase;
  letter-spacing:.04em;
  opacity:0;
  transition:opacity .2s;
}
.char-v2:hover .char-v2-role-badge { opacity:1; }
.char-v2-name {
  font-size:.62rem; font-weight:600;
  line-height:1.2; color:var(--text-secondary);
  overflow:hidden; display:-webkit-box;
  -webkit-line-clamp:2; -webkit-box-orient:vertical;
  text-align:center;
  position:relative; z-index:1;
}

/* Guest gate */
.wp-gate {
  position:absolute; inset:0; z-index:5;
  display:flex; flex-direction:column;
  align-items:center; justify-content:center;
  gap:1.25rem; padding:2rem; text-align:center;
}
.wp-gate-bg {
  position:absolute; inset:0;
  background-size:cover; background-position:center;
  filter:blur(10px) brightness(.2);
  transform:scale(1.05);
}
.wp-gate-vignette {
  position:absolute; inset:0;
  background:radial-gradient(ellipse at 50% 60%, transparent 30%, rgba(0,0,0,.6) 100%);
}
.wp-gate-inner {
  position:relative; z-index:1;
  display:flex; flex-direction:column; align-items:center; gap:.9rem;
}
.wp-gate-ring {
  width:76px; height:76px;
  border-radius:50%;
  background:rgba(124,58,237,.12);
  border:1.5px solid rgba(124,58,237,.35);
  display:flex; align-items:center; justify-content:center;
  cursor:pointer;
  transition:all .2s;
  -webkit-backdrop-filter:blur(6px);
  backdrop-filter:blur(6px);
  animation:ringPulse 2.8s ease-in-out infinite;
}
@keyframes ringPulse {
  0%,100%{box-shadow:0 0 0 0 rgba(124,58,237,.35);}
  50%{box-shadow:0 0 0 20px rgba(124,58,237,0);}
}
.wp-gate-ring:hover {
  background:var(--accent); border-color:var(--accent);
  animation:none; transform:scale(1.1);
  box-shadow:0 0 28px rgba(124,58,237,.5);
}
.wp-gate-ring svg { width:30px; height:30px; fill:#fff; margin-left:4px; }
.wp-gate-title { font-size:1.05rem; font-weight:800; color:#fff; letter-spacing:-.01em; }
.wp-gate-sub { font-size:.8rem; color:rgba(255,255,255,.5); margin-top:-5px; }
.wp-gate-btns { display:flex; gap:.6rem; flex-wrap:wrap; justify-content:center; }
.wp-gate-cta {
  padding:.55rem 1.5rem;
  border-radius:10px; border:none;
  background:var(--accent); color:#fff;
  font-weight:700; font-size:.87rem;
  cursor:pointer; font-family:var(--font-body);
  transition:opacity .15s, transform .15s;
  box-shadow:0 4px 14px rgba(124,58,237,.35);
}
.wp-gate-cta:hover { opacity:.88; transform:translateY(-1px); }
.wp-gate-ghost {
  padding:.55rem 1.5rem;
  border-radius:10px;
  border:1px solid rgba(255,255,255,.2);
  background:rgba(255,255,255,.07);
  color:#fff; font-weight:700; font-size:.87rem;
  cursor:pointer; font-family:var(--font-body);
  transition:background .15s;
  -webkit-backdrop-filter:blur(4px);
  backdrop-filter:blur(4px);
}
.wp-gate-ghost:hover { background:rgba(255,255,255,.14); }

.wp-no-video {
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  aspect-ratio:16/9;
  background:rgba(22,26,34,.8);
  border-radius:14px;
  border:1px solid rgba(255,255,255,.07);
  gap:.75rem; padding:2rem; text-align:center;
}
.wp-no-video .nv-icon { font-size:2.5rem; opacity:.25; }
.wp-no-video p { color:var(--text-muted); font-size:.88rem; line-height:1.5; }

/* AniVault-owned server buttons */
.av-server {
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:.38rem;
  min-height:34px;
  padding:.32rem .68rem;
  border:1px solid rgba(124,58,237,.38) !important;
  border-radius:999px;
  background:linear-gradient(180deg,rgba(124,58,237,.14),rgba(18,20,28,.72));
  color:var(--text-primary);
  font-weight:800;
  letter-spacing:.01em;
  box-shadow:0 3px 12px rgba(0,0,0,.2);
  transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease,background .15s ease;
}
.av-server:hover {
  transform:translateY(-1px);
  border-color:rgba(124,58,237,.72) !important;
  background:linear-gradient(180deg,rgba(124,58,237,.24),rgba(18,20,28,.86));
  box-shadow:0 5px 18px rgba(124,58,237,.22);
}
.av-server.active {
  border-color:rgba(124,58,237,.95) !important;
  background:linear-gradient(180deg,rgba(124,58,237,.42),rgba(78,38,145,.82));
  box-shadow:0 0 0 1px rgba(124,58,237,.22),0 5px 18px rgba(124,58,237,.3);
}
.av-server-logo {
  width:18px;
  height:18px;
  border-radius:5px;
  object-fit:contain;
  flex:0 0 18px;
  box-shadow:0 0 10px rgba(124,58,237,.22);
}
.av-server-label { line-height:1; }
@media (max-width:390px) {
  .av-server { min-height:31px; padding:.28rem .55rem; gap:.3rem; }
  .av-server-logo { width:16px; height:16px; flex-basis:16px; }
}
/* RESPONSIVE */
@media (min-width:1025px) and (max-width:1200px) {
  .wp-grid { grid-template-columns: 1fr 300px; gap: 1.25rem; }
  .wp-ep-list { max-height: 420px; }
  .wp-anime-banner { height: 90px; }
}
@media (max-width: 1024px) {
  html, body { overflow-x: hidden; }
  .wp-page { padding: 0 0 3rem; }
  .wp-grid { display: flex; flex-direction: column; gap: 0; width: 100%; }
  .wp-left { display: contents; width: 100%; }
  .wp-crumb       { order: 0; }
  .wp-player-zone { order: 1; }
  .wp-info        { order: 2; }
  .wp-sidebar     { order: 3; }
  .wp-chars       { order: 4; }
  .wp-sidebar {
    position: static;
    max-height: none;
    overflow: visible;
    padding: 0;
    gap: .8rem;
    margin-top: .8rem;
    width: 100%;
  }
  .wp-anime-card { display: none; }
  .wp-crumb { padding: .65rem .6rem .4rem; font-size: .72rem; }
  .wp-player-zone {
    width: 100vw;
    position: relative;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 0;
  }
  .wp-player-shell {
    border-radius: 0 !important;
    border-left: none !important;
    border-right: none !important;
    border-top: none !important;
    box-shadow: 0 4px 28px rgba(0,0,0,.7);
  }
  .wp-player-accent-line { border-radius: 0; margin: 0; }
  .wp-player-glow { display: none; }
  .wp-controls {
    border-radius: 0 !important;
    border-left: none !important;
    border-right: none !important;
    margin-top: 0 !important;
    padding: .5rem .6rem !important;
  }
  .wp-nav { margin: .75rem .6rem 0 !important; gap: .5rem; }
  .wp-nav-btn { padding: .55rem .9rem; font-size: .8rem; }
  .wp-info { margin: .75rem 3px 0 !important; border-radius: 13px; width: calc(100% - 6px) !important; box-sizing: border-box; }
  .wp-info-head { padding: .9rem .6rem .7rem !important; }
  .wp-ep-title { font-size: 1rem; }
  .wp-actions { padding: .65rem .6rem !important; }
  .wp-prog-wrap { padding: .65rem .6rem !important; }
  .wp-ep-card { margin: .75rem 3px 0 !important; border-radius: 13px; width: calc(100% - 6px) !important; box-sizing: border-box; }
  .wp-ep-head { padding: .65rem .6rem !important; }
  .wp-ep-search-wrap { padding: .5rem .6rem !important; }
  .wp-ep-search-ico { left: 1.05rem; }
  .ep-item { padding: .4rem .6rem !important; }
  .ep-item.active { padding-left: calc(.6rem - 2px) !important; }
  .wp-ep-list { max-height: 320px; }
  .wp-chars { margin: .75rem 3px .8rem !important; border-radius: 13px; overflow: hidden; width: calc(100% - 6px) !important; box-sizing: border-box; }
  .wp-chars-head { padding: .65rem .6rem !important; }
  .char-grid-v2 { display: grid; grid-template-columns: repeat(4, 1fr); }
  .char-v2 { flex: unset; }
  .wp-gate-ring { width: 64px; height: 64px; }
  .wp-gate-ring svg { width: 24px; height: 24px; }
  .wp-gate-title { font-size: .95rem; }
}
@media (max-width: 390px) {
  .server-btn { padding: .25rem .45rem; font-size: .68rem; gap: .2rem; }
  .server-row { flex-wrap: wrap; gap: .3rem; }
  .server-row-badge { min-width: 28px; font-size: .55rem; }
  .server-panel-body { padding: .4rem .5rem; gap: .4rem; }
}
@media (max-width: 480px) {
  .wp-crumb { display: none; }
  .wpc-label, .wpc-div, .wpc-hint { display: none; }
  .wp-controls { padding: .4rem .6rem; gap: .4rem; }
  .wp-nav-lbl { display: none; }
  .wp-nav-btn { padding: .5rem .75rem; font-size: .77rem; gap: .35rem; }
  .ep-thumb-box { width: 66px; height: 38px; }
  .wp-info, .wp-ep-card, .wp-chars { margin-left: 3px; margin-right: 3px; }
  .wp-nav { margin-left: .6rem; margin-right: .6rem; }
}

/* ═══════════════════════════════════════════════════════════════════
   ANIVAULT WATCH — FULL UI REDESIGN
   The video player/engine is intentionally not styled or modified here.
   Everything below is page chrome, controls, metadata and episode browsing.
═══════════════════════════════════════════════════════════════════ */

.wp-page{
  max-width:1500px;
  margin:0 auto;
  padding:0 clamp(.75rem,2.4vw,2.25rem) 5rem;
}
.wp-crumb{
  max-width:1500px;
  margin:0 auto;
  padding:1rem 0 .8rem;
  font-size:.72rem;
  text-transform:uppercase;
  letter-spacing:.09em;
}
.wp-crumb a:hover{color:var(--accent)!important}

/* ── top context header ───────────────────────────────────────── */
.watch-heading{
  display:grid;
  grid-template-columns:82px minmax(0,1fr) auto;
  gap:1rem;
  align-items:center;
  padding:1rem 1.15rem;
  margin-bottom:1rem;
  border:1px solid rgba(255,255,255,.08);
  border-radius:20px;
  background:linear-gradient(135deg,rgba(24,27,36,.96),rgba(15,17,23,.94));
  box-shadow:0 18px 55px rgba(0,0,0,.28);
}
.watch-heading-poster{
  width:82px;height:112px;
  position:relative;
  overflow:hidden;
  border-radius:12px;
  background:#101218;
  box-shadow:0 10px 28px rgba(0,0,0,.45);
}
.watch-heading-poster img{width:100%;height:100%;display:block;object-fit:cover}
.watch-heading-ep{
  position:absolute;left:7px;bottom:7px;
  padding:.25rem .42rem;
  border-radius:6px;
  background:rgba(8,10,14,.88);
  border:1px solid rgba(255,255,255,.13);
  color:#fff;font-size:.62rem;font-weight:800;letter-spacing:.08em;
}
.watch-kicker,.watch-section-eyebrow{
  color:var(--accent);
  font-size:.62rem;
  font-weight:800;
  letter-spacing:.16em;
  text-transform:uppercase;
}
.watch-heading h1{
  margin:.2rem 0 .2rem;
  color:var(--text-primary);
  font-size:clamp(1.15rem,2.2vw,1.75rem);
  line-height:1.15;
  letter-spacing:-.035em;
}
.watch-heading-sub{
  display:flex;flex-wrap:wrap;gap:.45rem;
  color:var(--text-muted);
  font-size:.78rem;
}
.watch-heading-dot{opacity:.35}
.watch-heading-tags{
  display:flex;flex-wrap:wrap;gap:.4rem;
  margin-top:.65rem;
}
.watch-heading-tags span{
  padding:.27rem .52rem;
  border:1px solid rgba(255,255,255,.08);
  border-radius:7px;
  background:rgba(255,255,255,.035);
  color:var(--text-secondary);
  font-size:.63rem;font-weight:700;
}
.watch-heading-tags .tag-filler{color:#f6c453;border-color:rgba(246,196,83,.2)}
.watch-heading-tags .tag-recap{color:#67d6ff;border-color:rgba(103,214,255,.2)}
.watch-heading-actions{
  display:flex;gap:.45rem;align-self:start;
}
.heading-action{
  display:inline-flex;align-items:center;justify-content:center;gap:.4rem;
  min-height:36px;padding:0 .7rem;
  border:1px solid rgba(255,255,255,.09);
  border-radius:9px;
  background:rgba(255,255,255,.035);
  color:var(--text-secondary);
  text-decoration:none;
  font-size:.7rem;font-weight:700;
  cursor:pointer;
  transition:.18s ease;
}
.heading-action svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.heading-action:hover{background:rgba(255,255,255,.075);border-color:rgba(255,255,255,.16);color:var(--text-primary);transform:translateY(-1px)}
.heading-action.copied{color:#67e8a5;border-color:rgba(103,232,165,.3)}

/* ── page layout ───────────────────────────────────────────────── */
.watch-layout{
  display:grid;
  grid-template-columns:minmax(0,1fr) 390px;
  gap:1.15rem;
  align-items:start;
}
.watch-main{min-width:0}
.watch-sidebar{
  min-width:0;
  display:flex;
  flex-direction:column;
  gap:1rem;
  position:sticky;
  top:12px;
  align-self:start;
}

/* The player container itself is deliberately left alone. */
.wp-player-zone{min-width:0}

/* ── server/control console ────────────────────────────────────── */
.wp-controls{
  margin-top:.7rem;
  padding:.85rem;
  border:1px solid rgba(255,255,255,.08);
  border-radius:15px;
  background:rgba(18,21,28,.96);
  box-shadow:0 10px 30px rgba(0,0,0,.18);
}
.wp-controls-top{
  display:flex;align-items:center;justify-content:space-between;
  padding:0 .15rem .55rem;
}
.wpc-label{
  color:var(--text-primary)!important;
  font-size:.67rem!important;
  font-weight:800!important;
  text-transform:uppercase;
  letter-spacing:.1em;
}
.wpc-hint{font-size:.62rem!important;color:var(--text-muted)!important}
.server-panel{
  border:1px solid rgba(255,255,255,.07)!important;
  border-radius:12px!important;
  background:rgba(255,255,255,.018)!important;
  overflow:hidden;
}
.server-panel-head{
  min-height:39px!important;
  padding:.65rem .75rem!important;
  border-bottom:1px solid rgba(255,255,255,.06)!important;
}
.server-panel-dot{width:6px!important;height:6px!important}
.server-panel-hint{font-size:.61rem!important}
.server-panel-body{padding:.65rem!important}
.server-tabs{gap:.35rem!important}
.server-tab{
  border-radius:8px!important;
  min-height:32px!important;
  font-size:.67rem!important;
}
.server-tab-panel{padding:.6rem!important}
.server-btn-row{gap:.4rem!important}
.server-btn{
  min-height:35px!important;
  border-radius:9px!important;
  padding:.35rem .65rem!important;
  font-size:.7rem!important;
}
.av-server{
  border-color:rgba(124,58,237,.25)!important;
  background:rgba(124,58,237,.08)!important;
}
.av-server:hover,.av-server.active{
  border-color:rgba(124,58,237,.55)!important;
  background:rgba(124,58,237,.14)!important;
}
.av-server-logo{width:18px!important;height:18px!important}
.av-server-label{margin-left:2px!important}
.wp-nav{
  margin-top:.7rem!important;
  gap:.65rem!important;
}
.wp-nav-btn{
  min-height:48px!important;
  border-radius:12px!important;
  border:1px solid rgba(255,255,255,.07)!important;
  background:rgba(18,21,28,.9)!important;
}

/* ── episode information ───────────────────────────────────────── */
.watch-episode-card,
.watch-discover-card,
.wp-chars{
  margin-top:1rem;
  border:1px solid rgba(255,255,255,.08);
  border-radius:18px;
  background:linear-gradient(145deg,rgba(22,25,33,.98),rgba(15,17,23,.97));
  box-shadow:0 14px 40px rgba(0,0,0,.18);
  overflow:hidden;
}
.watch-episode-main{padding:1.2rem 1.25rem .85rem}
.watch-episode-main h2{
  margin:.25rem 0 .3rem;
  color:var(--text-primary);
  font-size:1.28rem;
  line-height:1.25;
  letter-spacing:-.025em;
}
.watch-episode-meta{
  display:flex;flex-wrap:wrap;gap:.42rem;
  color:var(--text-muted);
  font-size:.72rem;
}
.watch-synopsis{
  max-width:900px;
  margin:.85rem 0 0;
  color:var(--text-secondary);
  font-size:.78rem;
  line-height:1.7;
}
.watch-synopsis.muted{color:var(--text-muted)}
.watch-episode-facts{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:1px;
  border-top:1px solid rgba(255,255,255,.06);
  border-bottom:1px solid rgba(255,255,255,.06);
  background:rgba(255,255,255,.055);
}
.fact-box{
  min-width:0;
  padding:.75rem .85rem;
  background:rgba(18,21,28,.9);
}
.fact-box span{
  display:block;
  margin-bottom:.25rem;
  color:var(--text-muted);
  font-size:.58rem;
  text-transform:uppercase;
  letter-spacing:.1em;
}
.fact-box strong{
  display:block;
  overflow:hidden;
  color:var(--text-primary);
  font-size:.74rem;
  white-space:nowrap;
  text-overflow:ellipsis;
}
.watch-action-row{
  display:flex;flex-wrap:wrap;gap:.45rem;
  padding:.85rem 1.25rem;
}
.watch-action{
  display:inline-flex;align-items:center;justify-content:center;gap:.42rem;
  min-height:36px;padding:0 .72rem;
  border:1px solid rgba(255,255,255,.09);
  border-radius:9px;
  background:rgba(255,255,255,.035);
  color:var(--text-secondary);
  text-decoration:none;
  font-size:.68rem;font-weight:750;
  cursor:pointer;
  transition:.18s ease;
}
.watch-action svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.watch-action:hover{color:var(--text-primary);background:rgba(255,255,255,.075);border-color:rgba(255,255,255,.16);transform:translateY(-1px)}
.watch-action.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.watch-action.primary:hover{filter:brightness(1.08)}
.watch-progress-card{
  margin:0 1.25rem 1.1rem;
  padding:.75rem .85rem;
  border:1px solid rgba(255,255,255,.07);
  border-radius:11px;
  background:rgba(255,255,255,.025);
}
.watch-progress-head,.watch-progress-foot{
  display:flex;align-items:center;justify-content:space-between;gap:.75rem;
}
.watch-progress-head span{font-size:.58rem;letter-spacing:.1em;color:var(--text-muted);font-weight:800}
.watch-progress-head strong{font-size:.68rem;color:var(--text-secondary)}
.watch-progress-track{
  height:5px;margin:.55rem 0;
  border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;
}
.watch-progress-track span{display:block;height:100%;border-radius:inherit;background:var(--accent)}
.watch-progress-foot{font-size:.61rem;color:var(--text-muted)}

/* ── discovery / genres ────────────────────────────────────────── */
.watch-discover-card{padding:1rem 1.2rem}
.watch-discover-head{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem}
.watch-discover-head h2{margin:.2rem 0 0;font-size:1rem;color:var(--text-primary)}
.watch-discover-head>a{color:var(--accent);font-size:.68rem;font-weight:700;text-decoration:none;white-space:nowrap}
.watch-genre-row{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.8rem}
.watch-genre-row span{
  padding:.3rem .52rem;
  border:1px solid rgba(255,255,255,.07);
  border-radius:7px;
  background:rgba(255,255,255,.025);
  color:var(--text-muted);
  font-size:.62rem;
}
.watch-dub-line{
  display:flex;align-items:center;gap:.4rem;
  margin-top:.75rem;padding-top:.7rem;
  border-top:1px solid rgba(255,255,255,.06);
  color:var(--text-secondary);font-size:.68rem;
}

/* ── anime card ────────────────────────────────────────────────── */
.watch-anime-card{
  overflow:hidden;
  border:1px solid rgba(255,255,255,.08);
  border-radius:18px;
  background:#151820;
  box-shadow:0 14px 40px rgba(0,0,0,.22);
}
.watch-anime-art{height:205px;position:relative;overflow:hidden;background:#0e1015}
.watch-anime-art img{width:100%;height:100%;display:block;object-fit:cover}
.watch-anime-art-shade{
  position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(0,0,0,.04),rgba(5,7,10,.88));
}
.watch-anime-art-info{
  position:absolute;left:.9rem;right:.9rem;bottom:.75rem;
  display:flex;justify-content:space-between;gap:.5rem;
  color:#fff;font-size:.59rem;font-weight:800;letter-spacing:.08em;
}
.watch-anime-body{padding:1rem}
.watch-anime-title{
  display:block;
  color:var(--text-primary);
  font-size:1rem;font-weight:800;line-height:1.25;
  text-decoration:none;
}
.watch-anime-title:hover{color:var(--accent)}
.watch-anime-status{margin-top:.25rem;color:var(--text-muted);font-size:.68rem}
.watch-anime-status span{opacity:.4}
.watch-dub-badge{
  display:inline-flex;margin-top:.65rem;
  padding:.3rem .5rem;
  border:1px solid rgba(45,212,191,.18);
  border-radius:7px;
  background:rgba(45,212,191,.06);
  color:#6ee7d2;font-size:.62rem;font-weight:700;
}
.watch-score-line{
  display:flex;align-items:center;gap:.6rem;margin-top:.75rem;
}
.watch-score-line strong{color:#f6c453;font-size:.72rem}
.watch-score-line>div{height:4px;flex:1;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden}
.watch-score-line>div span{display:block;height:100%;border-radius:inherit;background:#f6c453}
.watch-anime-open{
  display:flex;align-items:center;justify-content:space-between;
  margin-top:.85rem;padding-top:.75rem;
  border-top:1px solid rgba(255,255,255,.06);
  color:var(--text-secondary);font-size:.68rem;font-weight:700;text-decoration:none;
}
.watch-anime-open:hover{color:var(--accent)}

/* ── episode queue ─────────────────────────────────────────────── */
.watch-queue-card{
  overflow:hidden;
  border:1px solid rgba(255,255,255,.08);
  border-radius:18px;
  background:rgba(18,21,28,.98);
  box-shadow:0 14px 40px rgba(0,0,0,.18);
}
.watch-queue-head{
  display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;
  padding:1rem 1rem .75rem;
}
.watch-queue-head h2{margin:.2rem 0 0;font-size:1.05rem;color:var(--text-primary)}
.watch-queue-count{
  padding:.28rem .48rem;border-radius:6px;
  background:rgba(255,255,255,.045);
  color:var(--text-muted);font-size:.59rem;font-weight:700;
}
.watch-queue-search{
  display:flex;align-items:center;gap:.45rem;
  margin:0 .85rem .7rem;
  padding:0 .65rem;
  min-height:36px;
  border:1px solid rgba(255,255,255,.08);
  border-radius:9px;
  background:rgba(255,255,255,.025);
}
.watch-queue-search svg{width:15px;height:15px;fill:currentColor;color:var(--text-muted);flex:none}
.watch-queue-search input{
  width:100%;border:0;outline:0;background:transparent;
  color:var(--text-primary);font-size:.7rem;
}
.watch-queue-search input::placeholder{color:var(--text-muted)}
.watch-queue-card .wp-ep-list{
  max-height:min(62vh,720px);
  overflow-y:auto;
  padding:.25rem .65rem .7rem;
  scrollbar-width:thin;
}
.watch-queue-card .ep-item{
  display:grid!important;
  grid-template-columns:142px minmax(0,1fr) auto;
  gap:.7rem!important;
  align-items:center;
  min-height:86px;
  margin:.18rem 0;
  padding:.4rem!important;
  border:1px solid transparent!important;
  border-radius:11px!important;
  background:transparent!important;
}
.watch-queue-card .ep-item:hover{
  border-color:rgba(255,255,255,.08)!important;
  background:rgba(255,255,255,.035)!important;
}
.watch-queue-card .ep-item.active{
  border-color:rgba(124,58,237,.38)!important;
  background:rgba(124,58,237,.075)!important;
}
.watch-queue-card .ep-thumb-box{
  width:142px!important;height:80px!important;
  border:0!important;border-radius:8px!important;
  background:#0b0d11!important;
  box-shadow:none!important;
}
.watch-queue-card .ep-thumb-box img,
.watch-queue-card .ep-thumb-box img.vis{
  width:100%!important;height:100%!important;
  opacity:1!important;filter:none!important;
  object-fit:cover!important;
}
.watch-queue-card .ep-thumb-box::before,
.watch-queue-card .ep-thumb-box::after{display:none!important;content:none!important}
.watch-queue-card .ep-play-ov{
  inset:auto 7px 7px auto!important;
  width:28px!important;height:28px!important;
  border-radius:50%!important;
  background:rgba(7,9,12,.86)!important;
  border:1px solid rgba(255,255,255,.18)!important;
  opacity:0!important;
  transform:scale(.92);
}
.watch-queue-card .ep-play-ov svg{width:12px!important;height:12px!important}
.watch-queue-card .ep-item:hover .ep-play-ov,
.watch-queue-card .ep-item.active .ep-play-ov{opacity:1!important;transform:scale(1)}
.watch-queue-card .ep-num-fallback{
  background:rgba(7,9,12,.82);
  inset:auto 6px 6px auto;
  width:30px;height:20px;border-radius:5px;
  font-size:.6rem;color:#fff;
}
.watch-queue-card .ep-meta{padding-right:.15rem}
.watch-queue-card .ep-num-txt{
  font-size:.59rem!important;color:var(--text-muted)!important;
  letter-spacing:.04em;text-transform:uppercase;
}
.watch-queue-card .ep-title-txt{
  margin-top:.18rem;
  color:var(--text-secondary)!important;
  font-size:.73rem!important;
  line-height:1.35!important;
}
.watch-queue-card .ep-item.active .ep-title-txt{color:var(--text-primary)!important}
.watch-queue-card .ep-live-dot{
  width:7px!important;height:7px!important;
  margin-right:.25rem;
}

/* remove old thumbnail dimming/color treatments */
.watch-queue-card .ep-item.watched:not(.active) .ep-thumb-box{opacity:1!important}
.watch-queue-card .ep-item.watched:not(.active) .ep-num-txt,
.watch-queue-card .ep-item.watched:not(.active) .ep-title-txt{opacity:1!important}
.watch-queue-card .ep-item.watched .ep-thumb-box::after{display:none!important}

/* ── characters: turn the old block into a clean content rail ─── */
.wp-chars{
  padding:1rem;
  margin-top:1rem!important;
  background:rgba(18,21,28,.98)!important;
}
.wp-chars-head{
  display:flex!important;align-items:center!important;justify-content:space-between!important;
  margin-bottom:.7rem!important;
}
.wp-chars-head a{font-size:.66rem!important;color:var(--accent)!important}
.char-grid-v2{
  display:flex!important;
  gap:.6rem!important;
  overflow-x:auto;
  padding-bottom:.25rem;
  scrollbar-width:thin;
}
.char-v2{
  flex:0 0 88px!important;
  width:88px!important;
}
.char-v2-img-wrap{
  height:118px!important;
  border-radius:10px!important;
  overflow:hidden;
  background:#0d1015;
}
.char-v2-img{width:100%!important;height:100%!important;object-fit:cover!important}
.char-v2-role-badge{
  bottom:5px!important;left:5px!important;right:5px!important;
  width:auto!important;
  padding:.2rem .28rem!important;
  border-radius:5px!important;
  background:rgba(5,7,10,.84)!important;
  font-size:.52rem!important;
}
.char-v2-name{
  margin-top:.38rem!important;
  font-size:.62rem!important;
  line-height:1.3!important;
}

/* ── mobile ────────────────────────────────────────────────────── */
@media (max-width:1100px){
  .watch-layout{grid-template-columns:minmax(0,1fr) 330px;gap:.9rem}
  .watch-queue-card .ep-item{grid-template-columns:112px minmax(0,1fr) auto}
  .watch-queue-card .ep-thumb-box{width:112px!important;height:63px!important}
}
@media (max-width:900px){
  .watch-layout{grid-template-columns:1fr}
  .watch-sidebar{position:static}
  .watch-anime-card{display:none}
  .watch-queue-card .wp-ep-list{max-height:620px}
}
@media (max-width:640px){
  /* Keep mobile watch pages compact: no duplicate discovery panel. Characters follow episode info directly. */
  .watch-discover-card{display:none!important}
  .wp-page{padding-left:.65rem;padding-right:.65rem}
  .wp-crumb{display:none}
  .watch-heading{
    grid-template-columns:58px minmax(0,1fr);
    gap:.75rem;
    padding:.75rem;
    border-radius:15px;
  }
  .watch-heading-poster{width:58px;height:78px;border-radius:9px}
  .watch-heading-ep{left:4px;bottom:4px;font-size:.52rem}
  .watch-heading h1{font-size:1.05rem}
  .watch-heading-sub{font-size:.68rem}
  .watch-heading-actions{
    grid-column:1/-1;
    display:grid;grid-template-columns:1fr 1fr;
  }
  .heading-action{min-height:34px}
  .watch-episode-main{padding:1rem .85rem .7rem}
  .watch-episode-main h2{font-size:1.05rem}
  .watch-episode-facts{grid-template-columns:repeat(2,1fr)}
  .watch-episode-facts .fact-box{padding:.75rem .7rem}
  .watch-episode-facts .fact-box span{font-size:.58rem}
  .watch-episode-facts .fact-box strong{font-size:.9rem}
  .watch-action-row{padding:.7rem .85rem}
  .watch-action{flex:1 1 calc(50% - .5rem)}
  .watch-progress-card{margin:0 .85rem .9rem}
  .watch-discover-card{padding:.9rem}
  .watch-queue-head{padding:.85rem .8rem .65rem}
  .watch-queue-search{margin-left:.7rem;margin-right:.7rem}
  .watch-queue-card .wp-ep-list{padding-left:.45rem;padding-right:.45rem}
  .watch-queue-card .ep-item{
    grid-template-columns:110px minmax(0,1fr) auto;
    min-height:70px;
  }
  .watch-queue-card .ep-thumb-box{width:110px!important;height:62px!important}
  .watch-queue-card .ep-title-txt{font-size:.67rem!important}
  .wp-nav{margin-left:0!important;margin-right:0!important}
}
@media (max-width:390px){
  .watch-queue-card .ep-item{grid-template-columns:96px minmax(0,1fr)}
  .watch-queue-card .ep-thumb-box{width:96px!important;height:54px!important}
  .watch-queue-card .ep-live-dot{display:none}
}

/* ── watch page: plain dark layout + mobile section order ───────── */
.av-ambient{display:none!important}
.watch-title-under-player{padding:1rem 0 .85rem}
.watch-title-ep{font-size:.68rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:.28rem}
.watch-title-under-player h1{margin:0;color:var(--text-primary);font-size:1.45rem;line-height:1.18;font-weight:800}
.watch-title-sub{margin-top:.28rem;color:var(--text-muted);font-size:.86rem;line-height:1.4}
.watch-info-card,.watch-episode-card,.watch-discover-card,.wp-chars,.watch-anime-card,.watch-queue-card{background:transparent!important;box-shadow:none!important}
.watch-info-card,.watch-episode-card,.watch-discover-card,.wp-chars{border-radius:0!important}
.watch-info-card{padding:1rem 0;border-top:1px solid rgba(255,255,255,.07);border-bottom:1px solid rgba(255,255,255,.07)}
.watch-info-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:.7rem}
.watch-info-head a{font-size:.7rem;color:var(--accent);text-decoration:none;font-weight:700}
.watch-episode-card{margin-top:.9rem}
.watch-episode-main{padding-left:0!important;padding-right:0!important}
.watch-episode-facts{border:0!important}
@media (max-width:900px){
  .watch-main{display:flex!important;flex-direction:column!important}
  .watch-main>.wp-player-zone{order:1}
  .watch-main>.watch-info-card{order:2}
  .watch-main>.watch-episode-card{order:3}
  .watch-main>.watch-discover-card{order:4}
  .watch-main>.wp-chars{order:5}
  .watch-discover-card{display:none!important}
  .wp-chars{margin-top:.9rem!important;padding-top:0!important}
}
@media (max-width:640px){
  .watch-title-under-player{padding:.8rem .1rem .7rem}
  .watch-title-under-player h1{font-size:1.2rem}
  .watch-title-sub{font-size:.76rem}
  .watch-info-card{padding:.85rem 0}
  .watch-episode-card{margin-top:.7rem}
  .watch-info-head{margin-bottom:.55rem}
}

/* ── final flat watch UI overrides ───────────────────────────── */
.av-ambient,.watch-heading{display:none!important}
.wp-page{padding-top:0!important}
.wp-player-zone,.wp-player-glow,.wp-controls,.server-panel,.server-panel-body,.server-tab-panel,.watch-info-card,.watch-episode-card,.watch-discover-card,.wp-chars,.watch-anime-card,.watch-queue-card{background:transparent!important;box-shadow:none!important}
.wp-player-zone,.wp-controls,.server-panel,.watch-info-card,.watch-episode-card,.watch-discover-card,.wp-chars{border-color:transparent!important}
.wp-player-zone{padding-left:0!important;padding-right:0!important}
.watch-main{background:transparent!important}
.watch-info-card,.watch-episode-card,.wp-chars{padding-left:0!important;padding-right:0!important}
.watch-info-card{margin-top:.35rem!important}
.watch-episode-card{margin-top:.75rem!important}
.wp-chars{margin-top:.75rem!important}
.watch-action,.heading-action,.server-btn,.server-tab,.wpc-q,.wp-nav-btn,.ep-range-btn,.ep-range-row{background:rgba(255,255,255,.045)}
.watch-title-under-player{padding:.65rem 0 .55rem .85rem!important}
.watch-title-under-player h1{margin:0!important}
@media (max-width:900px){
  /* Explicit mobile DOM flow: player/title -> episode -> characters. */
  .watch-main{
    display:grid!important;
    grid-template-columns:minmax(0,1fr)!important;
    grid-auto-flow:row!important;
    align-items:stretch!important;
  }
  .watch-main>.wp-player-zone{
    display:block!important;
    grid-row:1!important;
    order:0!important;
  }
  .watch-main>.watch-episode-card{
    display:block!important;
    grid-row:2!important;
    order:0!important;
  }
  .watch-main>.wp-chars{
    display:block!important;
    grid-row:3!important;
    order:0!important;
    position:relative!important;
    float:none!important;
    clear:both!important;
  }
  .watch-discover-card{display:none!important}
}
@media (max-width:640px){
  .wp-page{padding-left:.6rem!important;padding-right:.6rem!important;padding-bottom:2rem!important}
  .watch-title-under-player{padding:.6rem 0 .5rem .75rem!important}
  .watch-info-card{padding-top:.7rem!important;padding-bottom:.7rem!important}
  .watch-episode-card{margin-top:.65rem!important;padding-top:.1rem!important}
  .wp-chars{margin-top:.65rem!important;padding-top:.1rem!important}
  .watch-info-head{padding:0!important}
  .watch-episode-main{padding:0!important}
}

/* ── locked episode/character flow ─────────────────────────────── */
.watch-content-flow{
  display:flex!important;
  flex-direction:column!important;
  width:100%!important;
  min-width:0!important;
  gap:0!important;
}
.watch-content-flow>.watch-episode-card{order:1!important;position:relative!important;float:none!important;grid-area:auto!important;}
.watch-content-flow>.wp-chars{order:2!important;position:relative!important;float:none!important;grid-area:auto!important;clear:both!important;}
.watch-title-under-player{padding-left:1.25rem!important;}
@media (max-width:640px){
  .watch-title-under-player{padding-left:1.15rem!important;padding-right:.35rem!important;}
  .watch-content-flow{display:flex!important;flex-direction:column!important;}
  .watch-content-flow>.watch-episode-card{order:1!important;}
  .watch-content-flow>.wp-chars{order:2!important;margin-top:1.1rem!important;}
}

/* ── isolated character section: never affected by legacy .wp-chars layout ── */
.watch-character-section{
  display:block!important;
  position:relative!important;
  float:none!important;
  clear:both!important;
  width:100%!important;
  margin:1.1rem 0 0!important;
  padding:0!important;
  background:transparent!important;
  border:0!important;
  border-radius:0!important;
  box-shadow:none!important;
  overflow:visible!important;
  order:2!important;
}
.watch-content-flow{
  display:flex!important;
  flex-direction:column!important;
  align-items:stretch!important;
  width:100%!important;
}
.watch-content-flow>.watch-episode-card{
  order:1!important;
  width:100%!important;
  flex:none!important;
}
.watch-content-flow>.watch-character-section{
  order:2!important;
  flex:none!important;
}
.watch-title-under-player{
  padding-left:1.5rem!important;
}
@media(max-width:640px){
  .watch-title-under-player{
    padding-left:1.5rem!important;
    padding-right:.5rem!important;
  }
  .watch-content-flow{
    display:flex!important;
    flex-direction:column!important;
  }
  .watch-content-flow>.watch-episode-card{order:1!important;}
  .watch-content-flow>.watch-character-section{order:2!important;margin-top:1.25rem!important;}
}

.watch-character-slot{
  display:block!important;
  width:100%!important;
  min-width:0!important;
  height:auto!important;
  position:relative!important;
  order:2!important;
  clear:both!important;
  float:none!important;
}
.watch-character-slot>.wp-chars{
  display:block!important;
  width:100%!important;
  height:auto!important;
  position:relative!important;
  top:auto!important;left:auto!important;right:auto!important;bottom:auto!important;
  transform:none!important;
  order:initial!important;
  float:none!important;
  clear:both!important;
  margin-top:1.1rem!important;
}
@media(max-width:640px){
  .watch-title-under-player{padding-left:1.5rem!important;padding-right:.5rem!important}
  .watch-content-flow{display:flex!important;flex-direction:column!important}
  .watch-content-flow>.watch-episode-card{flex:0 0 auto!important;order:1!important}
  .watch-content-flow>.watch-character-slot{flex:0 0 auto!important;order:2!important}
  .watch-character-slot>.wp-chars{margin-top:1.25rem!important}
}


/*
   The episode queue lives in .watch-sidebar while characters live in
   .watch-main. On small displays we flatten both wrappers so they share
   one vertical flex flow. This makes the DOM-independent visual order:
   player -> info -> episode info -> episode queue -> characters.
*/
@media (max-width:900px){
  .watch-layout{
    display:flex!important;
    flex-direction:column!important;
    align-items:stretch!important;
    gap:0!important;
  }
  .watch-layout>.watch-main,
  .watch-layout>.watch-sidebar{
    display:contents!important;
  }

  .watch-layout .watch-content-flow{
    display:contents!important;
  }

  .watch-layout .wp-player-zone{
    order:1!important;
  }
  .watch-layout .watch-episode-card{
    order:2!important;
  }
  .watch-layout .watch-queue-card{
    order:3!important;
    width:100%!important;
    margin-top:.85rem!important;
  }
  .watch-layout .wp-chars,
  .watch-layout .watch-character-section,
  .watch-layout .watch-character-slot{
    order:4!important;
  }

  .watch-layout .watch-anime-card,
  .watch-layout .watch-discover-card{
    display:none!important;
  }
}

@media (max-width:640px){
  .watch-layout .watch-queue-card{
    margin-top:.65rem!important;
  }
  .watch-layout .wp-chars{
    margin-top:.75rem!important;
  }
}


  /* Hide play overlay on episode thumbnails */
.ep-play-ov{display:none!important;}

/* ── enhanced SUB / DUB segmented switch ───────────────────────── */
.server-tabs{
  position:relative!important;
  display:grid!important;
  grid-template-columns:1fr 1fr!important;
  align-items:center!important;
  width:174px!important;
  height:42px!important;
  box-sizing:border-box!important;
  padding:3px!important;
  margin:.7rem .85rem .05rem!important;
  border:1px solid rgba(255,255,255,.11)!important;
  border-radius:13px!important;
  background:rgba(8,10,15,.82)!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.045),0 5px 18px rgba(0,0,0,.18)!important;
  overflow:hidden!important;
}
.server-tabs::before{
  content:'';
  position:absolute;
  z-index:0;
  top:3px;
  left:3px;
  width:calc(50% - 3px);
  height:34px;
  border-radius:10px;
  background:#fff;
  box-shadow:0 4px 14px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.8);
  transition:transform .28s cubic-bezier(.16,1,.3,1),background .28s ease,box-shadow .28s ease;
}
.server-tabs:has(.server-tab[data-tab="dub"].active)::before{
  transform:translateX(100%);
  background:#fff;
  box-shadow:0 4px 14px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.8);
}
.server-tab{
  position:relative!important;
  z-index:1!important;
  width:100%!important;
  height:34px!important;
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  gap:.38rem!important;
  padding:0 .55rem!important;
  border:0!important;
  border-radius:10px!important;
  background:transparent!important;
  color:#a7adb8!important;
  font-size:.67rem!important;
  font-weight:800!important;
  letter-spacing:.09em!important;
  transition:color .22s ease,transform .22s ease!important;
}
.server-tab-icon{
  width:17px!important;
  height:17px!important;
  flex:0 0 17px;
  display:block;
  color:currentColor!important;
  fill:none;
  stroke:currentColor;
  opacity:.72;
  transition:opacity .22s ease,transform .22s ease;
}
.server-tab.active{
  background:transparent!important;
  color:#111827!important;
  box-shadow:none!important;
  transform:translateY(-.5px);
}
.server-tab.active .server-tab-icon{
  opacity:1;
  color:#111827!important;
  stroke:#111827!important;
  transform:scale(1.02);
}
 .server-tab:not(.active):hover{
  color:#d7dbe2!important;
  background:rgba(255,255,255,.045)!important;
}
.server-tab:not(.active):hover .server-tab-icon{
  opacity:.95;
  color:#d7dbe2!important;
  stroke:currentColor;
}
.server-tab:focus-visible{
  outline:2px solid rgba(167,139,250,.8)!important;
  outline-offset:1px;
}
@media (max-width:640px){
  .server-tabs{
    width:166px!important;
    height:40px!important;
    margin:.55rem .6rem .05rem!important;
  }
  .server-tabs::before{height:32px;}
  .server-tab{height:32px!important;font-size:.64rem!important;gap:.3rem!important;}
  .server-tab-icon{width:15px!important;height:15px!important;flex-basis:15px;}
}


/* ── quick episode navigation ─────────────────────────────────── */
.watch-quick-nav{
  display:grid!important;
  grid-template-columns:1fr auto 1fr!important;
  align-items:stretch!important;
  gap:.55rem!important;
  width:100%!important;
  padding:.55rem 0 .2rem!important;
  background:transparent!important;
}
.watch-quick-btn,.watch-auto-next{
  min-height:46px;
  border:1px solid rgba(255,255,255,.07);
  border-radius:10px;
  background:rgba(255,255,255,.035);
  color:var(--text-primary);
  display:flex;
  align-items:center;
  justify-content:flex-start;
  gap:.55rem;
  padding:.55rem .75rem;
  text-decoration:none;
  cursor:pointer;
  transition:background .18s ease,border-color .18s ease,transform .18s ease;
}
.watch-quick-btn.next{justify-content:flex-end;text-align:right}
.watch-quick-btn:not(.disabled):hover,.watch-auto-next:hover{
  background:rgba(255,255,255,.07);
  border-color:rgba(255,255,255,.13);
}
.watch-quick-btn svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
.watch-quick-btn span,.watch-auto-next>span:last-child{display:flex;flex-direction:column;line-height:1.15}
.watch-quick-btn b,.watch-auto-next b{font-size:.72rem;font-weight:750}
.watch-quick-btn small,.watch-auto-next small{margin-top:3px;color:var(--text-muted);font-size:.61rem}
.watch-auto-next{justify-content:center;min-width:126px;color:var(--text-secondary)}
.watch-auto-icon{width:25px;height:25px;border-radius:7px;display:grid;place-items:center;background:rgba(255,255,255,.055)}
.watch-auto-icon svg{width:13px;height:13px;fill:currentColor}
.watch-auto-next.is-on{border-color:rgba(232,69,60,.55);background:rgba(232,69,60,.10);color:var(--text-primary)}
.watch-auto-next.is-on .watch-auto-icon{background:var(--accent);color:#fff}
.watch-quick-btn.disabled{opacity:.35;cursor:default;pointer-events:none}
@media(max-width:640px){
  .watch-quick-nav{gap:.4rem!important;padding:.4rem 0 .15rem!important}
  .watch-quick-btn,.watch-auto-next{min-height:43px;padding:.45rem .55rem;border-radius:9px}
  .watch-quick-btn b,.watch-auto-next b{font-size:.65rem}
  .watch-quick-btn small,.watch-auto-next small{font-size:.56rem}
  .watch-auto-next{min-width:0;padding-left:.5rem;padding-right:.5rem}
  .watch-quick-btn svg{width:16px;height:16px}
}

/* ── compact episode pager / white auto-next toggle ───────────── */
.watch-quick-nav{
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  gap:.55rem!important;
  width:100%!important;
  padding:.6rem 0 .25rem!important;
  background:transparent!important;
}
.watch-quick-btn{
  height:38px!important;
  min-width:112px!important;
  padding:0 .7rem!important;
  border:1px solid rgba(255,255,255,.08)!important;
  border-radius:9px!important;
  background:rgba(255,255,255,.035)!important;
  color:rgba(255,255,255,.78)!important;
  display:inline-flex!important;
  align-items:center!important;
  justify-content:space-between!important;
  gap:.55rem!important;
  text-decoration:none!important;
  font-size:.66rem!important;
  font-weight:650!important;
  transition:all .18s ease!important;
}
.watch-quick-btn span{display:flex!important;align-items:center!important;gap:.28rem!important;white-space:nowrap!important}
.watch-quick-btn b{font-size:.64rem!important;color:rgba(255,255,255,.48)!important;font-weight:650!important}
.watch-quick-btn svg{width:15px!important;height:15px!important;fill:none!important;stroke:currentColor!important;stroke-width:2!important;stroke-linecap:round!important;stroke-linejoin:round!important;flex:none!important}
.watch-quick-btn:hover:not(.disabled){background:rgba(255,255,255,.075)!important;border-color:rgba(255,255,255,.15)!important;color:#fff!important;transform:translateY(-1px)}
.watch-quick-btn.next{justify-content:space-between!important}
.watch-quick-btn.disabled{opacity:.28!important;pointer-events:none!important}
.watch-auto-next{
  height:40px!important;
  padding:0 .72rem 0 .9rem!important;
  border:0!important;
  border-radius:999px!important;
  background:#fff!important;
  color:#171717!important;
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  gap:.65rem!important;
  cursor:pointer!important;
  box-shadow:0 2px 12px rgba(0,0,0,.18)!important;
  transition:transform .18s ease,background .18s ease,box-shadow .18s ease!important;
}
.watch-auto-next:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(0,0,0,.25)!important}
.watch-auto-copy{font-size:.69rem!important;font-weight:800!important;letter-spacing:.01em!important}
.watch-toggle{
  width:32px!important;
  height:19px!important;
  padding:2px!important;
  border-radius:999px!important;
  background:#d8d8d8!important;
  display:flex!important;
  align-items:center!important;
  justify-content:flex-start!important;
  transition:background .18s ease!important;
}
.watch-toggle-knob{
  width:15px!important;
  height:15px!important;
  border-radius:50%!important;
  background:#fff!important;
  box-shadow:0 1px 3px rgba(0,0,0,.28)!important;
  transition:transform .18s ease!important;
}
.watch-auto-next.is-on{background:#fff!important;color:#111!important}
.watch-auto-next.is-on .watch-toggle{background:#111!important}
.watch-auto-next.is-on .watch-toggle-knob{transform:translateX(13px)!important}
@media(max-width:640px){
  .watch-quick-nav{gap:.4rem!important;padding:.45rem 0 .2rem!important}
  .watch-quick-btn{min-width:0!important;flex:1 1 0!important;height:36px!important;padding:0 .55rem!important}
  .watch-quick-btn span{font-size:.6rem!important}
  .watch-quick-btn b{font-size:.58rem!important}
  .watch-auto-next{height:38px!important;padding:0 .58rem 0 .7rem!important;gap:.45rem!important;flex:0 0 auto!important}
  .watch-auto-copy{font-size:.62rem!important}
  .watch-toggle{width:29px!important;height:18px!important}
  .watch-toggle-knob{width:14px!important;height:14px!important}
  .watch-auto-next.is-on .watch-toggle-knob{transform:translateX(11px)!important}
}

/* ── simple episode navigation: auto-next first + emoji controls ── */
.watch-quick-nav{
  display:flex!important;
  align-items:center!important;
  justify-content:flex-start!important;
  gap:.9rem!important;
  width:100%!important;
  padding:.35rem 0 .15rem!important;
  background:transparent!important;
}
.watch-auto-next{
  order:1!important;
  height:34px!important;
  padding:0!important;
  border:0!important;
  border-radius:0!important;
  background:transparent!important;
  color:var(--text-secondary)!important;
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  gap:.45rem!important;
  cursor:pointer!important;
  box-shadow:none!important;
}
.watch-auto-next:hover{
  background:transparent!important;
  color:var(--text-primary)!important;
  transform:none!important;
  box-shadow:none!important;
}
.watch-auto-copy{font-size:.68rem!important;font-weight:700!important}
.watch-toggle{
  width:28px!important;
  height:17px!important;
  padding:2px!important;
  border-radius:999px!important;
  background:rgba(255,255,255,.16)!important;
}
.watch-toggle-knob{
  width:13px!important;
  height:13px!important;
  background:#fff!important;
  box-shadow:none!important;
}
.watch-auto-next.is-on{background:transparent!important;color:var(--text-primary)!important}
.watch-auto-next.is-on .watch-toggle{background:var(--accent)!important}
.watch-auto-next.is-on .watch-toggle-knob{transform:translateX(11px)!important}

.watch-quick-btn{
  order:2!important;
  min-width:auto!important;
  height:34px!important;
  padding:0 .15rem!important;
  border:0!important;
  border-radius:0!important;
  background:transparent!important;
  color:var(--text-secondary)!important;
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  gap:.35rem!important;
  font-size:.68rem!important;
  font-weight:700!important;
  box-shadow:none!important;
}
.watch-quick-btn:hover:not(.disabled){
  background:transparent!important;
  border-color:transparent!important;
  color:var(--text-primary)!important;
  transform:none!important;
}
.watch-quick-btn span[aria-hidden="true"]{
  font-size:1.05rem!important;
  line-height:1!important;
}
.watch-quick-btn span:not([aria-hidden="true"]){
  color:inherit!important;
  font-size:.66rem!important;
  font-weight:700!important;
}
.watch-quick-btn b{display:none!important}
.watch-quick-btn.disabled{opacity:.28!important}
.watch-quick-btn.prev{order:2!important}
.watch-quick-btn.next{order:3!important}
@media(max-width:640px){
  .watch-quick-nav{gap:.7rem!important;padding:.3rem 0 .1rem!important}
  .watch-auto-next{height:32px!important}
  .watch-auto-copy{font-size:.62rem!important}
  .watch-toggle{width:26px!important;height:16px!important}
  .watch-toggle-knob{width:12px!important;height:12px!important}
  .watch-auto-next.is-on .watch-toggle-knob{transform:translateX(10px)!important}
  .watch-quick-btn{height:32px!important;padding:0!important}
  .watch-quick-btn span[aria-hidden="true"]{font-size:.98rem!important}
  .watch-quick-btn span:not([aria-hidden="true"]){font-size:.61rem!important}
}

/* ── episode pager icon refinement ── */
.watch-quick-btn .watch-ep-icon{
  display:block!important;
  width:18px!important;
  height:18px!important;
  flex:0 0 18px!important;
  fill:none!important;
  stroke:currentColor!important;
  stroke-width:1.8!important;
  stroke-linecap:round!important;
  stroke-linejoin:round!important;
}
.watch-quick-btn.prev .watch-ep-icon,
.watch-quick-btn.next .watch-ep-icon{opacity:.9!important}
@media(max-width:640px){
  .watch-quick-btn .watch-ep-icon{width:17px!important;height:17px!important;flex-basis:17px!important}
}

/* ── direct episode navigation symbol sizing ── */
.watch-quick-nav{
  padding-left:18px!important;
  padding-right:18px!important;
}
.watch-auto-next{
  margin-right:22px!important;
}
.watch-quick-btn{
  margin-left:0!important;
  margin-right:0!important;
  padding:4px 4px!important;
  gap:3px!important;
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  min-width:0!important;
  font-size:14px!important;
  line-height:19px!important;
}
.watch-quick-btn + .watch-quick-btn{
  margin-left:1px!important;
}
.watch-quick-btn span:not(.watch-ep-icon-text){
  display:inline-flex!important;
  align-items:center!important;
  height:19px!important;
  line-height:19px!important;
  transform:translateY(1px)!important;
}
.watch-ep-icon-text{
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  font-size:19px!important;
  line-height:19px!important;
  min-width:19px!important;
  height:19px!important;
  font-weight:500!important;
  vertical-align:middle!important;
}
@media(max-width:640px){
  .watch-quick-nav{padding-left:10px!important;padding-right:10px!important;}
  .watch-auto-next{margin-right:14px!important;}
  .watch-quick-btn{font-size:13px!important;padding:3px 3px!important;gap:2px!important;line-height:18px!important;}
  .watch-quick-btn + .watch-quick-btn{margin-left:0!important;}
  .watch-quick-btn span:not(.watch-ep-icon-text){height:18px!important;line-height:18px!important;}
  .watch-ep-icon-text{font-size:18px!important;min-width:18px!important;height:18px!important;line-height:18px!important;}
}

/* ── native player fallback ───────────────────────────────────── */
.watch-native-player{
  order:2!important;
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  gap:5px!important;
  height:34px!important;
  padding:0!important;
  margin-right:18px!important;
  border:0!important;
  background:transparent!important;
  color:var(--text-secondary)!important;
  font-size:13px!important;
  font-weight:700!important;
  line-height:1!important;
  cursor:pointer!important;
  opacity:.9!important;
}
.watch-native-player:disabled{opacity:.3!important;cursor:default!important;}
.watch-native-player:not(:disabled):hover{color:var(--text-primary)!important;}
.watch-native-toggle{
  width:26px!important;
  height:16px!important;
  padding:2px!important;
  border-radius:999px!important;
  background:rgba(255,255,255,.16)!important;
  display:inline-flex!important;
  align-items:center!important;
  justify-content:flex-start!important;
  transition:background .18s ease!important;
}
.watch-native-knob{
  width:12px!important;
  height:12px!important;
  border-radius:50%!important;
  background:#fff!important;
  transition:transform .18s ease!important;
}
.watch-native-player.is-on .watch-native-toggle{background:var(--accent)!important;}
.watch-native-player.is-on .watch-native-knob{transform:translateX(10px)!important;}
#senshi-player-root.native-player-mode{
  background:#000!important;
}
#senshi-player-root.native-player-mode .vh-main-ui,
#senshi-player-root.native-player-mode .vh-gradient-overlay,
#senshi-player-root.native-player-mode #sp-spinner,
#senshi-player-root.native-player-mode #sp-error,
#senshi-player-root.native-player-mode #vh-sub-container{
  display:none!important;
}
#senshi-player-root.native-player-mode #sp-video{
  display:block!important;
  width:100%!important;
  height:100%!important;
  object-fit:contain!important;
  background:#000!important;
}
@media(max-width:640px){
  .watch-native-player{
    height:32px!important;
    margin-right:10px!important;
    gap:4px!important;
    font-size:12px!important;
  }
  .watch-native-toggle{width:24px!important;height:15px!important;}
  .watch-native-knob{width:11px!important;height:11px!important;}
  .watch-native-player.is-on .watch-native-knob{transform:translateX(9px)!important;}
}





.source-section{
  margin-top:.45rem!important;
}
.source-section + .source-section{
  margin-top:1rem!important;
}
.source-section-head{
  display:flex!important;
  align-items:center!important;
  gap:.55rem!important;
  margin:0 .85rem .45rem!important;
  color:var(--text-primary)!important;
  font-size:.74rem!important;
  font-weight:900!important;
  letter-spacing:.06em!important;
  text-transform:uppercase!important;
}
.source-section-icon{
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  width:24px!important;
  height:24px!important;
  font-size:1.35rem!important;
  line-height:1!important;
  font-weight:900!important;
}
.source-section-icon-hls{
  color:#42dff5!important;
  text-shadow:0 0 12px rgba(66,223,245,.28)!important;
  transform:rotate(-8deg)!important;
}
.source-section-icon-embed{
  color:#b79cff!important;
  font-size:1.55rem!important;
  text-shadow:0 0 12px rgba(183,156,255,.24)!important;
}
.source-section-embed .server-btn-row{
  padding-bottom:.15rem!important;
}

.source-tabs{
  display:inline-flex!important;
  align-items:center!important;
  gap:3px!important;
  margin:.55rem .85rem .35rem!important;
  padding:3px!important;
  border:1px solid rgba(255,255,255,.08)!important;
  border-radius:9px!important;
  background:rgba(255,255,255,.025)!important;
}
.source-tab{
  height:28px!important;
  padding:0 .7rem!important;
  border:0!important;
  border-radius:7px!important;
  background:transparent!important;
  color:var(--text-muted)!important;
  font-size:.61rem!important;
  font-weight:800!important;
  letter-spacing:.08em!important;
  text-transform:uppercase!important;
  cursor:pointer!important;
  transition:all .18s ease!important;
}
.source-tab:hover{color:var(--text-primary)!important;background:rgba(255,255,255,.045)!important}
.source-tab.active{
  color:#111827!important;
  background:#fff!important;
  box-shadow:0 2px 8px rgba(0,0,0,.18)!important;
}
.source-panel{display:none!important}
.source-panel.active{display:block!important}

.embed-server-btn{
  min-height:38px!important;
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  gap:.55rem!important;
  padding:0 .8rem!important;
  border:1px solid rgba(232,69,60,.28)!important;
  border-radius:9px!important;
  background:rgba(232,69,60,.07)!important;
  color:var(--text-primary)!important;
  cursor:pointer!important;
  font-size:.68rem!important;
  font-weight:800!important;
  transition:background .18s ease,border-color .18s ease,transform .18s ease!important;
}
.embed-server-btn:hover{
  background:rgba(232,69,60,.13)!important;
  border-color:rgba(232,69,60,.48)!important;
  transform:translateY(-1px)!important;
}
.embed-server-name{letter-spacing:.02em!important}
.embed-server-badge{
  display:inline-flex!important;
  align-items:center!important;
  min-height:20px!important;
  padding:0 .42rem!important;
  border-radius:999px!important;
  background:rgba(255,255,255,.09)!important;
  color:rgba(255,255,255,.72)!important;
  font-size:.56rem!important;
  font-weight:850!important;
  letter-spacing:.04em!important;
  text-transform:uppercase!important;
}
.babastream-embed-frame{
  display:block;
  width:100%;
  height:100%;
  min-height:420px;
  border:0;
  border-radius:inherit;
  background:#000;
}
@media(max-width:640px){
  .source-tabs{margin:.45rem .6rem .3rem!important}
  .source-tab{height:27px!important;padding:0 .6rem!important;font-size:.58rem!important}
  .embed-server-btn{min-height:36px!important;padding:0 .68rem!important;font-size:.64rem!important}
  .embed-server-badge{font-size:.52rem!important}
  .babastream-embed-frame{min-height:240px}
}
`;
