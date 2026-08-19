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
  background: rgba(255,255,255,.02);
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
</style>
`;
