chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'ANIVAULT_PRESENCE') return;

  const bridgeUrl = typeof message.bridgeUrl === 'string' ? message.bridgeUrl : '';
  if (!/^https?:\/\//i.test(bridgeUrl)) return;

  fetch(bridgeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    keepalive: Boolean(message.keepalive),
    body: JSON.stringify(message.payload || {}),
  }).catch(() => {
    // The companion is optional; never interfere with playback when it is offline.
  });

  sendResponse({ ok: true });
  return true;
});
