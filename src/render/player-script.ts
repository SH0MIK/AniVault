export function playerScript(malId: number, epNum: number, siteUrl: string): string {
  return `<script>
(function(){
'use strict';

/* ── DOM ─────────────────────────────────────────────────── */
const root       = document.getElementById('senshi-player-root');
const vid        = document.getElementById('sp-video');
const spinner    = document.getElementById('sp-spinner');
const errBox     = document.getElementById('sp-error');
const errMsg     = document.getElementById('sp-err-msg');
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
let hls           = null;
let currentM3u8   = null;
let segsLoaded    = 0;

/* ── Utils ───────────────────────────────────────────────── */
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
      vid.muted=true;
      vid.play().catch(err=>{
        if(vid.readyState===0) showError('Playback failed to start — tap Try Again or switch servers.');
      });
    });
  }
}

/* ── Spinner / Error ─────────────────────────────────────── */
function spin(on){spinner.classList.toggle('hide',!on)}
function showError(msg){spin(false);errMsg.textContent=msg||'Stream unavailable.';errBox.classList.add('show')}
function hideError(){errBox.classList.remove('show')}

/* ── Info panel update (kept from the Stats tab) ────────────── */
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
vid.addEventListener('timeupdate',updateInfoPanel);
vid.addEventListener('progress',updateInfoPanel);

/* ── Buffer chart (Stats tab) ────────────────────────────── */
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

/* ── Quality (Quality tab in the panel + control-bar settings popover) ── */
const popQualList = document.getElementById('sp-pop-qual-opts');
const curQualLabel = document.getElementById('sp-sett-cur-qual');
function buildQual(levels){
  panelQualList.innerHTML='<div class="sp-qopt active" data-level="-1"><div class="sp-qopt-lbl">Auto</div><div class="sp-qopt-sub">Adaptive</div></div>';
  if(popQualList) popQualList.innerHTML='<div class="sp-sett-opt active" data-level="-1">Auto</div>';
  const sorted=[...levels].sort((a,b)=>(b.height||0)-(a.height||0));
  sorted.forEach(lvl=>{
    const ri=levels.indexOf(lvl);
    const card=document.createElement('div');
    card.className='sp-qopt';card.dataset.level=ri;
    card.innerHTML=\`<div class="sp-qopt-lbl">\${lvl.height?lvl.height+'p':'Lvl '+ri}</div><div class="sp-qopt-sub">\${lvl.bitrate?(lvl.bitrate/1e6).toFixed(1)+' Mbps':''}</div>\`;
    card.addEventListener('click',()=>setQual(ri));
    panelQualList.appendChild(card);
    if(popQualList){
      const opt=document.createElement('div');
      opt.className='sp-sett-opt';opt.dataset.level=ri;
      opt.textContent=lvl.height?lvl.height+'p':'Level '+ri;
      opt.addEventListener('click',()=>setQual(ri));
      popQualList.appendChild(opt);
    }
  });
  panelQualList.querySelector('[data-level="-1"]').addEventListener('click',()=>setQual(-1));
  popQualList?.querySelector('[data-level="-1"]').addEventListener('click',()=>setQual(-1));
}
function setQual(level){
  if(!hls)return;
  hls.currentLevel=level;hls.autoLevelEnabled=level===-1;
  panelQualList.querySelectorAll('.sp-qopt').forEach(el=>el.classList.toggle('active',+el.dataset.level===level));
  popQualList?.querySelectorAll('.sp-sett-opt').forEach(el=>el.classList.toggle('active',+el.dataset.level===level));
  if(curQualLabel) curQualLabel.textContent = level===-1 ? 'Auto' : (hls.levels[level]?.height ? hls.levels[level].height+'p' : 'Custom');
}

/* ── Subtitles — plain native <track> elements, exactly like
   subtitle-test-player.html. The browser supplies its own subtitle
   selector (e.g. the CC icon inside the native video controls); no
   custom rendering/menu is built here anymore. ───────────────── */
function injectSubtitleTracks(subtitles){
  Array.from(vid.querySelectorAll('track[data-external]')).forEach(t=>t.remove());
  if(!subtitles || !subtitles.length) return;
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
    tr.srclang=(s.lang||s.language||'und').slice(0,2).toLowerCase();
    tr.label=s.label||s.lang||('Track '+(i+1));
    tr.setAttribute('data-external','1');
    if(i===0) tr.default=true;
    // Append to the DOM FIRST. Setting \`.track.mode\` before the
    // element is attached isn't reliably honored — the TextTrack
    // isn't fully wired into the video's track list yet, so the mode
    // can get silently reset back to 'hidden' once the VTT actually
    // loads. That's why toggling the native CC menu off/on "fixed"
    // it: that forces the browser to re-evaluate track state fresh.
    vid.appendChild(tr);
    if(i===0){
      const forceShowing=()=>{ if(tr.track) tr.track.mode='showing'; };
      tr.addEventListener('load',forceShowing);
      // Belt-and-suspenders: some browsers fire 'load' before this
      // listener attaches (cached VTT) or don't fire it at all for
      // an empty file, so also force it on next frame.
      requestAnimationFrame(forceShowing);
    }
  });
}

/* Turns on the first subtitle/caption track if nothing is showing yet.
   Used for Senshi's natively-embedded HLS subtitle tracks, which hls.js
   adds to vid.textTracks itself (we don't create <track> elements for
   those, so injectSubtitleTracks() above never runs for them). */
function enableDefaultSubtitles(){
  const tracks=Array.from(vid.textTracks||[]).filter(t=>t.kind==='subtitles'||t.kind==='captions');
  if(!tracks.length)return;
  if(!tracks.some(t=>t.mode==='showing')) tracks[0].mode='showing';
}
vid.textTracks && vid.textTracks.addEventListener('addtrack',enableDefaultSubtitles);

/* ── Panel tabs ──────────────────────────────────────────── */
document.querySelectorAll('.sp-ptab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.sp-ptab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.sp-psec').forEach(s=>s.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('sp-ptab-'+tab.dataset.ptab)?.classList.add('active');
  });
});

/* ── Episode show more / less ────────────────────────────── */
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

/* ── Panel speed buttons + control-bar settings popover speed list ── */
const curSpdLabel = document.getElementById('sp-sett-cur-spd');
const popSpdList = document.getElementById('sp-pop-spd-opts');
function setSpeed(spd){
  vid.playbackRate=spd;
  document.querySelectorAll('.sp-sopt').forEach(b=>b.classList.toggle('active',+b.dataset.spd===spd));
  popSpdList?.querySelectorAll('.sp-sett-opt').forEach(b=>b.classList.toggle('active',+b.dataset.spd===spd));
  if(curSpdLabel) curSpdLabel.textContent=(spd===1?'1':String(spd))+'x';
}
document.querySelectorAll('.sp-sopt').forEach(btn=>{
  btn.addEventListener('click',()=>setSpeed(+btn.dataset.spd));
});
if(popSpdList){
  [0.25,0.5,0.75,1,1.25,1.5,1.75,2].forEach(spd=>{
    const opt=document.createElement('div');
    opt.className='sp-sett-opt'+(spd===1?' active':'');
    opt.dataset.spd=spd;
    opt.textContent=spd+'x'+(spd===1?' (Normal)':'');
    opt.addEventListener('click',()=>setSpeed(spd));
    popSpdList.appendChild(opt);
  });
}

/* ── Info strip tooltips ─────────────────────────────────── */
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

/* ── Custom control bar ──────────────────────────────────── */
(function(){
  const area      = document.getElementById('sp-video-area');
  const ctrlBar   = document.getElementById('sp-ctrl-bar');
  const playBtn   = document.getElementById('sp-play');
  const back10Btn = document.getElementById('sp-back10');
  const fwd10Btn  = document.getElementById('sp-fwd10');
  const muteBtn   = document.getElementById('sp-mute');
  const volSlider = document.getElementById('sp-vol');
  const timeEl2   = document.getElementById('sp-time');
  const progWrap  = document.getElementById('sp-progress-wrap');
  const seekInput = document.getElementById('sp-seek');
  const bufFill   = document.getElementById('sp-buf-fill');
  const playFill  = document.getElementById('sp-play-fill');
  const seekTip   = document.getElementById('sp-seek-tip');
  const pauseIcon2= document.getElementById('sp-pause-icon');
  const settBtn2  = document.getElementById('sp-settings-btn');
  const settPop   = document.getElementById('sp-settings-pop');
  const settMain2 = document.getElementById('sp-sett-main');
  const settQualPop = document.getElementById('sp-sett-qual');
  const settSpdPop  = document.getElementById('sp-sett-spd');
  const fsBtn2    = document.getElementById('sp-fs');
  if(!area||!playBtn) return;

  function fmt(t){
    if(!isFinite(t)||t<0) t=0;
    const m=Math.floor(t/60), s=Math.floor(t%60);
    return m+':'+String(s).padStart(2,'0');
  }

  /* Play / pause */
  function syncPlayIcon(){
    const playing=!vid.paused&&!vid.ended;
    playBtn.querySelector('.sp-icon-play').style.display=playing?'none':'';
    playBtn.querySelector('.sp-icon-pause').style.display=playing?'':'none';
  }
  function flashPause(){
    if(vid.paused) return;
    pauseIcon2.classList.remove('show');
  }
  playBtn.addEventListener('click',()=>{ vid.paused?vid.play():vid.pause(); });
  area.addEventListener('click',e=>{
    if(e.target===vid){ vid.paused?vid.play():vid.pause(); }
  });
  vid.addEventListener('play',()=>{ syncPlayIcon(); pauseIcon2.classList.remove('show'); });
  vid.addEventListener('pause',()=>{
    syncPlayIcon();
    pauseIcon2.classList.add('show');
    setTimeout(()=>pauseIcon2.classList.remove('show'),700);
    area.classList.remove('sp-hide-ui');
  });

  /* Skip ±10s */
  back10Btn.addEventListener('click',()=>{ vid.currentTime=Math.max(0,vid.currentTime-10); });
  fwd10Btn.addEventListener('click',()=>{ vid.currentTime=Math.min(vid.duration||1e9,vid.currentTime+10); });

  /* Volume / mute */
  let lastVol=1;
  function syncVolIcon(){
    const muted=vid.muted||vid.volume===0;
    muteBtn.querySelector('.sp-icon-vol').style.display=muted?'none':'';
    muteBtn.querySelector('.sp-icon-muted').style.display=muted?'':'none';
  }
  muteBtn.addEventListener('click',()=>{
    if(vid.muted||vid.volume===0){ vid.muted=false; vid.volume=lastVol||1; volSlider.value=vid.volume; }
    else { lastVol=vid.volume; vid.muted=true; volSlider.value=0; }
    syncVolIcon();
  });
  volSlider.addEventListener('input',()=>{
    vid.volume=+volSlider.value; vid.muted=vid.volume===0;
    if(vid.volume>0) lastVol=vid.volume;
    syncVolIcon();
  });

  /* Progress / seek */
  let seeking=false;
  vid.addEventListener('timeupdate',()=>{
    if(!vid.duration||seeking) return;
    const pct=(vid.currentTime/vid.duration)*100;
    playFill.style.width=pct+'%';
    seekInput.value=pct;
    timeEl2.textContent=fmt(vid.currentTime)+' / '+fmt(vid.duration);
  });
  vid.addEventListener('progress',()=>{
    if(!vid.duration||!vid.buffered.length) return;
    const end=vid.buffered.end(vid.buffered.length-1);
    bufFill.style.width=Math.min(100,(end/vid.duration)*100)+'%';
  });
  vid.addEventListener('loadedmetadata',()=>{
    timeEl2.textContent=fmt(0)+' / '+fmt(vid.duration);
  });
  seekInput.addEventListener('input',()=>{
    seeking=true;
    const pct=+seekInput.value;
    playFill.style.width=pct+'%';
    if(vid.duration) timeEl2.textContent=fmt((pct/100)*vid.duration)+' / '+fmt(vid.duration);
  });
  seekInput.addEventListener('change',()=>{
    if(vid.duration) vid.currentTime=(+seekInput.value/100)*vid.duration;
    seeking=false;
  });
  progWrap.addEventListener('mousemove',e=>{
    if(!vid.duration) return;
    const rect=progWrap.getBoundingClientRect();
    const pct=Math.min(1,Math.max(0,(e.clientX-rect.left)/rect.width));
    seekTip.style.left=(pct*100)+'%';
    seekTip.textContent=fmt(pct*vid.duration);
  });

  /* Fullscreen */
  function syncFsIcon(){
    const fs=!!document.fullscreenElement;
    fsBtn2.querySelector('.sp-icon-fs').style.display=fs?'none':'';
    fsBtn2.querySelector('.sp-icon-exit-fs').style.display=fs?'':'none';
  }
  fsBtn2.addEventListener('click',()=>{
    if(document.fullscreenElement) document.exitFullscreen();
    else area.requestFullscreen?.();
  });
  document.addEventListener('fullscreenchange',()=>{
    syncFsIcon();
    if(document.fullscreenElement){
      screen.orientation?.lock?.('landscape').catch(()=>{});
    } else {
      screen.orientation?.unlock?.();
    }
  });

  /* Settings popover */
  function closeSettings(){
    settPop.classList.remove('show');
    settMain2.style.display='';
    settQualPop.style.display='none';
    settSpdPop.style.display='none';
  }
  settBtn2.addEventListener('click',e=>{
    e.stopPropagation();
    settPop.classList.toggle('show');
  });
  document.getElementById('sp-sett-qual-btn').addEventListener('click',()=>{
    settMain2.style.display='none'; settQualPop.style.display='';
  });
  document.getElementById('sp-sett-spd-btn').addEventListener('click',()=>{
    settMain2.style.display='none'; settSpdPop.style.display='';
  });
  document.getElementById('sp-sett-qual-back').addEventListener('click',()=>{
    settQualPop.style.display='none'; settMain2.style.display='';
  });
  document.getElementById('sp-sett-spd-back').addEventListener('click',()=>{
    settSpdPop.style.display='none'; settMain2.style.display='';
  });
  document.addEventListener('click',e=>{
    if(!e.target.closest('.sp-settings-wrap')) closeSettings();
  });

  /* Auto-hide controls on inactivity */
  let idleTimer=null;
  function showUI(){
    area.classList.remove('sp-hide-ui');
    clearTimeout(idleTimer);
    idleTimer=setTimeout(()=>{
      if(!vid.paused && !settPop.classList.contains('show')) area.classList.add('sp-hide-ui');
    },2800);
  }
  ['mousemove','touchstart','click'].forEach(ev=>area.addEventListener(ev,showUI));
  showUI();

  syncPlayIcon(); syncVolIcon(); syncFsIcon();
})();

/* ── HLS loader ──────────────────────────────────────────── */
let _watchdogTimer=null;
function _clearWatchdog(){ if(_watchdogTimer){ clearTimeout(_watchdogTimer); _watchdogTimer=null; } }
function _armWatchdog(){
  _clearWatchdog();
  // Safety net: if playback hasn't actually started ~18s after we asked
  // for it, stop spinning forever and surface an error instead. Covers
  // cases hls.js doesn't cleanly report as fatal (stalled segment
  // fetches, a manifest that parses but never yields playable data,
  // non-fatal errors it keeps silently retrying, etc.) — previously
  // these left the spinner running indefinitely with no way out.
  _watchdogTimer=setTimeout(()=>{
    if(vid.readyState===0||vid.currentTime===0){
      showError('Stream timed out — try another server.');
    }
  },18000);
}

function loadHLS(m3u8){
  if(hls){hls.destroy();hls=null}
  currentM3u8=m3u8;segsLoaded=0;
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
      enableDefaultSubtitles();
      attemptAutoplay();
    });
    hls.on(Hls.Events.FRAG_LOADED,()=>{
      segsLoaded++;sSegs.textContent=segsLoaded;
      sNet.textContent=hls.bandwidthEstimate?(hls.bandwidthEstimate/1e6).toFixed(1)+' Mbps':'—';
    });
    hls.on(Hls.Events.LEVEL_SWITCHED,(_,d)=>{
      if(hls.autoLevelEnabled){
        panelQualList.querySelectorAll('.sp-qopt').forEach(el=>el.classList.toggle('active',el.dataset.level==='-1'));
        popQualList?.querySelectorAll('.sp-sett-opt').forEach(el=>el.classList.toggle('active',el.dataset.level==='-1'));
        if(curQualLabel) curQualLabel.textContent='Auto';
      }
      updateInfoPanel();
    });
    hls.on(Hls.Events.ERROR,(_,data)=>{
      // Any fatal error means playback has actually stopped, regardless
      // of how much (if anything) had already buffered — the previous
      // readyState===0/currentTime===0 check missed fatal errors that
      // happen mid-stream and just left the spinner stuck.
      if(data.fatal){ _clearWatchdog(); showError('Stream error — try another server.'); }
    });
    vid.addEventListener('playing',()=>{_clearWatchdog();spin(false)});
  }else if(vid.canPlayType('application/vnd.apple.mpegurl')){
    vid.src=m3u8;
    vid.addEventListener('loadedmetadata',()=>{enableDefaultSubtitles();attemptAutoplay()},{once:true});
    vid.addEventListener('playing',()=>{_clearWatchdog();spin(false)});
  }else{
    _clearWatchdog();
    showError('HLS playback is not supported in this browser.');
  }
}

/* ── Public API ──────────────────────────────────────────── */
window.SenshiPlayer={
  load(m3u8){
    Array.from(vid.querySelectorAll('track[data-external]')).forEach(t=>t.remove());
    if(m3u8)loadHLS(m3u8);else showError('No stream URL provided.')
  },
  loadWithSubs(m3u8,subs){if(!m3u8){showError('No stream URL provided.');return}injectSubtitleTracks(subs||[]);loadHLS(m3u8)},
  destroy(){if(hls){hls.destroy();hls=null}vid.src='';Array.from(vid.querySelectorAll('track[data-external]')).forEach(t=>t.remove())},
  // "Try Again" re-runs whichever server (AnimeHeaven / Anikoto-*) is
  // currently active, via the global switchToServer() from watch-script1.ts,
  // instead of the old Senshi-specific self-fetch this used to do.
  retry(){
    if(typeof switchToServer==='function'&&typeof currentServer!=='undefined'){
      switchToServer(currentServer,currentAudio);
    }else{
      spin(false);showError('Could not reach stream server.');
    }
  },
};

/* ── Init ────────────────────────────────────────────────── */
const _curEpChip = document.querySelector('.sp-ep-chip.current');
if(_curEpChip?.classList.contains('sp-ep-extra')) document.getElementById('sp-ep-more-btn')?.click();

})();
</script>
`;
}
