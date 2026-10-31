import { Db } from './db';

export const Logger = {
  async log(db: Db, userId: number | null, action: string, details = '', ip = 'unknown'): Promise<void> {
    await db.query(
      'INSERT INTO activity_log (user_id, action, details, ip_address) VALUES (?,?,?,?)',
      [userId, action, details, ip]
    );
  },

  async getRecent(db: Db, limit = 50): Promise<any[]> {
    return db.fetchAll(
      `SELECT l.*, u.username FROM activity_log l LEFT JOIN users u ON l.user_id = u.id ORDER BY l.created_at DESC LIMIT ?`,
      [limit]
    );
  },
};
