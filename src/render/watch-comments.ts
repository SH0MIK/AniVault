import { h } from '../lib/helpers';

export function renderWatchComments(animeId:number,episodeNum:number,siteUrl:string,isLoggedIn:boolean):string {
  const loginUrl = siteUrl + '/login';
  return '<style>' +
  '.av-comments{margin:28px 0 8px;padding:4px 0 18px;background:transparent;border:0;border-radius:0}' +
  '.avc-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:18px}.avc-title{font-size:1.25rem;font-weight:750;letter-spacing:-.01em}.avc-count{color:var(--text-muted);font-size:.82rem}' +
  '.avc-compose{display:flex;gap:10px;margin-bottom:24px}.avc-compose textarea{flex:1;min-height:48px;max-height:180px;resize:vertical;background:transparent;border:0;border-bottom:1px solid var(--border-color);border-radius:0;color:var(--text-primary);padding:10px 2px;font:inherit;outline:none}.avc-compose textarea:focus{border-bottom-color:var(--text-primary)}.avc-compose button{align-self:flex-end}' +
  '.avc-login{padding:12px;border-radius:10px;background:rgba(168,85,247,.06);color:var(--text-secondary);margin-bottom:16px}.avc-login a{color:#a855f7;font-weight:700}' +
  '.avc-list{display:flex;flex-direction:column;gap:12px}.avc-item{position:relative;padding:12px 0 0}.avc-item.reply{margin-left:34px;padding-left:14px;border-left:2px solid rgba(168,85,247,.18)}.avc-top{display:flex;align-items:center;gap:8px}.avc-avatar{width:30px;height:30px;border-radius:50%;object-fit:cover;background:var(--bg-surface)}.avc-user{font-weight:700;font-size:.86rem}.avc-badge{font-size:.62rem;padding:2px 5px;border-radius:4px;background:rgba(168,85,247,.15);color:#c084fc}.avc-time{color:var(--text-muted);font-size:.72rem}.avc-body{margin:8px 0;color:var(--text-secondary);white-space:pre-wrap;word-break:break-word;line-height:1.55}.avc-deleted{color:var(--text-muted);font-style:italic}.avc-actions{display:flex;align-items:center;gap:6px}.avc-btn{border:0;background:transparent;color:var(--text-muted);cursor:pointer;padding:5px 7px;border-radius:7px;font:inherit;font-size:.76rem}.avc-btn:hover{background:rgba(255,255,255,.06);color:var(--text-primary)}.avc-btn.on{color:#a855f7;background:rgba(168,85,247,.1)}.avc-btn:disabled{opacity:.45;cursor:not-allowed}.avc-error{color:#f87171;font-size:.78rem;margin:6px 0}.avc-replybox{margin:7px 0 0 38px;display:none;gap:7px}.avc-replybox.open{display:flex}.avc-replybox input{flex:1;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);padding:8px;font:inherit;font-size:.82rem}.avc-loading{color:var(--text-muted);padding:18px;text-align:center}@media(max-width:600px){.av-comments{padding:15px}.avc-item.reply{margin-left:16px;padding-left:10px}.avc-compose{flex-direction:column}.avc-compose button{align-self:stretch}}' +
  '</style>' +
  '<section class="av-comments" id="watch-comments" data-anime-id="' + animeId + '" data-episode="' + episodeNum + '">' +
    '<div class="avc-head"><div class="avc-title">Comments <span class="avc-count" id="avc-count"></span></div></div>' +
    (isLoggedIn
      ? '<div class="avc-compose"><textarea id="avc-input" maxlength="1000" placeholder="Share your thoughts about Episode ' + episodeNum + '…"></textarea><button class="btn btn-primary btn-sm" type="button" data-avc-action="send">Post</button></div>'
      : '<div class="avc-login">Want to join the discussion? <a href="' + h(loginUrl) + '">Log in</a> to comment, reply, like or dislike.</div>') +
    '<div class="avc-error" id="avc-error"></div><div class="avc-list" id="avc-list"><div class="avc-loading">Loading comments…</div></div>' +
  '</section>' +
  '';
}