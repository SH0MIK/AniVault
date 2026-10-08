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
    var isLoggedIn=true,comments=[],sortMode='newest',expanded={};

    function esc(v){var d=document.createElement('div');d.textContent=v==null?'':String(v);return d.innerHTML;}
    function icon(name){
      var p={
        like:'<svg viewBox="0 0 24 24"><path d="M7 10v10H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h3Zm0 10h10.6a2 2 0 0 0 1.9-1.4l2-6A2 2 0 0 0 19.6 10H15l.7-4.2A3 3 0 0 0 12.8 2L7 10v10Z"/></svg>',
        dislike:'<svg viewBox="0 0 24 24"><path d="M7 14V4H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h3Zm0-10h10.6a2 2 0 0 1 1.9 1.4l2 6A2 2 0 0 1 19.6 14H15l.7 4.2A3 3 0 0 1 12.8 22L7 14V4Z"/></svg>',
        reply:'<svg viewBox="0 0 24 24"><path d="M9 17 4 12l5-5"/><path d="M4 12h10a6 6 0 0 1 6 6v1"/></svg>',
        down:'<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
        up:'<svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg>',
        more:'<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>'
      };
      return p[name]||'';
    }
    function err(msg){var e=document.getElementById('avc-error');if(e)e.textContent=msg==null?'Comments are temporarily unavailable.':msg;}
    function sorted(arr){
      return arr.slice().sort(function(a,b){
        if(sortMode==='oldest')return Number(a.id)-Number(b.id);
        if(sortMode==='top')return (Number(b.likes)-Number(b.dislikes))-(Number(a.likes)-Number(a.dislikes))||Number(b.id)-Number(a.id);
        return Number(b.id)-Number(a.id);
      });
    }
    function avatar(c,cls){
      return c&&c.avatar_url?'<img class="'+cls+'" src="'+esc(c.avatar_url)+'" alt="" loading="lazy">':'<div class="'+cls+'"></div>';
    }
    function menu(c){
      if(!c.can_delete||c.deleted)return '';
      return '<div class="avc-more"><button type="button" class="avc-btn" data-avc-action="more" data-comment-id="'+c.id+'">'+icon('more')+'<span>More</span></button><div class="avc-more-menu" id="avc-more-'+c.id+'"><button type="button" data-avc-action="delete" data-comment-id="'+c.id+'">Delete</button></div></div>';
    }
    function drawComment(c,depth){
      var deleted=c.deleted;
      var body=deleted?'<span class="avc-deleted">Comment deleted</span>':esc(c.body);
      var uname=esc(c.username), role=String(c.role||'');
      var userClass=role==='owner'?'owner':role==='admin'?'admin':'';
      var actions=deleted?'':(
        '<button type="button" class="avc-btn '+(c.my_vote===1?'on':'')+'" data-avc-action="vote" data-comment-id="'+c.id+'" data-vote="1">'+icon('like')+'<span>'+c.likes+'</span></button>'+
        '<button type="button" class="avc-btn '+(c.my_vote===-1?'on':'')+'" data-avc-action="vote" data-comment-id="'+c.id+'" data-vote="-1">'+icon('dislike')+'<span>'+c.dislikes+'</span></button>'+
        '<button type="button" class="avc-btn" data-avc-action="reply" data-comment-id="'+c.id+'">'+icon('reply')+'<span>Reply</span></button>'+
        menu(c)
      );
      var box=!deleted&&isLoggedIn?'<div class="avc-replybox" id="avc-reply-'+c.id+'"><input maxlength="1000" placeholder="Reply…"><button type="button" data-avc-action="reply-send" data-comment-id="'+c.id+'">Reply</button></div>':'';
      return '<article class="avc-item '+(depth?'reply':'')+'" data-comment-id="'+c.id+'"><div class="avc-comment">'+avatar(c,'avc-avatar')+'<div class="avc-top"><span class="avc-user '+userClass+'">'+uname+'</span><span class="avc-time">'+esc(c.time)+'</span></div><div class="avc-body">'+body+'</div><div class="avc-actions">'+actions+'</div>'+box+'</div></article>';
    }
    function drawThread(parentId,depth){
      var children=sorted(comments.filter(function(c){return Number(c.parent_id||0)===Number(parentId);}));
      if(!children.length)return '';
      var open=!!expanded[parentId];
      var out='<div class="avc-thread">';
      if(open){
        children.forEach(function(c){out+=drawComment(c,depth);out+=drawThread(c.id,depth+1);});
        out+='</div>';
      }else{
        out+='<button type="button" class="avc-replies-toggle" data-avc-action="toggle-replies" data-comment-id="'+parentId+'">'+icon('down')+'<span>View '+children.length+' '+(children.length===1?'reply':'replies')+'</span></button></div>';
      }
      return out;
    }
    function render(){
      var list=document.getElementById('avc-list'),count=document.getElementById('avc-count'),head=document.getElementById('avc-list-head');
      if(!list)return;
      var roots=sorted(comments.filter(function(c){return !c.parent_id;})),html='';
      roots.forEach(function(c){html+=drawComment(c,0);html+=drawThread(c.id,1);});
      list.innerHTML=html||'<div class="avc-empty">No comments yet. Be the first!</div>';
      if(count)count.textContent=comments.length;
      if(head)head.textContent=comments.length+' '+(comments.length===1?'comment':'comments');
      var mine=comments.find(function(c){return c.mine&&c.avatar_url;});
      var avatarUrl=(currentUser&&currentUser.avatar_url)||(mine&&mine.avatar_url)||'';
      var ca=document.getElementById('avc-compose-avatar');
      if(ca&&avatarUrl)ca.innerHTML='<img src="'+esc(avatarUrl)+'" alt="" loading="lazy">';
    }
    async function api(action,extra){
      var payload=Object.assign({action:action,anime_id:animeId,episode:episode},extra||{}),opt;
      if(action==='get'){
        var qs=new URLSearchParams(payload).toString();
        var r=await fetch('/api/anime-comments?'+qs,{cache:'no-store'});
        var d=await r.json().catch(function(){return{success:false,message:'Request failed ('+r.status+')'}});
        if(!r.ok||!d.success)throw new Error(d.message||('Request failed ('+r.status+')'));return d;
      }
      opt={method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)};
      var r2=await fetch('/api/anime-comments',opt),d2=await r2.json().catch(function(){return{success:false,message:'Request failed ('+r2.status+')'}});
      if(!r2.ok||!d2.success)throw new Error(d2.message||('Request failed ('+r2.status+')'));return d2;
    }
    async function load(){
      try{var d=await api('get');comments=Array.isArray(d.comments)?d.comments:[];currentUser=d.current_user||null;render();err('');}
      catch(e){err(e&&e.message?e.message:'Comments are temporarily unavailable.');var list=document.getElementById('avc-list');if(list)list.innerHTML='<div class="avc-loading">Unable to load comments.</div>';}
    }
    async function sendComment(parentId){
      var input=parentId?document.querySelector('#avc-reply-'+parentId+' input'):document.getElementById('avc-input'),text=input&&input.value.trim();if(!text)return;
      try{var d=await api('send',{message:text,parent_id:String(parentId||0)});comments=Array.isArray(d.comments)?d.comments:comments;if(input)input.value='';if(parentId)expanded[parentId]=true;render();err('');}
      catch(e){err(e&&e.message?e.message:'Could not post comment.');}
    }
    async function voteComment(id,v){try{var d=await api('vote',{comment_id:String(id),vote:String(v)});comments=Array.isArray(d.comments)?d.comments:comments;render();err('');}catch(e){err(e&&e.message?e.message:'Could not update vote.');}}
    async function deleteComment(id){if(!window.confirm('Delete this comment?'))return;try{var d=await api('delete',{comment_id:String(id)});comments=Array.isArray(d.comments)?d.comments:comments;render();err('');}catch(e){err(e&&e.message?e.message:'Could not delete comment.');}}
    root.addEventListener('click',function(e){
      var el=e.target&&e.target.closest?e.target.closest('[data-avc-action]'):null;
      if(!el||!root.contains(el))return;
      var action=el.getAttribute('data-avc-action'),id=Number(el.getAttribute('data-comment-id')||0),v=Number(el.getAttribute('data-vote')||0);
      if(action==='send')sendComment(0);
      else if(action==='reply'){var b=document.getElementById('avc-reply-'+id);if(b){b.classList.toggle('open');var inp=b.querySelector('input');if(inp)inp.focus();}}
      else if(action==='reply-send')sendComment(id);
      else if(action==='vote')voteComment(id,v);
      else if(action==='delete')deleteComment(id);
      else if(action==='toggle-replies'){expanded[id]=!expanded[id];render();}
      else if(action==='more'){var m=document.getElementById('avc-more-'+id);document.querySelectorAll('.avc-more-menu.open').forEach(function(x){if(x!==m)x.classList.remove('open')});if(m)m.classList.toggle('open');}
    });
    root.addEventListener('click',function(e){
      if(!e.target.closest('.avc-more')&&!e.target.closest('.avc-sort'))document.querySelectorAll('.avc-more-menu.open,.avc-sort-menu.open').forEach(function(x){x.classList.remove('open');});
    });
    root.addEventListener('keydown',function(e){
      if(e.key!=='Enter'||e.shiftKey)return;
      var input=e.target;if(!input||input.tagName!=='INPUT'||!input.closest('.avc-replybox'))return;
      var box=input.closest('.avc-replybox'),id=Number(box.id.replace('avc-reply-',''))||0;if(id){e.preventDefault();sendComment(id);}
    });
    var sortBtn=document.getElementById('avc-sort-btn'),sortMenu=document.getElementById('avc-sort-menu');
    if(sortBtn)sortBtn.addEventListener('click',function(e){e.stopPropagation();if(sortMenu)sortMenu.classList.toggle('open');});
    root.querySelectorAll('.avc-sort-option').forEach(function(btn){btn.addEventListener('click',function(){sortMode=btn.getAttribute('data-sort')||'newest';sortBtn.childNodes[0].nodeValue=btn.textContent+' ';root.querySelectorAll('.avc-sort-option').forEach(function(x){x.classList.toggle('active',x===btn)});if(sortMenu)sortMenu.classList.remove('open');render();});});
    load();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initAniVaultComments);else initAniVaultComments();
})();
</script>
