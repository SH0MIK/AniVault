import { Db } from './db';

export interface AnimeCommentRow {
  id:number; anime_id:number; episode_num:number; user_id:number; parent_id:number|null;
  body:string; is_deleted:number; created_at:string; updated_at:string;
  username:string; avatar_url:string|null; role:string; likes:number; dislikes:number; my_vote:number;
}

const MAX_BODY = 1000;
const MIN_INTERVAL_MS = 2000;

const SELECT = 'SELECT c.id,c.anime_id,c.episode_num,c.user_id,c.parent_id,c.body,c.is_deleted,c.created_at,c.updated_at,' +
  'u.username,u.avatar_url,u.role,' +
  'COALESCE((SELECT COUNT(*) FROM anime_comment_votes v WHERE v.comment_id=c.id AND v.vote=1),0) AS likes,' +
  'COALESCE((SELECT COUNT(*) FROM anime_comment_votes v WHERE v.comment_id=c.id AND v.vote=-1),0) AS dislikes,' +
  'COALESCE((SELECT vote FROM anime_comment_votes v WHERE v.comment_id=c.id AND v.user_id=?),0) AS my_vote ' +
  'FROM anime_comments c JOIN users u ON u.id=c.user_id';

export const AnimeComments = {
  async list(db:Db, animeId:number, episodeNum:number, userId=0):Promise<AnimeCommentRow[]> {
    return db.fetchAll<AnimeCommentRow>(SELECT + ' WHERE c.anime_id=? AND c.episode_num=? ORDER BY c.created_at ASC,c.id ASC LIMIT 300',[userId,animeId,episodeNum]);
  },
  async create(db:Db,userId:number,animeId:number,episodeNum:number,body:string,parentId?:number) {
    const text=body.trim();
    if(!text) return {success:false,error:'Comment cannot be empty.'};
    if(text.length>MAX_BODY) return {success:false,error:'Comment is too long (max '+MAX_BODY+' characters).'};
    const last=await db.fetchOne<{created_at:string}>('SELECT created_at FROM anime_comments WHERE user_id=? ORDER BY id DESC LIMIT 1',[userId]);
    if(last){const ms=new Date(last.created_at.replace(' ','T')+'Z').getTime();if(!Number.isNaN(ms)&&Date.now()-ms<MIN_INTERVAL_MS)return {success:false,error:'You are posting too quickly — slow down a little.'};}
    let parent:number|null=null;
    if(parentId){
      const p=await db.fetchOne<{id:number;anime_id:number;episode_num:number;is_deleted:number}>('SELECT id,anime_id,episode_num,is_deleted FROM anime_comments WHERE id=?',[parentId]);
      if(!p||p.anime_id!==animeId||p.episode_num!==episodeNum||p.is_deleted)return {success:false,error:'That comment is no longer available.'};
      parent=p.id;
    }
    const id=await db.insert('INSERT INTO anime_comments(anime_id,episode_num,user_id,parent_id,body) VALUES(?,?,?,?,?)',[animeId,episodeNum,userId,parent,text]);
    const row=await db.fetchOne<AnimeCommentRow>(SELECT + ' WHERE c.id=?',[userId,id]);
    return {success:true,row};
  },
  async vote(db:Db,userId:number,commentId:number,vote:1|-1){
    const exists=await db.fetchOne<{vote:number}>('SELECT vote FROM anime_comment_votes WHERE comment_id=? AND user_id=?',[commentId,userId]);
    if(!exists) await db.query('INSERT INTO anime_comment_votes(comment_id,user_id,vote) VALUES(?,?,?)',[commentId,userId,vote]);
    else if(exists.vote===vote) await db.query('DELETE FROM anime_comment_votes WHERE comment_id=? AND user_id=?',[commentId,userId]);
    else await db.query("UPDATE anime_comment_votes SET vote=?,created_at=datetime('now') WHERE comment_id=? AND user_id=?",[vote,commentId,userId]);
  },
  async delete(db:Db,userId:number,commentId:number,isAdmin:boolean){
    const r=isAdmin
      ? await db.query("UPDATE anime_comments SET is_deleted=1,body='',updated_at=datetime('now') WHERE id=?",[commentId])
      : await db.query("UPDATE anime_comments SET is_deleted=1,body='',updated_at=datetime('now') WHERE id=? AND user_id=?",[commentId,userId]);
    return (r.meta.changes??0)>0;
  }
};
