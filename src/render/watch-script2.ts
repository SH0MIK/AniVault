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
<script>
(function(){
  function initAniVaultComments(){
    var root=document.getElementById('watch-comments');
    if(!root||root.__commentsReady)return;
    root.__commentsReady=true;
    var params=new URLSearchParams(window.location.search);
    var animeId=root.getAttribute('data-anime-id')||params.get('anime')||'';
    var episode=root.getAttribute('data-episode')||params.get('ep')||'';
    var isLoggedIn=true,comments=[];
    function esc(v){var d=document.createElement('div');d.textContent=v==null?'':String(v);return d.innerHTML;}
    function err(msg){var e=document.getElementById('avc-error');if(e)e.textContent=msg||'Comments are temporarily unavailable.';}
    function render(){
      var list=document.getElementById('avc-list'),count=document.getElementById('avc-count'),byParent={};if(!list)return;
      comments.forEach(function(c){(byParent[c.parent_id||0]||(byParent[c.parent_id||0]=[])).push(c);});
      function draw(parent,depth){return (byParent[parent]||[]).map(function(c){
        var body=c.deleted?'<span class="avc-deleted">Comment deleted</span>':esc(c.body);
        var avatar=c.avatar_url?'<img class="avc-avatar" src="'+esc(c.avatar_url)+'" alt="" loading="lazy">':'<div class="avc-avatar"></div>';
        var votes='<button type="button" class="avc-btn '+(c.my_vote===1?'on':'')+'" data-avc-action="vote" data-comment-id="'+c.id+'" data-vote="1" '+(!isLoggedIn||c.deleted?'disabled':'')+'>▲ '+c.likes+'</button>'+
          '<button type="button" class="avc-btn '+(c.my_vote===-1?'on':'')+'" data-avc-action="vote" data-comment-id="'+c.id+'" data-vote="-1" '+(!isLoggedIn||c.deleted?'disabled':'')+'>▼ '+c.dislikes+'</button>';
        var reply=isLoggedIn&&!c.deleted?'<button type="button" class="avc-btn" data-avc-action="reply" data-comment-id="'+c.id+'">↩ Reply</button>':'';
        var del=c.can_delete&&!c.deleted?'<button type="button" class="avc-btn" data-avc-action="delete" data-comment-id="'+c.id+'">Delete</button>':'';
        var box=isLoggedIn&&!c.deleted?'<div class="avc-replybox" id="avc-reply-'+c.id+'"><input maxlength="1000" placeholder="Reply…"><button type="button" class="btn btn-sm btn-primary" data-avc-action="reply-send" data-comment-id="'+c.id+'">Send</button></div>':'';
        return '<article class="avc-item '+(depth?'reply':'')+'"><div class="avc-top">'+avatar+'<span class="avc-user">'+esc(c.username)+'</span>'+(c.badge?'<span class="avc-badge">'+esc(c.badge)+'</span>':'')+'<span class="avc-time">'+esc(c.time)+'</span></div><div class="avc-body">'+body+'</div><div class="avc-actions">'+votes+reply+del+'</div>'+box+draw(c.id,depth+1)+'</article>';
      }).join('');}
      list.innerHTML=draw(0,0)||'<div class="avc-loading">No comments yet. Be the first!</div>';
      if(count)count.textContent=comments.length?'· '+comments.length:'';
    }
    async function api(action,extra){
      var payload=Object.assign({action:action,anime_id:animeId,episode:episode},extra||{});
      var opt;
      if(action==='get'){
        var qs=new URLSearchParams(payload).toString();
        opt={cache:'no-store'};
        var url='/api/anime-comments?'+qs;
        return fetch(url,opt).then(function(r){
          return r.json().catch(function(){return{success:false,message:'Request failed ('+r.status+')'};}).then(function(d){
            if(!r.ok||!d.success)throw new Error(d.message||('Request failed ('+r.status+')'));
            return d;
          });
        });
      }
      opt={method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)};
      var r=await fetch('/api/anime-comments',opt);
      var d=await r.json().catch(function(){return{success:false,message:'Request failed ('+r.status+')'}});
      if(!r.ok||!d.success)throw new Error(d.message||('Request failed ('+r.status+')'));
      return d;
    }
    async function load(){
      var list=document.getElementById('avc-list');
      try{var d=await api('get');comments=Array.isArray(d.comments)?d.comments:[];render();err('');}
      catch(e){if(list)list.innerHTML='<div class="avc-loading">Unable to load comments.</div>';err(e&&e.message?e.message:'Comments are temporarily unavailable.');}
    }
    async function sendComment(parentId){
      var input=parentId?document.querySelector('#avc-reply-'+parentId+' input'):document.getElementById('avc-input'),text=input&&input.value.trim();if(!text)return;
      try{err('');var d=await api('send',{message:text,parent_id:String(parentId||0)});comments=Array.isArray(d.comments)?d.comments:comments;if(input)input.value='';render();err('');}
      catch(e){err(e&&e.message?e.message:'Could not post comment.');}
    }
    function replyComment(id){var box=document.getElementById('avc-reply-'+id);if(box){box.classList.toggle('open');var input=box.querySelector('input');if(input)input.focus();}}
    async function voteComment(id,v){try{var d=await api('vote',{comment_id:String(id),vote:String(v)});comments=Array.isArray(d.comments)?d.comments:comments;render();err('');}catch(e){err(e&&e.message?e.message:'Could not update vote.');}}
    async function deleteComment(id){if(!window.confirm('Delete this comment?'))return;try{var d=await api('delete',{comment_id:String(id)});comments=Array.isArray(d.comments)?d.comments:comments;render();err('');}catch(e){err(e&&e.message?e.message:'Could not delete comment.');}}
    root.addEventListener('click',function(e){
      var el=e.target&&e.target.closest?e.target.closest('[data-avc-action]'):null;if(!el||!root.contains(el))return;
      var action=el.getAttribute('data-avc-action'),id=Number(el.getAttribute('data-comment-id')||0),v=Number(el.getAttribute('data-vote')||0);
      if(action==='send')sendComment(0);else if(action==='reply')replyComment(id);else if(action==='reply-send')sendComment(id);else if(action==='vote')voteComment(id,v);else if(action==='delete')deleteComment(id);
    });
    root.addEventListener('keydown',function(e){
      if(e.key!=='Enter'||e.shiftKey)return;var input=e.target;if(!input||input.tagName!=='INPUT'||!input.closest('.avc-replybox'))return;
      var box=input.closest('.avc-replybox'),id=Number(box.id.replace('avc-reply-',''))||0;if(id){e.preventDefault();sendComment(id);}
    });
    load();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initAniVaultComments);else initAniVaultComments();
})();
</script>
`;
}
