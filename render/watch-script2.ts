export function watchScript2(animeId: number, epNum: number, siteUrl: string, epDurationSec: number, totalEps: number = 0): string {
  return `<script>
(function(){
  if(!window.__loggedIn)return;
  var ANIME_ID=${animeId};
  var EP_NUM=${epNum};
  var SITE_URL=${JSON.stringify(siteUrl)};
  var EP_DUR=${epDurationSec};
  var TOTAL_EPS=${totalEps};
  var curPos=0,lastSaved=-1;

  function livePos(){
    var v=document.getElementById('sp-video');
    if(v&&typeof v.currentTime==='number'&&!isNaN(v.currentTime)&&v.currentTime>0)return v.currentTime;
    return curPos;
  }

  function updateUI(){
    var pos=Math.floor(livePos());
    var pct=EP_DUR>0?Math.min(100,(pos/EP_DUR)*100):0;
    var fill=document.getElementById('wp-prog-fill');
    var time=document.getElementById('wp-prog-time');
    var wrap=document.getElementById('wp-prog');
    if(wrap&&pos>=5)wrap.style.display='';
    if(fill)fill.style.width=pct.toFixed(1)+'%';
    if(time){var m=Math.floor(pos/60),s=pos%60,dm=Math.floor(EP_DUR/60),ds=EP_DUR%60;time.textContent=m+':'+(s<10?'0':'')+s+' / '+dm+':'+(ds<10?'0':'')+ds;}
  }

  function save(force){
    var pos=Math.floor(livePos());
    if(pos<5)return;
    if(!force&&pos===lastSaved)return;
    lastSaved=pos;
    fetch(SITE_URL+'/api/watch_history.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save_progress',anime_id:ANIME_ID,episode_num:EP_NUM,watch_time:pos,episode_duration:EP_DUR,total_eps:TOTAL_EPS})}).catch(function(){});
  }

  function load(cb){fetch(SITE_URL+'/api/watch_history.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'get_progress',anime_id:ANIME_ID,episode_num:EP_NUM})}).then(function(r){return r.json();}).then(function(d){if(d.success&&d.watch_time>0)curPos=parseInt(d.watch_time);cb&&cb();}).catch(function(){cb&&cb();});}

  function seekVideoTo(t){
    var v=document.getElementById('sp-video');
    if(!v){var f=document.getElementById('main-player-iframe')||document.querySelector('#watch-player-wrap iframe');try{v=f&&f.contentDocument&&f.contentDocument.querySelector('video');}catch(e){v=null;}}
    if(!v)return false;
    try{
      if(v.readyState>0){v.currentTime=t;return true;}
      v.addEventListener('loadedmetadata',function(){try{v.currentTime=t;}catch(e){}},{once:true});
      return true;
    }catch(e){return false;}
  }

  var urlT=parseInt(new URLSearchParams(window.location.search).get('t')||'0');
  load(function(){
    if(urlT>30&&urlT>curPos)curPos=urlT;
    if(curPos>=30){
      var resumeAt=curPos;
      setTimeout(function(){var m=Math.floor(resumeAt/60),s=resumeAt%60;if(typeof showToast==='function')showToast('▶ Resumed from '+m+':'+(s<10?'0':'')+s,'success');updateUI();},1500);
      var tries=0;
      var seekTimer=setInterval(function(){tries++;if(seekVideoTo(resumeAt)||tries>10)clearInterval(seekTimer);},500);
    }
    setInterval(function(){save();updateUI();},5000);
  });

  // Real-time position + events reported by the player (same-document
  // postMessage from player-js.ts's <video> element listeners).
  window.addEventListener('message',function(e){
    var d=e.data;if(!d||typeof d!=='object')return;
    var ev=d.type||d.event||'';
    var ct=typeof d.currentTime==='number'?d.currentTime:(d.detail&&typeof d.detail.currentTime==='number'?d.detail.currentTime:null);
    if(ct!==null)curPos=ct;
    if(ev==='pause'||ev==='paused')save(true);
    if(ev==='ended'||ev==='complete'){curPos=EP_DUR;save(true);}
  });

  // Belt-and-braces: whatever the exact currentTime is at the moment the
  // user actually leaves (tab hidden or navigating away), save that exact
  // position -- not an estimate.
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')save(true);});
  window.addEventListener('beforeunload',function(){save(true);});
})();
</script>
`;
}
