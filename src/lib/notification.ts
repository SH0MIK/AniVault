// Full port of includes/notification.php.
import { Db } from './db';
import { h } from './helpers';

export interface NotificationRow {
  [key: string]: unknown;
  id: number;
  user_id: number;
  actor_id: number | null;
  type: string;
  entity_id: number | null;
  entity_meta: string | null;
  is_read: number;
  created_at: string;
  actor_name?: string;
  actor_avatar?: string | null;
}

export const NOTIFICATION_TYPES: Record<string, { icon: string; color: string; label: string }> = {
  follow: { icon: '👤', color: 'blue', label: 'followed you' },
  like_review: { icon: '♥', color: 'accent', label: 'liked your review' },
  anime_update: { icon: '📋', color: 'teal', label: 'updated their list' },
  announcement: { icon: '📢', color: 'gold', label: 'new announcement' },
  chat_mention: { icon: '💬', color: 'accent', label: 'mentioned you in chat' },
  chat_reply: { icon: '↩️', color: 'accent', label: 'replied to your message' },
  auto_account: { icon: '🔑', color: 'gold', label: 'account created for you' },
};

export const Notification = {
  /** Creates a notification, skipping self-notifications (except announcements)
   * and de-duping identical (user, actor, type, entity) notifications within 1 hour. */
  async create(db: Db, userId: number, actorId: number, type: string, entityId: number | null = null, entityMeta: string | null = null): Promise<void> {
    if (userId === actorId && type !== 'announcement') return;

    const recent = await db.fetchOne(
      `SELECT id FROM notifications
       WHERE user_id=? AND actor_id=? AND type=? AND entity_id IS ?
       AND created_at > datetime('now', '-1 hour')`,
      [userId, actorId, type, entityId]
    );
    if (recent) return;

    await db.query(
      'INSERT INTO notifications (user_id, actor_id, type, entity_id, entity_meta) VALUES (?,?,?,?,?)',
      [userId, actorId, type, entityId, entityMeta]
    );
  },

  /** Broadcasts an announcement notification to every user, skipping users
   * who already have one for this announcement (idempotent, safe to re-run). */
  async broadcast(db: Db, announcementId: number, actorId: number, title: string): Promise<void> {
    const users = await db.fetchAll<{ id: number }>('SELECT id FROM users', []);
    for (const user of users) {
      const existing = await db.fetchOne(
        'SELECT id FROM notifications WHERE user_id=? AND type=? AND entity_id=?',
        [user.id, 'announcement', announcementId]
      );
      if (existing) continue;
      await db.query(
        'INSERT INTO notifications (user_id, actor_id, type, entity_id, entity_meta) VALUES (?,?,?,?,?)',
        [user.id, actorId, 'announcement', announcementId, title]
      );
    }
  },

  async unreadCount(db: Db, userId: number): Promise<number> {
    return db.count('SELECT COUNT(*) as cnt FROM notifications WHERE user_id=? AND is_read=0', [userId]);
  },

  async getForUser(db: Db, userId: number, limit = 30, offset = 0): Promise<NotificationRow[]> {
    return db.fetchAll<NotificationRow>(
      `SELECT n.*, u.username AS actor_name, u.avatar_url AS actor_avatar
       FROM notifications n JOIN users u ON u.id = n.actor_id
       WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );
  },

  async markRead(db: Db, notifId: number, userId: number): Promise<void> {
    await db.query('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?', [notifId, userId]);
  },

  async markAllRead(db: Db, userId: number): Promise<void> {
    await db.query('UPDATE notifications SET is_read=1 WHERE user_id=?', [userId]);
  },

  async delete(db: Db, notifId: number, userId: number): Promise<void> {
    await db.query('DELETE FROM notifications WHERE id=? AND user_id=?', [notifId, userId]);
  },

  getText(n: NotificationRow): string {
    const actor = h(n.actor_name ?? '');
    const meta = h(n.entity_meta ?? '');
    switch (n.type) {
      case 'follow': return `<strong>${actor}</strong> started following you`;
      case 'like_review': return `<strong>${actor}</strong> liked your review` + (meta ? ` on <em>${meta}</em>` : '');
      case 'anime_update': return `<strong>${actor}</strong> updated their list` + (meta ? `: <em>${meta}</em>` : '');
      case 'chat_mention': return `<strong>${actor}</strong> mentioned you in chat` + (meta ? `: <em>"${meta}"</em>` : '');
      case 'chat_reply': return `<strong>${actor}</strong> replied to your message` + (meta ? `: <em>"${meta}"</em>` : '');
      case 'announcement': return `📢 New announcement<br><strong>${meta || 'Check it out'}</strong>`;
      case 'auto_account': {
        let creds: { username?: string; password?: string } = {};
        try { creds = JSON.parse(n.entity_meta ?? '{}'); } catch { /* malformed -- show generic text */ }
        if (!creds.username) return `We made you a free account — tap to secure it`;
        return `We made you a free account: <strong>${h(creds.username)}</strong> / <strong>${h(creds.password ?? '')}</strong><br><span style="opacity:.75">Tap to set your own username, password, or connect Google/Discord</span>`;
      }
      default: return `<strong>${actor}</strong> did something`;
    }
  },

  getLink(n: NotificationRow, siteUrl: string): string {
    switch (n.type) {
      case 'follow': return `${siteUrl}/u/${encodeURIComponent(n.actor_name ?? '')}`;
      case 'like_review': return n.entity_id ? `${siteUrl}/anime?id=${n.entity_id}` : `${siteUrl}/feed`;
      case 'announcement': return `${siteUrl}/announcements`;
      case 'chat_mention': return `${siteUrl}/?openChat=1`;
      case 'chat_reply': return `${siteUrl}/?openChat=1`;
      case 'auto_account': return `${siteUrl}/profile`;
      default: return `${siteUrl}/feed`;
    }
  },

  getMeta(type: string): { icon: string; color: string; label: string } {
    return NOTIFICATION_TYPES[type] ?? { icon: '🔔', color: 'text-primary', label: 'notification' };
  },
};
