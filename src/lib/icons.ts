// Ports includes/icons.php. The SVG sprite is inlined once in <head> (same as
// the PHP version's SVG_SPRITE_INLINED path), so icon() just references
// '#icon-name' fragments against it.
import { h } from './helpers';

const ICON_MAP: Record<string, string> = {
  home: 'home', search: 'search', user: 'user', logout: 'logout', login: 'login',
  fire: 'fire', trophy: 'trophy', calendar: 'calendar', list: 'list', star: 'star',
  heart: 'heart', 'heart-filled': 'heart-filled', plus: 'plus', edit: 'edit', trash: 'trash',
  settings: 'settings', watching: 'watching', completed: 'completed', plantowatch: 'plantowatch',
  dropped: 'dropped', onhold: 'onhold', download: 'download', upload: 'upload', box: 'box',
  bell: 'bell', globe: 'globe', users: 'users', message: 'message', 'arrow-right': 'arrow-right',
  'arrow-left': 'arrow-left', 'chevron-right': 'chevron-right', 'chevron-left': 'chevron-left',
  x: 'x', shield: 'shield', database: 'database', activity: 'activity', info: 'info',
  alert: 'alert', check: 'check', camera: 'camera', play: 'play', moon: 'moon', lock: 'lock',
  mail: 'mail', menu: 'menu', circle: 'circle', square: 'square', megaphone: 'megaphone',
  terms: 'terms', 'chart-bar': 'chart-bar', wrench: 'wrench', merge: 'merge', layout: 'layout',
  heal: 'heal', eye: 'eye', tv: 'tv', discord: 'discord', github: 'github', facebook: 'facebook',
  twitter: 'twitter', instagram: 'instagram', youtube: 'youtube', reddit: 'reddit', anilist: 'anilist', mic: 'mic',
  captions: 'captions', clock: 'clock',
};

export function icon(name: string, cls = '', size: string | number = '1em'): string {
  const iconName = ICON_MAP[name] ?? name;
  const sizeAttr = typeof size === 'number' ? `${size}px` : size;
  return `<svg class="icon icon-${iconName} ${cls}" width="${sizeAttr}" height="${sizeAttr}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-${iconName}"/></svg>`;
}

export function iconWithText(name: string, text: string, cls = ''): string {
  return `<span class="icon-with-text ${h(cls)}">${icon(name, 'icon-inline')}<span>${h(text)}</span></span>`;
}

export function statusIcon(status: string): string {
  const map: Record<string, string> = {
    watching: 'watching', completed: 'completed', plan_to_watch: 'plantowatch',
    dropped: 'dropped', on_hold: 'onhold',
  };
  return icon(map[status] ?? 'info', 'status-icon');
}
