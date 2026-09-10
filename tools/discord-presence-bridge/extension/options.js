const urlInput = document.getElementById('bridgeUrl');
const secretInput = document.getElementById('bridgeSecret');
const status = document.getElementById('status');

chrome.storage.sync.get({
  bridgeUrl: 'http://127.0.0.1:6463',
  bridgeSecret: '',
}, value => {
  urlInput.value = value.bridgeUrl || 'http://127.0.0.1:6463';
  secretInput.value = value.bridgeSecret || '';
});

document.getElementById('save').addEventListener('click', () => {
  const bridgeUrl = urlInput.value.trim().replace(/\/$/, '');
  const bridgeSecret = secretInput.value.trim();
  chrome.storage.sync.set({ bridgeUrl, bridgeSecret }, () => {
    status.textContent = 'Saved';
    setTimeout(() => { status.textContent = ''; }, 1800);
  });
});
