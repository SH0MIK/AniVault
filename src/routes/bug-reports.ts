import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { Notification } from '../lib/notification';
import { h, timeAgo } from '../lib/helpers';
import { icon } from '../lib/icons';
import { renderHeader, renderFooter } from '../render/layout';
import { getBannerData } from '../lib/settings';

export const bugReportRoutes = new Hono<{ Bindings: Env }>();

const OWNER_USER_ID = 2;
const MAX_IMAGE = 8 * 1024 * 1024;
const CATEGORIES: Record<string,string> = {
  playback:'Playback', subtitle:'Subtitles / Dub', anime_data:'Anime Data',
  account:'Account', ui:'UI / Design', performance:'Performance', other:'Other'
};
const IMAGE_TYPES = ['image/jpeg','image/png','image/webp','image/gif'];

async function ctx(c:any) {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  return { db, session, lifetime, auth };
}

async function layoutUser(db:Db, auth:Auth) {
  const user = await auth.getCurrentUser();
  return { user, unreadCount: user ? await Notification.unreadCount(db, user.id) : 0 };
}

bugReportRoutes.get('/bug-reports', async c => {
  const x = await ctx(c);
  if (!x.auth.check()) { await x.session.save(c,x.lifetime); return c.redirect(c.env.SITE_URL + '/'); }
  const rows = await x.db.fetchAll<any>('SELECT * FROM bug_reports WHERE user_id=? ORDER BY created_at DESC LIMIT 100',[x.session.user_id!]);
  const lu = await layoutUser(x.db,x.auth);
  const banner = await getBannerData(x.db);
  let html = renderHeader({ ...banner, siteUrl:c.env.SITE_URL, siteName:c.env.SITE_NAME,
    pageTitle:'Bug Reports', pageDescription:'Report a problem and track your reports.',
    currentPage:'bug-reports', currentUser:lu.user as any, unreadCount:lu.unreadCount, requestUrl:c.req.url });
  html += renderBugPage(c.env.SITE_URL,rows);
  html += renderFooter({siteUrl:c.env.SITE_URL,currentUser:lu.user as any});
  await x.session.save(c,x.lifetime);
  return c.html(html);
});

bugReportRoutes.post('/bug-reports', async c => {
  const x = await ctx(c);
  if (!x.auth.check()) return c.json({success:false,message:'Please sign in first.'},401);
  const fd = await c.req.formData();
  const title = String(fd.get('title') ?? '').trim();
  const description = String(fd.get('description') ?? '').trim();
  const category = String(fd.get('category') ?? 'other');
  const file = fd.get('image');
  if (title.length < 4 || title.length > 120) return c.json({success:false,message:'Title must be 4–120 characters.'},400);
  if (description.length < 10 || description.length > 5000) return c.json({success:false,message:'Description must be 10–5000 characters.'},400);
  if (!CATEGORIES[category]) return c.json({success:false,message:'Invalid category.'},400);
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_IMAGE) return c.json({success:false,message:'Image is too large. Maximum size is 8MB.'},400);
    if (!IMAGE_TYPES.includes(file.type)) return c.json({success:false,message:'Only JPG, PNG, WEBP and GIF images are allowed.'},400);
  }
  let pageUrl = '';
  try {
    const ref = new URL(c.req.header('referer') ?? '');
    if (ref.origin === new URL(c.env.SITE_URL).origin) pageUrl = (ref.pathname + ref.search).slice(0,500);
  } catch {}
  const id = await x.db.insert('INSERT INTO bug_reports (user_id,title,description,category,page_url) VALUES (?,?,?,?,?)',
    [x.session.user_id!,title,description,category,pageUrl || null]);
  if (file instanceof File && file.size > 0) {
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : file.type === 'image/gif' ? 'gif' : 'jpg';
    const name = 'report_' + id + '_' + Date.now() + '.' + ext;
    await c.env.AVATARS.put('bug-reports/' + name, await file.arrayBuffer(), {httpMetadata:{contentType:file.type,cacheControl:'public, max-age=31536000, immutable'}});
    const url = c.env.SITE_URL + '/assets/img/bug-reports/' + name;
    await x.db.query('UPDATE bug_reports SET image_url=?,updated_at=datetime(\'now\') WHERE id=?',[url,id]);
  }
  await Notification.create(x.db,OWNER_USER_ID,x.session.user_id!,'bug_report',id,title);
  await x.session.save(c,x.lifetime);
  return c.json({success:true,report_id:id,message:'Bug report submitted. Thanks for helping improve AniVault!'});
});

