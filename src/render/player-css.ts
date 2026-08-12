export const PLAYER_CSS = `<style id="sp-skin">
/* ─── Tokens ────────────────────────────────────────────── */
:root{
  --sp-accent:#7c3aed;
  --sp-accent-rgb:124,58,237;
  --sp-accent-glow:rgba(124,58,237,0.4);
  --sp-bg:#05070d;
  --sp-surface:#0f1219;
  --sp-surface2:#161b26;
  --sp-surface3:#1e2535;
  --sp-text:#e8eaf0;
  --sp-text-sub:rgba(232,234,240,0.6);
  --sp-text-muted:rgba(232,234,240,0.35);
  --sp-border:rgba(124,58,237,0.15);
  --sp-border2:rgba(124,58,237,0.08);
  --sp-r:14px;
  --sp-hud:'Orbitron',monospace;
  --sp-body:'Exo 2',sans-serif;
}

/* ─── Reset / base ──────────────────────────────────────── */
#senshi-player-root *{box-sizing:border-box;margin:0;padding:0}
#senshi-player-root{
  position:relative;width:100%;
  background:var(--sp-bg);
  font-family:var(--sp-body);
  border-radius:var(--sp-r);
  box-shadow:0 0 0 1px var(--sp-border),0 0 28px rgba(124,58,237,0.07);
  overflow:hidden;
}

/* ─── Video area ────────────────────────────────────────── */
#sp-video-area{position:relative;width:100%;aspect-ratio:16/9;background:#000}
#sp-video{width:100%;height:100%;display:block;background:#000}

/* ─── Spinner ─────────────────────────────────────────────
   Solid black so it fully covers the video element (which otherwise shows
   a "no source" placeholder icon on a grey background while the stream is
   still loading — that's what was making it look broken). Visible by
   default; only hidden once playback actually starts. ─────────────── */
#sp-spinner{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:20;background:#000;opacity:1;transition:opacity .25s}
#sp-spinner.hide{opacity:0;pointer-events:none}
.sp-spin{width:46px;height:46px;border-radius:50%;border:2.5px solid transparent;border-top-color:var(--sp-accent);border-bottom-color:rgba(124,58,237,0.2);animation:sp-spin .75s linear infinite;box-shadow:0 0 12px var(--sp-accent-glow)}
@keyframes sp-spin{to{transform:rotate(360deg)}}

/* ─── Error ─────────────────────────────────────────────── */
#sp-error{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:.9rem;background:rgba(0,0,0,0.9);z-index:40;padding:2rem;text-align:center}
#sp-error.show{display:flex}
.sp-err-icon{font-size:2rem}
.sp-err-title{font-family:var(--sp-hud);font-size:.85rem;letter-spacing:.06em;color:#fff}
.sp-err-msg{font-size:.78rem;color:var(--sp-text-sub);line-height:1.5;max-width:320px}
.sp-err-retry{font-family:var(--sp-hud);font-size:.7rem;letter-spacing:.08em;padding:.4rem 1.4rem;background:var(--sp-accent);color:#fff;border:none;border-radius:8px;cursor:pointer;transition:opacity .15s}
.sp-err-retry:hover{opacity:.85}

/* ─── Pause flash icon ──────────────────────────────────── */
#sp-pause-icon{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(1.4);width:64px;height:64px;border-radius:50%;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:15;opacity:0;pointer-events:none;transition:opacity .35s,transform .35s}
#sp-pause-icon.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
#sp-pause-icon svg{width:28px;height:28px;fill:#fff}

/* ─── Custom control bar ────────────────────────────────────
   Replaces the native <video controls> UI. Auto-hides via the
   .sp-hide-ui class toggled from player-script.ts on inactivity. */
#sp-ctrl-bar{position:absolute;left:0;right:0;bottom:0;z-index:25;padding:22px 14px 10px;background:linear-gradient(180deg,transparent,rgba(0,0,0,.82) 60%,rgba(0,0,0,.92));opacity:1;transition:opacity .25s;font-family:var(--sp-body)}
#sp-video-area.sp-hide-ui #sp-ctrl-bar{opacity:0;pointer-events:none}
#sp-video-area.sp-hide-ui{cursor:none}

.sp-progress-wrap{position:relative;height:14px;display:flex;align-items:center;cursor:pointer;margin-bottom:6px}
.sp-progress-wrap::before{content:'';position:absolute;left:0;right:0;height:4px;border-radius:2px;background:rgba(255,255,255,.18)}
.sp-buf-fill{position:absolute;left:0;height:4px;width:0;border-radius:2px;background:rgba(255,255,255,.32);pointer-events:none}
.sp-play-fill{position:absolute;left:0;height:4px;width:0;border-radius:2px;background:var(--sp-accent);box-shadow:0 0 8px var(--sp-accent-glow);pointer-events:none}
.sp-play-fill::after{content:'';position:absolute;right:-5px;top:50%;transform:translateY(-50%);width:11px;height:11px;border-radius:50%;background:var(--sp-accent);box-shadow:0 0 0 3px rgba(0,0,0,.25);opacity:0;transition:opacity .15s}
.sp-progress-wrap:hover .sp-play-fill::after{opacity:1}
.sp-seek{position:absolute;inset:0;width:100%;margin:0;opacity:0;cursor:pointer}
.sp-seek-tip{position:absolute;bottom:20px;transform:translateX(-50%);background:#0f0f0f;border:1px solid var(--sp-border);color:var(--sp-text);font-size:.68rem;padding:3px 7px;border-radius:6px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .15s}
.sp-progress-wrap:hover .sp-seek-tip{opacity:1}

.sp-ctrl-row{display:flex;align-items:center;justify-content:space-between;gap:10px}
.sp-ctrl-left,.sp-ctrl-right{display:flex;align-items:center;gap:2px}
.sp-cbtn{width:34px;height:34px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:#fff;cursor:pointer;border-radius:8px;transition:background .15s;flex-shrink:0;position:relative}
.sp-cbtn:hover{background:rgba(255,255,255,.1)}
.sp-cbtn svg{width:19px;height:19px}
.sp-cbtn span{position:absolute;bottom:2px;right:3px;font-size:.5rem;font-weight:800;font-family:var(--sp-hud);pointer-events:none}
.sp-vol{width:64px;accent-color:var(--sp-accent);margin:0 6px;cursor:pointer}
.sp-time{font-family:var(--sp-hud);font-size:.68rem;letter-spacing:.03em;color:var(--sp-text-sub);white-space:nowrap;margin-left:4px}

.sp-settings-wrap{position:relative}
.sp-settings-pop{position:absolute;bottom:44px;right:0;width:220px;background:#111421;border:1px solid var(--sp-border);border-radius:14px;padding:10px;box-shadow:0 10px 32px rgba(0,0,0,.5);display:none;overflow:hidden}
.sp-settings-pop.show{display:block}
.sp-sett-item{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;margin-bottom:2px;border-radius:9px;cursor:pointer;font-size:.78rem;color:var(--sp-text)}
.sp-sett-item:last-child{margin-bottom:0}
.sp-sett-item:hover{background:rgba(124,58,237,.1)}
.sp-sett-cur{color:var(--sp-text-muted);font-size:.72rem}
.sp-sett-back{display:flex;align-items:center;gap:8px;padding:10px 8px;margin-bottom:6px;border-bottom:1px solid var(--sp-border2);font-size:.75rem;font-weight:700;color:var(--sp-text);cursor:pointer}
.sp-sett-back svg{width:14px;height:14px}
.sp-sett-opts{max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:2px}
.sp-sett-opt{padding:10px 14px;border-radius:9px;font-size:.78rem;color:var(--sp-text-sub);cursor:pointer}
.sp-sett-opt:hover{background:rgba(124,58,237,.08);color:var(--sp-text)}
.sp-sett-opt.active{background:rgba(124,58,237,.15);color:var(--sp-accent)}

/* Fullscreen: bar/controls scale up slightly for easier hit targets */
#sp-video-area:fullscreen #sp-ctrl-bar,
#sp-video-area:-webkit-full-screen #sp-ctrl-bar{padding-bottom:18px}

/* iOS Safari fallback fullscreen — iOS doesn't support the Fullscreen API on
   non-<video> elements, so we fake it with fixed positioning instead. */
#sp-video-area.sp-ios-fs{
  position:fixed!important;
  top:0;left:0;right:0;bottom:0;
  width:100vw!important;height:100vh!important;
  max-width:none!important;max-height:none!important;
  aspect-ratio:unset!important;
  z-index:2147483000;
  border-radius:0!important;
  background:#000;
  padding-top:env(safe-area-inset-top);
  padding-bottom:env(safe-area-inset-bottom);
}
#sp-video-area.sp-ios-fs #sp-ctrl-bar{padding-bottom:18px}
html.sp-ios-fs-lock,html.sp-ios-fs-lock body{overflow:hidden!important;height:100%!important}

@media (max-width:640px){
  .sp-vol{width:44px}
  .sp-time{font-size:.62rem}
  #sp-ctrl-bar{padding:16px 8px 8px}
  .sp-cbtn{width:30px;height:30px}
  .sp-cbtn svg{width:17px;height:17px}
}

/* ─── Tap-to-play overlay ───────────────────────────────────
   Shown when the browser blocks autoplay (no recent user-gesture
   context — common right after a page reload) even though the video
   is already fully loaded and ready. Sits above the spinner so a
   real, working play button replaces what would otherwise look like
   an endless loading spinner. ─────────────────────────────────── */
#sp-preplay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:30;cursor:pointer}
#sp-preplay.hide{display:none;pointer-events:none}
#sp-pp-bg{position:absolute;inset:0;background:rgba(0,0,0,0.55)}
#sp-pp-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,.5) 100%);pointer-events:none}
#sp-pp-btn{position:relative;z-index:1;width:64px;height:64px;border-radius:50%;border:none;background:var(--sp-accent);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 0 0 1px rgba(255,255,255,.15),0 4px 20px var(--sp-accent-glow);transition:transform .15s,opacity .15s}
#sp-pp-btn:hover{opacity:.9;transform:scale(1.05)}
#sp-pp-btn svg{width:28px;height:28px;fill:#fff;margin-left:3px}

/* ─── Top bar (simple, not overlaid on the video so it never blocks
       native video controls / gestures) ───────────────────── */
#sp-topbar{
  display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:8px 14px;background:var(--sp-surface);
  border-bottom:1px solid var(--sp-border);
}
.sp-top-title{font-family:var(--sp-hud);font-size:.68rem;font-weight:500;letter-spacing:.05em;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-top-ep{font-family:var(--sp-hud);font-size:.56rem;letter-spacing:.07em;color:rgba(124,58,237,.7);margin-top:2px}
#sp-hls-badge{font-family:var(--sp-hud);font-size:.5rem;letter-spacing:.14em;color:rgba(124,58,237,.7);border:1px solid rgba(124,58,237,.25);border-radius:4px;padding:2px 6px;background:rgba(124,58,237,.06);flex-shrink:0}

/* ─── INFO PANEL (below video) — UNCHANGED ─────────────────── */
#sp-panel{
  background:var(--sp-surface, #0f1219);
  border-top:1px solid var(--sp-border, rgba(124,58,237,0.15));
  border-radius:0 0 var(--sp-r, 14px) var(--sp-r, 14px);
}

/* ── Info strip (above tabs) ────────────────────────────── */
#sp-info-strip{
  display:flex;align-items:center;gap:2px;
  padding:10px 10px;
  border-bottom:1px solid var(--sp-border, rgba(124,58,237,0.15));
  background:rgba(0,0,0,.18);
  overflow-x:auto;scrollbar-width:none;
}
#sp-info-strip::-webkit-scrollbar{display:none}
.sp-istat{
  position:relative;display:flex;align-items:center;gap:5px;
  padding:3px 8px;border-radius:6px;cursor:default;flex-shrink:0;
  transition:background .15s;
}
.sp-istat:hover{background:rgba(255,255,255,.06)}
.sp-istat svg{width:13px;height:13px;fill:rgba(124,58,237,.7);flex-shrink:0}
.sp-istat-val{font-family:var(--sp-hud, 'Orbitron',monospace);font-size:.6rem;color:var(--sp-text-sub, rgba(232,234,240,0.6));letter-spacing:.02em;white-space:nowrap}
.sp-istat-sep{width:1px;height:12px;background:var(--sp-border, rgba(124,58,237,0.15));margin:0 3px;flex-shrink:0}

#sp-istat-float-tip{
  position:absolute;
  background:rgba(8,10,18,.97);border:1px solid var(--sp-border, rgba(124,58,237,0.15));
  color:var(--sp-text-sub, rgba(232,234,240,0.6));font-family:var(--sp-hud, 'Orbitron',monospace);font-size:.5rem;letter-spacing:.09em;
  padding:4px 9px;border-radius:5px;white-space:nowrap;
  pointer-events:none;opacity:0;transition:opacity .12s;z-index:60;text-transform:uppercase;
  transform:translateX(-50%);
}
#sp-istat-float-tip.show{opacity:1}

/* ── Tabs ───────────────────────────────────────────────── */
#sp-panel-tabs{display:flex;border-bottom:1px solid var(--sp-border, rgba(124,58,237,0.15))}
.sp-ptab{
  flex:1;padding:12px 6px;
  font-family:var(--sp-hud, 'Orbitron',monospace);font-size:.58rem;font-weight:700;
  letter-spacing:.08em;text-transform:uppercase;
  color:var(--sp-text-muted, rgba(232,234,240,0.35));cursor:pointer;border:none;background:none;
  text-align:center;border-bottom:2px solid transparent;
  transition:color .2s;margin-bottom:-1px;white-space:nowrap;
}
.sp-ptab.active{color:var(--sp-accent, #7c3aed);border-bottom-color:var(--sp-accent, #7c3aed)}
.sp-ptab:hover{color:var(--sp-text, #e8eaf0)}
#sp-panel-body{padding:18px 16px 16px!important}
.sp-psec{display:none}.sp-psec.active{display:block}

/* ── Episodes tab ───────────────────────────────────────── */
.sp-ep-nav{display:flex;gap:8px;margin:0 0 16px!important}
.sp-ep-nav-btn{
  flex:1;display:flex;align-items:center;gap:8px;
  padding:10px 12px;background:var(--sp-surface2, #161b26);
  border:1px solid var(--sp-border, rgba(124,58,237,0.15));border-radius:9px;
  color:var(--sp-text-sub, rgba(232,234,240,0.6));font-family:var(--sp-body, 'Exo 2',sans-serif);font-size:.8rem;font-weight:500;
  cursor:pointer;text-decoration:none;transition:all .18s;
}
.sp-ep-nav-btn:hover{border-color:var(--sp-accent, #7c3aed);color:#fff;background:rgba(124,58,237,.07)}
.sp-ep-nav-btn.disabled{opacity:.28;pointer-events:none;cursor:default}
.sp-ep-nav-btn svg{width:16px;height:16px;fill:currentColor;flex-shrink:0}
.sp-ep-nav-lbl{display:flex;flex-direction:column}
.sp-ep-nav-lbl small{font-size:.55rem;color:var(--sp-text-muted, rgba(232,234,240,0.35));font-family:var(--sp-hud, 'Orbitron',monospace);letter-spacing:.07em;text-transform:uppercase}
.sp-ep-nav-btn.next{justify-content:flex-end;text-align:right}
.sp-ep-divider{
  font-family:var(--sp-hud, 'Orbitron',monospace);font-size:.47rem;letter-spacing:.18em;text-transform:uppercase;
  color:var(--sp-text-muted, rgba(232,234,240,0.35));margin:0 0 10px!important;padding-bottom:6px;
  border-bottom:1px solid var(--sp-border, rgba(124,58,237,0.15));
  display:flex;align-items:center;justify-content:space-between;
}
.sp-ep-grid{
  display:grid;grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:6px;
  margin-top:2px;
  overflow:hidden;
}
.sp-ep-grid.sp-ep-expanded{
  max-height:152px;overflow-y:auto;
  scrollbar-width:thin;scrollbar-color:rgba(124,58,237,.35) transparent;
  padding-right:3px;
}
.sp-ep-grid.sp-ep-expanded::-webkit-scrollbar{width:4px}
.sp-ep-grid.sp-ep-expanded::-webkit-scrollbar-track{background:transparent}
.sp-ep-grid.sp-ep-expanded::-webkit-scrollbar-thumb{background:rgba(124,58,237,.35);border-radius:2px}
.sp-ep-chip{
  display:block;padding:7px 2px;background:var(--sp-surface2, #161b26);
  border:1px solid var(--sp-border, rgba(124,58,237,0.15));border-radius:7px;
  text-align:center;font-family:var(--sp-hud, 'Orbitron',monospace);font-size:.62rem;
  color:var(--sp-text-muted, rgba(232,234,240,0.35));cursor:pointer;text-decoration:none;transition:all .15s;
}
.sp-ep-chip:hover{border-color:var(--sp-accent, #7c3aed);color:#fff;background:rgba(124,58,237,.08)}
.sp-ep-chip.current{border-color:var(--sp-accent, #7c3aed);background:rgba(124,58,237,.15);color:var(--sp-accent, #7c3aed)}
.sp-ep-chip.watched:not(.current){background:rgba(0,0,0,.4);border-color:rgba(255,255,255,.05);color:var(--sp-text-muted, rgba(232,234,240,0.35))}
.sp-ep-chip.watched:not(.current):hover{background:rgba(0,0,0,.5)}
.sp-ep-chip.sp-ep-extra{display:none}
.sp-ep-grid.sp-ep-expanded .sp-ep-chip.sp-ep-extra{display:block}

/* show more / less button */
.sp-ep-more{
  display:flex;align-items:center;justify-content:center;gap:6px;
  width:100%;margin-top:12px!important;padding:9px;
  background:var(--sp-surface2, #161b26);border:1px solid var(--sp-border, rgba(124,58,237,0.15));
  border-radius:8px;color:var(--sp-text-sub, rgba(232,234,240,0.6));
  font-family:var(--sp-hud, 'Orbitron',monospace);font-size:.6rem;letter-spacing:.06em;text-transform:uppercase;
  cursor:pointer;transition:all .15s;
}
.sp-ep-more:hover{border-color:var(--sp-accent, #7c3aed);color:#fff;background:rgba(124,58,237,.08)}
.sp-ep-more svg{width:12px;height:12px;fill:currentColor;transition:transform .2s;flex-shrink:0}
.sp-ep-more.sp-expanded svg{transform:rotate(180deg)}

/* quality panel */
.sp-qual-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.sp-qopt{padding:10px 8px;background:var(--sp-surface2, #161b26);border:1px solid var(--sp-border, rgba(124,58,237,0.15));border-radius:8px;cursor:pointer;text-align:center;transition:all .18s}
.sp-qopt:hover{border-color:var(--sp-accent, #7c3aed);background:rgba(124,58,237,.06)}
.sp-qopt.active{border-color:var(--sp-accent, #7c3aed);background:rgba(124,58,237,.12)}
.sp-qopt-lbl{font-family:var(--sp-hud, 'Orbitron',monospace);font-size:.8rem;font-weight:500;color:var(--sp-text, #e8eaf0)}
.sp-qopt-sub{font-size:.65rem;color:var(--sp-text-muted, rgba(232,234,240,0.35));margin-top:4px;font-family:var(--sp-body, 'Exo 2',sans-serif)}

/* speed panel */
.sp-spd-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.sp-sopt{padding:10px 4px;background:var(--sp-surface2, #161b26);border:1px solid var(--sp-border, rgba(124,58,237,0.15));border-radius:8px;cursor:pointer;text-align:center;font-family:var(--sp-hud, 'Orbitron',monospace);font-size:.68rem;color:var(--sp-text-muted, rgba(232,234,240,0.35));transition:all .18s}
.sp-sopt:hover{border-color:var(--sp-accent, #7c3aed);color:var(--sp-text, #e8eaf0)}
.sp-sopt.active{border-color:var(--sp-accent, #7c3aed);color:var(--sp-accent, #7c3aed);background:rgba(124,58,237,.1);text-shadow:0 0 8px rgba(124,58,237,.35)}

/* stats panel */
.sp-stat-bar{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px!important}
.sp-stat-item{font-family:var(--sp-hud, 'Orbitron',monospace);font-size:.58rem;letter-spacing:.05em;color:var(--sp-text-muted, rgba(232,234,240,0.35))}
.sp-stat-item span{color:var(--sp-accent, #7c3aed)}
#sp-buf-chart{height:48px;background:var(--sp-surface2, #161b26);border:1px solid var(--sp-border, rgba(124,58,237,0.15));border-radius:8px;overflow:hidden;display:flex;align-items:flex-end;padding:5px;gap:2px}
.sp-buf-bar{flex:1;border-radius:3px 3px 0 0;background:rgba(124,58,237,.45);min-width:0;transition:height .4s,opacity .4s}

/* shortcuts panel */
.sp-keys-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.sp-key-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.sp-key-row:last-child{border:none}
.sp-kbd{background:var(--sp-surface3, #1e2535);border:1px solid var(--sp-border, rgba(124,58,237,0.15));border-radius:4px;padding:3px 8px;font-family:var(--sp-hud, 'Orbitron',monospace);font-size:.58rem;color:var(--sp-accent, #7c3aed);white-space:nowrap;flex-shrink:0}
.sp-key-desc{font-family:var(--sp-body, 'Exo 2',sans-serif);font-size:.75rem;color:var(--sp-text-muted, rgba(232,234,240,0.35))}

/* ─── Mobile ─────────────────────────────────────────────── */
@media(max-width:600px){
  .sp-top-title{font-size:.6rem}
  #sp-panel-body{padding:16px 12px 14px!important}
  .sp-ptab{font-size:.5rem;padding:11px 4px!important;letter-spacing:.04em}
  .sp-qual-grid{grid-template-columns:repeat(3,1fr)}
  .sp-spd-grid{grid-template-columns:repeat(4,1fr)}
  .sp-keys-grid{grid-template-columns:1fr 1fr}
  .sp-key-desc{font-size:.7rem}
  .sp-ep-grid{grid-template-columns:repeat(auto-fill,minmax(38px,1fr))}
  .sp-ep-grid.sp-ep-expanded{max-height:130px}
}

</style>
`;
