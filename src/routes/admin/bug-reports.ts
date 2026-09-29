import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { Notification } from '../../lib/notification';
import { h, timeAgo } from '../../lib/helpers';
import { icon } from '../../lib/icons';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';

export const adminBugReportRoutes = new Hono<{ Bindings: Env }>();

const CATEGORIES: Record<string,string> = {
  playback:'Playback', subtitle:'Subtitles / Dub', anime_data:'Anime Data',
  account:'Account', ui:'UI / Design', performance:'Performance', other:'Other'
};

adminBugReportRoutes.on(['GET','POST'],'/admin/bug-reports.php',async c => {
  const ctx=await buildAdminCtx(c);
  const siteUrl=c.env.SITE_URL;
  if(!ctx) return c.redirect(siteUrl+'/');
  const {db,session,lifetime,userId,isOwner,impersonating}=ctx;

  if(c.req.method==='POST'){
    const body=await c.req.parseBody();
    const action=String(body.action||'');
    const id=Number(body.report_id||0);
    const report=id?await db.fetchOne<any>('SELECT * FROM bug_reports WHERE id=?',[id]):null;
    if(!report){session.setFlash('error','Bug report not found.');await session.save(c,lifetime);return c.redirect(siteUrl+'/admin/bug-reports.php');}
    if(action==='update_status'){
      const status=String(body.status||'open');
      const note=String(body.admin_note||'').trim().slice(0,3000);
      if(['open','in_progress','solved'].indexOf(status)<0){
        session.setFlash('error','Invalid status.');
      }else if(status==='solved'){
        await db.query('UPDATE bug_reports SET status=?,admin_note=?,resolved_by=?,resolved_at=datetime(\'now\'),updated_at=datetime(\'now\') WHERE id=?',[status,note||null,userId,id]);
        await Notification.create(db,report.user_id,userId,'bug_report_solved',id,report.title);
        session.setFlash('success','Report #'+id+' marked as solved. The reporter has been notified.');
      }else{
        await db.query('UPDATE bug_reports SET status=?,admin_note=?,resolved_by=NULL,resolved_at=NULL,updated_at=datetime(\'now\') WHERE id=?',[status,note||null,id]);
        session.setFlash('success','Report #'+id+' updated.');
      }
    }
    await session.save(c,lifetime);
    return c.redirect(siteUrl+'/admin/bug-reports.php');
  }

  const status=String(c.req.query('status')||'');
  const category=String(c.req.query('category')||'');
  const search=String(c.req.query('search')||'').trim();
  const page=Math.max(1,Number(c.req.query('page')||1)||1);
  const limit=20,offset=(page-1)*limit;
  let where='WHERE 1=1',params:any[]=[];
  if(['open','in_progress','solved'].indexOf(status)>=0){where+=' AND br.status=?';params.push(status);}
  if(CATEGORIES[category]){where+=' AND br.category=?';params.push(category);}
  if(search){where+=' AND (br.title LIKE ? OR br.description LIKE ? OR u.username LIKE ?)';const q='%'+search+'%';params.push(q,q,q);}
  const total=await db.count('SELECT COUNT(*) as cnt FROM bug_reports br JOIN users u ON u.id=br.user_id '+where,params);
  const rows=await db.fetchAll<any>('SELECT br.*,u.username,u.avatar_url FROM bug_reports br JOIN users u ON u.id=br.user_id '+where+' ORDER BY CASE br.status WHEN \'open\' THEN 0 WHEN \'in_progress\' THEN 1 ELSE 2 END,br.created_at DESC LIMIT '+limit+' OFFSET '+offset,params);
  const stats=await db.fetchOne<any>('SELECT COUNT(*) total,SUM(status=\'open\') open,SUM(status=\'in_progress\') in_progress,SUM(status=\'solved\') solved FROM bug_reports');

  let html=renderAdminHeader({siteUrl,pageTitle:'Bug Reports',adminPage:'bug_reports',isOwner,impersonating});
  html+='<style>.abr-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}.abr-kpi{border:1px solid var(--border);border-radius:13px;padding:14px;background:var(--bg-card)}.abr-kpi strong{display:block;font-size:1.45rem}.abr-kpi span{font-size:.72rem;color:var(--text-muted)}.abr-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.abr-row{border:1px solid var(--border);border-radius:15px;background:var(--bg-card);padding:16px;margin-bottom:10px}.abr-head{display:flex;gap:11px;align-items:flex-start}.abr-avatar{width:36px;height:36px;border-radius:50%;overflow:hidden;background:var(--bg-surface);display:flex;align-items:center;justify-content:center;flex:0 0 auto}.abr-avatar img{width:100%;height:100%;object-fit:cover}.abr-main{flex:1;min-width:0}.abr-title{font-weight:700;font-size:.94rem}.abr-meta{font-size:.74rem;color:var(--text-muted);margin-top:3px}.abr-desc{font-size:.83rem;color:var(--text-secondary);line-height:1.6;white-space:pre-wrap;margin:12px 0}.abr-img{display:block;max-width:560px;max-height:300px;border-radius:10px;border:1px solid var(--border);object-fit:contain;background:#000;margin-bottom:12px}.abr-actions{border-top:1px solid var(--border);padding-top:12px;display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}.abr-actions select{min-width:140px}.abr-note{min-width:260px;flex:1}@media(max-width:760px){.abr-kpis{grid-template-columns:repeat(2,1fr)}.abr-note{min-width:100%}}</style>';

  html+='<div class="admin-header"><div><h1>'+icon('alert','icon-large')+' Bug Reports</h1><span class="text-muted">Review reports and update their status.</span></div></div>';
  html+='<div class="abr-kpis"><div class="abr-kpi"><strong>'+Number(stats?.total||0).toLocaleString()+'</strong><span>Total reports</span></div><div class="abr-kpi"><strong style="color:#fbbf24">'+Number(stats?.open||0).toLocaleString()+'</strong><span>Open</span></div><div class="abr-kpi"><strong style="color:#60a5fa">'+Number(stats?.in_progress||0).toLocaleString()+'</strong><span>In progress</span></div><div class="abr-kpi"><strong style="color:#4ade80">'+Number(stats?.solved||0).toLocaleString()+'</strong><span>Solved</span></div></div>';

  html+='<form method="GET" class="abr-filters"><input class="form-control" name="search" value="'+h(search)+'" placeholder="Search reports or users…"><select class="form-control" name="status"><option value="">All statuses</option><option value="open" '+(status==='open'?'selected':'')+'>Open</option><option value="in_progress" '+(status==='in_progress'?'selected':'')+'>In progress</option><option value="solved" '+(status==='solved'?'selected':'')+'>Solved</option></select><select class="form-control" name="category"><option value="">All categories</option>'+Object.entries(CATEGORIES).map(([k,v])=>'<option value="'+k+'" '+(category===k?'selected':'')+'>'+h(v)+'</option>').join('')+'</select><button class="btn btn-primary" type="submit">'+icon('search','icon-small')+' Filter</button><a class="btn btn-ghost" href="bug-reports.php">Clear</a></form>';

  const flash=session.takeFlash();
  if(flash) html+='<div class="alert '+(flash.type==='error'?'alert-error':'alert-success')+' mb-2">'+h(flash.message)+'</div>';

  html+='<div>';
  if(!rows.length) html+='<div class="card card-body text-center text-muted" style="padding:3rem;">No bug reports found.</div>';
  for(const r of rows){
    const st=r.status==='solved'?'Solved':r.status==='in_progress'?'In progress':'Open';
    html+='<article class="abr-row"><div class="abr-head"><div class="abr-avatar">'+(r.avatar_url?'<img src="'+h(r.avatar_url)+'" alt="">':icon('user','icon-small'))+'</div><div class="abr-main"><div class="abr-title">'+icon('alert','icon-small')+' '+h(r.title)+'</div><div class="abr-meta"><strong>'+h(r.username)+'</strong> · #'+r.id+' · '+h(CATEGORIES[r.category]||'Other')+' · '+h(timeAgo(r.created_at))+'</div></div><span class="br-chip">'+h(st)+'</span></div>';
    html+='<div class="abr-desc">'+h(r.description)+'</div>';
    if(r.page_url) html+='<div class="abr-meta" style="margin-bottom:9px">'+icon('globe','icon-small')+' '+h(r.page_url)+'</div>';
    if(r.image_url) html+='<a href="'+h(r.image_url)+'" target="_blank" rel="noopener"><img class="abr-img" src="'+h(r.image_url)+'" alt="Screenshot" loading="lazy"></a>';
    if(r.admin_note) html+='<div class="abr-meta" style="padding:9px 10px;border-radius:9px;background:rgba(124,58,237,.07);margin-bottom:11px"><strong>Current admin note:</strong> '+h(r.admin_note)+'</div>';
    html+='<form method="POST" class="abr-actions"><input type="hidden" name="action" value="update_status"><input type="hidden" name="report_id" value="'+r.id+'"><select class="form-control" name="status"><option value="open" '+(r.status==='open'?'selected':'')+'>Open</option><option value="in_progress" '+(r.status==='in_progress'?'selected':'')+'>In progress</option><option value="solved" '+(r.status==='solved'?'selected':'')+'>Solved</option></select><input class="form-control abr-note" name="admin_note" maxlength="3000" value="'+h(r.admin_note||'')+'" placeholder="Optional note for the user"><button class="btn btn-primary" type="submit">'+icon('check','icon-small')+' Save update</button></form></article>';
  }
  html+='</div>';

  const pageCount=Math.ceil(total/limit);
  if(pageCount>1){html+='<div class="pagination">';for(let i=1;i<=pageCount;i++){const p=new URLSearchParams();if(status)p.set('status',status);if(category)p.set('category',category);if(search)p.set('search',search);p.set('page',String(i));html+='<a href="?'+p.toString()+'" class="'+(i===page?'current':'')+'">'+i+'</a>';}html+='</div>';}

  html+=renderAdminFooter(siteUrl);
  await session.save(c,lifetime);
  return c.html(html);
});
