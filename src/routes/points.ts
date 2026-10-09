import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { h } from '../lib/helpers';
import { icon } from '../lib/icons';
import { renderHeader, renderFooter, CurrentUser } from '../render/layout';
import { Notification } from '../lib/notification';
import { getBannerData } from '../lib/settings';

export const pointsRoutes = new Hono<{ Bindings: Env }>();

async function context(c: any) {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  return { db, session, lifetime, auth };
}
function renderRewardPreview(item: any) {
  const type=String(item.cosmetic_type||''), value=String(item.cosmetic_value||'');
  if(type==='avatar_frame') return `<div class="points-preview"><div class="points-preview-avatar frame-${h(value)}">👤</div></div>`;
  if(type==='profile_background') return `<div class="points-preview"><div class="points-preview-bg bg-${h(value)}">${value==='sakura'?'🌸':value==='constellation'?'✦':'▦'}</div></div>`;
  if(type==='name_style') return `<div class="points-preview"><span class="points-preview-name name-${h(value)}">AniVault</span></div>`;
  if(type==='flair') return `<div class="points-preview"><span class="points-preview-label" style="font-size:1rem">✦ ${h(value.replace(/-/g,' '))} ✦</span></div>`;
  if(type==='profile_effect') return `<div class="points-preview"><span style="font-size:2rem">✨ ✧ ✨</span></div>`;
  if(type==='badge') return `<div class="points-preview"><span style="font-size:2rem">🏅</span></div>`;
  return `<div class="points-preview"><span style="font-size:2rem">✦</span></div>`;
}
function todayUTC() { return new Date().toISOString().slice(0, 10); }

async function ensureWallet(db: Db, userId: number) {
  await db.query('INSERT OR IGNORE INTO points_wallets(user_id) VALUES(?)', [userId]);
  return db.fetchOne<{balance:number;lifetime_earned:number;lifetime_spent:number}>(
    'SELECT balance,lifetime_earned,lifetime_spent FROM points_wallets WHERE user_id=?', [userId]
  );
}
async function award(db: Db, userId: number, amount: number, eventType: string, eventKey: string, description: string) {
  if (!Number.isInteger(amount) || amount <= 0) return false;
  await ensureWallet(db, userId);
  const exists = await db.fetchOne<{id:number}>('SELECT id FROM points_ledger WHERE user_id=? AND event_key=?', [userId,eventKey]);
  if (exists) return false;
  const wallet = await db.fetchOne<{balance:number}>('SELECT balance FROM points_wallets WHERE user_id=?', [userId]);
  const balance = Number(wallet?.balance ?? 0) + amount;
  const inserted = await db.query(
    'INSERT OR IGNORE INTO points_ledger(user_id,amount,balance_after,event_type,event_key,description) VALUES(?,?,?,?,?,?)',
    [userId,amount,balance,eventType,eventKey,description]
  );
  if (!(inserted.meta.changes ?? 0)) return false;
  await db.query('UPDATE points_wallets SET balance=balance+?,lifetime_earned=lifetime_earned+?,updated_at=datetime(\'now\') WHERE user_id=?', [amount,amount,userId]);
  return true;
}

pointsRoutes.get('/api/points', async c => {
  const {db,session,lifetime,auth} = await context(c);
  if (!auth.check()) { await session.save(c,lifetime); return c.json({success:false,message:'Please log in first.'},401); }
  await session.save(c,lifetime);
  const userId = session.user_id!;
  const wallet = await ensureWallet(db,userId);
  const [catalog,inventory,ledger,daily] = await Promise.all([
    db.fetchAll<any>('SELECT id,category,name,description,icon,price,cosmetic_type,cosmetic_value FROM points_catalog WHERE active=1 ORDER BY category,sort_order,name'),
    db.fetchAll<any>('SELECT i.item_id,i.equipped,i.purchased_at,c.name,c.category,c.cosmetic_type,c.cosmetic_value FROM points_inventory i JOIN points_catalog c ON c.id=i.item_id WHERE i.user_id=? ORDER BY i.purchased_at DESC',[userId]),
    db.fetchAll<any>('SELECT amount,event_type,description,created_at FROM points_ledger WHERE user_id=? ORDER BY id DESC LIMIT 30',[userId]),
    db.fetchAll<any>('SELECT task_key,claim_date,points FROM points_daily_claims WHERE user_id=? AND claim_date=?',[userId,todayUTC()])
  ]);
  return c.json({success:true,wallet,catalog,inventory,ledger,daily_claims:daily.map((r:any)=>r.task_key)});
});