bugReportRoutes.get('/assets/img/bug-reports/:filename', async c => {
  const name = c.req.param('filename').replace(/[^a-zA-Z0-9_.-]/g,'');
  if (!name.startsWith('report_')) return c.notFound();
  const obj = await c.env.AVATARS.get('bug-reports/' + name);
  if (!obj) return c.notFound();
  return new Response(obj.body,{headers:{'Content-Type':obj.httpMetadata?.contentType ?? 'application/octet-stream','Cache-Control':'public, max-age=31536000, immutable'}});
});

// Existing navbar JS calls this compatibility endpoint.
bugReportRoutes.on(['GET','POST'],'/api/notifications.php',async c => {
  const x = await ctx(c);
  if (!x.auth.check()) return c.json({success:false,message:'Not logged in.'},401);
  const uid = x.session.user_id!;
  const body = c.req.method === 'POST' ? await c.req.parseBody() : {};
  const action = String(body.action ?? c.req.query('action') ?? '');
  if (action === 'count') return c.json({success:true,unread:await Notification.unreadCount(x.db,uid)});
  if (action === 'get') {
    const rows = await Notification.getForUser(x.db,uid,30,0);
    return c.json({success:true,unread:await Notification.unreadCount(x.db,uid),notifications:rows.map(n => ({
      id:n.id,is_read:n.is_read,actor_name:n.actor_name ?? 'AniVault',actor_avatar:n.actor_avatar ?? null,
      icon:Notification.getMeta(n.type).icon,text:Notification.getText(n),link:Notification.getLink(n,c.env.SITE_URL),time:timeAgo(n.created_at)
    }))});
  }
  if (action === 'read') { const id=Number(body.id ?? 0); if(id) await Notification.markRead(x.db,id,uid); return c.json({success:true}); }
  if (action === 'read_all') { await Notification.markAllRead(x.db,uid); return c.json({success:true}); }
  if (action === 'delete') { const id=Number(body.id ?? 0); if(id) await Notification.delete(x.db,id,uid); return c.json({success:true}); }
  return c.json({success:false,message:'Unknown notification action.'},400);
});

