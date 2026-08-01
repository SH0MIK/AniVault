export const PLAYER_PRO_CSS = `<style id="sp-skin">
/* ─── Tokens ────────────────────────────────────────────── */
:root{
  --sp-accent:#e8453c;
  --sp-accent-rgb:232,69,60;
  --sp-accent-glow:rgba(232,69,60,0.4);
  --sp-bg:#05070d;
  --sp-surface:#0f1219;
  --sp-surface2:#161b26;
  --sp-surface3:#1e2535;
  --sp-text:#e8eaf0;
  --sp-text-sub:rgba(232,234,240,0.6);
  --sp-text-muted:rgba(232,234,240,0.35);
  --sp-border:rgba(232,69,60,0.15);
  --sp-border2:rgba(232,69,60,0.08);
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
  box-shadow:0 0 0 1px var(--sp-border),0 0 28px rgba(232,69,60,0.07);
  overflow:hidden;
  -webkit-tap-highlight-color:transparent;
}
#senshi-player-root:fullscreen{border-radius:0}

/* ─── HUD corner accents ────────────────────────────────── */
.sp-corner{position:absolute;width:18px;height:18px;border-color:var(--sp-accent);opacity:.35;z-index:15;pointer-events:none}
.sp-corner.tl{top:6px;left:6px;border-top:2px solid;border-left:2px solid}
.sp-corner.tr{top:6px;right:6px;border-top:2px solid;border-right:2px solid}
.sp-corner.bl{bottom:6px;left:6px;border-bottom:2px solid;border-left:2px solid}
.sp-corner.br{bottom:6px;right:6px;border-bottom:2px solid;border-right:2px solid}

/* ─── Video area ────────────────────────────────────────── */
#sp-video-area{position:relative;width:100%;aspect-ratio:16/9;background:#000;overflow:hidden}
#sp-video{width:100%;height:100%;display:block;background:#000}
#senshi-player-root:fullscreen #sp-video-area{aspect-ratio:unset;height:100%}

/* ─── Spinner ───────────────────────────────────────────── */
#sp-spinner{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:20;background:#000;opacity:1;transition:opacity .25s}
#sp-spinner.hide{opacity:0;pointer-events:none}
.sp-spin{width:46px;height:46px;border-radius:50%;border:2.5px solid transparent;border-top-color:var(--sp-accent);border-bottom-color:rgba(232,69,60,0.2);animation:sp-spin .75s linear infinite;box-shadow:0 0 12px var(--sp-accent-glow)}
@keyframes sp-spin{to{transform:rotate(360deg)}}

/* ─── Error ─────────────────────────────────────────────── */
#sp-error{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:.9rem;background:rgba(0,0,0,0.9);z-index:40;padding:2rem;text-align:center}
#sp-error.show{display:flex}
.sp-err-icon{font-size:2rem}
.sp-err-title{font-family:var(--sp-hud);font-size:.85rem;letter-spacing:.06em;color:#fff}
.sp-err-msg{font-size:.78rem;color:var(--sp-text-sub);line-height:1.5;max-width:320px}
.sp-err-retry{font-family:var(--sp-hud);font-size:.7rem;letter-spacing:.08em;padding:.4rem 1.4rem;background:var(--sp-accent);color:#fff;border:none;border-radius:8px;cursor:pointer;transition:opacity .15s}
.sp-err-retry:hover{opacity:.85}

/* ─── Tap-to-play overlay ───────────────────────────────── */
#sp-preplay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:30;cursor:pointer}
#sp-preplay.hide{display:none;pointer-events:none}
#sp-pp-bg{position:absolute;inset:0;background:rgba(0,0,0,0.55)}
#sp-pp-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,.5) 100%);pointer-events:none}
#sp-pp-btn{position:relative;z-index:1;width:64px;height:64px;border-radius:50%;border:none;background:var(--sp-accent);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 0 0 1px rgba(255,255,255,.15),0 4px 20px var(--sp-accent-glow);transition:transform .15s,opacity .15s}
#sp-pp-btn:hover{opacity:.9;transform:scale(1.05)}
#sp-pp-btn svg{width:28px;height:28px;fill:#fff;margin-left:3px}

/* ─── Centre play/pause + episode skip ──────────────────── */
#sp-center{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:26px;z-index:18;opacity:0;pointer-events:none;transition:opacity .2s}
#sp-center.show{opacity:1;pointer-events:auto}
.sp-cr-btn{width:52px;height:52px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(8,10,18,.55);backdrop-filter:blur(6px);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s}
.sp-cr-btn:hover{background:rgba(232,69,60,.35);border-color:var(--sp-accent)}
.sp-cr-btn svg{width:22px;height:22px;fill:currentColor}
#sp-cr-btn{width:64px;height:64px}
#sp-cr-btn svg{width:28px;height:28px}
.sp-cr-side.disabled{opacity:.25;pointer-events:none}

/* ─── Double-tap seek zones (mobile) ────────────────────── */
.sp-zone{position:absolute;top:0;bottom:0;width:40%;display:flex;align-items:center;justify-content:center;z-index:12;opacity:0;pointer-events:none;transition:opacity .3s}
.sp-zone.show{opacity:1}
#sp-zone-l{left:0}
#sp-zone-r{right:0}
.sp-zone-lbl{display:flex;flex-direction:column;align-items:center;gap:4px;color:#fff;font-family:var(--sp-hud);font-size:.68rem;letter-spacing:.06em}
.sp-zone-lbl svg{width:26px;height:26px;fill:#fff}

/* ─── Custom subtitle layer ──────────────────────────────── */
#sp-sub-layer{position:absolute;left:0;right:0;bottom:8%;z-index:16;display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;padding:0 6%}
.sp-sub-line{background:rgba(0,0,0,.72);color:#fff;font-family:var(--sp-body);padding:.2em .5em;border-radius:4px;font-size:1rem;line-height:1.35;text-align:center;white-space:pre-line}

/* ─── Keyboard shortcut overlay ─────────────────────────── */
#sp-sc-overlay{position:absolute;inset:0;z-index:70;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.82);backdrop-filter:blur(4px)}
#sp-sc-overlay.show{display:flex}
#sp-sc-overlay>div{background:var(--sp-surface2);border:1px solid var(--sp-border);border-radius:12px;padding:1.4rem 1.6rem;max-width:92%;width:380px}
.sp-sc-title{font-family:var(--sp-hud);font-size:.65rem;font-weight:700;letter-spacing:.14em;color:rgba(232,69,60,.7);text-transform:uppercase;text-align:center;margin-bottom:.9rem}
.sp-sc-grid{display:grid;grid-template-columns:auto 1fr;gap:.5rem 1rem;align-items:center}
.sp-sc-key{font-family:var(--sp-hud);font-size:.62rem;color:var(--sp-accent);background:var(--sp-surface3);border:1px solid var(--sp-border);border-radius:5px;padding:3px 8px;white-space:nowrap;justify-self:start}
.sp-sc-desc{font-size:.78rem;color:var(--sp-text-sub)}
.sp-sc-close{background:none;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.55);padding:.35rem 1.1rem;border-radius:6px;cursor:pointer;font-size:.75rem;display:block;margin:1rem auto 0}
.sp-sc-close:hover{border-color:var(--sp-accent);color:#fff}

/* ─── Top bar ────────────────────────────────────────────── */
#sp-topbar{
  position:absolute;top:0;left:0;right:0;z-index:14;
  display:flex;align-items:flex-start;justify-content:space-between;gap:10px;
  padding:12px 14px;
  background:linear-gradient(to bottom,rgba(0,0,0,.75),transparent);
  opacity:1;transition:opacity .25s;
}
#sp-topbar.hidden{opacity:0;pointer-events:none}
.sp-top-title{font-family:var(--sp-hud);font-size:.72rem;font-weight:500;letter-spacing:.05em;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60vw}
.sp-top-ep{font-family:var(--sp-hud);font-size:.58rem;letter-spacing:.07em;color:rgba(232,69,60,.85);margin-top:3px}
.sp-top-right{display:flex;align-items:center;gap:8px}
#sp-hls-badge{font-family:var(--sp-hud);font-size:.5rem;letter-spacing:.14em;color:rgba(232,69,60,.9);border:1px solid rgba(232,69,60,.4);border-radius:4px;padding:2px 6px;background:rgba(232,69,60,.1);flex-shrink:0}

/* ─── Bottom controls bar ────────────────────────────────── */
#sp-controls{
  position:absolute;bottom:0;left:0;right:0;z-index:14;
  padding:6px 12px 10px;
  background:linear-gradient(to top,rgba(0,0,0,.82),transparent);
  opacity:1;transition:opacity .25s;
}
#sp-controls.hidden{opacity:0;pointer-events:none}

#sp-prog-area{position:relative;padding:9px 0;cursor:pointer}
#sp-prog-track{position:relative;height:4px;border-radius:2px;background:rgba(255,255,255,.22)}
#sp-prog-buf,#sp-prog-fill{position:absolute;top:0;left:0;height:100%;border-radius:2px}
#sp-prog-buf{background:rgba(255,255,255,.32);width:0}
#sp-prog-fill{background:var(--sp-accent);width:0;box-shadow:0 0 8px var(--sp-accent-glow)}
#sp-prog-thumb{position:absolute;top:50%;left:0;width:13px;height:13px;border-radius:50%;background:var(--sp-accent);transform:translate(-50%,-50%);box-shadow:0 0 0 3px rgba(232,69,60,.25);opacity:0;transition:opacity .15s}
#sp-prog-area:hover #sp-prog-thumb,#sp-prog-area.dragging #sp-prog-thumb{opacity:1}
#sp-prog-tip{position:absolute;bottom:100%;left:0;transform:translateX(-50%);margin-bottom:6px;background:rgba(8,10,18,.95);border:1px solid var(--sp-border);color:#fff;font-family:var(--sp-hud);font-size:.6rem;padding:3px 7px;border-radius:5px;opacity:0;pointer-events:none;transition:opacity .12s;white-space:nowrap}
#sp-prog-area:hover #sp-prog-tip,#sp-prog-area.dragging #sp-prog-tip{opacity:1}

.sp-btm{display:flex;align-items:center;gap:4px}
.sp-btn{width:36px;height:36px;border-radius:8px;border:none;background:none;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s;flex-shrink:0;position:relative}
.sp-btn:hover{background:rgba(255,255,255,.1)}
.sp-btn svg{width:20px;height:20px;fill:currentColor}
.sp-btn.sm{width:32px;height:32px}
.sp-btn.sm svg{width:17px;height:17px}
.sp-btn.xs{width:26px;height:26px;background:rgba(0,0,0,.35)}
.sp-btn.xs svg{width:14px;height:14px}
.sp-btn.active{color:var(--sp-accent)}

.sp-vol-wrap{display:flex;align-items:center;gap:2px}
.sp-vol-slider{width:0;opacity:0;transition:width .18s,opacity .18s,margin .18s;accent-color:var(--sp-accent);height:3px;cursor:pointer}
.sp-vol-wrap:hover .sp-vol-slider,.sp-vol-wrap.open .sp-vol-slider{width:70px;opacity:1;margin-left:4px}

.sp-time{font-family:var(--sp-hud);font-size:.66rem;color:var(--sp-text);white-space:nowrap;margin-left:6px}
.sp-time-sep{color:var(--sp-text-muted);margin:0 3px}
.sp-spacer{flex:1}

/* data-tip hover labels on control buttons */
.sp-btn[data-tip]{position:relative}
.sp-btn[data-tip]:hover::after{
  content:attr(data-tip);position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);
  background:rgba(8,10,18,.95);border:1px solid var(--sp-border);color:#fff;font-family:var(--sp-hud);
  font-size:.55rem;letter-spacing:.04em;padding:4px 8px;border-radius:5px;white-space:nowrap;pointer-events:none;z-index:50;
}
.sp-cr-btn[data-tip]:hover::after{
  content:attr(data-tip);position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);
  background:rgba(8,10,18,.95);border:1px solid var(--sp-border);color:#fff;font-family:var(--sp-hud);
  font-size:.55rem;padding:4px 8px;border-radius:5px;white-space:nowrap;pointer-events:none;z-index:50;
}

/* ─── Settings / subtitle menu (video overlay) ──────────── */
.sp-menu{
  position:absolute;bottom:56px;right:12px;z-index:45;
  width:260px;max-height:min(380px,70%);overflow:auto;
  background:rgba(10,12,20,.97);border:1px solid var(--sp-border);border-radius:12px;
  box-shadow:0 12px 32px rgba(0,0,0,.55);
  display:none;flex-direction:column;
  scrollbar-width:thin;scrollbar-color:rgba(232,69,60,.35) transparent;
}
.sp-menu.open{display:flex}
.sp-tab-bar{display:flex;border-bottom:1px solid var(--sp-border);position:sticky;top:0;background:rgba(10,12,20,.97);z-index:1}
.sp-tab{flex:1;padding:9px 4px;background:none;border:none;color:var(--sp-text-muted);font-family:var(--sp-hud);font-size:.55rem;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;transition:color .15s}
.sp-tab svg{width:15px;height:15px;fill:currentColor}
.sp-tab.active{color:var(--sp-accent)}
.sp-tab:hover{color:#fff}
.sp-tab-panel{padding:10px}
.sp-tab-panel.sp-tab-hidden{display:none}

.sp-menu-item{display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:7px;color:var(--sp-text-sub);font-size:.8rem;cursor:pointer;transition:background .15s}
.sp-menu-item svg{width:13px;height:13px;fill:currentColor;flex-shrink:0;visibility:hidden}
.sp-menu-item.active svg{visibility:visible;fill:var(--sp-accent)}
.sp-menu-item.active{color:#fff}
.sp-menu-item:hover{background:rgba(255,255,255,.06)}

.sp-speed-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.sp-speed-opt{padding:8px 2px;background:var(--sp-surface2);border:1px solid var(--sp-border);border-radius:7px;color:var(--sp-text-muted);font-family:var(--sp-hud);font-size:.6rem;cursor:pointer;transition:all .15s}
.sp-speed-opt:hover{color:#fff;border-color:var(--sp-accent)}
.sp-speed-opt.active{color:var(--sp-accent);border-color:var(--sp-accent);background:rgba(232,69,60,.1)}

.sp-sub-item{display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:7px;color:var(--sp-text-sub);font-size:.8rem;cursor:pointer;transition:background .15s}
.sp-sub-item svg{width:13px;height:13px;fill:currentColor;flex-shrink:0;visibility:hidden}
.sp-sub-item.active svg{visibility:visible;fill:var(--sp-accent)}
.sp-sub-item.active{color:#fff}
.sp-sub-item:hover{background:rgba(255,255,255,.06)}
.sp-sub-edit-btn{width:100%;display:flex;align-items:center;justify-content:space-between;padding:9px 10px;margin-top:4px;background:none;border:1px solid var(--sp-border);border-radius:7px;color:var(--sp-text-sub);font-size:.75rem;cursor:pointer;transition:all .15s}
.sp-sub-edit-btn:hover{border-color:var(--sp-accent);color:#fff}
.sp-sub-edit-btn svg{transition:transform .2s}
.sp-sub-edit-btn.open svg{transform:rotate(180deg)}
.sp-sub-style-wrap{max-height:0;overflow:hidden;transition:max-height .22s ease}
.sp-sub-style-wrap.open{max-height:260px}
.sp-sub-panel{padding:10px 2px;display:flex;flex-direction:column;gap:9px}
.sp-sub-panel label{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:.72rem;color:var(--sp-text-muted)}
.sp-sub-panel input[type=range]{width:120px;accent-color:var(--sp-accent)}
.sp-sub-panel select{background:var(--sp-surface2);color:var(--sp-text);border:1px solid var(--sp-border);border-radius:5px;padding:3px 6px;font-size:.72rem}
.sp-sub-panel input[type=color]{width:36px;height:22px;padding:0;border:none;background:none;cursor:pointer}

/* ─── INFO PANEL (below video) ──────────────────────────── */
#sp-panel{
  background:var(--sp-surface);
  border-top:1px solid var(--sp-border);
  border-radius:0 0 var(--sp-r) var(--sp-r);
}

#sp-info-strip{
  display:flex;align-items:center;gap:2px;
  padding:10px 10px;
  border-bottom:1px solid var(--sp-border);
  background:rgba(0,0,0,.18);
  overflow-x:auto;scrollbar-width:none;
}
#sp-info-strip::-webkit-scrollbar{display:none}
.sp-istat{position:relative;display:flex;align-items:center;gap:5px;padding:3px 8px;border-radius:6px;cursor:default;flex-shrink:0;transition:background .15s}
.sp-istat:hover{background:rgba(255,255,255,.06)}
.sp-istat svg{width:13px;height:13px;fill:rgba(232,69,60,.7);flex-shrink:0}
.sp-istat-val{font-family:var(--sp-hud);font-size:.6rem;color:var(--sp-text-sub);letter-spacing:.02em;white-space:nowrap}
.sp-istat-sep{width:1px;height:12px;background:var(--sp-border);margin:0 3px;flex-shrink:0}

#sp-istat-float-tip{
  position:absolute;background:rgba(8,10,18,.97);border:1px solid var(--sp-border);
  color:var(--sp-text-sub);font-family:var(--sp-hud);font-size:.5rem;letter-spacing:.09em;
  padding:4px 9px;border-radius:5px;white-space:nowrap;
  pointer-events:none;opacity:0;transition:opacity .12s;z-index:60;text-transform:uppercase;
  transform:translateX(-50%);
}
#sp-istat-float-tip.show{opacity:1}

#sp-panel-tabs{display:flex;border-bottom:1px solid var(--sp-border)}
.sp-ptab{
  flex:1;padding:12px 6px;
  font-family:var(--sp-hud);font-size:.58rem;font-weight:700;
  letter-spacing:.08em;text-transform:uppercase;
  color:var(--sp-text-muted);cursor:pointer;border:none;background:none;
  text-align:center;border-bottom:2px solid transparent;
  transition:color .2s;margin-bottom:-1px;white-space:nowrap;
}
.sp-ptab.active{color:var(--sp-accent);border-bottom-color:var(--sp-accent)}
.sp-ptab:hover{color:var(--sp-text)}
#sp-panel-body{padding:18px 16px 16px!important}
.sp-psec{display:none}.sp-psec.active{display:block}

.sp-ep-nav{display:flex;gap:8px;margin:0 0 16px!important}
.sp-ep-nav-btn{
  flex:1;display:flex;align-items:center;gap:8px;
  padding:10px 12px;background:var(--sp-surface2);
  border:1px solid var(--sp-border);border-radius:9px;
  color:var(--sp-text-sub);font-family:var(--sp-body);font-size:.8rem;font-weight:500;
  cursor:pointer;text-decoration:none;transition:all .18s;
}
.sp-ep-nav-btn:hover{border-color:var(--sp-accent);color:#fff;background:rgba(232,69,60,.07)}
.sp-ep-nav-btn.disabled{opacity:.28;pointer-events:none;cursor:default}
.sp-ep-nav-btn svg{width:16px;height:16px;fill:currentColor;flex-shrink:0}
.sp-ep-nav-lbl{display:flex;flex-direction:column}
.sp-ep-nav-lbl small{font-size:.55rem;color:var(--sp-text-muted);font-family:var(--sp-hud);letter-spacing:.07em;text-transform:uppercase}
.sp-ep-nav-btn.next{justify-content:flex-end;text-align:right}
.sp-ep-divider{
  font-family:var(--sp-hud);font-size:.47rem;letter-spacing:.18em;text-transform:uppercase;
  color:var(--sp-text-muted);margin:0 0 10px!important;padding-bottom:6px;
  border-bottom:1px solid var(--sp-border);
  display:flex;align-items:center;justify-content:space-between;
}
.sp-ep-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:6px;margin-top:2px;overflow:hidden}
.sp-ep-grid.sp-ep-expanded{max-height:152px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(232,69,60,.35) transparent;padding-right:3px}
.sp-ep-grid.sp-ep-expanded::-webkit-scrollbar{width:4px}
.sp-ep-grid.sp-ep-expanded::-webkit-scrollbar-track{background:transparent}
.sp-ep-grid.sp-ep-expanded::-webkit-scrollbar-thumb{background:rgba(232,69,60,.35);border-radius:2px}
.sp-ep-chip{display:block;padding:7px 2px;background:var(--sp-surface2);border:1px solid var(--sp-border);border-radius:7px;text-align:center;font-family:var(--sp-hud);font-size:.62rem;color:var(--sp-text-muted);cursor:pointer;text-decoration:none;transition:all .15s}
.sp-ep-chip:hover{border-color:var(--sp-accent);color:#fff;background:rgba(232,69,60,.08)}
.sp-ep-chip.current{border-color:var(--sp-accent);background:rgba(232,69,60,.15);color:var(--sp-accent)}
.sp-ep-chip.watched:not(.current){background:rgba(0,0,0,.4);border-color:rgba(255,255,255,.05);color:var(--sp-text-muted)}
.sp-ep-chip.watched:not(.current):hover{background:rgba(0,0,0,.5)}
.sp-ep-chip.sp-ep-extra{display:none}
.sp-ep-grid.sp-ep-expanded .sp-ep-chip.sp-ep-extra{display:block}

.sp-ep-more{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:12px!important;padding:9px;background:var(--sp-surface2);border:1px solid var(--sp-border);border-radius:8px;color:var(--sp-text-sub);font-family:var(--sp-hud);font-size:.6rem;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;transition:all .15s}
.sp-ep-more:hover{border-color:var(--sp-accent);color:#fff;background:rgba(232,69,60,.08)}
.sp-ep-more svg{width:12px;height:12px;fill:currentColor;transition:transform .2s;flex-shrink:0}
.sp-ep-more.sp-expanded svg{transform:rotate(180deg)}

.sp-qual-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.sp-qopt{padding:10px 8px;background:var(--sp-surface2);border:1px solid var(--sp-border);border-radius:8px;cursor:pointer;text-align:center;transition:all .18s}
.sp-qopt:hover{border-color:var(--sp-accent);background:rgba(232,69,60,.06)}
.sp-qopt.active{border-color:var(--sp-accent);background:rgba(232,69,60,.12)}
.sp-qopt-lbl{font-family:var(--sp-hud);font-size:.8rem;font-weight:500;color:var(--sp-text)}
.sp-qopt-sub{font-size:.65rem;color:var(--sp-text-muted);margin-top:4px;font-family:var(--sp-body)}

.sp-spd-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.sp-sopt{padding:10px 4px;background:var(--sp-surface2);border:1px solid var(--sp-border);border-radius:8px;cursor:pointer;text-align:center;font-family:var(--sp-hud);font-size:.68rem;color:var(--sp-text-muted);transition:all .18s}
.sp-sopt:hover{border-color:var(--sp-accent);color:var(--sp-text)}
.sp-sopt.active{border-color:var(--sp-accent);color:var(--sp-accent);background:rgba(232,69,60,.1);text-shadow:0 0 8px rgba(232,69,60,.35)}

.sp-stat-bar{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px!important}
.sp-stat-item{font-family:var(--sp-hud);font-size:.58rem;letter-spacing:.05em;color:var(--sp-text-muted)}
.sp-stat-item span{color:var(--sp-accent)}
.sp-buf-lbl{font-family:var(--sp-hud);font-size:.44rem;letter-spacing:.18em;color:var(--sp-text-muted);text-transform:uppercase;margin-bottom:6px!important}
#sp-buf-chart{height:48px;background:var(--sp-surface2);border:1px solid var(--sp-border);border-radius:8px;overflow:hidden;display:flex;align-items:flex-end;padding:5px;gap:2px}
.sp-buf-bar{flex:1;border-radius:3px 3px 0 0;background:rgba(232,69,60,.45);min-width:0;transition:height .4s,opacity .4s}

.sp-keys-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.sp-key-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.sp-key-row:last-child{border:none}
.sp-kbd{background:var(--sp-surface3);border:1px solid var(--sp-border);border-radius:4px;padding:3px 8px;font-family:var(--sp-hud);font-size:.58rem;color:var(--sp-accent);white-space:nowrap;flex-shrink:0}
.sp-key-desc{font-family:var(--sp-body);font-size:.75rem;color:var(--sp-text-muted)}

/* ─── Mobile ─────────────────────────────────────────────── */
@media(max-width:600px){
  .sp-top-title{font-size:.62rem;max-width:50vw}
  #sp-topbar{padding:9px 10px}
  #sp-controls{padding:4px 8px 8px}
  .sp-btn{width:32px;height:32px}
  .sp-btn svg{width:17px;height:17px}
  .sp-btn.sm{width:28px;height:28px}
  .sp-time{font-size:.58rem}
  .sp-vol-wrap:hover .sp-vol-slider{width:44px}
  .sp-menu{width:88vw;right:6%;bottom:52px}
  .sp-cr-btn{width:42px;height:42px}
  #sp-cr-btn{width:52px;height:52px}
  #sp-center{gap:16px}
  #sp-panel-body{padding:16px 12px 14px!important}
  .sp-ptab{font-size:.5rem;padding:11px 4px!important;letter-spacing:.04em}
  .sp-qual-grid{grid-template-columns:repeat(3,1fr)}
  .sp-spd-grid{grid-template-columns:repeat(4,1fr)}
  .sp-keys-grid{grid-template-columns:1fr 1fr}
  .sp-key-desc{font-size:.7rem}
  .sp-ep-grid{grid-template-columns:repeat(auto-fill,minmax(38px,1fr))}
  .sp-ep-grid.sp-ep-expanded{max-height:130px}
  .sp-sub-line{font-size:.85rem}
}

</style>
`;
