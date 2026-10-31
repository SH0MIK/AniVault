// Ports the non-class helper functions from includes/helpers.php.
export function h(str: string | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Renders a <time> tag with a UTC unix timestamp; footer.ts's inline script
 * converts it to the user's local timezone client-side, same as the PHP version. */
export function timeAgo(datetime: string | null | undefined): string {
  if (!datetime || !datetime.trim()) return '<span class="text-muted">&mdash;</span>';
  const ts = Math.floor(new Date(datetime.replace(' ', 'T') + 'Z').getTime() / 1000);
  if (Number.isNaN(ts)) return '<span class="text-muted">&mdash;</span>';
  const diff = Math.floor(Date.now() / 1000) - ts;
  let label: string;
  if (diff < 60) label = 'just now';
  else if (diff < 3600) label = `${Math.floor(diff / 60)}m ago`;
  else if (diff < 86400) label = `${Math.floor(diff / 3600)}h ago`;
  else if (diff < 604800) label = `${Math.floor(diff / 86400)}d ago`;
  else label = new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return `<time class="local-ts" data-ts="${ts}">${label}</time>`;
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  watching: { label: 'Watching', cls: 'badge-watching' },
  completed: { label: 'Completed', cls: 'badge-completed' },
  plan_to_watch: { label: 'Planning', cls: 'badge-ptw' },
  dropped: { label: 'Dropped', cls: 'badge-dropped' },
  on_hold: { label: 'On Hold', cls: 'badge-onhold' },
};

export function statusBadge(status: string): string {
  const d = STATUS_MAP[status] ?? { label: status.charAt(0).toUpperCase() + status.slice(1), cls: 'badge-default' };
  return `<span class="badge ${d.cls}">${d.label}</span>`;
}

export function roleBadge(role: string, userId: number | null = null): string {
  if (role === 'owner' || userId === 2) return `<span class="badge badge-dropped">OWNER</span>`;
  if (role === 'admin') return `<span class="badge badge-dropped">Admin</span>`;
  return `<span class="badge badge-completed">User</span>`;
}

export function stars(score: number): string {
  const filled = score;
  const empty = 10 - score;
  let out = '';
  for (let i = 0; i < filled; i++) out += '<span class="star filled">★</span>';
  for (let i = 0; i < empty; i++) out += '<span class="star">★</span>';
  return out;
}

/** Best display title: English first, romaji fallback (matches getAnimeTitle()). */
export function getAnimeTitle(data: { title_english?: string; title?: string }): string {
  const english = (data.title_english ?? '').trim();
  const romaji = (data.title ?? '').trim();
  if (english !== '' && english !== romaji) return english;
  return romaji || 'Unknown';
}