function renderBugPage(siteUrl:string,rows:any[]):string {
  const open=rows.filter(r=>r.status==='open').length;
  const progress=rows.filter(r=>r.status==='in_progress').length;
  const solved=rows.filter(r=>r.status==='solved').length;
  const cats=Object.entries(CATEGORIES).map(([k,v])=>'<option value="'+k+'">'+h(v)+'</option>').join('');
  return '<style>.br-page{max-width:1080px;margin:0 auto;padding:34px 16px 70px}.br-hero{border:1px solid var(--border);border-radius:22px;padding:28px;background:linear-gradient(135deg,rgba(124,58,237,.16),rgba(59,130,246,.07));box-shadow:0 16px 50px rgba(0,0,0,.16)}.br-hero-icon{width:54px;height:54px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:rgba(124,58,237,.16);color:#a78bfa;margin-bottom:14px}.br-hero h1{margin:0 0 8px;font-size:clamp(1.5rem,4vw,2.1rem)}.br-hero p{margin:0;color:var(--text-secondary);line-height:1.65;max-width:700px}.br-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:18px}.br-stat{border:1px solid var(--border);border-radius:12px;padding:10px;text-align:center;background:rgba(255,255,255,.02)}.br-stat strong{display:block;font-size:1.1rem}.br-stat span{font-size:.7rem;color:var(--text-muted)}.br-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr);gap:18px;margin-top:18px}.br-card{background:var(--bg-card);border:1px solid var(--border);border-radius:18px;overflow:hidden}.br-head{padding:17px 19px;border-bottom:1px solid var(--border);display:flex;gap:9px;align-items:center}.br-head h2{margin:0;font-size:1rem}.br-body{padding:19px}.br-label{display:flex;gap:6px;align-items:center;font-size:.82rem;font-weight:650;color:var(--text-secondary);margin-bottom:6px}.br-input,.br-select,.br-area{width:100%;box-sizing:border-box;border:1px solid var(--border);background:var(--bg-input,var(--bg-surface));color:var(--text-primary);border-radius:11px;padding:11px 12px;font:inherit;outline:0}.br-input:focus,.br-select:focus,.br-area:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(124,58,237,.12)}.br-area{min-height:150px;resize:vertical;line-height:1.55}.br-help{font-size:.73rem;color:var(--text-muted);margin-top:5px}.br-upload{border:1px dashed var(--border);border-radius:13px;padding:13px;display:flex;align-items:center;gap:11px;cursor:pointer}.br-upload input{display:none}.br-upload-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:rgba(124,58,237,.12);color:#a78bfa}.br-preview{display:none;margin-top:10px;position:relative}.br-preview img{width:100%;max-height:260px;object-fit:contain;border-radius:10px;background:#000;border:1px solid var(--border)}.br-remove{position:absolute;right:8px;top:8px;width:30px;height:30px;border:1px solid #ffffff33;border-radius:50%;background:#000a;color:#fff;cursor:pointer}.br-submit{width:100%;border:0;border-radius:11px;padding:12px;background:var(--accent);color:#fff;font-weight:700;cursor:pointer}.br-submit:disabled{opacity:.6}.br-note{display:flex;gap:10px;padding:11px 0;border-bottom:1px solid var(--border)}.br-note:last-child{border:0}.br-list{display:flex;flex-direction:column;gap:10px}.br-report{border:1px solid var(--border);border-radius:15px;overflow:hidden}.br-main{padding:15px 16px}.br-top{display:flex;gap:10px;align-items:flex-start}.br-title{font-weight:700;flex:1;min-width:0}.br-chip{display:inline-flex;gap:5px;align-items:center;border:1px solid var(--border);border-radius:999px;padding:3px 8px;font-size:.68rem;color:var(--text-muted)}.br-open{color:#fbbf24;border-color:#f59e0b55;background:#f59e0b10}.br-progress{color:#60a5fa;border-color:#3b82f655;background:#3b82f610}.br-solved{color:#4ade80;border-color:#22c55e55;background:#22c55e10}.br-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.br-desc{margin-top:10px;color:var(--text-secondary);font-size:.84rem;line-height:1.6;white-space:pre-wrap;word-break:break-word}.br-img{display:block;width:100%;max-height:330px;object-fit:contain;background:#050505;border-radius:10px;margin-top:11px}.br-admin-note{margin-top:11px;padding:10px;border-radius:10px;background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.18);font-size:.8rem;line-height:1.5}.br-empty{text-align:center;padding:35px;color:var(--text-muted)}@media(max-width:760px){.br-grid{grid-template-columns:1fr}.br-page{padding:24px 11px 55px}.br-body{padding:15px}}</style><div class="br-page"><section class="br-hero"><div class="br-hero-icon">'+icon('alert','icon-large')+'</div><h1>Report a bug</h1><p>Found something that is not working correctly? Tell us what happened and where it happened. A screenshot is optional — reports without images are fully supported.</p><div class="br-stats"><div class="br-stat"><strong>'+open+'</strong><span>Open</span></div><div class="br-stat"><strong>'+progress+'</strong><span>In progress</span></div><div class="br-stat"><strong>'+solved+'</strong><span>Solved</span></div></div></section><div class="br-grid"><section class="br-card"><div class="br-head">'+icon('message','icon-small')+'<h2>New bug report</h2></div><div class="br-body"><form id="bug-report-form" enctype="multipart/form-data"><div style="margin-bottom:14px"><label class="br-label">'+icon('edit','icon-small')+' Short title</label><input class="br-input" name="title" maxlength="120" required placeholder="e.g. Episode 4 does not load"></div><div style="margin-bottom:14px"><label class="br-label">'+icon('list','icon-small')+' Category</label><select class="br-select" name="category">'+cats+'</select></div><div style="margin-bottom:14px"><label class="br-label">'+icon('info','icon-small')+' What went wrong?</label><textarea class="br-area" name="description" maxlength="5000" required placeholder="Describe what you expected, what actually happened, and how to reproduce it."></textarea><div class="br-help">Specific steps make bugs much easier to reproduce.</div></div><div style="margin-bottom:16px"><label class="br-label">'+icon('camera','icon-small')+' Screenshot <span style="font-weight:400;color:var(--text-muted)">(optional)</span></label><label class="br-upload"><span class="br-upload-icon">'+icon('upload','icon-medium')+'</span><span><strong style="font-size:.84rem">Attach an image</strong><br><small class="text-muted">JPG, PNG, WEBP or GIF · max 8MB</small></span><input id="bug-image" type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif"></label><div class="br-preview" id="bug-preview"><img id="bug-preview-img" alt="Screenshot preview"><button class="br-remove" type="button" id="bug-remove">'+icon('x','icon-small')+'</button></div></div><button class="br-submit" id="bug-submit" type="submit">'+icon('alert','icon-small')+' Submit bug report</button><div id="bug-message" style="display:none;margin-top:9px;font-size:.82rem"></div></form></div></section><aside class="br-card"><div class="br-head">'+icon('info','icon-small')+'<h2>What to include</h2></div><div class="br-body"><div class="br-note">'+icon('check','icon-small')+'<div><strong>Expected result</strong><div class="text-muted" style="font-size:.76rem">What should have happened?</div></div></div><div class="br-note">'+icon('alert','icon-small')+'<div><strong>Actual result</strong><div class="text-muted" style="font-size:.76rem">What happened instead?</div></div></div><div class="br-note">'+icon('globe','icon-small')+'<div><strong>Page</strong><div class="text-muted" style="font-size:.76rem">Your current page is attached automatically.</div></div></div><div class="br-note">'+icon('camera','icon-small')+'<div><strong>Screenshot</strong><div class="text-muted" style="font-size:.76rem">Optional. You can submit without one.</div></div></div></div></aside></div><section class="br-card" style="margin-top:18px"><div class="br-head">'+icon('list','icon-small')+'<h2>My reports</h2></div><div class="br-body">'+(rows.length ? '<div class="br-list">'+rows.map(renderReport).join('')+'</div>' : '<div class="br-empty">'+icon('inbox','icon-large')+'<div>You have not submitted any bug reports yet.</div></div>')+'</div></section></div><script>(function(){var f=document.getElementById("bug-report-form"),i=document.getElementById("bug-image"),p=document.getElementById("bug-preview"),im=document.getElementById("bug-preview-img"),rm=document.getElementById("bug-remove"),b=document.getElementById("bug-submit"),m=document.getElementById("bug-message");function msg(t,ok){m.style.display="block";m.style.color=ok?"#4ade80":"#f87171";m.textContent=t}i&&i.addEventListener("change",function(){var file=i.files&&i.files[0];if(!file){p.style.display="none";return}if(file.size>8388608){msg("Image is too large. Maximum size is 8MB.",false);i.value="";p.style.display="none";return}var r=new FileReader();r.onload=function(e){im.src=e.target.result;p.style.display="block"};r.readAsDataURL(file)});rm&&rm.addEventListener("click",function(){i.value="";p.style.display="none";im.src=""});f&&f.addEventListener("submit",async function(e){e.preventDefault();b.disabled=true;b.textContent="Submitting…";m.style.display="none";try{var res=await fetch("'+siteUrl+'/bug-reports",{method:"POST",body:new FormData(f)});var d=await res.json();if(!res.ok||!d.success)throw new Error(d.message||"Could not submit report.");msg(d.message,true);f.reset();p.style.display="none";setTimeout(function(){location.reload()},700)}catch(err){msg(err.message||"Network error. Please try again.",false)}finally{b.disabled=false;b.innerHTML=''+icon('alert','icon-small')+' Submit bug report'}})})();</script>';
}