pointsRoutes.post('/api/points', async c => {
  const {db,session,lifetime,auth} = await context(c);
  if (!auth.check()) { await session.save(c,lifetime); return c.json({success:false,message:'Please log in first.'},401); }
  let body:any = {};
  try { body = await c.req.json(); } catch { body = {}; }
  const userId = session.user_id!;
  const action = String(body.action ?? '');
  await ensureWallet(db,userId);

  if (action === 'daily') {
    const task = String(body.task ?? '');
    const tasks: Record<string,{points:number;description:string}> = {
      daily_login:{points:10,description:'Daily check-in'},
      profile_complete:{points:25,description:'Complete your profile'}
    };
    const spec = tasks[task];
    if (!spec) return c.json({success:false,message:'Unknown task.'},400);
    if (task === 'profile_complete') {
      const alreadyCompleted = await db.fetchOne<{id:number}>('SELECT id FROM points_ledger WHERE user_id=? AND event_key=?',[userId,'task:profile_complete']);
      if (alreadyCompleted) return c.json({success:false,message:'You already earned this one-time reward.'},409);
      const profile = await db.fetchOne<any>('SELECT bio,avatar_url FROM users WHERE id=?',[userId]);
      if (!profile?.bio?.trim() || !profile?.avatar_url) return c.json({success:false,message:'Add a bio and avatar to complete this task.'},400);
    }
    const date = todayUTC();
    const claim = await db.query('INSERT OR IGNORE INTO points_daily_claims(user_id,task_key,claim_date,points) VALUES(?,?,?,?)',[userId,task,date,spec.points]);
    if (!(claim.meta.changes ?? 0)) return c.json({success:false,message:'You already claimed this task today.'},409);
    const ok = await award(db,userId,spec.points,'task',task === 'profile_complete' ? 'task:profile_complete' : task+':'+date,spec.description);
    if (!ok) return c.json({success:false,message:'This task was already credited.'},409);
    const wallet = await ensureWallet(db,userId);
    return c.json({success:true,message:'+'+spec.points+' points earned!',wallet});
  }

  if (action === 'redeem') {
    const itemId = String(body.item_id ?? '');
    const item = await db.fetchOne<any>('SELECT id,name,price,category,cosmetic_type FROM points_catalog WHERE id=? AND active=1',[itemId]);
    if (!item) return c.json({success:false,message:'Reward not found.'},404);
    const owned = await db.fetchOne<any>('SELECT item_id FROM points_inventory WHERE user_id=? AND item_id=?',[userId,itemId]);
    if (owned) return c.json({success:false,message:'You already own this reward.'},409);
    const debit = await db.query('UPDATE points_wallets SET balance=balance-?,lifetime_spent=lifetime_spent+?,updated_at=datetime(\'now\') WHERE user_id=? AND balance>=?',[item.price,item.price,userId,item.price]);
    if (!(debit.meta.changes ?? 0)) return c.json({success:false,message:'Not enough points.'},400);
    try {
      await db.query('INSERT INTO points_inventory(user_id,item_id) VALUES(?,?)',[userId,itemId]);
      const balance = Number((await ensureWallet(db,userId))?.balance ?? 0);
      await db.query('INSERT INTO points_ledger(user_id,amount,balance_after,event_type,event_key,description) VALUES(?,?,?,?,?,?)',[userId,-Number(item.price),balance,'purchase','purchase:'+itemId,item.name]);
    } catch (e) {
      await db.query('UPDATE points_wallets SET balance=balance+?,lifetime_spent=lifetime_spent-? WHERE user_id=?',[item.price,item.price,userId]);
      return c.json({success:false,message:'Could not complete purchase. Please try again.'},409);
    }
    return c.json({success:true,message:'Reward redeemed!',wallet:await ensureWallet(db,userId)});
  }

  if (action === 'equip') {
    const itemId = String(body.item_id ?? '');
    const item = await db.fetchOne<any>('SELECT id,cosmetic_type FROM points_catalog WHERE id=? AND active=1',[itemId]);
    const owned = await db.fetchOne<any>('SELECT item_id FROM points_inventory WHERE user_id=? AND item_id=?',[userId,itemId]);
    if (!item || !owned) return c.json({success:false,message:'You do not own that reward.'},403);
    await db.query('UPDATE points_inventory SET equipped=0 WHERE user_id=? AND item_id IN (SELECT id FROM points_catalog WHERE cosmetic_type=?)',[userId,item.cosmetic_type]);
    await db.query('UPDATE points_inventory SET equipped=1 WHERE user_id=? AND item_id=?',[userId,itemId]);
    return c.json({success:true,message:'Reward equipped!'});
  }
  if (action === 'unequip') {
    const itemId = String(body.item_id ?? '');
    const item = await db.fetchOne<any>('SELECT id,cosmetic_type FROM points_catalog WHERE id=? AND active=1',[itemId]);
    if (!item) return c.json({success:false,message:'Reward not found.'},404);
    await db.query('UPDATE points_inventory SET equipped=0 WHERE user_id=? AND item_id=?',[userId,itemId]);
    return c.json({success:true,message:'Reward unequipped.'});
  }
  return c.json({success:false,message:'Unknown action.'},400);
});

