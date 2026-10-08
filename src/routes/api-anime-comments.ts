import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { AnimeComments, AnimeCommentRow } from '../lib/anime-comments';
import { Notification } from '../lib/notification';
import { timeAgo, h } from '../lib/helpers';

export const apiAnimeCommentsRoutes = new Hono<{Bindings:Env}>();

async function ctx(c:any){
  const db=new Db(c.env.DB);
  const lifetime=Number(c.env.SESSION_LIFETIME_SECONDS??86400);
  const session=await Session.load(c,db,lifetime);
  const auth=new Auth(db,session,c.env as any,c.req.header('cf-connecting-ip')??'unknown');
  return {db,session,lifetime,auth};
}

function serialize(r:AnimeCommentRow,userId:number,isAdmin:boolean){
  return {
    id:r.id, anime_id:r.anime_id, episode_num:r.episode_num, user_id:r.user_id, parent_id:r.parent_id,
    username:h(r.username), avatar_url:r.avatar_url, role:r.role, body:r.is_deleted?'':h(r.body),
    deleted:!!r.is_deleted, likes:Number(r.likes||0), dislikes:Number(r.dislikes||0), my_vote:Number(r.my_vote||0),
    mine:r.user_id===userId, can_delete:r.user_id===userId||isAdmin,
    time:(timeAgo(r.created_at).replace(/<[^>]*>/g,'')),
    badge:r.role==='owner'?'OWNER':r.role==='admin'?'ADMIN':null
  };
}

async function all(db:Db,animeId:number,episodeNum:number,userId:number,isAdmin:boolean){
  const rows=await AnimeComments.list(db,animeId,episodeNum,userId);
  return rows.map(r=>serialize(r,userId,isAdmin));
}

apiAnimeCommentsRoutes.on(['GET','POST'],'/api/anime-comments',async c=>{
  try{
  const {db,session,lifetime,auth}=await ctx(c);
  let body:Record<string,unknown>={};
  if(c.req.method==='POST'){
    const ct=c.req.header('content-type')??'';
    if(ct.includes('application/json')) body=await c.req.json().catch(()=>({}));
    else body=await c.req.parseBody();
  }
  const get=(k:string)=>String(c.req.query(k)??body[k]??'');
  const action=get('action');
  let animeId=parseInt(get('anime_id'),10)||0;
  let episodeNum=parseInt(get('episode'),10)||0;
  // Gracefully recover identifiers from the watch-page referrer for older
  // cached clients that may still issue the comments GET without query params.
  if((!animeId||!episodeNum) && c.req.method==='GET'){
    try{
      const ref=c.req.header('referer')||c.req.header('referrer')||'';
      if(ref){
        const u=new URL(ref);
        animeId=animeId||parseInt(u.searchParams.get('anime')||'',10)||0;
        episodeNum=episodeNum||parseInt(u.searchParams.get('ep')||'',10)||0;
      }
    }catch{}
  }
  if(!animeId||!episodeNum)return c.json({success:false,message:'Invalid anime or episode.'},400);

  const writes=new Set(['send','vote','delete']);
  if(writes.has(action)&&!auth.check()){
    await session.save(c,lifetime);
    return c.json({success:false,message:'Please log in to comment.'},401);
  }

  const userId=session.user_id??0;
  const isAdmin=auth.check()&&auth.isAdmin();

  if(action==='get') return c.json({success:true,comments:await all(db,animeId,episodeNum,userId,isAdmin)});

  if(action==='send'){
    const text=get('message');
    const parentId=parseInt(get('parent_id'),10)||undefined;
    const sent=await AnimeComments.create(db,userId,animeId,episodeNum,text,parentId);
    if(!sent.success)return c.json({success:false,message:sent.error},400);

    if(parentId){
      const parent=await db.fetchOne<{user_id:number}>('SELECT user_id FROM anime_comments WHERE id=?',[parentId]);
      if(parent&&parent.user_id!==userId) await Notification.create(db,parent.user_id,userId,'comment_reply',sent.row?.id??null,text.slice(0,80));
    }
    return c.json({success:true,comments:await all(db,animeId,episodeNum,userId,isAdmin)});
  }

  if(action==='vote'){
    const id=parseInt(get('comment_id'),10)||0;
    const vote=parseInt(get('vote'),10);
    if(!id||(vote!==1&&vote!==-1))return c.json({success:false,message:'Invalid vote.'},400);
    const own=await db.fetchOne<{anime_id:number;episode_num:number;is_deleted:number}>('SELECT anime_id,episode_num,is_deleted FROM anime_comments WHERE id=?',[id]);
    if(!own||own.anime_id!==animeId||own.episode_num!==episodeNum||own.is_deleted)return c.json({success:false,message:'Comment not found.'},404);
    await AnimeComments.vote(db,userId,id,vote as 1|-1);
    return c.json({success:true,comments:await all(db,animeId,episodeNum,userId,isAdmin)});
  }

  if(action==='delete'){
    const id=parseInt(get('comment_id'),10)||0;
    const ok=await AnimeComments.delete(db,userId,id,isAdmin);
    return c.json({success:ok,comments:await all(db,animeId,episodeNum,userId,isAdmin)});
  }

  return c.json({success:false,message:'Unknown action.'},400);
  }catch(err){
    console.error('[anime-comments]',err);
    return c.json({success:false,message:'Comments are temporarily unavailable.'},500);
  }
});
