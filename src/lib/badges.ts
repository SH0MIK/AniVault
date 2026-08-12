// Full port of includes/badges.php.
import { Db } from './db';
import { h } from './helpers';

export interface BadgeRow {
  [key: string]: unknown;
  id: number;
  name: string;
  description: string | null;
  icon_text: string | null;
  image_url: string | null;
  color: string;
  is_animated: number;
  sort_order: number;
}

function safeColor(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#7c3aed';
}

export const Badge = {
  async all(db: Db): Promise<BadgeRow[]> {
    return db.fetchAll<BadgeRow>('SELECT * FROM badges ORDER BY sort_order ASC, name ASC');
  },

  async getForUser(db: Db, userId: number): Promise<BadgeRow[]> {
    return db.fetchAll<BadgeRow>(
      'SELECT b.* FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = ? ORDER BY b.sort_order ASC, b.name ASC',
      [userId]
    );
  },

  async getForUsers(db: Db, userIds: number[]): Promise<Record<number, BadgeRow[]>> {
    const ids = Array.from(new Set(userIds.filter((n) => n > 0)));
    if (ids.length === 0) return {};
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.fetchAll<BadgeRow & { user_id: number }>(
      `SELECT ub.user_id, b.* FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id IN (${placeholders}) ORDER BY b.sort_order ASC, b.name ASC`,
      ids
    );
    const out: Record<number, BadgeRow[]> = {};
    for (const row of rows) {
      const uid = row.user_id;
      const { user_id, ...rest } = row;
      if (!out[uid]) out[uid] = [];
      out[uid].push(rest as BadgeRow);
    }
    return out;
  },

  renderList(badges: BadgeRow[]): string {
    if (!badges || badges.length === 0) return '';
    let html = '<span class="user-badges" aria-label="User badges">';
    for (const badge of badges) {
      const name = h(badge.name ?? 'Badge');
      const color = safeColor(badge.color ?? '#7c3aed');
      const imageUrl = (badge.image_url ?? '').trim();
      const iconText = (badge.icon_text ?? '').trim();
      const animatedClass = badge.is_animated ? ' user-badge-animated' : '';
      if (imageUrl !== '') {
        html += `<span class="user-badge user-badge-image${animatedClass}" title="${name}" style="--badge-color:${h(color)}">`;
        html += `<img src="${h(imageUrl)}" alt="${name}" loading="lazy"></span>`;
      } else {
        html += `<span class="user-badge user-badge-text${animatedClass}" title="${name}" style="--badge-color:${h(color)}">`;
        html += h(iconText !== '' ? iconText : (badge.name ?? 'B').charAt(0).toUpperCase()) + '</span>';
      }
    }
    html += '</span>';
    return html;
  },
};