pointsRoutes.get('/points', async c => {
  const {db,session,lifetime,auth} = await context(c);
  if (!auth.check()) { await session.save(c,lifetime); return c.redirect(c.env.SITE_URL + '/login'); }
  const user = await auth.getCurrentUser();
  if (!user) return c.redirect(c.env.SITE_URL + '/login');
  const wallet = await ensureWallet(db,user.id);
  const items = await db.fetchAll<any>('SELECT id,category,name,description,icon,price,cosmetic_type,cosmetic_value FROM points_catalog WHERE active=1 ORDER BY category,sort_order,name');
  const inventory = await db.fetchAll<any>('SELECT i.item_id,i.equipped,c.name,c.category,c.icon,c.cosmetic_type,c.cosmetic_value FROM points_inventory i JOIN points_catalog c ON c.id=i.item_id WHERE i.user_id=? ORDER BY i.purchased_at DESC',[user.id]);
  const owned = new Set(inventory.map((x:any)=>x.item_id));
  const equipped = new Set(inventory.filter((x:any)=>x.equipped).map((x:any)=>x.item_id));
  const claimed = await db.fetchAll<any>('SELECT task_key FROM points_daily_claims WHERE user_id=? AND claim_date=?',[user.id,todayUTC()]);
  const claimedTasks = new Set(claimed.map((x:any)=>x.task_key));
  const profileTaskEarned = await db.fetchOne<{id:number}>('SELECT id FROM points_ledger WHERE user_id=? AND event_key=?',[user.id,'task:profile_complete']);
  if (profileTaskEarned) claimedTasks.add('profile_complete');
  const unreadCount = await Notification.unreadCount(db,user.id);
  const currentUser: CurrentUser = {id:user.id,username:user.username,avatar_url:user.avatar_url,role:user.role};
  const banner = await getBannerData(db);
  let html = renderHeader({...banner,siteUrl:c.env.SITE_URL,siteName:c.env.SITE_NAME,pageTitle:'Points Store',currentPage:'points',currentUser,unreadCount,requestUrl:c.req.url});
  html += `
<style>
.points-page{max-width:1180px;margin:0 auto;padding:30px 18px 70px;color:var(--text-primary)}
.points-hero{text-align:center;padding:30px 16px 26px;background:radial-gradient(ellipse at 50% 0,rgba(124,58,237,.17),transparent 65%);border:1px solid var(--border);border-radius:18px;margin-bottom:22px}
.points-eyebrow{font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;color:var(--accent-2);font-weight:700}
.points-hero h1{font-family:Orbitron,system-ui,sans-serif;font-size:clamp(1.7rem,4vw,2.6rem);margin:10px 0}
.points-muted{color:var(--text-secondary)}
.points-balance{font-size:1.8rem;font-weight:800;color:var(--accent-2);margin:10px 0}
.points-tabs{display:flex;gap:8px;overflow:auto;padding:4px 0 14px}
.points-tab{border:1px solid var(--border);background:var(--card-bg,var(--bg-secondary));color:var(--text-primary);border-radius:999px;padding:9px 16px;white-space:nowrap;cursor:pointer}
.points-tab.active{background:var(--accent);border-color:var(--accent);color:#fff}
.points-panel{display:none}.points-panel.active{display:block}
.points-task-grid,.points-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}
.points-card{background:var(--card-bg,rgba(255,255,255,.035));border:1px solid var(--border);border-radius:15px;padding:17px;min-width:0}
.points-icon{width:40px;height:40px;display:grid;place-items:center;border-radius:12px;background:rgba(124,58,237,.12);color:var(--accent-2);margin-bottom:13px}
.points-icon svg{display:block;width:22px;height:22px;flex-shrink:0}
.points-icon-fallback{font-size:1.45rem;line-height:1}.points-reward-icon svg{display:none!important}.points-reward-icon .points-icon-fallback{display:inline!important}
.points-preview{display:flex;align-items:center;justify-content:center;min-height:94px;margin:-2px 0 14px;border:1px solid var(--border);border-radius:12px;background:linear-gradient(135deg,rgba(124,58,237,.12),rgba(232,69,60,.08));overflow:hidden}
.points-preview-avatar{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;background:var(--bg-secondary,#20202a);position:relative;font-size:1.7rem;border:3px solid transparent}
.points-preview-avatar.frame-sakura{border-color:#f5a6d2;box-shadow:0 0 0 3px rgba(245,166,210,.18)}
.points-preview-avatar.frame-gold{border-color:#f5c451;box-shadow:0 0 0 3px rgba(245,196,81,.18)}
.points-preview-avatar.frame-neon{border-color:#48f5e5;box-shadow:0 0 12px #48f5e5}
.points-preview-bg{width:100%;min-height:110px;display:grid;place-items:center;font-size:1.9rem;position:relative;isolation:isolate;overflow:hidden}
.points-preview-bg.bg-constellation{background-color:#090d1b;background-image:radial-gradient(circle at 20% 25%,#fff 0 1px,transparent 2px),radial-gradient(circle at 75% 30%,#a5b4fc 0 1.5px,transparent 2.5px),radial-gradient(circle at 55% 75%,#fff 0 1px,transparent 2px),radial-gradient(ellipse at 75% 15%,rgba(99,102,241,.42),transparent 48%),linear-gradient(135deg,#090d1b,#312e81)}
.points-preview-bg.bg-sakura{background-color:#211126;background-image:radial-gradient(ellipse at 18% 18%,rgba(244,114,182,.72),transparent 42%),radial-gradient(ellipse at 80% 75%,rgba(217,70,160,.4),transparent 45%),radial-gradient(circle at 25% 65%,rgba(255,190,220,.8) 0 2px,transparent 3px),radial-gradient(circle at 78% 25%,rgba(255,190,220,.8) 0 2px,transparent 3px),linear-gradient(135deg,#321c35,#6b3657)}
.points-preview-bg.bg-midnight{background-color:#080c16;background-image:linear-gradient(90deg,rgba(129,140,248,.22) 1px,transparent 1px),linear-gradient(rgba(129,140,248,.22) 1px,transparent 1px),radial-gradient(ellipse at 50% 0,rgba(79,70,229,.32),transparent 65%);background-size:14px 14px,14px 14px,auto}
.points-preview-name{font-size:1.12rem;font-weight:800;letter-spacing:.02em}
.points-preview-name.name-gradient{background:linear-gradient(90deg,#f472b6,#a78bfa,#38bdf8);color:transparent;background-clip:text;-webkit-background-clip:text}
.points-preview-name.name-gold{color:#f5c451;text-shadow:0 0 12px rgba(245,196,81,.35)}
.points-preview-label{font-size:.75rem;color:var(--text-secondary);margin-top:6px}
.points-currency{display:inline-flex;align-items:center;gap:5px;color:var(--accent-2)}
.points-currency svg{display:none!important}.points-coin-icon{display:inline-grid;place-items:center;width:1.05em;height:1.05em;line-height:1;font-size:1.05em;color:#f5c451;flex:0 0 auto;text-shadow:0 0 8px rgba(245,196,81,.35)}

.points-card h3{font-size:1rem;margin:0 0 6px}.points-card p{font-size:.83rem;color:var(--text-secondary);line-height:1.5;min-height:38px;margin:0 0 14px}
.points-card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px}
.points-price{font-weight:700;font-size:.86rem;white-space:nowrap}
.points-action{border:0;border-radius:999px;padding:8px 13px;background:var(--accent);color:white;font-weight:700;cursor:pointer;font-size:.78rem}
.points-action:disabled{opacity:.55;cursor:not-allowed}
.points-message{min-height:24px;margin:8px 0;color:var(--text-secondary);font-size:.9rem}
.points-section-title{font-size:.76rem;letter-spacing:.12em;text-transform:uppercase;color:var(--text-secondary);margin:24px 0 12px}
.points-ledger{width:100%;border-collapse:collapse}.points-ledger td{padding:12px 8px;border-bottom:1px solid var(--border);font-size:.86rem}.points-ledger td:last-child{text-align:right;font-weight:700}.points-positive{color:#57d6a0}.points-negative{color:#ff8b8b}
.points-note{font-size:.78rem;color:var(--text-secondary);margin:16px 0}
@media(max-width:760px){.points-task-grid,.points-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.points-page{padding:20px 12px 45px}.points-card{padding:13px}}
@media(max-width:460px){.points-task-grid,.points-grid{grid-template-columns:1fr}}
</style>
<div class="points-page">
  <section class="points-hero">
    <div class="points-eyebrow">Play • Contribute • Collect</div>
    <h1>Points Store</h1>
    <p class="points-muted">Earn points by being part of AniVault. Spend them on profile cosmetics and collectibles.</p>
    <div class="points-balance" id="points-balance">${Number(wallet?.balance ?? 0).toLocaleString()} <span style="font-size:.9rem">pts</span></div>
    <p class="points-muted" style="font-size:.82rem">Earned ${Number(wallet?.lifetime_earned ?? 0).toLocaleString()} · Spent ${Number(wallet?.lifetime_spent ?? 0).toLocaleString()}</p>
  </section>
  <div class="points-tabs" role="tablist">
    <button class="points-tab active" data-tab="earn">Earn points</button>
    <button class="points-tab" data-tab="store">Store</button>
    <button class="points-tab" data-tab="inventory">My collection</button>
    <button class="points-tab" data-tab="history">History</button>
  </div>
  <div id="points-message" class="points-message" role="status" aria-live="polite"></div>
  <section class="points-panel active" id="panel-earn">
    <h2 class="points-section-title">Daily tasks</h2>
    <div class="points-task-grid">
      <article class="points-card"><div class="points-icon">${icon('calendar','icon-medium')}</div><h3>Daily check-in</h3><p>Drop by AniVault every day to keep your points growing.</p><div class="points-card-foot"><span class="points-price">+10 pts</span><button class="points-action" data-action="daily" data-task="daily_login" ${claimedTasks.has('daily_login')?'disabled':''}>${claimedTasks.has('daily_login')?'Claimed':'Claim'}</button></div></article>
      <article class="points-card"><div class="points-icon">${icon('user','icon-medium')}</div><h3>Complete your profile</h3><p>Add a profile picture and bio to introduce yourself to the community. One-time reward.</p><div class="points-card-foot"><span class="points-price">+25 pts</span><button class="points-action" data-action="daily" data-task="profile_complete" ${claimedTasks.has('profile_complete')?'disabled':''}>${claimedTasks.has('profile_complete')?'Claimed':'Claim'}</button></div></article>
    </div>
    <h2 class="points-section-title">Community activities</h2>
    <div class="points-task-grid">
      <article class="points-card"><div class="points-icon">${icon('message','icon-medium')}</div><h3>Write a comment</h3><p>Join episode discussions. Earn points for eligible comments, subject to daily limits.</p><div class="points-card-foot"><span class="points-price">+2 pts</span><span class="points-muted" style="font-size:.75rem">In episode chat</span></div></article>
      <article class="points-card"><div class="points-icon">${icon('list','icon-medium')}</div><h3>Add anime to your list</h3><p>Track a new title in your personal anime list. Each title earns points once, with a daily cap.</p><div class="points-card-foot"><span class="points-price">+5 pts</span><span class="points-muted" style="font-size:.75rem">Earn automatically</span></div></article>
      <article class="points-card"><div class="points-icon">${icon('users','icon-medium')}</div><h3>Chat with the community</h3><p>Join the global chat. Eligible messages earn points, with a daily limit to prevent spam.</p><div class="points-card-foot"><span class="points-price">+2 pts</span><span class="points-muted" style="font-size:.75rem">Earn automatically</span></div></article>
      <article class="points-card"><div class="points-icon">${icon('play','icon-medium')}</div><h3>Watch an episode</h3><p>Watch at least 90% of an episode to earn points. Progress is verified from saved playback data.</p><div class="points-card-foot"><span class="points-price">+5 pts</span><span class="points-muted" style="font-size:.75rem">Progress verified</span></div></article>
    </div>
    <p class="points-note">Task rewards may have daily limits to keep the points economy fair.</p>
  </section>
  <section class="points-panel" id="panel-store">
    <h2 class="points-section-title">Redeem rewards</h2>
    <div class="points-grid">${items.map((item:any)=>{const isOwned=owned.has(item.id);return `<article class="points-card">${renderRewardPreview(item)}<h3>${h(item.name)}</h3><p>${h(item.description)}</p><div class="points-card-foot"><span class="points-price points-currency"><span class="points-coin-icon" aria-hidden="true">✦</span> ${Number(item.price).toLocaleString()}</span><button class="points-action" data-action="redeem" data-item="${h(item.id)}" ${isOwned?'disabled':''}>${isOwned?'Owned':'Redeem'}</button></div></article>`}).join('')}</div>
  </section>
  <section class="points-panel" id="panel-inventory">
    <h2 class="points-section-title">My collection</h2>
    ${inventory.length? `<div class="points-grid">${inventory.map((item:any)=>`<article class="points-card">${renderRewardPreview(item)}<h3>${h(item.name||"Unnamed reward")}</h3><p>${h(item.category)} · ${item.equipped?'Currently equipped':'Ready to use'}</p><div class="points-card-foot"><span class="points-muted" style="font-size:.78rem">${item.equipped?'Active cosmetic':'Owned'}</span><button class="points-action" data-action="${item.equipped?'unequip':'equip'}" data-item="${h(item.item_id)}">${item.equipped?'Unequip':'Equip'}</button></div></article>`).join('')}</div>`:'<p class="points-muted">Your collection is empty. Redeem something from the Store to get started!</p>'}
  </section>
  <section class="points-panel" id="panel-history">
    <h2 class="points-section-title">Recent activity</h2>
    ${(await db.fetchAll<any>('SELECT amount,event_type,description,created_at FROM points_ledger WHERE user_id=? ORDER BY id DESC LIMIT 30',[user.id])).length ? `<table class="points-ledger"><tbody>${(await db.fetchAll<any>('SELECT amount,event_type,description,created_at FROM points_ledger WHERE user_id=? ORDER BY id DESC LIMIT 30',[user.id])).map((row:any)=>`<tr><td><strong>${h(row.description||row.event_type)}</strong><br><span class="points-muted">${h(String(row.created_at||''))}</span></td><td class="${row.amount>0?'points-positive':'points-negative'}">${row.amount>0?'+':''}${row.amount} pts</td></tr>`).join('')}</tbody></table>`:'<p class="points-muted">Your points activity will appear here.</p>'}
  </section>
</div>
<script>
(function(){
 const root=document.querySelector('.points-page');if(!root)return;
 const message=document.getElementById('points-message');
 root.querySelectorAll('.points-tab').forEach(btn=>btn.addEventListener('click',()=>{root.querySelectorAll('.points-tab').forEach(b=>b.classList.toggle('active',b===btn));root.querySelectorAll('.points-panel').forEach(p=>p.classList.toggle('active',p.id==='panel-'+btn.dataset.tab));}));
 root.addEventListener('click',async e=>{const btn=e.target.closest('[data-action]');if(!btn||btn.disabled)return;const action=btn.dataset.action;btn.disabled=true;message.textContent='Working…';try{const res=await fetch('/api/points',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,task:btn.dataset.task,item_id:btn.dataset.item})});const data=await res.json();if(!res.ok||!data.success)throw new Error(data.message||'Could not complete that action.');message.textContent=data.message||'Saved!';if(data.wallet)document.getElementById('points-balance').innerHTML=Number(data.wallet.balance).toLocaleString()+' <span style="font-size:.9rem">pts</span>';setTimeout(()=>location.reload(),500);}catch(err){message.textContent=err.message||'Something went wrong.';btn.disabled=false;}});
})();
</script>`;
  html += renderFooter({siteUrl:c.env.SITE_URL,currentUser});
  await session.save(c,lifetime);
  return c.html(html);
});
