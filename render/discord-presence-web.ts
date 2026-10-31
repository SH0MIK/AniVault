/**
 * Browser-side Rich Presence bridge for the normal AniVault web player.
 *
 * The actual Discord IPC connection stays local in tools/discord-rpc-bridge.mjs.
 * This script is intentionally silent when the helper is not installed/running.
 */
export function discordPresenceWebScript(): string {
  return `<script>
(() => {
  'use strict';
  if (window.__anivaultPcDiscordPresence) return;

  const BRIDGE_URL = 'http://127.0.0.1:27123/presence';
  const api = {
    video: null,
    art: { image: '', banner: '' },
    artLoading: false,
    artLoadedFor: '',
    heartbeat: null,
    lastSend: 0,
  };
  window.__anivaultPcDiscordPresence = api;

  const meta = (name) =>
    document.querySelector(\`meta[property="\${name}"], meta[name="\${name}"]\`)?.getAttribute('content') || '';

  const cssUrl = (value) => {
    const m = String(value || '').match(/url\\((['"]?)(.*?)\\1\\)/i);
    return m ? m[2] : '';
  };

  const animeIdFromUrl = () => {
    try { return new URL(location.href).searchParams.get('anime') || ''; } catch (_) { return ''; }
  };

  const currentPoster = () => {
    const ambient = document.querySelector('.av-ambient-img');
    return cssUrl(ambient?.style?.backgroundImage || '') || meta('og:image');
  };

  const episodeThumbnail = () => meta('og:image') || '';

  const loadAnimeArt = async () => {
    const animeId = animeIdFromUrl();
    if (!animeId || api.artLoading || api.artLoadedFor === animeId) return;
    api.artLoading = true;
    api.art.image = episodeThumbnail() || currentPoster();

    try {
      const encodedId = encodeURIComponent(animeId);
      const res = await fetch(\`/anime?id=\${encodedId}\`, {
        credentials: 'same-origin',
        cache: 'force-cache',
      });
      if (res.ok) {
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const poster = doc.querySelector('.ih-thumb img')?.getAttribute('src') || '';
        const banner = cssUrl(doc.querySelector('.ih-bg')?.getAttribute('style') || '');
        if (!api.art.image && poster) api.art.image = new URL(poster, location.href).href;
        if (banner) api.art.banner = new URL(banner, location.href).href;
      }
    } catch (_) {}

    api.artLoadedFor = animeId;
    api.artLoading = false;
  };

  const send = (event) => {
    const v = api.video;
    if (!v && event !== 'pagehide') return;

    let u;
    try { u = new URL(location.href); } catch (_) { return; }
    const episode = Number(u.searchParams.get('ep')) || 0;
    if (!episode) return;

    const title = (meta('og:title') || document.title)
      .replace(/^Ep\\s+\\d+\\s+[—-]\\s*/i, '')
      .replace(/\\s*\\|\\s*AniVault.*$/i, '')
      .trim() || 'Anime';

    const episodeTitle = document.querySelector('.wp-ep-title, [data-episode-title]')?.textContent?.trim() || '';
    const currentTime = v && Number.isFinite(v.currentTime) ? Math.max(0, v.currentTime) : 0;
    const duration = v && Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    const playing = !!v && !v.paused && !v.ended && !v.seeking;

    const payload = {
      event,
      title,
      episode,
      episodeTitle,
      url: location.href,
      image: api.art.image || episodeThumbnail() || currentPoster(),
      banner: api.art.banner || '',
      currentTime,
      duration,
      playing,
      at: Date.now(),
    };

    const body = JSON.stringify(payload);

    try {
      fetch(BRIDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        cache: 'no-store',
        keepalive: event === 'pagehide',
        targetAddressSpace: 'local',
      }).catch(() => {});
    } catch (_) {}

    // pagehide is best-effort; the local helper also expires stale sessions.
    api.lastSend = Date.now();
  };

  const startHeartbeat = () => {
    if (api.heartbeat) return;
    api.heartbeat = setInterval(() => send('heartbeat'), 10000);
  };

  const attach = () => {
    const next = document.getElementById('sp-video') || document.querySelector('video');
    if (!(next instanceof HTMLVideoElement) || next === api.video) return;

    if (api.video) {
      try { api.video.removeAttribute('data-anivault-rpc-video'); } catch (_) {}
    }

    api.video = next;
    next.setAttribute('data-anivault-rpc-video', '1');

    ['play','playing','pause','waiting','stalled','seeked','loadedmetadata','durationchange','ended'].forEach((event) => {
      next.addEventListener(event, () => send(event), { passive: true });
    });

    send('ready');
    loadAnimeArt().then(() => send('art-ready'));
    startHeartbeat();
  };

  api.send = send;
  attach();
  new MutationObserver(attach).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => send('pagehide'), { capture: true });
})();
</script>`;
}
