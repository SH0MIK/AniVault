(() => {
  'use strict';

  let video = null;
  let seekPending = false;
  let waiting = false;
  let bridgeUrl = 'http://127.0.0.1:6463/presence';

  chrome.storage.sync.get({ bridgeUrl: 'http://127.0.0.1:6463/presence' }, value => {
    if (typeof value.bridgeUrl === 'string' && value.bridgeUrl.trim()) {
      bridgeUrl = value.bridgeUrl.trim().replace(/\/$/, '') + '/presence';
    }
    findVideo();
  });

  const send = (event, keepalive = false) => {
    if (!video && event !== 'pagehide') return;

    const url = new URL(location.href);
    const animeId = Number(url.searchParams.get('anime')) || 0;
    const episode = Number(url.searchParams.get('ep')) || 0;
    if (!animeId || !episode) return;

    const title = document.querySelector('meta[property="og:title"]')?.content
      ?.replace(/^Ep\s+\d+\s+[—-]\s*/i, '')
      ?.replace(/\s*\|\s*AniVault.*$/i, '')
      || document.title.replace(/^Ep\s+\d+\s+[—-]\s*/i, '').replace(/\s*\|\s*AniVault.*$/i, '')
      || 'Anime';

    const episodeTitle = document.querySelector('.wp-ep-title, [data-episode-title]')?.textContent?.trim() || null;
    const image = document.querySelector('meta[property="og:image"]')?.content || '';
    const duration = video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const currentTime = video && Number.isFinite(video.currentTime) && video.currentTime >= 0 ? video.currentTime : 0;
    const playing = video ? !video.paused && !video.ended && !video.seeking && !waiting : false;

    chrome.runtime.sendMessage({
      type: 'ANIVAULT_PRESENCE',
      bridgeUrl,
      keepalive,
      payload: {
        version: 1,
        source: 'anivault-extension',
        event,
        animeId,
        title,
        image,
        episode,
        episodeTitle,
        url: location.href,
        currentTime,
        duration,
        playing,
        ended: video?.ended ?? false,
        at: Date.now(),
      },
    });
  };

  function attach(candidate) {
    if (!(candidate instanceof HTMLVideoElement) || candidate === video) return;
    video = candidate;

    video.addEventListener('play', () => { waiting = false; send('play'); }, { passive: true });
    video.addEventListener('playing', () => { waiting = false; send('playing'); }, { passive: true });
    video.addEventListener('pause', () => { waiting = false; send('pause'); }, { passive: true });
    video.addEventListener('waiting', () => { waiting = true; send('waiting'); }, { passive: true });
    video.addEventListener('stalled', () => { waiting = true; send('stalled'); }, { passive: true });
    video.addEventListener('seeking', () => { seekPending = true; }, { passive: true });
    video.addEventListener('seeked', () => {
      if (!seekPending) return;
      seekPending = false;
      send('seeked');
    }, { passive: true });
    video.addEventListener('loadedmetadata', () => send('metadata'), { passive: true });
    video.addEventListener('durationchange', () => send('durationchange'), { passive: true });
    video.addEventListener('ended', () => { waiting = false; send('ended'); }, { passive: true });

    send('ready');
  }

  function findVideo() {
    const candidate = document.getElementById('sp-video') || document.querySelector('video');
    if (candidate) attach(candidate);
  }

  findVideo();
  new MutationObserver(findVideo).observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('pagehide', () => send('pagehide', true), { capture: true });
})();
