// Full port of includes/follow.php.
import { Db } from './db';
import { Logger } from './logger';
import { Notification } from './notification';

export interface FollowUserRow {
  [key: string]: unknown;
  id: number;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
}

export const Follow = {
  async toggle(db: Db, followerId: number, followingId: number): Promise<{ success: boolean; following?: boolean; message: string }> {
    if (followerId === followingId) return { success: false, message: "You can't follow yourself." };

    const exists = await db.fetchOne('SELECT id FROM follows WHERE follower_id=? AND following_id=?', [followerId, followingId]);
    if (exists) {
      await db.query('DELETE FROM follows WHERE follower_id=? AND following_id=?', [followerId, followingId]);
      await Logger.log(db, followerId, 'unfollow', `Unfollowed user ${followingId}`);
      return { success: true, following: false, message: 'Unfollowed.' };
    }

    await db.insert('INSERT INTO follows (follower_id, following_id) VALUES (?,?)', [followerId, followingId]);
    await Logger.log(db, followerId, 'follow', `Followed user ${followingId}`);
    await Notification.create(db, followingId, followerId, 'follow');
    return { success: true, following: true, message: 'Following!' };
  },

  async isFollowing(db: Db, followerId: number, followingId: number): Promise<boolean> {
    if (followerId === followingId) return false;
    const row = await db.fetchOne('SELECT id FROM follows WHERE follower_id=? AND following_id=?', [followerId, followingId]);
    return !!row;
  },

  async followerCount(db: Db, userId: number): Promise<number> {
    return db.count('SELECT COUNT(*) as cnt FROM follows f JOIN users u ON f.follower_id = u.id WHERE f.following_id = ? AND u.is_active = 1', [userId]);
  },

  async followingCount(db: Db, userId: number): Promise<number> {
    return db.count('SELECT COUNT(*) as cnt FROM follows f JOIN users u ON f.following_id = u.id WHERE f.follower_id = ? AND u.is_active = 1', [userId]);
  },

  async getFollowers(db: Db, userId: number, limit = 12, offset = 0): Promise<FollowUserRow[]> {
    return db.fetchAll<FollowUserRow>(
      `SELECT u.id, u.username, u.avatar_url, u.bio, f.created_at
       FROM follows f JOIN users u ON f.follower_id = u.id
       WHERE f.following_id = ? AND u.is_active = 1 ORDER BY f.created_at DESC LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );
  },

  async getFollowing(db: Db, userId: number, limit = 12, offset = 0): Promise<FollowUserRow[]> {
    return db.fetchAll<FollowUserRow>(
      `SELECT u.id, u.username, u.avatar_url, u.bio, f.created_at
       FROM follows f JOIN users u ON f.following_id = u.id
       WHERE f.follower_id = ? AND u.is_active = 1 ORDER BY f.created_at DESC LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );
  },
};
