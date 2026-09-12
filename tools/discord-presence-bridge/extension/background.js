chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'ANIVAULT_PRESENCE') return;

  const bridgeUrl = typeof message.bridgeUrl === 'string' ? message.bridgeUrl : '';
  if (!/^https?:\/\//i.test(bridgeUrl)) return;

  chrome.storage.sync.get({ bridgeSecret: '' }, ({ bridgeSecret }) => {
    const headers = { 'Content-Type': 'application/json' };
    if (typeof bridgeSecret === 'string' && bridgeSecret) {
      headers['X-AniVault-Bridge-Secret'] = bridgeSecret;
    }

    fetch(bridgeUrl, {
      method: 'POST',
      headers,
      keepalive: Boolean(message.keepalive),
      body: JSON.stringify(message.payload || {}),
    }).catch(() => {
      // The companion is optional; never interfere with playback when it is offline.
    });
  });

  sendResponse({ ok: true });
  return true;
});
