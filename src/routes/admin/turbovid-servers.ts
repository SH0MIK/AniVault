import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { h } from '../../lib/helpers';
import { MalAPI } from '../../lib/mal-api';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';
import { renderTurboVidAdmin } from '../../render/admin-turbovid';

export const adminTurbovidServerRoutes = new Hono<{ Bindings: Env }>();

adminTurbovidServerRoutes.get('/admin/turbovid_servers.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating } = ctx;
  const selectedAnime = Number(c.req.query('anime') || 0) || 0;
  const json = c.req.query('json') === '1';
  if (json) {
    const anime = Number(c.req.query('anime') || 0);
    const episode = Number(c.req.query('episode') || 0);
    if (!anime || !episode) return c.json({ error: 'Missing anime or episode' }, 400);
    const rows = await db.fetchAll<any>(
      `SELECT id, anime_id, episode_num, audio_group, language, label, embed_url, is_active, updated_at
         FROM turbovid_servers WHERE anime_id=? AND episode_num=? ORDER BY audio_group, language, id`,
      [anime, episode]
    );
    return c.json({ success:true, sources:rows });
  }

  const seriesRows = await db.fetchAll<any>(
    `SELECT anime_id, COUNT(DISTINCT episode_num) AS episode_count, COUNT(*) AS source_count, MAX(updated_at) AS last_updated
       FROM turbovid_servers WHERE is_active=1 GROUP BY anime_id ORDER BY MAX(updated_at) DESC`
  );
  const mal = new MalAPI(c.env as any, c.env.API_CACHE, db);
  const series = await Promise.all(seriesRows.map(async (row:any) => {
    try {
      const a = (await mal.getAnime(Number(row.anime_id), true)).data;
      return {...row, title:a?.title || `Anime #${row.anime_id}`, image:a?.images?.jpg?.large_image_url || a?.images?.jpg?.image_url || '', totalEps:Number(a?.episodes || 0), status:a?.status || '', type:a?.type || ''};
    } catch {
      return {...row, title:`Anime #${row.anime_id}`, image:'', totalEps:0, status:'', type:''};
    }
  }));
  const selected = selectedAnime ? series.find((s:any)=>Number(s.anime_id)===selectedAnime) || null : null;
  const episodes = selectedAnime ? await db.fetchAll<any>(
    `SELECT episode_num, COUNT(*) AS source_count,
            GROUP_CONCAT(audio_group || CASE WHEN language != '' THEN ' · ' || language ELSE '' END, ' | ') AS sources,
            MAX(updated_at) AS updated_at
       FROM turbovid_servers WHERE anime_id=? AND is_active=1
      GROUP BY episode_num ORDER BY episode_num DESC`,
    [selectedAnime]
  ) : [];

  let html = renderAdminHeader({siteUrl,pageTitle:'TurboVid Servers',adminPage:'turbovid_servers',isOwner,impersonating});
  html += renderTurboVidAdmin({siteUrl,series,selected,episodes,selectedAnime});
  html += renderAdminFooter(siteUrl);
  await session.save(c,lifetime);
  return c.html(html);
});

async function adminOnly(c:any){ return await buildAdminCtx(c); }

adminTurbovidServerRoutes.post('/admin/turbovid_servers.php', async (c) => {
  const ctx=await adminOnly(c); if(!ctx)return c.json({error:'Forbidden'},403);
  const body:any=await c.req.json().catch(()=>null);
  const sourceId=Number(body?.id||0),animeId=Number(body?.anime_id||0),ep=Number(body?.episode_num||0),group=String(body?.audio_group||''),lang=String(body?.language||'').trim(),url=String(body?.embed_url||'').trim();
  if(!animeId||!ep||!/^https?:\/\//i.test(url)||!['sub','dub','hindi','multi'].includes(group)||(group==='multi'&&!lang))return c.json({error:'Invalid source data'},400);
  const label=group==='multi'?'AV-'+lang:group==='sub'?'AV-sub':group==='hindi'?'AV-hindi':'AV-dub';
  if(sourceId){
    await ctx.db.query("UPDATE turbovid_servers SET anime_id=?,episode_num=?,audio_group=?,language=?,label=?,embed_url=?,is_active=?,updated_at=datetime('now') WHERE id=?",[animeId,ep,group,lang,label,url,Number(body?.is_active?1:0),sourceId]);
  } else {
    await ctx.db.query("INSERT INTO turbovid_servers (anime_id,episode_num,audio_group,language,label,embed_url,is_active,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(anime_id,episode_num,audio_group,language) DO UPDATE SET label=excluded.label,embed_url=excluded.embed_url,is_active=excluded.is_active,updated_at=datetime('now')",[animeId,ep,group,lang,label,url,Number(body?.is_active?1:0)]);
  }
  return c.json({success:true});
});

adminTurbovidServerRoutes.delete('/admin/turbovid_servers.php', async (c) => {
  const ctx=await adminOnly(c); if(!ctx)return c.json({error:'Forbidden'},403);
  const id=Number(c.req.query('id')||0); if(!id)return c.json({error:'Missing id'},400);
  await ctx.db.query('DELETE FROM turbovid_servers WHERE id=?',[id]); return c.json({success:true});
});
