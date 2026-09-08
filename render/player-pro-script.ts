// New professional custom-controls player script.
//
// Replaces the old buggy custom player (player-js.ts / player-markup.ts,
// no longer wired up) which rendered subtitles off a `cuechange` listener
// on a track set to mode='hidden'. That's inherently racy: a track's cues
// aren't guaranteed to exist yet the instant `mode` is set (external VTT
// is fetched async, and HLS.js-injected tracks populate slightly after
// 'addtrack' fires) so cuechange sometimes never fired for the first
// cue(s) -- exactly the symptom described ("toggling the CC menu off/on
// fixes it", because that forces the browser to re-evaluate track state).
//
// This version sidesteps that whole race by not depending on 'cuechange'
// at all: it reads `track.activeCues` directly off the video's own
// 'timeupdate'/'seeked' events, which already fire on a steady cadence
// during playback. There's no dependency on event ordering, no "did the
// track finish loading before we started listening" question -- if the
// browser has parsed a cue that's active at the current time, it shows.
export function playerProScript(malId: number, epNum: number, siteUrl: string): string {
  return `<script>
(function(){
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
const volWrap    = document.querySelector('.sp-vol-wrap');
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
const ccBtn      = document.getElementById('sp-cc-btn');
const pipBtn     = document.getElementById('sp-pip-btn');
const fsBtn      = document.getElementById('sp-fs-btn');
const fsIcon     = document.getElementById('sp-fs-icon');
const subLayer   = document.getElementById('sp-sub-layer');
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
const ppBtn      = document.getElementById('sp-pp-btn');
/* subtitle style controls */
const subEditBtn = document.getElementById('sp-sub-edit-btn');
const subStyleWrap = document.getElementById('sp-sub-style-wrap');
const subList    = document.getElementById('sp-sub-list');
const subDisableEl = document.getElementById('sp-sub-disable');
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
const sSegs = document.getElementById('sp-s-segs');
const sNet  = document.getElementById('sp-s-net');
const bufChart = document.getElementById('sp-buf-chart');
const panelQualList = document.getElementById('sp-panel-qual-list');

/* ── State ───────────────────────────────────────────────── */
let hls            = null;
let hideTimer       = null;
let isDrag          = false;
let subtitlesOn     = true;
let allSubTracks    = [];
let activeTrackIdx  = -1; // -1 = off
let _watchdogTimer  = null;
let zLTimer, zRTimer;
let _mmThrottle     = null;

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

/* ── Autoplay (with muted fallback) ─────────────────────── */
function attemptAutoplay(){
  const p=vid.play();
  if(p&&p.catch){
    p.catch(()=>{
      vid.muted=true;if(volSlider)volSlider.value=0;syncVol();
      vid.play().catch(()=>{
        if(vid.readyState===0) showPreplay();
      });
    });
  }
}
function showPreplay(){
  spin(false);
  if(preplay){
    preplay.classList.remove('hide');
    const start=()=>{
      vid.play().then(()=>preplay.classList.add('hide')).catch(()=>{
        showError('Playback failed to start — tap Try Again or switch servers.');
      });
    };
    (ppBtn||preplay).addEventListener('click',start,{once:true});
  }else{
    showError('Playback failed to start — tap Try Again or switch servers.');
  }
}

/* ── Spinner / Error ─────────────────────────────────────── */
function spin(on){spinner.classList.toggle('hide',!on)}
function showError(msg){spin(false);errMsg.textContent=msg||'Stream unavailable.';errBox.classList.add('show')}
function hideError(){errBox.classList.remove('show')}

/* ── Controls visibility (auto-hide) ─────────────────────── */
function showCtrl(){
  controls.classList.remove('hidden');
  topbar.classList.remove('hidden');
  center.classList.add('show');
  root.style.cursor='';
  clearTimeout(hideTimer);
  hideTimer=setTimeout(hideCtrl,3000);
}
function hideCtrl(){
  if(isDrag||setMenu.classList.contains('open')||scOverlay.classList.contains('show'))return;
  controls.classList.add('hidden');
  topbar.classList.add('hidden');
  if(!vid.paused&&!vid.ended) center.classList.remove('show');
  root.style.cursor='none';
}

/* ── Zone flash (double-tap seek feedback) ───────────────── */
function flashZone(dir){
  const el=dir==='l'?zoneL:zoneR;
  if(dir==='l'){clearTimeout(zLTimer);el.classList.add('show');zLTimer=setTimeout(()=>el.classList.remove('show'),600);}
  else{clearTimeout(zRTimer);el.classList.add('show');zRTimer=setTimeout(()=>el.classList.remove('show'),600);}
}

/* ── Icons ───────────────────────────────────────────────── */
const PLAY_PATH  ='<path d="M8 5v14l11-7z"/>';
const PAUSE_PATH ='<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
function syncPlay(){
  const playing=!vid.paused&&!vid.ended;
  playIcon.innerHTML=playing?PAUSE_PATH:PLAY_PATH;
  if(crIcon)crIcon.innerHTML=playing?PAUSE_PATH:PLAY_PATH;
}
function syncVol(){
  if(!volIcon)return;
  if(vid.muted||vid.volume===0)
    volIcon.innerHTML='<path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
  else if(vid.volume<0.5)
    volIcon.innerHTML='<path d="M18.5 12A4.5 4.5 0 0016 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>';
  else
    volIcon.innerHTML='<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
  if(volSlider)volSlider.value=vid.muted?0:vid.volume;
}

/* ── Progress bar ────────────────────────────────────────── */
function updateProg(){
  if(!vid.duration||isDrag)return;
  const pct=(vid.currentTime/vid.duration)*100;
  progFill.style.width=pct+'%';
  progThumb.style.left=pct+'%';
  timeEl.innerHTML=\`\${fmt(vid.currentTime)}<span class="sp-time-sep">/</span>\${fmt(vid.duration)}\`;
  if(vid.buffered.length)
    progBuf.style.width=(vid.buffered.end(vid.buffered.length-1)/vid.duration*100)+'%';
  updateInfoPanel();
}
function seekPct(clientX){
  const rect=progTrack.getBoundingClientRect();
  const pct=Math.max(0,Math.min(1,(clientX-rect.left)/rect.width));
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
  isDrag=true;progArea.classList.add('dragging');seekPct(e.clientX);
  const mv=e2=>seekPct(e2.clientX);
  const up=()=>{isDrag=false;progArea.classList.remove('dragging');document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up)};
  document.addEventListener('mousemove',mv);
  document.addEventListener('mouseup',up);
});
progArea.addEventListener('touchstart',e=>{isDrag=true;progArea.classList.add('dragging');seekPct(e.touches[0].clientX)},{passive:true});
progArea.addEventListener('touchmove',e=>seekPct(e.touches[0].clientX),{passive:true});
progArea.addEventListener('touchend',()=>{isDrag=false;progArea.classList.remove('dragging')});

/* ── Info panel ──────────────────────────────────────────── */
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

/* ── Buffer chart (decorative, Stats tab) ─────────────────── */
bufChart.innerHTML='';
const bufBars=[];
for(let i=0;i<22;i++){
  const b=document.createElement('div');b.className='sp-buf-bar';
  b.style.height='30%';bufChart.appendChild(b);bufBars.push(b);
}
let _bufTimer=setInterval(()=>{
  bufBars.forEach(b=>{
    b.style.height=Math.round(15+Math.random()*80)+'%';
    b.style.opacity=(0.35+Math.random()*0.65).toFixed(2);
  });
},2000);

/* ── Quality menu ────────────────────────────────────────── */
function buildQual(levels){
  qualList.innerHTML='';
  const auto=document.createElement('div');
  auto.className='sp-menu-item active';auto.dataset.level='-1';
  auto.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>Auto';
  auto.addEventListener('click',()=>setQual(-1));
  qualList.appendChild(auto);

  panelQualList.innerHTML='<div class="sp-qopt active" data-level="-1"><div class="sp-qopt-lbl">Auto</div><div class="sp-qopt-sub">Adaptive</div></div>';
  panelQualList.querySelector('[data-level="-1"]').addEventListener('click',()=>setQual(-1));

  const sorted=[...levels].sort((a,b)=>(b.height||0)-(a.height||0));
  sorted.forEach(lvl=>{
    const ri=levels.indexOf(lvl);
    const item=document.createElement('div');
    item.className='sp-menu-item';item.dataset.level=ri;
    item.textContent=lvl.height?\`\${lvl.height}p\`:\`Level \${ri}\`;
    item.addEventListener('click',()=>setQual(ri));
    qualList.appendChild(item);

    const card=document.createElement('div');
    card.className='sp-qopt';card.dataset.level=ri;
    card.innerHTML=\`<div class="sp-qopt-lbl">\${lvl.height?lvl.height+'p':'Lvl '+ri}</div><div class="sp-qopt-sub">\${lvl.bitrate?(lvl.bitrate/1e6).toFixed(1)+' Mbps':''}</div>\`;
    card.addEventListener('click',()=>setQual(ri));
    panelQualList.appendChild(card);
  });
}
function setQual(level){
  if(!hls)return;
  hls.currentLevel=level;hls.autoLevelEnabled=level===-1;
  qualList.querySelectorAll('.sp-menu-item').forEach(el=>el.classList.toggle('active',+el.dataset.level===level));
  panelQualList.querySelectorAll('.sp-qopt').forEach(el=>el.classList.toggle('active',+el.dataset.level===level));
}

/* ── Speed menu ──────────────────────────────────────────── */
function setSpeed(spd){
  vid.playbackRate=spd;
  document.querySelectorAll('.sp-speed-opt').forEach(b=>b.classList.toggle('active',+b.dataset.speed===spd));
  document.querySelectorAll('.sp-sopt').forEach(b=>b.classList.toggle('active',+b.dataset.spd===spd));
}
document.querySelectorAll('.sp-speed-opt').forEach(btn=>btn.addEventListener('click',()=>setSpeed(+btn.dataset.speed)));
document.querySelectorAll('.sp-sopt').forEach(btn=>btn.addEventListener('click',()=>setSpeed(+btn.dataset.spd)));

/* ── Subtitles ───────────────────────────────────────────────
   Fix vs. the old player: instead of a 'cuechange' listener on a
   mode='hidden' track (racy -- cues may not exist the instant mode is
   set), this reads track.activeCues directly on the video's own
   'timeupdate'/'seeked' events. Those already fire continuously during
   playback, so there's no dependency on cue-load timing at all: whatever
   the browser has parsed and considers active right now is what renders,
   every time this runs. ────────────────────────────────────────────── */
function refreshTrackList(){
  const tracks=Array.from(vid.textTracks||[]).filter(t=>t.kind==='subtitles'||t.kind==='captions');
  allSubTracks=tracks;
  buildSubMenu();
  // Auto-select a sensible default the first time tracks appear.
  if(activeTrackIdx===-1&&tracks.length>0){
    let idx=tracks.findIndex(t=>/en(g(lish)?)?/i.test(t.label||t.language||''));
    if(idx===-1)idx=0;
    selectTrack(idx);
  }
}
function buildSubMenu(){
  if(!subList)return;
  subList.querySelectorAll('.sp-sub-track-item').forEach(el=>el.remove());
  allSubTracks.forEach((t,i)=>{
    const item=document.createElement('div');
    item.className='sp-sub-item sp-sub-track-item';
    item.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-10 7H8v-1H6v2h2v1H6v1h2v-1h2v-3zm7 0h-2v-1h-2v2h2v1h-2v1h2v-1h2v-3z"/></svg>'+(t.label||t.language||('Track '+(i+1)));
    item.addEventListener('click',e=>{e.stopPropagation();selectTrack(i)});
    subList.appendChild(item);
  });
  setActiveSubItem(activeTrackIdx);
}
function setActiveSubItem(idx){
  if(subDisableEl)subDisableEl.classList.toggle('active',idx===-1);
  if(subList)subList.querySelectorAll('.sp-sub-track-item').forEach((el,i)=>el.classList.toggle('active',i===idx));
  if(ccBtn)ccBtn.classList.toggle('active',idx!==-1&&subtitlesOn);
}
function selectTrack(idx){
  allSubTracks.forEach((t,i)=>{ t.mode = i===idx ? 'hidden' : 'disabled'; });
  activeTrackIdx=idx;
  subtitlesOn=true;
  subLayer.innerHTML='';
  setActiveSubItem(idx);
  renderSub();
}
function disableSubs(){
  allSubTracks.forEach(t=>{ t.mode='disabled'; });
  activeTrackIdx=-1;
  subtitlesOn=false;
  subLayer.innerHTML='';
  setActiveSubItem(-1);
}
function toggleSubsQuick(){
  if(subtitlesOn){ subtitlesOn=false; subLayer.innerHTML=''; if(ccBtn)ccBtn.classList.remove('active'); }
  else if(allSubTracks.length>0){ subtitlesOn=true; if(activeTrackIdx===-1)activeTrackIdx=0; allSubTracks.forEach((t,i)=>{t.mode=i===activeTrackIdx?'hidden':'disabled'}); if(ccBtn)ccBtn.classList.add('active'); renderSub(); }
}
function renderSub(){
  if(!subtitlesOn||activeTrackIdx<0||!allSubTracks[activeTrackIdx]){subLayer.innerHTML='';return}
  const track=allSubTracks[activeTrackIdx];
  const cues=track.activeCues;
  if(!cues||cues.length===0){subLayer.innerHTML='';return}
  subLayer.innerHTML=Array.from(cues).map(c=>{
    const txt=(c.text||'').replace(/<[^>]+>/g,'').replace(/\\n/g,'<br>');
    return\`<span class="sp-sub-line">\${txt}</span>\`;
  }).join('');
}
vid.addEventListener('timeupdate',renderSub);
vid.addEventListener('seeked',renderSub);
if(vid.textTracks){
  vid.textTracks.addEventListener('addtrack',refreshTrackList);
  vid.textTracks.addEventListener('removetrack',refreshTrackList);
}
if(subDisableEl)subDisableEl.addEventListener('click',e=>{e.stopPropagation();disableSubs()});
if(ccBtn)ccBtn.addEventListener('click',toggleSubsQuick);
if(subEditBtn)subEditBtn.addEventListener('click',e=>{
  e.stopPropagation();
  const open=subStyleWrap.classList.toggle('open');
  subEditBtn.classList.toggle('open',open);
});

/* Subtitle style customization, persisted locally so it survives episode
   changes / reloads instead of resetting every time. */
const SUB_STYLE_KEY='av_sub_style_v1';
function loadSubStyle(){
  try{
    const raw=localStorage.getItem(SUB_STYLE_KEY);
    if(!raw)return;
    const s=JSON.parse(raw);
    if(s.size&&subSizeEl)subSizeEl.value=s.size;
    if(s.pos&&subPosEl)subPosEl.value=s.pos;
    if(s.bg&&subBgEl)subBgEl.value=s.bg;
    if(s.font&&subFontEl)subFontEl.value=s.font;
    if(s.color&&subColorEl)subColorEl.value=s.color;
  }catch(e){}
}
function saveSubStyle(){
  try{
    localStorage.setItem(SUB_STYLE_KEY,JSON.stringify({
      size:subSizeEl?subSizeEl.value:null,pos:subPosEl?subPosEl.value:null,
      bg:subBgEl?subBgEl.value:null,font:subFontEl?subFontEl.value:null,color:subColorEl?subColorEl.value:null,
    }));
  }catch(e){}
}
function applySubStyle(){
  if(!subLayer)return;
  if(subSizeEl)subLayer.style.fontSize=(subSizeEl.value/100)+'rem';
  if(subPosEl)subLayer.style.bottom=subPosEl.value+'%';
  subLayer.querySelectorAll('.sp-sub-line').forEach(el=>{
    if(subBgEl)el.style.background=subBgEl.value;
    if(subFontEl)el.style.fontFamily=subFontEl.value;
    if(subColorEl)el.style.color=subColorEl.value;
  });
  saveSubStyle();
}
loadSubStyle();
[subSizeEl,subPosEl].forEach(el=>el&&el.addEventListener('input',applySubStyle));
[subBgEl,subFontEl].forEach(el=>el&&el.addEventListener('change',applySubStyle));
if(subColorEl)subColorEl.addEventListener('input',applySubStyle);
// Re-apply style to freshly-rendered cue lines every frame they change.
const _subLayerObserver=new MutationObserver(applySubStyle);
_subLayerObserver.observe(subLayer,{childList:true});

/* Externally-supplied subtitles (Anikoto etc.) come back as a plain
   array and need <track> elements created for them. */
function injectSubtitleTracks(subtitles){
  Array.from(vid.querySelectorAll('track[data-external]')).forEach(t=>t.remove());
  allSubTracks=[];activeTrackIdx=-1;subtitlesOn=true;subLayer.innerHTML='';
  if(!subtitles||!subtitles.length){ buildSubMenu(); return; }
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
    tr.srclang=(s.lang||s.language||'und').slice(0,2).toLowerCase()||'en';
    tr.label=s.label||s.lang||('Track '+(i+1));
    tr.setAttribute('data-external','1');
    vid.appendChild(tr);
  });
  // refreshTrackList() also runs on the native 'addtrack' event, but
  // <track> elements queue that asynchronously -- calling it once more
  // right after a short delay guarantees the menu/auto-select still runs
  // even in the rare case 'addtrack' timing is delayed further than
  // expected, without depending on it being the *only* trigger.
  setTimeout(refreshTrackList,120);
}

/* ── Fullscreen ──────────────────────────────────────────── */
function toggleFs(){
  const isFs=document.fullscreenElement||document.webkitFullscreenElement;
  if(!isFs){
    (root.requestFullscreen||root.webkitRequestFullscreen||function(){}).call(root);
    try{screen.orientation&&screen.orientation.lock&&screen.orientation.lock('landscape').catch(()=>{})}catch(e){}
  }else{
    (document.exitFullscreen||document.webkitExitFullscreen||function(){}).call(document);
    try{screen.orientation&&screen.orientation.unlock&&screen.orientation.unlock()}catch(e){}
  }
}
function syncFsIcon(){
  const isFs=document.fullscreenElement===root||document.webkitFullscreenElement===root;
  fsIcon.innerHTML=isFs
    ?'<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>'
    :'<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>';
}
document.addEventListener('fullscreenchange',syncFsIcon);
document.addEventListener('webkitfullscreenchange',syncFsIcon);
if(fsBtn)fsBtn.addEventListener('click',toggleFs);

/* ── Picture-in-picture ──────────────────────────────────── */
if(pipBtn&&document.pictureInPictureEnabled){
  pipBtn.addEventListener('click',()=>{
    if(document.pictureInPictureElement){ document.exitPictureInPicture().catch(()=>{}); }
    else{ vid.requestPictureInPicture().catch(()=>{}); }
  });
}else if(pipBtn){
  pipBtn.style.display='none';
}

/* ── Play / seek ─────────────────────────────────────────── */
function togglePlay(){
  if(vid.paused){ vid.play().catch(()=>{ if(vid.readyState===0) showPreplay(); }); }
  else{ vid.pause(); }
}
function seekRel(s){
  vid.currentTime=Math.max(0,Math.min(vid.duration||0,vid.currentTime+s));
  flashZone(s<0?'l':'r');showCtrl();
}
if(playBtn)playBtn.addEventListener('click',togglePlay);
if(crBtn)crBtn.addEventListener('click',togglePlay);
if(backBtn)backBtn.addEventListener('click',()=>seekRel(-10));
if(fwdBtn)fwdBtn.addEventListener('click',()=>seekRel(10));
if(crPrevBtn)crPrevBtn.addEventListener('click',e=>{if(crPrevBtn.classList.contains('disabled'))e.preventDefault()});
if(crNextBtn)crNextBtn.addEventListener('click',e=>{if(crNextBtn.classList.contains('disabled'))e.preventDefault()});

/* ── Volume ──────────────────────────────────────────────── */
if(muteBtn)muteBtn.addEventListener('click',()=>{ vid.muted=!vid.muted; if(!vid.muted&&vid.volume===0)vid.volume=0.5; });
if(volSlider)volSlider.addEventListener('input',()=>{ vid.volume=+volSlider.value; vid.muted=+volSlider.value===0; });

/* ── Settings menu open/close + tabs ─────────────────────── */
function openSettingsTab(tab){
  setMenu.classList.add('open');
  document.querySelectorAll('.sp-tab').forEach(t=>t.classList.toggle('active',t.dataset.stab===tab));
  document.querySelectorAll('.sp-tab-panel').forEach(p=>p.classList.toggle('sp-tab-hidden',p.id!=='sp-stab-'+tab));
}
if(setBtn)setBtn.addEventListener('click',e=>{ e.stopPropagation(); setMenu.classList.toggle('open'); });
if(ccBtn)ccBtn.addEventListener('dblclick',()=>openSettingsTab('subs'));
document.querySelectorAll('.sp-tab').forEach(tab=>tab.addEventListener('click',()=>openSettingsTab(tab.dataset.stab)));
document.addEventListener('click',e=>{
  if(!e.target.closest('#sp-set-menu')&&!e.target.closest('#sp-set-btn')) setMenu.classList.remove('open');
});

/* ── Help / shortcuts overlay ────────────────────────────── */
if(helpBtn)helpBtn.addEventListener('click',()=>scOverlay.classList.add('show'));

/* ── Keyboard shortcuts ──────────────────────────────────── */
document.addEventListener('keydown',e=>{
  if(!root||!document.body.contains(root))return;
  const tag=(e.target&&e.target.tagName||'').toLowerCase();
  if(tag==='input'||tag==='select'||tag==='textarea')return;
  switch(e.code){
    case'Space':case'KeyK':e.preventDefault();togglePlay();showCtrl();break;
    case'ArrowLeft':seekRel(-10);break;
    case'ArrowRight':seekRel(10);break;
    case'ArrowUp':e.preventDefault();vid.volume=Math.min(1,vid.volume+0.1);vid.muted=false;showCtrl();break;
    case'ArrowDown':e.preventDefault();vid.volume=Math.max(0,vid.volume-0.1);showCtrl();break;
    case'KeyM':vid.muted=!vid.muted;showCtrl();break;
    case'KeyF':toggleFs();break;
    case'KeyC':toggleSubsQuick();break;
    case'KeyP':if(pipBtn&&document.pictureInPictureEnabled)pipBtn.click();break;
    case'Slash':if(e.shiftKey)scOverlay.classList.toggle('show');break;
    case'Escape':scOverlay.classList.remove('show');setMenu.classList.remove('open');break;
    case'KeyN':if(e.shiftKey&&crNextBtn&&!crNextBtn.classList.contains('disabled')&&crNextBtn.dataset.href)location.href=crNextBtn.dataset.href;break;
    case'KeyP':if(e.shiftKey&&crPrevBtn&&!crPrevBtn.classList.contains('disabled')&&crPrevBtn.dataset.href)location.href=crPrevBtn.dataset.href;break;
    default:
      if(/^Digit[0-9]$/.test(e.code)&&vid.duration){
        const n=+e.code.slice(5);vid.currentTime=(n/10)*vid.duration;showCtrl();
      }
  }
});

/* ── Video events ────────────────────────────────────────── */
vid.addEventListener('waiting',()=>spin(true));
vid.addEventListener('canplay',()=>spin(false));
vid.addEventListener('play',syncPlay);
vid.addEventListener('playing',()=>{spin(false);syncPlay();showCtrl();hideError();});
vid.addEventListener('pause',()=>{syncPlay();showCtrl();});
vid.addEventListener('ended',syncPlay);
vid.addEventListener('timeupdate',updateProg);
vid.addEventListener('volumechange',syncVol);
vid.addEventListener('durationchange',updateProg);

/* ── Mouse / touch controls visibility + double-tap seek ─── */
const isTouchDevice=('ontouchstart' in window)||navigator.maxTouchPoints>0;
root.addEventListener('mousemove',()=>{
  if(_mmThrottle)return;
  showCtrl();_mmThrottle=setTimeout(()=>{_mmThrottle=null},500);
});
root.addEventListener('mouseleave',hideCtrl);
root.addEventListener('click',e=>{
  if(e.target.closest('button')||e.target.closest('input')||e.target.closest('select')||e.target.closest('.sp-menu')||e.target.closest('#sp-preplay')||e.target.closest('#sp-sc-overlay')||e.target.closest('#sp-prog-area')||e.target.closest('#sp-panel'))return;
  if(isTouchDevice)return; // touch handled separately below (single-tap = show/hide, double-tap = seek)
  togglePlay();showCtrl();
});

if(isTouchDevice){
  let _touchMoved=false,_lastTapTime=0,_lastTapX=0;
  root.addEventListener('touchstart',()=>{_touchMoved=false},{passive:true});
  root.addEventListener('touchmove',()=>{_touchMoved=true},{passive:true});
  root.addEventListener('touchend',function(e){
    const onInteractive=e.target.closest('button')||e.target.closest('input')||e.target.closest('select')||
      e.target.closest('.sp-menu')||e.target.closest('#sp-preplay')||e.target.closest('#sp-center')||
      e.target.closest('#sp-sc-overlay')||e.target.closest('#sp-panel')||e.target.closest('#sp-prog-area');
    if(onInteractive||_touchMoved)return;
    const now=Date.now();
    const touch=e.changedTouches[0];
    const tapX=touch.clientX;
    const isDoubleTap=(now-_lastTapTime)<350&&Math.abs(tapX-_lastTapX)<60;
    _lastTapTime=now;_lastTapX=tapX;
    if(isDoubleTap){
      const rect=root.getBoundingClientRect();
      const relX=(tapX-rect.left)/rect.width;
      e.preventDefault();
      if(relX<0.4) seekRel(-10); else if(relX>0.6) seekRel(10); else togglePlay();
    }else{
      if(controls.classList.contains('hidden')) showCtrl(); else hideCtrl();
    }
  });
}

/* ── Episode show more / less ────────────────────────────── */
(function(){
  const btn=document.getElementById('sp-ep-more-btn');
  if(!btn)return;
  const grid=document.getElementById('sp-ep-grid');
  const label=document.getElementById('sp-ep-more-label');
  const moreCount=btn.dataset.moreCount;
  let expanded=false;
  btn.addEventListener('click',()=>{
    expanded=!expanded;
    grid.classList.toggle('sp-ep-expanded',expanded);
    label.textContent=expanded?'Show Less':\`Show More (\${moreCount})\`;
    btn.classList.toggle('sp-expanded',expanded);
    if(!expanded)grid.scrollIntoView({block:'nearest'});
  });
})();

/* ── Panel tabs ──────────────────────────────────────────── */
document.querySelectorAll('.sp-ptab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.sp-ptab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.sp-psec').forEach(s=>s.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('sp-ptab-'+tab.dataset.ptab)?.classList.add('active');
  });
});

/* ── Info strip tooltips ─────────────────────────────────── */
(function(){
  const floatTip=document.getElementById('sp-istat-float-tip');
  if(!floatTip)return;
  function positionTip(stat){
    const rootRect=root.getBoundingClientRect();
    const statRect=stat.getBoundingClientRect();
    floatTip.style.top=(statRect.bottom-rootRect.top+6)+'px';
    floatTip.style.left=(statRect.left-rootRect.left+statRect.width/2)+'px';
    floatTip.textContent=stat.dataset.tip||'';
  }
  function showTip(stat){positionTip(stat);floatTip.classList.add('show')}
  function hideTip(){floatTip.classList.remove('show')}
  document.querySelectorAll('.sp-istat').forEach(stat=>{
    stat.addEventListener('mouseenter',()=>showTip(stat));
    stat.addEventListener('mouseleave',hideTip);
    stat.addEventListener('click',e=>{
      e.stopPropagation();
      const wasActive=stat.classList.contains('sp-istat-active');
      document.querySelectorAll('.sp-istat.sp-istat-active').forEach(s=>s.classList.remove('sp-istat-active'));
      if(wasActive)hideTip();else{stat.classList.add('sp-istat-active');showTip(stat)}
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

/* ── HLS loader ──────────────────────────────────────────── */
function _clearWatchdog(){ if(_watchdogTimer){clearTimeout(_watchdogTimer);_watchdogTimer=null} }
function _armWatchdog(){
  _clearWatchdog();
  _watchdogTimer=setTimeout(()=>{
    if(vid.readyState===0||vid.currentTime===0) showError('Stream timed out — try another server.');
  },18000);
}
function loadHLS(m3u8){
  if(hls){hls.destroy();hls=null}
  spin(true);hideError();_armWatchdog();
  if(window.Hls&&Hls.isSupported()){
    hls=new Hls({
      enableWorker:true,lowLatencyMode:false,
      backBufferLength:90,maxBufferLength:60,maxMaxBufferLength:120,
      xhrSetup:xhr=>{xhr.withCredentials=false},
    });
    hls.loadSource(m3u8);
    hls.attachMedia(vid);
    hls.on(Hls.Events.MANIFEST_PARSED,(_,d)=>{
      buildQual(d.levels);
      refreshTrackList();
      attemptAutoplay();showCtrl();
    });
    hls.on(Hls.Events.FRAG_LOADED,()=>{
      sSegs.textContent=+sSegs.textContent+1;
      sNet.textContent=hls.bandwidthEstimate?(hls.bandwidthEstimate/1e6).toFixed(1)+' Mbps':'—';
    });
    hls.on(Hls.Events.LEVEL_SWITCHED,(_,d)=>{
      qualList.querySelectorAll('.sp-menu-item').forEach(el=>el.classList.toggle('active',+el.dataset.level===d.level));
      panelQualList.querySelectorAll('.sp-qopt').forEach(el=>el.classList.toggle('active',+el.dataset.level===d.level));
      updateInfoPanel();
    });
    hls.on(Hls.Events.ERROR,(_,data)=>{
      if(!data.fatal)return;
      _clearWatchdog();
      showError('Stream error — try another server.');
    });
    vid.addEventListener('playing',()=>{_clearWatchdog();spin(false)});
  }else if(vid.canPlayType('application/vnd.apple.mpegurl')){
    vid.src=m3u8;
    vid.addEventListener('loadedmetadata',()=>{refreshTrackList();attemptAutoplay();showCtrl()},{once:true});
    vid.addEventListener('playing',()=>{_clearWatchdog();spin(false)},{once:true});
  }else{
    _clearWatchdog();
    showError('HLS playback is not supported in this browser.');
  }
}

/* ── Public API ──────────────────────────────────────────── */
window.SenshiPlayer={
  load(m3u8){
    Array.from(vid.querySelectorAll('track[data-external]')).forEach(t=>t.remove());
    allSubTracks=[];activeTrackIdx=-1;subLayer.innerHTML='';buildSubMenu();
    if(m3u8)loadHLS(m3u8);else showError('No stream URL provided.');
  },
  loadWithSubs(m3u8,subs){
    if(!m3u8){showError('No stream URL provided.');return}
    injectSubtitleTracks(subs||[]);
    loadHLS(m3u8);
  },
  destroy(){
    if(hls){hls.destroy();hls=null}
    vid.src='';
    Array.from(vid.querySelectorAll('track[data-external]')).forEach(t=>t.remove());
    allSubTracks=[];activeTrackIdx=-1;subLayer.innerHTML='';
  },
  retry(){
    if(typeof switchToServer==='function'&&typeof currentServer!=='undefined'){
      switchToServer(currentServer,currentAudio);
    }else{
      spin(false);showError('Could not reach stream server.');
    }
  },
};

/* ── Init ────────────────────────────────────────────────── */
showCtrl();
const _curEpChip=document.querySelector('.sp-ep-chip.current');
if(_curEpChip&&_curEpChip.classList.contains('sp-ep-extra')) document.getElementById('sp-ep-more-btn')?.click();

})();
</script>
`;
}
