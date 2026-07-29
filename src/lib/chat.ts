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

  // ── Reactions ──────────────────────────────────────────────────────────

  /** Toggles a single (message, user, emoji) reaction on/off. Returns the new state. */
  async toggleReaction(db: Db, messageId: number, userId: number, emoji: string): Promise<boolean> {
    const existing = await db.fetchOne(
      'SELECT id FROM chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
      [messageId, userId, emoji]
    );
    if (existing) {
      await db.query('DELETE FROM chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', [messageId, userId, emoji]);
      return false;
    }
    await db.query('INSERT INTO chat_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)', [messageId, userId, emoji]);
    return true;
  },

  /** Batch-fetches reaction summaries (emoji, count, whether the current user reacted) for a set of messages. */
  async getReactionsForMessages(db: Db, messageIds: number[], currentUserId: number): Promise<Record<number, { emoji: string; count: number; mine: boolean }[]>> {
    const ids = Array.from(new Set(messageIds.filter((n) => n > 0)));
    if (ids.length === 0) return {};
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.fetchAll<{ message_id: number; emoji: string; user_id: number }>(
      `SELECT message_id, emoji, user_id FROM chat_reactions WHERE message_id IN (${placeholders})`,
      ids
    );
    const out: Record<number, { emoji: string; count: number; mine: boolean }[]> = {};
    for (const r of rows) {
      if (!out[r.message_id]) out[r.message_id] = [];
      let entry = out[r.message_id].find((e) => e.emoji === r.emoji);
      if (!entry) {
        entry = { emoji: r.emoji, count: 0, mine: false };
        out[r.message_id].push(entry);
      }
      entry.count++;
      if (r.user_id === currentUserId) entry.mine = true;
    }
    return out;
  },

  // ── Presence / typing ────────────────────────────────────────────────

  async ping(db: Db, userId: number, typing: boolean): Promise<void> {
    await db.query(
      `INSERT INTO chat_presence (user_id, last_seen, typing_until) VALUES (?, datetime('now'), ${typing ? "datetime('now', '+5 seconds')" : 'NULL'})
       ON CONFLICT(user_id) DO UPDATE SET last_seen = datetime('now'), typing_until = ${typing ? "datetime('now', '+5 seconds')" : 'NULL'}`,
      [userId]
    );
  },

  /** Logged-in users active in the last 60 seconds. */
  async onlineCount(db: Db): Promise<number> {
    return db.count(`SELECT COUNT(*) as cnt FROM chat_presence WHERE last_seen > datetime('now', '-60 seconds')`, []);
  },

  /** Usernames currently typing (excluding the caller), up to 3. */
  async typingUsernames(db: Db, excludeUserId: number): Promise<string[]> {
    const rows = await db.fetchAll<{ username: string }>(
      `SELECT u.username FROM chat_presence p JOIN users u ON u.id = p.user_id
       WHERE p.typing_until > datetime('now') AND p.user_id != ? LIMIT 3`,
      [excludeUserId]
    );
    return rows.map((r) => r.username);
  },

  // ── @mentions ─────────────────────────────────────────────────────────

  /** Looks up users named via @username in a message (case-insensitive), excluding the sender. */
  async findMentionedUsers(db: Db, message: string, excludeUserId: number): Promise<{ id: number; username: string }[]> {
    const handles = Array.from(new Set((message.match(/@([a-zA-Z0-9_]{2,32})/g) ?? []).map((m) => m.slice(1).toLowerCase())));
    if (handles.length === 0) return [];
    const placeholders = handles.map(() => '?').join(',');
    const rows = await db.fetchAll<{ id: number; username: string }>(
      `SELECT id, username FROM users WHERE lower(username) IN (${placeholders}) AND id != ?`,
      [...handles, excludeUserId]
    );
    return rows;
  },

  // ── "Currently watching" flair ──────────────────────────────────────

  /** Each user's most recently-updated "watching" list entry, if any — shown as a flair next to their name in chat. */
  async getWatchingMap(db: Db, userIds: number[]): Promise<Record<number, { anime_id: number; title: string; image: string } | null>> {
    const ids = Array.from(new Set(userIds.filter((n) => n > 0)));
    if (ids.length === 0) return {};
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.fetchAll<{ user_id: number; anime_id: number; anime_title: string; anime_image: string; updated_at: string }>(
      `SELECT user_id, anime_id, anime_title, anime_image, updated_at FROM anime_list
       WHERE user_id IN (${placeholders}) AND status = 'watching'`,
      ids
    );
    const out: Record<number, { anime_id: number; title: string; image: string } | null> = {};
    for (const r of rows) {
      const current = out[r.user_id];
      if (!current || (r.updated_at ?? '') > ((current as any).__updated_at ?? '')) {
        out[r.user_id] = { anime_id: r.anime_id, title: r.anime_title, image: r.anime_image, __updated_at: r.updated_at } as any;
      }
    }
    for (const uid of ids) {
      if (out[uid]) delete (out[uid] as any).__updated_at;
      else out[uid] = null;
    }
    return out;
  },
};

