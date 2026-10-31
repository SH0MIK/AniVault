export function playerScript(fallbackThumb: string, malId: number, epNum: number, siteUrl: string): string {
  return `(function(){
'use strict';

/* ── DOM ─────────────────────────────────────────────────── */
const root       = document.getElementById('senshi-player-root');
const vid        = document.getElementById('sp-video');
const spinner    = document.getElementById('sp-spinner');
const errBox     = document.getElementById('sp-error');
const errMsg     = document.getElementById('sp-err-msg');
const topbar     = document.getElementById('sp-topbar');
const controls   = document.getElementById('sp-controls');
const playBtn    = document.getElementById('sp-play-btn');
const playIcon   = document.getElementById('sp-play-icon');
const backBtn    = document.getElementById('sp-back-btn');
const fwdBtn     = document.getElementById('sp-fwd-btn');
const muteBtn    = document.getElementById('sp-mute-btn');
const volIcon    = document.getElementById('sp-vol-icon');
const volSlider  = document.getElementById('sp-vol');
const timeEl     = document.getElementById('sp-time');
const progArea   = document.getElementById('sp-prog-area');
const progTrack  = document.getElementById('sp-prog-track');
const progFill   = document.getElementById('sp-prog-fill');
const progBuf    = document.getElementById('sp-prog-buf');
const progThumb  = document.getElementById('sp-prog-thumb');
const progTip    = document.getElementById('sp-prog-tip');
const qualList   = document.getElementById('sp-qual-list');
const setBtn     = document.getElementById('sp-set-btn');
const setMenu    = document.getElementById('sp-set-menu');
const fsBtn      = document.getElementById('sp-fs-btn');
const fsIcon     = document.getElementById('sp-fs-icon');
const subLayer   = document.getElementById('sp-sub-layer');
const subTok     = document.getElementById('sp-sub-tokens');
const crBtn      = document.getElementById('sp-cr-btn');
const crIcon     = document.getElementById('sp-cr-icon');
const crPrevBtn  = document.getElementById('sp-cr-prev-btn');
const crNextBtn  = document.getElementById('sp-cr-next-btn');
const center     = document.getElementById('sp-center');
const zoneL      = document.getElementById('sp-zone-l');
const zoneR      = document.getElementById('sp-zone-r');
const helpBtn    = document.getElementById('sp-help-btn');
const scOverlay  = document.getElementById('sp-sc-overlay');
const preplay    = document.getElementById('sp-preplay');
const ppBg       = document.getElementById('sp-pp-bg');
const ppBtn      = document.getElementById('sp-pp-btn');
/* subtitle controls */
const subSizeEl  = document.getElementById('sp-sub-size');
const subPosEl   = document.getElementById('sp-sub-pos');
const subBgEl    = document.getElementById('sp-sub-bg');
const subFontEl  = document.getElementById('sp-sub-font');
const subColorEl = document.getElementById('sp-sub-color');
/* panel info */
const iRes  = document.getElementById('sp-i-res');
const iBr   = document.getElementById('sp-i-br');
const iBuf  = document.getElementById('sp-i-buf');
const iCodec= document.getElementById('sp-i-codec');
const iLvl  = document.getElementById('sp-i-lvl');
const iDrop = document.getElementById('sp-i-drop');
const sSegs = document.getElementById('sp-s-segs');
const sNet  = document.getElementById('sp-s-net');
const bufChart = document.getElementById('sp-buf-chart');
const panelQualList = document.getElementById('sp-panel-qual-list');

/* ── State ───────────────────────────────────────────────── */
let hls           = null;
let hideTimer     = null;
let isDrag        = false;
let subtitlesOn   = true;
let subTrack      = null;
let preplayReady  = false;
let _fetchingStream = false;
let currentM3u8   = null;
let segsLoaded    = 0;
let _mmThrottle   = null;
let zLTimer, zRTimer;

/* ── Utils ───────────────────────────────────────────────── */
function fmt(s){
  if(!s||s<0)return'0:00';
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=Math.floor(s%60);
  if(h)return\`\${h}:\${String(m).padStart(2,'0')}:\${String(sec).padStart(2,'0')}\`;
  return\`\${m}:\${String(sec).padStart(2,'0')}\`;
}
function _parseCodec(c){
  if(!c)return'H.264';
  c=c.toLowerCase();
  if(c.startsWith('hvc1')||c.startsWith('hev1'))return'H.265';
  if(c.startsWith('av01'))return'AV1';
  if(c.startsWith('vp09')||c.startsWith('vp9'))return'VP9';
  if(c.startsWith('vp08')||c.startsWith('vp8'))return'VP8';
  if(c.startsWith('avc1')||c.startsWith('avc3'))return'H.264';
  return c.split('.')[0].toUpperCase();
}

/* ── Autoplay (with muted fallback for browsers that block sound) ── */
function attemptAutoplay(){
  const p=vid.play();
  if(p&&p.catch){
    p.catch(()=>{
      vid.muted=true;volSlider.value=0;syncVol();
      vid.play().catch(err=>{
        // Both unmuted and muted autoplay were rejected — most likely the
        // stream itself didn't actually attach (stale/expired Senshi URL,
        // decode error, etc). Surface it instead of failing silently, so
        // a stuck "paused" button doesn't look like a dead click handler.
        if(vid.readyState===0) showError('Playback failed to start — tap Try Again or switch servers.');
      });
    });
  }
}

/* ── Spinner ─────────────────────────────────────────────── */
function spin(on){spinner.classList.toggle('hide',!on)}

/* ── Error ───────────────────────────────────────────────── */
function showError(msg){spin(false);errMsg.textContent=msg||'Stream unavailable.';errBox.classList.add('show')}
function hideError(){errBox.classList.remove('show')}

/* ── Controls visibility ─────────────────────────────────── */
function showCtrl(){
  controls.classList.remove('hidden');
  topbar.classList.remove('hidden');
  center.classList.add('show');
  root.style.cursor='';
  clearTimeout(hideTimer);
  hideTimer=setTimeout(hideCtrl,3000);
}
function hideCtrl(){
  if(isDrag)return;
  controls.classList.add('hidden');
  topbar.classList.add('hidden');
  if(!vid.paused&&!vid.ended) center.classList.remove('show');
  root.style.cursor='none';
}

/* ── Zone flash ──────────────────────────────────────────── */
function flashZone(dir){
  const el=dir==='l'?zoneL:zoneR;
  const timer=dir==='l'?'zLTimer':'zRTimer';
  clearTimeout(window[timer]);
  el.classList.add('show');
  window[timer]=setTimeout(()=>el.classList.remove('show'),600);
}

/* ── Icons ───────────────────────────────────────────────── */
const PLAY_PATH  ='<path d="M8 5v14l11-7z"/>';
const PAUSE_PATH ='<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
function syncPlay(){
  const playing=!vid.paused&&!vid.ended;
  playIcon.innerHTML=playing?PAUSE_PATH:PLAY_PATH;
  crIcon.innerHTML=playing?PAUSE_PATH:PLAY_PATH;
}
function syncVol(){
  if(vid.muted||vid.volume===0)
    volIcon.innerHTML='<path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
  else if(vid.volume<0.5)
    volIcon.innerHTML='<path d="M18.5 12A4.5 4.5 0 0016 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>';
  else
    volIcon.innerHTML='<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
}

/* ── Progress ────────────────────────────────────────────── */
let _lastReportedSec=-1;
function updateProg(){
  if(!vid.duration||isDrag)return;
  const pct=(vid.currentTime/vid.duration)*100;
  progFill.style.width=pct+'%';
  progThumb.style.left=pct+'%';
  timeEl.innerHTML=\`\${fmt(vid.currentTime)}<span class="sp-time-sep">/</span>\${fmt(vid.duration)}\`;
  if(vid.buffered.length)
    progBuf.style.width=(vid.buffered.end(vid.buffered.length-1)/vid.duration*100)+'%';
  updateInfoPanel();
  const sec=Math.floor(vid.currentTime||0);
  if(sec!==_lastReportedSec){_lastReportedSec=sec;reportPlayback('timeupdate');}
}
function seekPct(x){
  const rect=progTrack.getBoundingClientRect();
  const pct=Math.max(0,Math.min(1,(x-rect.left)/rect.width));
  if(vid.duration)vid.currentTime=pct*vid.duration;
  progFill.style.width=(pct*100)+'%';
  progThumb.style.left=(pct*100)+'%';
}
progArea.addEventListener('mousemove',e=>{
  const rect=progTrack.getBoundingClientRect();
  const pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
  progTip.style.left=(pct*100)+'%';
  progTip.textContent=vid.duration?fmt(pct*vid.duration):'0:00';
});
progArea.addEventListener('mousedown',e=>{
  isDrag=true;seekPct(e.clientX);
  const mv=e2=>seekPct(e2.clientX);
  const up=()=>{isDrag=false;document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up)};
  document.addEventListener('mousemove',mv);
  document.addEventListener('mouseup',up);
});
progArea.addEventListener('touchstart',e=>{isDrag=true;seekPct(e.touches[0].clientX)},{passive:true});
progArea.addEventListener('touchmove',e=>seekPct(e.touches[0].clientX),{passive:true});
progArea.addEventListener('touchend',()=>{isDrag=false});

/* ── Info panel update ───────────────────────────────────── */
function updateInfoPanel(){
  if(vid.buffered.length)
    iBuf.innerHTML=vid.buffered.end(vid.buffered.length-1).toFixed(1)+'<small> s</small>';
  if(hls){
    const lvl=hls.currentLevel>=0?hls.levels[hls.currentLevel]:null;
    if(lvl){
      iRes.innerHTML=lvl.width&&lvl.height?\`\${lvl.height}<small>p</small>\`:'—';
      iBr.innerHTML=lvl.bitrate?(lvl.bitrate/1e6).toFixed(1)+'<small> Mbps</small>':'—';
      iCodec.textContent=lvl.videoCodec?_parseCodec(lvl.videoCodec):'H.264';
    }
    iLvl.textContent=hls.currentLevel>=0?\`\${hls.currentLevel+1}/\${hls.levels.length}\`:'Auto';
  }
}

/* ── Buffer chart ────────────────────────────────────────── */
bufChart.innerHTML='';
const bufBars=[];
for(let i=0;i<22;i++){
  const b=document.createElement('div');b.className='sp-buf-bar';
  b.style.height='30%';bufChart.appendChild(b);bufBars.push(b);
}
function updateBufChart(){
  bufBars.forEach(b=>{
    b.style.height=Math.round(15+Math.random()*80)+'%';
    b.style.opacity=(0.35+Math.random()*0.65).toFixed(2);
  });
}
setInterval(updateBufChart,2000);

/* ── Quality ─────────────────────────────────────────────── */
function buildQual(levels){
  // Settings menu list
  qualList.innerHTML='';
  const auto=document.createElement('div');
  auto.className='sp-menu-item active';auto.dataset.level='-1';
  auto.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg> Auto';
  auto.onclick=()=>setQual(-1);
  qualList.appendChild(auto);

  // Panel quality grid
  panelQualList.innerHTML='<div class="sp-qopt active" data-level="-1"><div class="sp-qopt-lbl">Auto</div><div class="sp-qopt-sub">Adaptive</div></div>';

  const sorted=[...levels].sort((a,b)=>(b.height||0)-(a.height||0));
  sorted.forEach(lvl=>{
    const ri=levels.indexOf(lvl);
    // menu item
    const item=document.createElement('div');
    item.className='sp-menu-item';item.dataset.level=ri;
    item.textContent=lvl.height?\`\${lvl.height}p\`:\`Level \${ri}\`;
    item.onclick=()=>setQual(ri);
    qualList.appendChild(item);
    // panel card
    const card=document.createElement('div');
    card.className='sp-qopt';card.dataset.level=ri;
    card.innerHTML=\`<div class="sp-qopt-lbl">\${lvl.height?lvl.height+'p':'Lvl '+ri}</div><div class="sp-qopt-sub">\${lvl.bitrate?(lvl.bitrate/1e6).toFixed(1)+' Mbps':''}</div>\`;
    card.onclick=()=>setQual(ri);
    panelQualList.appendChild(card);
  });

  panelQualList.querySelectorAll('.sp-qopt').forEach(c=>{
    c.addEventListener('click',()=>setQual(+c.dataset.level));
  });
}
function setQual(level){
  if(!hls)return;
  hls.currentLevel=level;hls.autoLevelEnabled=level===-1;
  qualList.querySelectorAll('.sp-menu-item').forEach(el=>el.classList.toggle('active',+el.dataset.level===level));
  panelQualList.querySelectorAll('.sp-qopt').forEach(el=>el.classList.toggle('active',+el.dataset.level===level));
}

/* ── Subtitles ───────────────────────────────────────────── */
const subEditBtn  = document.getElementById('sp-sub-edit-btn');
const subStyleWrap= document.getElementById('sp-sub-style-wrap');
const subList     = document.getElementById('sp-sub-list');
const subDisableEl= document.getElementById('sp-sub-disable');
let allSubTracks  = [];
let activeTrackIdx = -1; // -1 = disabled

function setActiveSubItem(idx){
  // idx = -1 means Disable, >=0 means a track
  activeTrackIdx = idx;
  // update checkmarks
  if(subDisableEl) subDisableEl.classList.toggle('active', idx === -1);
  subList && subList.querySelectorAll('.sp-sub-track-item').forEach((el,i)=>{
    el.classList.toggle('active', i === idx);
  });
}

function buildSubList(){
  if(!subList) return;
  // Remove old track items (keep Disable)
  subList.querySelectorAll('.sp-sub-track-item').forEach(el=>el.remove());
  allSubTracks.forEach((t,i)=>{
    const item = document.createElement('div');
    item.className = 'sp-sub-item sp-sub-track-item';
    item.innerHTML = \`<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-10 7H8v-1H6v2h2v1H6v1h2v-1h2v-3zm7 0h-2v-1h-2v2h2v1h-2v1h2v-1h2v-3z"/></svg>\${t.label||t.language||('Track '+(i+1))}\`;
    item.addEventListener('click', e=>{ e.stopPropagation(); selectTrack(i); });
    subList.appendChild(item);
  });
  // Auto-select first track if nothing active yet
  if(activeTrackIdx === -1 && allSubTracks.length > 0) selectTrack(0);
}

function selectTrack(idx){
  allSubTracks.forEach(t=>{ t.removeEventListener('cuechange',renderSub); t.mode='disabled'; });
  subTrack = allSubTracks[idx] || null;
  subtitlesOn = true;
  if(subTrack){ subTrack.mode='hidden'; subTrack.addEventListener('cuechange',renderSub); }
  subLayer.innerHTML='';
  setActiveSubItem(idx);
}

function disableSubs(){
  subtitlesOn = false;
  if(subTrack){ subTrack.removeEventListener('cuechange',renderSub); subTrack.mode='disabled'; }
  subTrack = null;
  subLayer.innerHTML='';
  setActiveSubItem(-1);
}

if(subDisableEl) subDisableEl.addEventListener('click', e=>{ e.stopPropagation(); disableSubs(); });
if(subEditBtn) subEditBtn.addEventListener('click',e=>{
  e.stopPropagation();
  const open=subStyleWrap.classList.toggle('open');
  subEditBtn.classList.toggle('open',open);
});

function initSubtitles(){
  setTimeout(()=>{
    const tracks=Array.from(vid.textTracks||[]).filter(t=>t.kind==='subtitles'||t.kind==='captions');
    allSubTracks=tracks;
    buildSubList();
  },150);
  vid.textTracks.addEventListener('addtrack',e=>{
    if(e.track.kind==='subtitles'||e.track.kind==='captions'){
      const tracks=Array.from(vid.textTracks||[]).filter(t=>t.kind==='subtitles'||t.kind==='captions');
      allSubTracks=tracks;
      buildSubList();
    }
  });
}
function renderSub(){
  if(!subtitlesOn||!subTrack){subLayer.innerHTML='';return}
  const cues=subTrack.activeCues;
  if(!cues||cues.length===0){subLayer.innerHTML='';return}
  subLayer.innerHTML=Array.from(cues).map(c=>{
    const txt=(c.text||'').replace(/<[^>]+>/g,'').replace(/\\n/g,'<br>');
    return\`<span class="sp-sub-line">\${txt}</span>\`;
  }).join('<br>');
}
function applySub(){
  subLayer.style.fontSize=(subSizeEl.value/100)+'rem';
  subLayer.style.bottom=subPosEl.value+'%';
  subLayer.querySelectorAll('.sp-sub-line').forEach(el=>{
    el.style.background=subBgEl.value;
    el.style.fontFamily=subFontEl.value;
    el.style.color=subColorEl.value;
  });
}
subSizeEl.addEventListener('input',applySub);
subPosEl.addEventListener('input',applySub);
subBgEl.addEventListener('change',applySub);
subFontEl.addEventListener('change',applySub);
subColorEl.addEventListener('input',applySub);

/* ── Fullscreen ──────────────────────────────────────────── */
let _fsMode = false; // tracked ourselves — some mobile browsers don't reliably report document.fullscreenElement
function syncFsSize(){
  const isFs=document.fullscreenElement===root||document.webkitFullscreenElement===root;
  if(isFs){
    root.style.setProperty('width',window.innerWidth+'px','important');
    root.style.setProperty('height',window.innerHeight+'px','important');
  }else{
    root.style.removeProperty('width');
    root.style.removeProperty('height');
  }
}
document.addEventListener('fullscreenchange',syncFsSize);
document.addEventListener('webkitfullscreenchange',syncFsSize);
window.addEventListener('resize',()=>{if(document.fullscreenElement===root||document.webkitFullscreenElement===root)syncFsSize()});
window.addEventListener('orientationchange',()=>setTimeout(syncFsSize,350));

function toggleFs(){
  const isFs=document.fullscreenElement||document.webkitFullscreenElement||_fsMode;
  if(!isFs){
    _fsMode=true;
    (root.requestFullscreen||root.webkitRequestFullscreen).call(root);
    try{screen.orientation?.lock('landscape').then(syncFsSize).catch(()=>{})}catch(_){}
    fsIcon.innerHTML='<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>';
    showCtrl();
  }else{
    _fsMode=false;
    (document.exitFullscreen||document.webkitExitFullscreen).call(document);
    try{screen.orientation?.unlock()}catch(_){}
    fsIcon.innerHTML='<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>';
  }
}
document.addEventListener('fullscreenchange',()=>{
  if(!document.fullscreenElement){
    _fsMode=false;
    fsIcon.innerHTML='<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>';
  }
});

/* ── Play/seek ───────────────────────────────────────────── */
function togglePlay(){
  if(vid.paused){
    vid.play().catch(()=>{
      if(vid.readyState===0) showError('Playback failed to start — tap Try Again or switch servers.');
    });
  } else {
    vid.pause();
  }
}
function seekRel(s){
  vid.currentTime=Math.max(0,Math.min(vid.duration||0,vid.currentTime+s));
  flashZone(s<0?'l':'r');showCtrl();
}

/* ── Video events ────────────────────────────────────────── */
function reportPlayback(type){
  try{window.postMessage({type:type,currentTime:vid.currentTime||0},'*');}catch(e){}
}
vid.addEventListener('waiting',()=>spin(true));
vid.addEventListener('canplay',()=>spin(false));
vid.addEventListener('play',()=>{syncPlay();reportPlayback('play');});
vid.addEventListener('playing',()=>{spin(false);syncPlay();showCtrl();hideError();reportPlayback('playing');});
vid.addEventListener('pause',()=>{syncPlay();showCtrl();reportPlayback('pause');});
vid.addEventListener('ended',()=>{syncPlay();reportPlayback('ended');});
vid.addEventListener('timeupdate',updateProg);
vid.addEventListener('volumechange',syncVol);
vid.addEventListener('durationchange',updateProg);

/* ── Mouse/touch ─────────────────────────────────────────── */
const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

root.addEventListener('mousemove',()=>{
  if(_mmThrottle)return;
  showCtrl();_mmThrottle=setTimeout(()=>{_mmThrottle=null},500);
});
root.addEventListener('mouseleave',hideCtrl);
let _clickLock=false;

/* Touch: single-tap = show/hide controls, double-tap = seek */
if(isTouchDevice){
  let _touchMoved=false;
  let _lastTapTime=0;
  let _lastTapX=0;
  let _singleTapTimer=null;
  root.addEventListener('touchstart',()=>{_touchMoved=false;},{passive:true});
  root.addEventListener('touchmove',()=>{_touchMoved=true;},{passive:true});
  root.addEventListener('touchend',function(e){
    const onInteractive = e.target.closest('button')||e.target.closest('input')||e.target.closest('select')||
       e.target.closest('.sp-menu')||e.target.closest('#sp-preplay')||
       e.target.closest('#sp-center')||
       e.target.closest('#sp-sc-overlay')||e.target.closest('#sp-panel');
    if(onInteractive||_touchMoved)return;
    if(_clickLock)return;
    e.preventDefault();

    const now=Date.now();
    const touch=e.changedTouches[0];
    const tapX=touch.clientX;
    const playerRect=root.getBoundingClientRect();
    const relX=(tapX-playerRect.left)/playerRect.width; // 0..1

    const isDoubleTap=(now-_lastTapTime)<350 && Math.abs(tapX-_lastTapX)<60;
    _lastTapTime=now;
    _lastTapX=tapX;

    if(isDoubleTap){
      clearTimeout(_singleTapTimer);
      _singleTapTimer=null;
      _clickLock=true;setTimeout(()=>{_clickLock=false},400);
      if(relX<0.35){
        seekRel(-5);showCtrl();
      } else if(relX>0.65){
        seekRel(10);showCtrl();
      } else {
        togglePlay();showCtrl();
      }
    } else {
      _singleTapTimer=setTimeout(()=>{
        _singleTapTimer=null;
        _clickLock=true;setTimeout(()=>{_clickLock=false},400);
        if(controls.classList.contains('hidden')){
          showCtrl();
        } else {
          hideCtrl();
        }
      },280);
    }
  },{passive:false});
}

root.addEventListener('click',function(e){
  const onInteractive = e.target.closest('button')||e.target.closest('input')||e.target.closest('select')||
     e.target.closest('.sp-menu')||e.target.closest('#sp-preplay')||
     e.target.closest('#sp-center')||
     e.target.closest('#sp-sc-overlay')||e.target.closest('#sp-panel');
  if(isTouchDevice)return;
  if(window.innerWidth<768)return;
  if(_clickLock)return;
  if(onInteractive)return;
  _clickLock=true;setTimeout(()=>{_clickLock=false},300);
  togglePlay();showCtrl();
});
crBtn.addEventListener('click',e=>{e.stopPropagation();togglePlay();showCtrl()});
crPrevBtn.addEventListener('click',e=>{e.stopPropagation();if(!crPrevBtn.classList.contains('disabled')&&crPrevBtn.dataset.href)location.href=crPrevBtn.dataset.href});
crNextBtn.addEventListener('click',e=>{e.stopPropagation();if(!crNextBtn.classList.contains('disabled')&&crNextBtn.dataset.href)location.href=crNextBtn.dataset.href});

/* ── Keyboard ────────────────────────────────────────────── */
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='TEXTAREA')return;
  if(!root.isConnected)return;
  switch(e.code){
    case'Space':case'KeyK':e.preventDefault();togglePlay();showCtrl();break;
    case'ArrowLeft':e.preventDefault();seekRel(-10);break;
    case'ArrowRight':e.preventDefault();seekRel(10);break;
    case'ArrowUp':e.preventDefault();vid.volume=Math.min(1,vid.volume+.1);volSlider.value=vid.volume;break;
    case'ArrowDown':e.preventDefault();vid.volume=Math.max(0,vid.volume-.1);volSlider.value=vid.volume;break;
    case'KeyM':vid.muted=!vid.muted;break;
    case'KeyF':toggleFs();break;
    case'KeyN':if(e.shiftKey&&!crNextBtn.classList.contains('disabled')&&crNextBtn.dataset.href)location.href=crNextBtn.dataset.href;break;
    case'KeyP':if(e.shiftKey&&!crPrevBtn.classList.contains('disabled')&&crPrevBtn.dataset.href)location.href=crPrevBtn.dataset.href;break;
    case'Slash':case'Question':if(e.shiftKey||e.key==='?')scOverlay.classList.toggle('show');break;
    default:if(e.key>='0'&&e.key<='9'&&vid.duration)vid.currentTime=(+e.key/10)*vid.duration;
  }
});

/* ── Buttons ─────────────────────────────────────────────── */
playBtn.onclick=()=>{togglePlay();showCtrl()};
backBtn.onclick=()=>{seekRel(-10);showCtrl()};
fwdBtn.onclick=()=>{seekRel(10);showCtrl()};
fsBtn.onclick=toggleFs;
helpBtn.onclick=()=>scOverlay.classList.toggle('show');
muteBtn.onclick=()=>{vid.muted=!vid.muted;volSlider.value=vid.muted?0:vid.volume};
volSlider.addEventListener('input',()=>{vid.volume=+volSlider.value;vid.muted=vid.volume===0});
volSlider.addEventListener('click',e=>e.stopPropagation());

/* Settings menu tabs */
document.querySelectorAll('.sp-tab[data-stab]').forEach(tab=>{
  tab.addEventListener('click',e=>{
    e.stopPropagation();
    const t=tab.dataset.stab;
    document.querySelectorAll('.sp-tab[data-stab]').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.sp-tab-panel').forEach(p=>p.classList.add('sp-tab-hidden'));
    tab.classList.add('active');
    document.getElementById('sp-stab-'+t)?.classList.remove('sp-tab-hidden');
  });
});

/* Settings menu speed buttons */
document.querySelectorAll('.sp-speed-opt').forEach(btn=>{
  btn.addEventListener('click',e=>{
    e.stopPropagation();
    vid.playbackRate=+btn.dataset.speed;
    document.querySelectorAll('.sp-speed-opt').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    // sync panel speed
    document.querySelectorAll('.sp-sopt').forEach(b=>b.classList.toggle('active',+b.dataset.spd===+btn.dataset.speed));
  });
});

setBtn.onclick=e=>{e.stopPropagation();setMenu.classList.toggle('open')};
document.addEventListener('click',e=>{
  if(!e.target.closest('#sp-set-menu')&&!e.target.closest('#sp-set-btn'))
    setMenu.classList.remove('open');
});

/* Info strip tooltips — single floating element, positioned via JS so it's
   never clipped by #sp-info-strip's own overflow-x:auto scroll box.
   Works on hover (desktop) and tap (touch). */
(function(){
  const floatTip = document.getElementById('sp-istat-float-tip');
  if(!floatTip) return;

  function positionTip(stat){
    const rootRect = root.getBoundingClientRect();
    const statRect = stat.getBoundingClientRect();
    const top  = statRect.bottom - rootRect.top + 6;
    const left = statRect.left - rootRect.left + statRect.width/2;
    floatTip.style.top  = top + 'px';
    floatTip.style.left = left + 'px';
    floatTip.textContent = stat.dataset.tip || '';
  }
  function showTip(stat){ positionTip(stat); floatTip.classList.add('show'); }
  function hideTip(){ floatTip.classList.remove('show'); }

  document.querySelectorAll('.sp-istat').forEach(stat=>{
    stat.addEventListener('mouseenter',()=>showTip(stat));
    stat.addEventListener('mouseleave',hideTip);
    stat.addEventListener('click',e=>{
      e.stopPropagation();
      const wasActive = stat.classList.contains('sp-istat-active');
      document.querySelectorAll('.sp-istat.sp-istat-active').forEach(s=>s.classList.remove('sp-istat-active'));
      if(wasActive){ hideTip(); }
      else { stat.classList.add('sp-istat-active'); showTip(stat); }
    });
  });
  document.addEventListener('click',e=>{
    if(!e.target.closest('.sp-istat')){
      document.querySelectorAll('.sp-istat.sp-istat-active').forEach(s=>s.classList.remove('sp-istat-active'));
      hideTip();
    }
  });
  document.getElementById('sp-info-strip')?.addEventListener('scroll',hideTip);
})();

/* Panel tabs */
document.querySelectorAll('.sp-ptab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.sp-ptab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.sp-psec').forEach(s=>s.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('sp-ptab-'+tab.dataset.ptab)?.classList.add('active');
  });
});

/* Episode show more / less (state tracked separately from the toggling class) */
(function(){
  const btn = document.getElementById('sp-ep-more-btn');
  if(!btn) return;
  const grid  = document.getElementById('sp-ep-grid');
  const label = document.getElementById('sp-ep-more-label');
  const moreCount = btn.dataset.moreCount;
  let expanded = false;
  btn.addEventListener('click',()=>{
    expanded = !expanded;
    grid.classList.toggle('sp-ep-expanded', expanded);
    label.textContent = expanded ? 'Show Less' : \`Show More (\${moreCount})\`;
    btn.classList.toggle('sp-expanded', expanded);
    if(!expanded) grid.scrollIntoView({block:'nearest'});
  });
})();

/* Panel speed buttons */
document.querySelectorAll('.sp-sopt').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const spd=+btn.dataset.spd;
    vid.playbackRate=spd;
    document.querySelectorAll('.sp-sopt').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    // sync menu speed
    document.querySelectorAll('.sp-speed-opt').forEach(b=>b.classList.toggle('active',+b.dataset.speed===spd));
  });
});

/* ── HLS loader ──────────────────────────────────────────── */
function loadHLS(m3u8){
  if(hls){hls.destroy();hls=null}
  currentM3u8=m3u8;segsLoaded=0;
  spin(true);hideError();
  if(window.Hls&&Hls.isSupported()){
    hls=new Hls({
      enableWorker:true,lowLatencyMode:false,
      backBufferLength:90,maxBufferLength:60,maxMaxBufferLength:120,
      xhrSetup:xhr=>{xhr.withCredentials=false},
    });
    hls.loadSource(m3u8);
    hls.attachMedia(vid);
    hls.on(Hls.Events.MANIFEST_PARSED,(_,d)=>{
      // Do NOT spin(false) here — manifest-parsed just means HLS.js has
      // read the playlist, not that the video is actually playing yet.
      // Hiding the spinner here caused it to disappear before audio
      // actually started, since vid.play() (in attemptAutoplay below)
      // resolves asynchronously and buffering can still occur after this
      // point. The native 'playing' listener below is now the only thing
      // that hides the spinner, so it always matches real playback state.
      buildQual(d.levels);initSubtitles();
      attemptAutoplay();showCtrl();
    });
    hls.on(Hls.Events.FRAG_LOADED,()=>{
      segsLoaded++;sSegs.textContent=segsLoaded;
      sNet.textContent=hls.bandwidthEstimate?(hls.bandwidthEstimate/1e6).toFixed(1)+' Mbps':'—';
    });
    hls.on(Hls.Events.LEVEL_SWITCHED,(_,d)=>{
      qualList.querySelectorAll('.sp-menu-item').forEach(el=>el.classList.toggle('active',+el.dataset.level===d.level));
      panelQualList.querySelectorAll('.sp-qopt').forEach(el=>el.classList.toggle('active',+el.dataset.level===d.level));
      updateInfoPanel();
    });
    hls.on(Hls.Events.ERROR,(_,data)=>{
      if(!data.fatal)return;
      if(vid.readyState===0&&vid.currentTime===0)showError('Stream error — try another server.');
    });
  }else if(vid.canPlayType('application/vnd.apple.mpegurl')){
    vid.src=m3u8;
    vid.addEventListener('loadedmetadata',()=>{initSubtitles();attemptAutoplay();showCtrl()},{once:true});
  }else{
    showError('HLS playback is not supported in this browser.');
  }
}

/* ── Public API (unchanged from v3) ─────────────────────── */
function injectSubtitleTracks(subtitles){
  Array.from(vid.querySelectorAll('track[data-external]')).forEach(t=>t.remove());
  subTrack=null; subLayer.innerHTML=''; allSubTracks=[];
  if(!subtitles||!subtitles.length)return;
  // Sort: default track first, then prefer English
  const sorted=[...subtitles].sort((a,b)=>{
    if(b.default&&!a.default)return 1;
    if(a.default&&!b.default)return -1;
    const aEn=/en(g(lish)?)?/i.test(a.lang||a.label||'');
    const bEn=/en(g(lish)?)?/i.test(b.lang||b.label||'');
    return (bEn?1:0)-(aEn?1:0);
  });
  sorted.forEach((s,i)=>{
    const tr=document.createElement('track');
    tr.kind='subtitles';
    tr.src=s.url||s.file||s.src||'';
    tr.srclang=s.lang||s.language||'und';
    tr.label=s.label||s.lang||('Track '+(i+1));
    tr.setAttribute('data-external','1');
    if(i===0)tr.default=true;
    vid.appendChild(tr);
  });
}
window.SenshiPlayer={
  load(m3u8){if(m3u8)loadHLS(m3u8);else showError('No stream URL provided.')},
  loadWithSubs(m3u8,subs){if(!m3u8){showError('No stream URL provided.');return}injectSubtitleTracks(subs||[]);loadHLS(m3u8)},
  destroy(){if(hls){hls.destroy();hls=null}vid.src='';subLayer.innerHTML='';Array.from(vid.querySelectorAll('track[data-external]')).forEach(t=>t.remove());subTrack=null;allSubTracks=[]},
  retry(){preplayReady=false;_fetchingStream=false;startPlayback()},
};

/* ── Pre-play ────────────────────────────────────────────── */
const _fallbackThumb = ${JSON.stringify(fallbackThumb)};
const _malId         = ${malId};
const _epNum         = ${epNum};
const _siteUrl       = ${JSON.stringify(siteUrl)};



function startPlayback(audio){
  if(preplayReady||_fetchingStream)return;
  _fetchingStream=true;spin(true);
  const _audio=audio||(typeof currentAudio!=='undefined'?currentAudio:'sub');
  fetch(\`\${_siteUrl}/api/senshi_stream.php?anime=\${_malId}&ep=\${_epNum}&audio=\${_audio}\`)
    .then(r=>r.json())
    .then(d=>{
      _fetchingStream=false;
      // Another server may already be on screen by the time this resolves
      // (the watch page now activates whichever server confirms first, not
      // necessarily Senshi) — don't paint an error or hijack a stream that's
      // already playing under a different server.
      if(typeof currentServer!=='undefined'&&currentServer!=='volt')return;
      if(d.error||!d.m3u8){
        spin(false);
        showError(d.error?\`Senshi: \${d.error}\`:'No stream URL returned.');return;
      }
      preplayReady=true;loadHLS(d.m3u8);
    })
    .catch(()=>{
      _fetchingStream=false;
      if(typeof currentServer!=='undefined'&&currentServer!=='volt')return;
      spin(false);showError('Could not reach stream server.');
    });
}

/* ── Init ────────────────────────────────────────────────── */
// Don't blind-fetch Senshi's stream on every page load — the watch page
// probes every server and may well land on AnimeHeaven/Miruro instead.
// startPlayback() now only runs when this player actually becomes the
// active server (watch.php's switchToServer('volt', ...) calls .retry()).
showCtrl();
const _curEpChip = document.querySelector('.sp-ep-chip.current');
if(_curEpChip?.classList.contains('sp-ep-extra')) document.getElementById('sp-ep-more-btn')?.click();

})();`;
}
