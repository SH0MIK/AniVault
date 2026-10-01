import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { resolveLuluStream } from '../lib/lulustream-resolver';

export const luluStreamApiRoutes = new Hono<{ Bindings: Env }>();

function proxy(origin: string, url: string): string {
  return origin + '/admin/lulustream_proxy.php?url=' + encodeURIComponent(url);
}

luluStreamApiRoutes.get('/api/lulustream_stream.php', async (c) => {
  const db=new Db(c.env.DB);
  const lifetime=Number(c.env.SESSION_LIFETIME_SECONDS||86400);
  const session=await Session.load(c,db,lifetime);
  const auth=new Auth(db,session,c.env as any,c.req.header('cf-connecting-ip')||'unknown');
  if(!auth.check()){await session.save(c,lifetime);return c.json({error:'Unauthorized'},401);}
  const id=Number(c.req.query('id')||0);
  if(!id){await session.save(c,lifetime);return c.json({error:'Missing id'},400);}
  const row=await db.fetchOne<any>('SELECT * FROM lulustream_servers WHERE id=? AND is_active=1',[id]);
  if(!row){await session.save(c,lifetime);return c.json({error:'LuluStream server not found'},404);}
  const result=await resolveLuluStream(String(row.embed_url));
  if(!result){await session.save(c,lifetime);return c.json({error:'LuluStream resolve failed'},502);}
  const origin=new URL(c.req.url).origin;
  await session.save(c,lifetime);
  return c.json({
    id:row.id, label:row.label, embedUrl:result.embedUrl,
    m3u8:proxy(origin,result.video.url),
    rawM3u8:result.video.url,
    subtitles:(result.subtitles||[]).map((s:any)=>({lang:s.lang,url:proxy(origin,s.url)})),
    audios:(result.audioTracks||[]).map((a:any)=>({lang:a.lang,name:a.name,groupId:a.groupId,url:a.url})),
    type:result.video.type, title:result.title||''
  });
});