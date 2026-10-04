import { h } from '../lib/helpers';

export function renderWatchComments(animeId:number,episodeNum:number,siteUrl:string,isLoggedIn:boolean):string {
  const loginUrl = siteUrl + '/login';
  return '<style>' +
  '.wc{margin:18px 0 8px;padding:20px;border:1px solid var(--border-color,rgba(255,255,255,.08));border-radius:14px;background:rgba(255,255,255,.025)}' +
  '.wc-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}.wc-title{font-size:1.08rem;font-weight:750}.wc-count{color:var(--text-muted);font-size:.82rem}' +
  '.wc-compose{display:flex;gap:10px;margin-bottom:18px}.wc-compose textarea{flex:1;min-height:74px;resize:vertical;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:10px;color:var(--text-primary);padding:11px;font:inherit}.wc-compose button{align-self:flex-end}' +
  '.wc-login{padding:12px;border-radius:10px;background:rgba(168,85,247,.06);color:var(--text-secondary);margin-bottom:16px}.wc-login a{color:#a855f7;font-weight:700}' +
  '.wc-list{display:flex;flex-direction:column;gap:12px}.wc-item{position:relative;padding:12px 0 0}.wc-item.reply{margin-left:34px;padding-left:14px;border-left:2px solid rgba(168,85,247,.18)}.wc-top{display:flex;align-items:center;gap:8px}.wc-avatar{width:30px;height:30px;border-radius:50%;object-fit:cover;background:var(--bg-surface)}.wc-user{font-weight:700;font-size:.86rem}.wc-badge{font-size:.62rem;padding:2px 5px;border-radius:4px;background:rgba(168,85,247,.15);color:#c084fc}.wc-time{color:var(--text-muted);font-size:.72rem}.wc-body{margin:8px 0;color:var(--text-secondary);white-space:pre-wrap;word-break:break-word;line-height:1.55}.wc-deleted{color:var(--text-muted);font-style:italic}.wc-actions{display:flex;align-items:center;gap:6px}.wc-btn{border:0;background:transparent;color:var(--text-muted);cursor:pointer;padding:5px 7px;border-radius:7px;font:inherit;font-size:.76rem}.wc-btn:hover{background:rgba(255,255,255,.06);color:var(--text-primary)}.wc-btn.on{color:#a855f7;background:rgba(168,85,247,.1)}.wc-btn:disabled{opacity:.45;cursor:not-allowed}.wc-error{color:#f87171;font-size:.78rem;margin:6px 0}.wc-replybox{margin:7px 0 0 38px;display:none;gap:7px}.wc-replybox.open{display:flex}.wc-replybox input{flex:1;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);padding:8px;font:inherit;font-size:.82rem}.wc-loading{color:var(--text-muted);padding:18px;text-align:center}@media(max-width:600px){.wc{padding:15px}.wc-item.reply{margin-left:16px;padding-left:10px}.wc-compose{flex-direction:column}.wc-compose button{align-self:stretch}}' +
  '</style>' +
  '<section class="wc" id="watch-comments" data-anime-id="' + animeId + '" data-episode="' + episodeNum + '">' +
    '<div class="wc-head"><div class="wc-title">Comments <span class="wc-count" id="wc-count"></span></div></div>' +
    (isLoggedIn
      ? '<div class="wc-compose"><textarea id="wc-input" maxlength="1000" placeholder="Share your thoughts about Episode ' + episodeNum + '…"></textarea><button class="btn btn-primary btn-sm" type="button" onclick="wcSend()">Post</button></div>'
      : '<div class="wc-login">Want to join the discussion? <a href="' + h(loginUrl) + '">Log in</a> to comment, reply, like or dislike.</div>') +
    '<div class="wc-error" id="wc-error"></div><div class="wc-list" id="wc-list"><div class="wc-loading">Loading comments…</div></div>' +
  '</section>' +
  '<script>(function(){' +
    'var root=document.getElementById("watch-comments");if(!root)return;' +
    'var animeId=root.dataset.animeId,episode=root.dataset.episode,isLoggedIn=' + (isLoggedIn?'true':'false') + ',comments=[];' +
    'function esc(s){var d=document.createElement("div");d.textContent=s==null?"":s;return d.innerHTML}' +
    'function render(){var list=document.getElementById("wc-list"),byParent={};if(!list)return;comments.forEach(function(c){(byParent[c.parent_id||0]||(byParent[c.parent_id||0]=[])).push(c);});' +
      'function draw(parent,depth){return (byParent[parent]||[]).map(function(c){' +
        'var body=c.deleted?"<span class=\"wc-deleted\">Comment deleted</span>":esc(c.body);' +
        'var avatar=c.avatar_url?"<img class=\"wc-avatar\" src=\"" + esc(c.avatar_url) + "\" alt=\"\" loading=\"lazy\">":"<div class=\"wc-avatar\"></div>";' +
        'var voteButtons="<button class=\"wc-btn "+(c.my_vote===1?"on":"")+"\" onclick=\"wcVote("+c.id+",1)\" "+(!isLoggedIn||c.deleted?"disabled":"")+">▲ "+c.likes+"</button>" +' +
          '"<button class=\"wc-btn "+(c.my_vote===-1?"on":"")+"\" onclick=\"wcVote("+c.id+",-1)\" "+(!isLoggedIn||c.deleted?"disabled":"")+">▼ "+c.dislikes+"</button>";' +
        'var replyButton=(isLoggedIn&&!c.deleted?"<button class=\"wc-btn\" onclick=\"wcReply("+c.id+")\">↩ Reply</button>":"");' +
        'var deleteButton=(c.can_delete&&!c.deleted?"<button class=\"wc-btn\" onclick=\"wcDelete("+c.id+")\">Delete</button>":"");' +
        'var replyBox=(isLoggedIn&&!c.deleted?"<div class=\"wc-replybox\" id=\"wc-reply-"+c.id+"\"><input maxlength=\"1000\" placeholder=\"Reply…\"><button class=\"btn btn-sm btn-primary\" onclick=\"wcSend("+c.id+")\">Send</button></div>":"");' +
        'return "<article class=\"wc-item "+(depth?"reply":"")+"\"><div class=\"wc-top\">"+avatar+"<span class=\"wc-user\">"+esc(c.username)+"</span>"+(c.badge?"<span class=\"wc-badge\">"+esc(c.badge)+"</span>":"")+"<span class=\"wc-time\">"+esc(c.time)+"</span></div><div class=\"wc-body\">"+body+"</div><div class=\"wc-actions\">"+voteButtons+replyButton+deleteButton+"</div>"+replyBox+draw(c.id,depth+1)+"</article>";' +
      '}).join("");}' +
      'list.innerHTML=draw(0,0)||"<div class=\"wc-loading\">No comments yet. Be the first!</div>";document.getElementById("wc-count").textContent=comments.length?"· "+comments.length:"";}' +
    'async function api(action,extra){var p=new URLSearchParams(Object.assign({action:action,anime_id:animeId,episode:episode},extra||{}));var opt=action==="get"?{}:{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:p};var r=await fetch("/api/anime-comments",opt);var d=await r.json().catch(function(){return{success:false,message:"Request failed"}});if(!r.ok||!d.success)throw new Error(d.message||"Request failed");return d}' +
    'async function load(){try{var d=await api("get");comments=d.comments||[];render()}catch(e){document.getElementById("wc-error").textContent=e.message}}' +
    'window.wcSend=async function(parentId){var input=parentId?document.querySelector("#wc-reply-"+parentId+" input"):document.getElementById("wc-input"),text=input&&input.value.trim();if(!text)return;try{document.getElementById("wc-error").textContent="";var d=await api("send",{message:text,parent_id:String(parentId||0)});comments=d.comments||[];input.value="";render()}catch(e){document.getElementById("wc-error").textContent=e.message}};' +
    'window.wcReply=function(id){var x=document.getElementById("wc-reply-"+id);if(x){x.classList.toggle("open");var i=x.querySelector("input");if(i)i.focus()}};' +
    'window.wcVote=async function(id,v){try{var d=await api("vote",{comment_id:String(id),vote:String(v)});comments=d.comments||[];render()}catch(e){document.getElementById("wc-error").textContent=e.message}};' +
    'window.wcDelete=async function(id){if(!confirm("Delete this comment?"))return;try{var d=await api("delete",{comment_id:String(id)});comments=d.comments||[];render()}catch(e){document.getElementById("wc-error").textContent=e.message}};' +
    'load();' +
  '})();</script>';
}
