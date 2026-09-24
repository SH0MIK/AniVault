// Turbovid/Turboviplay direct-embed resolver — Cloudflare Workers version.
//
// This is a port of the same resolver already running on the Railway
// scraper API (src/resolvers/turbovid.ts there), rewritten against the
// Workers `fetch` global instead of axios/node https, so it can run here
// as an experiment: Google throttles/blocks Railway's datacenter IP on
// `lh3.googleusercontent.com/d/<id>=d` links (the actual video storage
// turbovid wraps in fake-HLS), and Cloudflare Workers egress from a
// completely different IP range that may not be blocked (yet).
//
// See src/routes/admin/turbovid-test.ts for where this is actually wired
// up as a Worker-side proxy, admin-gated and fully separate from the main
// site's real streaming path.

export interface TurbovidSubtitle {
  lang: string;
  url: string;
}

export interface TurbovidResult {
  embedUrl: string;
  m3u8: string | null;
  videoUrl: string | null;
  subtitles: TurbovidSubtitle[];
  poster: string | null;
  title: string | null;
  referer: string;
  type: 'hls' | 'mp4' | 'iframe';
}

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const LANGUAGE_CODES: Record<string, string> = {
  eng: 'English', spa: 'Spanish', ara: 'Arabic', chi: 'Chinese', fre: 'French',
  ger: 'German', hin: 'Hindi', ind: 'Indonesian', ita: 'Italian', jpn: 'Japanese',
  kor: 'Korean', por: 'Portuguese', rus: 'Russian', tha: 'Thai', tur: 'Turkish',
  vie: 'Vietnamese', mal: 'Malayalam', tam: 'Tamil', ukr: 'Ukrainian',
};

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function fetchSubtitles(subtitleFeedUrl: string): Promise<TurbovidSubtitle[]> {
  try {
    const res = await fetch(subtitleFeedUrl, { headers: BROWSER_HEADERS });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data)) return [];

    return data
      .map((item: any) => {
        const file = item?.file;
        if (typeof file !== 'string') return null;

        const match = file.match(/\/([a-z]{3})(?:_(\d+))?\.vtt$/i);
        const code = match ? LANGUAGE_CODES[match[1].toLowerCase()] || match[1] : null;
        const index = match?.[2];
        const derivedLabel = code ? (index ? `${code} ${index}` : code) : null;

        const rawLabel = typeof item.label === 'string' ? item.label.trim() : '';
        const looksLikeVanityLabel = rawLabel && /\.[a-z]{2,}\b|https?:\/\//i.test(rawLabel);
        const label = (!looksLikeVanityLabel && rawLabel) || derivedLabel || rawLabel || 'Subtitle';

        return { lang: label, url: file } as TurbovidSubtitle;
      })
      .filter((s: TurbovidSubtitle | null): s is TurbovidSubtitle => s !== null);
  } catch {
    return [];
  }
}

/**
 * Resolve a Turbovid/Turboviplay embed URL to its direct m3u8 + subtitles,
 * fetched from Cloudflare's own network rather than Railway's.
 */
export async function resolveTurbovidCF(embedUrl: string): Promise<TurbovidResult | null> {
  try {
    const embed = new URL(embedUrl);
    const res = await fetch(embedUrl, {
      headers: { ...BROWSER_HEADERS, Referer: `${embed.origin}/` },
    });
    if (!res.ok) return null;

    const html = await res.text();

    const m3u8 = firstMatch(html, [
      /data-hash=["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
      /var\s+urlPlay\s*=\s*['"]((https?:\/\/[^'"]+\.m3u8[^'"]*))['"]/i,
    ]);

    // Some TurboVid embeds are plain MP4 files (including uploads whose
    // original filename is .mkv). Those pages use the same JWPlayer shell,
    // but urlPlay points directly at the .mp4 instead of an HLS playlist.
    const videoUrl = firstMatch(html, [
      /var\s+urlPlay\s*=\s*['"](https?:\/\/[^'"]+)['"]/i,
      /["']file["']\s*:\s*['"](https?:\/\/[^'"]+)['"]/i,
    ]);

    const subtitleFeedUrl = firstMatch(html, [
      /var\s+urlSub\s*=\s*['"](https?:\/\/[^'"]+)['"]/i,
    ]);

    const poster = firstMatch(html, [/var\s+poster\s*=\s*['"](https?:\/\/[^'"]+)['"]/i]);
    const title = firstMatch(html, [/<title>([^<]*)<\/title>/i]);

    const subtitles = subtitleFeedUrl ? await fetchSubtitles(subtitleFeedUrl) : [];

    return {
      embedUrl,
      m3u8,
      videoUrl: m3u8 ? null : videoUrl,
      subtitles,
      poster,
      title,
      referer: `${embed.origin}/`,
      type: m3u8 ? 'hls' : videoUrl ? 'mp4' : 'iframe',
    };
  } catch (e) {
    console.warn('[turbovid-cf] resolveTurbovidCF failed:', (e as Error).message);
    return null;
  }
}

/**
 * Rewrite an HLS playlist so every segment/variant/URI reference routes
 * back through our own proxy (so the browser never talks to
 * turbosplayer.com / googleusercontent.com directly, and so every hop
 * keeps going through Cloudflare's egress, not the viewer's).
 */
export function rewriteHlsPlaylistCF(proxyBase: string, body: string, sourceUrl: string, ref?: string): string {
  const base = new URL(sourceUrl);
  const proxyUri = (uri: string) => {
    const absoluteUrl = new URL(uri, base);
    const absolute = absoluteUrl.toString();

    // TurboVid fake-HLS media is often stored as PNG/WebP on Google.
    // Cloudflare egress is currently returning 429/520 for those binary
    // objects, so leave Google media URLs direct and proxy everything else.
    if (absoluteUrl.hostname === 'lh3.googleusercontent.com' ||
        absoluteUrl.hostname.endsWith('.googleusercontent.com')) {
      return absolute;
    }

    const refParam = ref ? `&ref=${encodeURIComponent(ref)}` : '';
    return `${proxyBase}?url=${encodeURIComponent(absolute)}${refParam}`;
  };

  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith('#') && trimmed.includes('URI=')) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${proxyUri(uri)}"`);
      }
      if (trimmed.startsWith('#')) return line;

      // Non-# lines are segment/variant URLs
      return proxyUri(trimmed);
    })
    .join('\n');
}