function renderReport(r:any):string {
  const status = r.status === 'solved' ? 'br-solved' : r.status === 'in_progress' ? 'br-progress' : 'br-open';
  const statusIcon = r.status === 'solved' ? 'check' : r.status === 'in_progress' ? 'clock' : 'alert';
  const page = r.page_url ? '<a class="br-chip" href="'+h(r.page_url)+'">'+icon('globe','icon-small')+h(r.page_url)+'</a>' : '';
  const img = r.image_url ? '<a href="'+h(r.image_url)+'" target="_blank" rel="noopener"><img class="br-img" src="'+h(r.image_url)+'" alt="Screenshot" loading="lazy"></a>' : '';
  const note = r.admin_note ? '<div class="br-admin-note"><strong>Admin note</strong><br>'+h(r.admin_note)+'</div>' : '';
  return '<article class="br-report"><div class="br-main"><div class="br-top"><div class="br-title">'+icon('alert','icon-small')+' '+h(r.title)+'</div><span class="br-chip '+status+'">'+icon(statusIcon,'icon-small')+' '+h(r.status === 'solved' ? 'Solved' : r.status === 'in_progress' ? 'In Progress' : 'Open')+'</span></div><div class="br-meta"><span class="br-chip">'+icon('list','icon-small')+' '+h(CATEGORIES[r.category] || 'Other')+'</span><span class="br-chip">'+icon('clock','icon-small')+' '+h(timeAgo(r.created_at))+'</span>'+page+'</div><div class="br-desc">'+h(r.description)+'</div>'+img+note+'</div></article>';
}
