// Global (all-users-in-one-room) chat. New feature, not a port of anything
// in the old PHP site — modeled after lib/notification.ts's shape/style so
// it fits the rest of the codebase.
import { Db } from './db';

export interface ChatMessageRow {
  [key: string]: unknown;
  id: number;
  user_id: number;
  message: string;
  created_at: string;
  username: string;
  avatar_url: string | null;
  role: string;
}

export const MAX_MESSAGE_LENGTH = 500;
const MIN_INTERVAL_MS = 1500; // basic per-user flood guard

const SELECT_WITH_USER = `
  SELECT m.id, m.user_id, m.message, m.created_at, u.username, u.avatar_url, u.role
  FROM chat_messages m JOIN users u ON u.id = m.user_id`;

export const Chat = {
  /** Most recent `limit` messages, oldest first (ready to render top-to-bottom).
   * Pass beforeId to page further back in history ("load older" button). */
  async getRecent(db: Db, limit = 50, beforeId?: number): Promise<ChatMessageRow[]> {
    const rows = beforeId
      ? await db.fetchAll<ChatMessageRow>(
          `${SELECT_WITH_USER} WHERE m.id < ? ORDER BY m.id DESC LIMIT ?`,
          [beforeId, limit]
        )
      : await db.fetchAll<ChatMessageRow>(
          `${SELECT_WITH_USER} ORDER BY m.id DESC LIMIT ?`,
          [limit]
        );
    return rows.reverse();
  },

  /** Messages newer than afterId, oldest first — used for polling while the panel is open. */
  async getAfter(db: Db, afterId: number, limit = 200): Promise<ChatMessageRow[]> {
    return db.fetchAll<ChatMessageRow>(
      `${SELECT_WITH_USER} WHERE m.id > ? ORDER BY m.id ASC LIMIT ?`,
      [afterId, limit]
    );
  },

  async send(db: Db, userId: number, message: string): Promise<{ success: boolean; error?: string; row?: ChatMessageRow }> {
    const trimmed = message.trim();
    if (!trimmed) return { success: false, error: 'Message cannot be empty.' };
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      return { success: false, error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).` };
    }

    const last = await db.fetchOne<{ created_at: string }>(
      'SELECT created_at FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [userId]
    );
    if (last) {
      const lastMs = new Date(last.created_at.replace(' ', 'T') + 'Z').getTime();
      if (!Number.isNaN(lastMs) && Date.now() - lastMs < MIN_INTERVAL_MS) {
        return { success: false, error: 'You are sending messages too fast — slow down a little.' };
      }
    }

    const id = await db.insert('INSERT INTO chat_messages (user_id, message) VALUES (?, ?)', [userId, trimmed]);
    const row = await db.fetchOne<ChatMessageRow>(`${SELECT_WITH_USER} WHERE m.id = ?`, [id]);
    return { success: true, row: row ?? undefined };
  },

  async latestId(db: Db): Promise<number> {
    const row = await db.fetchOne<{ id: number | null }>('SELECT MAX(id) as id FROM chat_messages', []);
    return row?.id ?? 0;
  },

  async unreadCount(db: Db, userId: number): Promise<number> {
    const readRow = await db.fetchOne<{ last_read_id: number }>(
      'SELECT last_read_id FROM chat_reads WHERE user_id = ?',
      [userId]
    );
    const lastReadId = readRow?.last_read_id ?? 0;
    return db.count('SELECT COUNT(*) as cnt FROM chat_messages WHERE id > ?', [lastReadId]);
  },

  /** Marks everything up through the given message id (or the current latest, if omitted) as read. */
  async markRead(db: Db, userId: number, throughId?: number): Promise<void> {
    const latest = throughId ?? (await Chat.latestId(db));
    await db.query(
      `INSERT INTO chat_reads (user_id, last_read_id) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET last_read_id = excluded.last_read_id
       WHERE excluded.last_read_id > chat_reads.last_read_id`,
      [userId, latest]
    );
  },

  /** Regular users may delete only their own message; admins/owner may delete any. */
  async deleteMessage(db: Db, id: number, userId: number, isAdmin: boolean): Promise<boolean> {
    const res = isAdmin
      ? await db.query('DELETE FROM chat_messages WHERE id = ?', [id])
      : await db.query('DELETE FROM chat_messages WHERE id = ? AND user_id = ?', [id, userId]);
    return (res.meta.changes ?? 0) > 0;
  },
};
