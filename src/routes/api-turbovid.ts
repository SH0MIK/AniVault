import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { resolveTurbovidCF } from '../lib/turbovid-resolver-cf';

export const turbovidApiRoutes = new Hono<{ Bindings: Env }>();

turbovidApiRoutes.get('/api/turbovid_stream.php', async (c) => {
  const db=new Db(c.env.DB);
  const lifetime=Number(c.env.SESSION_LIFETIME_SECONDS||86400);
  const session=await Session.load(c,db,lifetime);
  const auth=new Auth(db,session,c.env as any,c.req.header('cf-connecting-ip')||'unknown');
  if(!auth.check()){await session.save(c,lifetime);return c.json({error:'Unauthorized'},401);}
  const id=Number(c.req.query('id')||0);
  if(!id){await session.save(c,lifetime);return c.json({error:'Missing id'},400);}
  const row=await db.fetchOne<any>('SELECT * FROM turbovid_servers WHERE id=? AND is_active=1',[id]);
  if(!row){await session.save(c,lifetime);return c.json({error:'TurboVid server not found'},404);}
  const result=await resolveTurbovidCF(String(row.embed_url));
  if(!result){await session.save(c,lifetime);return c.json({error:'TurboVid resolve failed'},502);}
  const base=new URL(c.req.url);
  const hlsProxy=base.origin+'/admin/turbovid_hls_proxy.php';
  const subProxy=base.origin+'/admin/turbovid_subtitle_proxy.php';
  await session.save(c,lifetime);
  return c.json({id:row.id,group:row.audio_group,language:row.language,label:row.label,embedUrl:result.embedUrl,m3u8:result.m3u8,videoUrl:result.videoUrl,videoProxyUrl:result.videoUrl?hlsProxy+'?url='+encodeURIComponent(result.videoUrl)+'&ref='+encodeURIComponent(result.referer):null,hlsProxyUrl:result.m3u8?hlsProxy+'?url='+encodeURIComponent(result.m3u8)+'&ref='+encodeURIComponent(result.referer):null,subtitles:result.subtitles.map(s=>({lang:s.lang,url:s.url})),poster:result.poster,title:result.title,type:result.type});
});