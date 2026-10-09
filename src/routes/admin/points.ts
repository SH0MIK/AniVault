import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { awardPoints } from '../../lib/points';
import { Notification } from '../../lib/notification';
import { Logger } from '../../lib/logger';
import { h } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';

export const adminPointsRoutes = new Hono<{ Bindings: Env }>();

async function eligibleCounts(db: any) {
  const queries = [
    `WITH ranked AS (
       SELECT a.id,a.user_id,ROW_NUMBER() OVER(PARTITION BY a.user_id ORDER BY COALESCE(a.created_at,''),a.id) rn
       FROM anime_list a JOIN users valid_user ON valid_user.id=a.user_id
       WHERE a.user_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM points_ledger p WHERE p.user_id=a.user_id AND p.event_key='add_anime:'||a.anime_id
       )
     ) SELECT COUNT(*) AS cnt FROM ranked WHERE rn<=100 AND NOT EXISTS (SELECT 1 FROM points_ledger old WHERE old.user_id=ranked.user_id AND old.event_key='legacy:list:'||ranked.id)`,
    `WITH ranked AS (
       SELECT w.id,w.user_id,ROW_NUMBER() OVER(PARTITION BY w.user_id ORDER BY COALESCE(w.watched_at,''),w.id) rn
       FROM watch_history w JOIN users valid_user ON valid_user.id=w.user_id
       WHERE w.user_id IS NOT NULL AND w.episode_duration>=30 AND w.watch_time>=CAST(w.episode_duration*0.8 AS INTEGER)
       AND NOT EXISTS (SELECT 1 FROM points_ledger p WHERE p.user_id=w.user_id AND p.event_key='watch:'||w.anime_id||':'||w.episode_num)
     ) SELECT COUNT(*) AS cnt FROM ranked WHERE rn<=100 AND NOT EXISTS (SELECT 1 FROM points_ledger old WHERE old.user_id=ranked.user_id AND old.event_key='legacy:watch:'||ranked.id)`,
    `WITH ranked AS (
       SELECT a.id,a.user_id,ROW_NUMBER() OVER(PARTITION BY a.user_id ORDER BY COALESCE(a.created_at,''),a.id) rn
       FROM anime_comments a JOIN users valid_user ON valid_user.id=a.user_id WHERE a.user_id IS NOT NULL AND a.is_deleted=0 AND LENGTH(TRIM(a.body))>=8
       AND NOT EXISTS (SELECT 1 FROM points_ledger p WHERE p.user_id=a.user_id AND p.event_key='comment:'||a.id)
     ) SELECT COUNT(*) AS cnt FROM ranked WHERE rn<=50 AND NOT EXISTS (SELECT 1 FROM points_ledger old WHERE old.user_id=ranked.user_id AND old.event_key='legacy:comment:'||ranked.id)`,
    `WITH ranked AS (
       SELECT m.id,m.user_id,ROW_NUMBER() OVER(PARTITION BY m.user_id ORDER BY COALESCE(m.created_at,''),m.id) rn
       FROM chat_messages m JOIN users valid_user ON valid_user.id=m.user_id WHERE m.user_id IS NOT NULL AND LENGTH(TRIM(m.message))>=8
       AND NOT EXISTS (SELECT 1 FROM points_ledger p WHERE p.user_id=m.user_id AND p.event_key='chat:'||m.id)
     ) SELECT COUNT(*) AS cnt FROM ranked WHERE rn<=50 AND NOT EXISTS (SELECT 1 FROM points_ledger old WHERE old.user_id=ranked.user_id AND old.event_key='legacy:chat:'||ranked.id)`
  ];
  const rows = await Promise.all(queries.map((q:string)=>db.fetchOne<{cnt:number}>(q)));
  return { anime:Number(rows[0]?.cnt||0), episodes:Number(rows[1]?.cnt||0), comments:Number(rows[2]?.cnt||0), chat:Number(rows[3]?.cnt||0) };
}

