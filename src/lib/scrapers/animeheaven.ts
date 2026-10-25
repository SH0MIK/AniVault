/**
 * Cloudflare-Worker-native AnimeHeaven scraper.
 *
 * Kept deliberately self-contained: one request performs search, episode-key
 * discovery, and gate resolution so AnimeHeaven's short-lived session cookies
 * stay together. This source does not depend on the external scraper API.
 */
const BASE = 'https://animeheaven.me';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

type CookieJar = Map<string, string>;

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function plainText(value: string): string {
  return decodeHtml(value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function attr(tag: string, name: string): string {
  const attributes = tag.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g);
  for (const match of attributes) {
    if (match[1]?.toLowerCase() === name.toLowerCase()) {
      return decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
    }
  }
  return '';
}

function captureCookies(response: Response, jar: CookieJar): void {
  const raw = response.headers.get('set-cookie') ?? '';
  // Cloudflare may combine Set-Cookie values; only extract cookie name/value
  // pairs, ignoring attributes such as Expires, Path, Secure and SameSite.
  const pattern = /(?:^|,\s*)([!#$%&'*+.^_`|~\w-]+)=([^;,]*)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw))) {
    const name = match[1]?.trim();
    const value = match[2]?.trim();
    if (name && value !== undefined && !/^(expires|path|domain|samesite|secure|httponly|max-age)$/i.test(name)) {
      jar.set(name, value);
    }
  }
}

function cookieHeader(jar: CookieJar, episodeKey?: string): string {
  const copy = new Map(jar);
  if (episodeKey) copy.set('key', episodeKey);
  return [...copy.entries()].map(([name, value]) => name + '=' + value).join('; ');
}

async function getText(url: string, jar: CookieJar, options: {
  referer?: string; cookieKey?: string; accept?: string; timeoutMs?: number;
} = {}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);
  try {
    const headers: Record<string, string> = {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': options.accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': options.referer ?? BASE + '/',
    };
    const cookies = cookieHeader(jar, options.cookieKey);
    if (cookies) headers.Cookie = cookies;
    const response = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
    captureCookies(response, jar);
    if (!response.ok) throw new Error('AnimeHeaven returned HTTP ' + response.status);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeTitle(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function scoreTitle(query: string, candidate: string): number {
  const q = normalizeTitle(query);
  const c = normalizeTitle(candidate);
  if (!q || !c) return 0;
  if (q === c) return 100;
  const ratio = Math.min(q.length, c.length) / Math.max(q.length, c.length);
  if (c.startsWith(q) || q.startsWith(c)) return ratio >= 0.6 ? 80 : 30;
  if (c.includes(q) || q.includes(c)) return ratio >= 0.6 ? 60 : 25;
  let hits = 0;
  for (const char of q) if (c.includes(char)) hits++;
  return Math.floor(hits / q.length * 40);
}

function absolute(url: string): string {
  try { return new URL(url, BASE).toString(); } catch { return ''; }
}

function findSearchMatches(html: string): Array<{ id: string; title: string }> {
  const found: Array<{ id: string; title: string }> = [];
  const anchors = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? [];
  for (const anchor of anchors) {
    const href = attr(anchor.slice(0, anchor.indexOf('>') + 1), 'href');
    if (!/anime\.php\?/i.test(href)) continue;
    const query = href.split('?').slice(1).join('?').trim();
    if (!query) continue;
    const fastname = anchor.match(/<[^>]*class\s*=\s*["'][^"']*fastname[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] ?? '';
    const imageTag = anchor.match(/<img\b[^>]*>/i)?.[0] ?? '';
    const title = plainText(fastname) || attr(imageTag, 'alt');
    if (title) found.push({ id: query, title });
  }
  return found;
}

function episodeKeyFromAnchor(anchor: string): { key: string; number: number } | null {
  const opening = anchor.slice(0, anchor.indexOf('>') + 1);
  const attrs = [attr(opening, 'onmouseover'), attr(opening, 'onclick'), attr(opening, 'href')].join(' ');
  const text = plainText(anchor);
  if (!/(?:gate[ha]\s*\(|gate\.php|episode)/i.test(attrs + ' ' + text)) return null;
  const key = attrs.match(/gate[ha]\s*\(\s*["']([^"']+)["']/i)?.[1]
    ?? attrs.match(/gate[ha]\s*\(\s*([^,)\s]+)/i)?.[1]
    ?? attrs.match(/[?&](?:key|id)=([^&#]+)/i)?.[1];
  const classNum = anchor.match(/<[^>]*class\s*=\s*["'][^"']*watch2[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] ?? '';
  const rawNum = plainText(classNum)
    || text.match(/episode\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1]
    || text.match(/^([0-9]+(?:\.[0-9]+)?)$/)?.[1]
    || '';
  const number = Number(rawNum);
  if (!key || !Number.isFinite(number) || number < 1) return null;
  try { return { key: decodeURIComponent(key), number }; } catch { return { key, number }; }
}

/** Returns a freshly resolved direct MP4 URL, or null when no safe match exists. */
export async function resolveAnimeHeavenMp4(title: string, episodeNumber: number): Promise<string | null> {
  if (!title.trim() || !Number.isInteger(episodeNumber) || episodeNumber < 1) return null;
  const jar: CookieJar = new Map();
  const searchUrl = new URL('/fastsearch.php', BASE);
  searchUrl.searchParams.set('xhr', '1');
  searchUrl.searchParams.set('s', title.trim());
  const searchHtml = await getText(searchUrl.toString(), jar, { accept: 'text/html,*/*' });
  const matches = findSearchMatches(searchHtml)
    .map((item) => ({ ...item, score: scoreTitle(title, item.title) }))
    .filter((item) => item.score >= 60)
    .sort((a, b) => b.score - a.score);
  const best = matches[0];
  if (!best) return null;

  const animeUrl = absolute('/anime.php?' + best.id);
  const animeHtml = await getText(animeUrl, jar, { referer: BASE + '/' });
  const anchors = animeHtml.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? [];
  const episodes = anchors.map(episodeKeyFromAnchor).filter((item): item is { key: string; number: number } => !!item);
  const episode = episodes.find((item) => item.number === episodeNumber);
  if (!episode) return null;

  const gateHtml = await getText(absolute('/gate.php'), jar, {
    referer: animeUrl,
    cookieKey: episode.key,
    timeoutMs: 16000,
  });
  if (/watch\s+episode\s+on\s+animeheaven\.me/i.test(plainText(gateHtml))) return null;

  const sources = [...gateHtml.matchAll(/<source\b[^>]*>/gi)]
    .map((match) => attr(match[0], 'src'))
    .filter((value) => /^https?:\/\//i.test(value))
    .filter((value) => {
      try { return new URL(value).pathname.toLowerCase().endsWith('.mp4'); } catch { return false; }
    });
  return sources[0] ?? null;
}