adminPointsRoutes.on(['GET','POST'], '/admin/points.php', async c => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const {db,session,lifetime,userId,isOwner,impersonating} = ctx;
  let flashSuccess = '';
  let flashError = '';

  if (c.req.method === 'POST') {
    const body = await c.req.parseBody();
    const action = String(body.action ?? '');
    if (action === 'gift') {
      const targetId = Math.max(0,parseInt(String(body.user_id ?? '0'),10)||0);
      const amount = parseInt(String(body.amount ?? '0'),10)||0;
      const reason = String(body.reason ?? '').trim().slice(0,160);
      const target = targetId ? await db.fetchOne<{id:number;username:string}>('SELECT id,username FROM users WHERE id=? AND is_active=1',[targetId]) : null;
      if (!target) flashError = 'Select a valid active user.';
      else if (!Number.isInteger(amount) || amount < 1 || amount > 1000000) flashError = 'Points must be between 1 and 1,000,000.';
      else if (!reason) flashError = 'Add a short reason so the user knows why they received the gift.';
      else {
        const key = 'admin_gift:' + crypto.randomUUID();
        const ok = await awardPoints(db,target.id,amount,'admin_gift',key,'Admin gift: '+reason);
        if (!ok) flashError = 'Could not add points. Please try again.';
        else {
          const entry = await db.fetchOne<{id:number}>('SELECT id FROM points_ledger WHERE user_id=? AND event_key=?',[target.id,key]);
          await Notification.create(db,target.id,userId,'points_gift',entry?.id??null,amount.toLocaleString('en-US')+' points — '+reason);
          await Logger.log(db,userId,'admin_points_gift',`Gifted ${amount} points to user ${target.id} (${target.username}): ${reason}`);
          flashSuccess = `Gifted ${amount.toLocaleString('en-US')} points to ${target.username}. A notification was sent.`;
        }
      }
    } else if (action === 'legacy_backfill') {
      try {
        const statements = [
          `WITH ranked AS (
             SELECT a.id,a.user_id,a.anime_id,ROW_NUMBER() OVER(PARTITION BY a.user_id ORDER BY COALESCE(a.created_at,''),a.id) rn
             FROM anime_list a JOIN users valid_user ON valid_user.id=a.user_id WHERE a.user_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM points_ledger p WHERE p.user_id=a.user_id AND p.event_key='add_anime:'||a.anime_id)
           )
           INSERT OR IGNORE INTO points_ledger(user_id,amount,balance_after,event_type,event_key,description)
           SELECT user_id,5,0,'legacy_list','legacy:list:'||id,'Legacy reward: anime in your list' FROM ranked WHERE rn<=100`,
          `WITH ranked AS (
             SELECT w.id,w.user_id,w.anime_id,w.episode_num,ROW_NUMBER() OVER(PARTITION BY w.user_id ORDER BY COALESCE(w.watched_at,''),w.id) rn
             FROM watch_history w JOIN users valid_user ON valid_user.id=w.user_id WHERE w.user_id IS NOT NULL AND w.episode_duration>=30 AND w.watch_time>=CAST(w.episode_duration*0.8 AS INTEGER)
             AND NOT EXISTS (SELECT 1 FROM points_ledger p WHERE p.user_id=w.user_id AND p.event_key='watch:'||w.anime_id||':'||w.episode_num)
           )
           INSERT OR IGNORE INTO points_ledger(user_id,amount,balance_after,event_type,event_key,description)
           SELECT user_id,5,0,'legacy_watch','legacy:watch:'||id,'Legacy reward: watched episode' FROM ranked WHERE rn<=100`,
          `WITH ranked AS (
             SELECT a.id,a.user_id,ROW_NUMBER() OVER(PARTITION BY a.user_id ORDER BY COALESCE(a.created_at,''),a.id) rn
             FROM anime_comments a JOIN users valid_user ON valid_user.id=a.user_id WHERE a.user_id IS NOT NULL AND a.is_deleted=0 AND LENGTH(TRIM(a.body))>=8
             AND NOT EXISTS (SELECT 1 FROM points_ledger p WHERE p.user_id=a.user_id AND p.event_key='comment:'||a.id)
           )
           INSERT OR IGNORE INTO points_ledger(user_id,amount,balance_after,event_type,event_key,description)
           SELECT user_id,2,0,'legacy_comment','legacy:comment:'||id,'Legacy reward: episode comment' FROM ranked WHERE rn<=50`,
          `WITH ranked AS (
             SELECT m.id,m.user_id,ROW_NUMBER() OVER(PARTITION BY m.user_id ORDER BY COALESCE(m.created_at,''),m.id) rn
             FROM chat_messages m JOIN users valid_user ON valid_user.id=m.user_id WHERE m.user_id IS NOT NULL AND LENGTH(TRIM(m.message))>=8
             AND NOT EXISTS (SELECT 1 FROM points_ledger p WHERE p.user_id=m.user_id AND p.event_key='chat:'||m.id)
           )
           INSERT OR IGNORE INTO points_ledger(user_id,amount,balance_after,event_type,event_key,description)
           SELECT user_id,2,0,'legacy_chat','legacy:chat:'||id,'Legacy reward: community chat message' FROM ranked WHERE rn<=50`
        ];
        let inserted = 0;
        for (const sql of statements) {
          const result = await db.query(sql);
          inserted += Number(result.meta.changes ?? 0);
        }
        // Rebuild wallet totals from the ledger so the newly inserted historical
        // entries are reflected exactly once, even if this action is retried.
        await db.query('INSERT OR IGNORE INTO points_wallets(user_id) SELECT DISTINCT user_id FROM points_ledger');
        await db.query(`WITH totals AS (
          SELECT user_id,SUM(amount) AS balance,
            SUM(CASE WHEN amount>0 THEN amount ELSE 0 END) AS earned,
            SUM(CASE WHEN amount<0 THEN -amount ELSE 0 END) AS spent
          FROM points_ledger GROUP BY user_id
        )
        UPDATE points_wallets SET
          balance=MAX(0,COALESCE((SELECT balance FROM totals WHERE totals.user_id=points_wallets.user_id),0)),
          lifetime_earned=COALESCE((SELECT earned FROM totals WHERE totals.user_id=points_wallets.user_id),0),
          lifetime_spent=COALESCE((SELECT spent FROM totals WHERE totals.user_id=points_wallets.user_id),0),
          updated_at=datetime('now')`);
        await db.query(`WITH running AS (
          SELECT id,SUM(amount) OVER(PARTITION BY user_id ORDER BY id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance_after
          FROM points_ledger
        )
        UPDATE points_ledger SET balance_after=(SELECT balance_after FROM running WHERE running.id=points_ledger.id)`);
        await Logger.log(db,userId,'admin_points_legacy_backfill',`Legacy points backfill inserted ${inserted} activity rewards.`);
        flashSuccess = inserted
          ? `Legacy rewards credited! Added ${inserted.toLocaleString('en-US')} historical activity rewards. Running it again will not duplicate credits.`
          : 'No new legacy rewards were needed — eligible activity was already credited.';
      } catch (err) {
        console.error('[admin-points] legacy backfill failed',err);
        flashError = 'Legacy rewards could not finish. Check the Worker logs before retrying.';
      }
    }
    await session.save(c,lifetime);
  }

  const search = (c.req.query('search') ?? '').trim().slice(0,80);
  const matches = search ? await db.fetchAll<any>(
    'SELECT id,username,email,role FROM users WHERE username LIKE ? OR email LIKE ? OR CAST(id AS TEXT)=? ORDER BY id DESC LIMIT 12',
    ['%'+search+'%','%'+search+'%',search]
  ) : [];
  const totals = await db.fetchOne<any>(`SELECT COUNT(*) AS users,
    COALESCE(SUM(balance),0) AS points_in_wallets FROM points_wallets`);
  const pending = await eligibleCounts(db).catch(()=>({anime:0,episodes:0,comments:0,chat:0}));
  const previewPoints = pending.anime*5 + pending.episodes*5 + pending.comments*2 + pending.chat*2;
  let html = renderAdminHeader({siteUrl,pageTitle:'Points Manager',adminPage:'points',isOwner,impersonating});
  html += `
<style>
.pm-wrap{max-width:1100px;margin:0 auto}.pm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.pm-card{background:var(--bg-card,#17181c);border:1px solid var(--border,#2b2c32);border-radius:14px;padding:20px;margin-bottom:18px}.pm-card h2{margin:0 0 8px;font-size:1.12rem}.pm-muted{color:var(--text-muted,#999);font-size:.86rem;line-height:1.55}.pm-field{display:block;width:100%;margin:6px 0 14px}.pm-field input,.pm-field select{width:100%;box-sizing:border-box}.pm-user{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border,#2b2c32)}.pm-user label{display:flex;gap:9px;align-items:center;width:100%;cursor:pointer}.pm-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}.pm-stat{background:rgba(124,58,237,.08);border:1px solid var(--border,#2b2c32);padding:12px;border-radius:10px}.pm-stat strong{display:block;font-size:1.3rem}.pm-stat span{font-size:.75rem;color:var(--text-muted,#999)}@media(max-width:800px){.pm-grid{grid-template-columns:1fr}.pm-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
<div class="admin-header"><div><h1>✨ Points Manager</h1><p class="text-muted">Gift points to a user and grant one-time rewards for eligible legacy activity.</p></div></div>
<div class="pm-wrap">
${flashSuccess ? `<div class="alert alert-success mb-2">✅ ${h(flashSuccess)}</div>` : ''}
${flashError ? `<div class="alert alert-error mb-2">⚠️ ${h(flashError)}</div>` : ''}
<div class="pm-stats">
 <div class="pm-stat"><strong>${Number(totals?.users||0).toLocaleString('en-US')}</strong><span>Wallets</span></div>
 <div class="pm-stat"><strong>${Number(totals?.points_in_wallets||0).toLocaleString('en-US')}</strong><span>Points in wallets</span></div>
 <div class="pm-stat"><strong>${previewPoints.toLocaleString('en-US')}</strong><span>Estimated legacy points</span></div>
 <div class="pm-stat"><strong>${(pending.anime+pending.episodes+pending.comments+pending.chat).toLocaleString('en-US')}</strong><span>Eligible legacy actions</span></div>
</div>
<div class="pm-grid">
 <section class="pm-card">
  <h2>🎁 Gift points</h2><p class="pm-muted">Choose a user, set the amount, and include a reason. The user receives an in-app notification and push notification when available.</p>
  <form method="GET" action="points.php" style="margin:14px 0">
   <label class="pm-field">Find user by username, email, or ID<input class="form-control" name="search" value="${h(search)}" placeholder="e.g. Shomik" required></label>
   <button class="btn btn-ghost" type="submit">Search users</button>
  </form>
  ${search ? `<form method="POST"><input type="hidden" name="action" value="gift">
    <div class="pm-muted" style="margin-bottom:8px">Select the recipient:</div>
    ${matches.map((u:any)=>`<label class="pm-user"><input type="radio" name="user_id" value="${u.id}" required><span><strong>${h(u.username)}</strong><br><small class="pm-muted">ID ${u.id} · ${h(u.email)} · ${h(u.role)}</small></span></label>`).join('') || '<p class="pm-muted">No users matched that search.</p>'}
    <label class="pm-field">Points to gift<input class="form-control" type="number" name="amount" min="1" max="1000000" value="100" required></label>
    <label class="pm-field">Reason shown in notification<input class="form-control" name="reason" maxlength="160" placeholder="Thanks for supporting AniVault!" required></label>
    <button class="btn btn-primary" type="submit" ${matches.length?'':'disabled'}>Gift points & notify</button>
   </form>` : '<p class="pm-muted">Search for a user to show recipients here.</p>'}
 </section>
 <section class="pm-card">
  <h2>🕰️ Legacy activity rewards</h2><p class="pm-muted">One-time backfill for older activity already stored in AniVault. Existing point awards are excluded and each historical event gets a unique ledger key, so repeated runs cannot double-credit it.</p>
  <div class="pm-user"><span style="flex:1">Anime list entries <small class="pm-muted">(up to 100 per user)</small></span><strong>+5 each</strong></div>
  <div class="pm-user"><span style="flex:1">Episodes watched at least 80% <small class="pm-muted">(up to 100 per user)</small></span><strong>+5 each</strong></div>
  <div class="pm-user"><span style="flex:1">Non-deleted episode comments <small class="pm-muted">(up to 50 per user)</small></span><strong>+2 each</strong></div>
  <div class="pm-user"><span style="flex:1">Substantial chat messages <small class="pm-muted">(up to 50 per user)</small></span><strong>+2 each</strong></div>
  <p class="pm-muted" style="margin:14px 0">Estimated total: <strong>${previewPoints.toLocaleString('en-US')} points</strong> across ${(pending.anime+pending.episodes+pending.comments+pending.chat).toLocaleString('en-US')} eligible actions.</p>
  <form method="POST" onsubmit="return confirm('Credit the eligible legacy activity shown here? Each activity is only rewarded once.');">
   <input type="hidden" name="action" value="legacy_backfill">
   <button class="btn btn-primary" type="submit">Reward all eligible legacy activity</button>
  </form>
  <p class="pm-muted" style="margin-top:12px">The backfill does not send one notification per historical action. Admin gifts do notify each recipient.</p>
 </section>
</div>
</div>`;
  html += renderAdminFooter(siteUrl);
  await session.save(c,lifetime);
  return c.html(html);
});
