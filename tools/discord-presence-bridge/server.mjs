import http from 'node:http';
import { Client } from '@xhayper/discord-rpc';

const PORT = Number(process.env.ANIVAULT_RPC_PORT || 6463);
const HOST = process.env.ANIVAULT_RPC_HOST || '127.0.0.1';
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const BRIDGE_SECRET = process.env.ANIVAULT_BRIDGE_SECRET || '';

if (!CLIENT_ID) {
  console.error('Missing DISCORD_CLIENT_ID. Set it to the Application ID of your AniVault Discord app.');
  process.exit(1);
}

if (HOST !== '127.0.0.1' && !BRIDGE_SECRET) {
  console.error('ANIVAULT_BRIDGE_SECRET is required when the bridge listens beyond localhost.');
  process.exit(1);
}

const rpc = new Client({ clientId: CLIENT_ID });
let rpcReady = false;

rpc.on('ready', () => {
  rpcReady = true;
  console.log('[AniVault RPC] Connected to Discord.');
});
rpc.on('disconnected', () => {
  rpcReady = false;
  console.log('[AniVault RPC] Discord disconnected; waiting to reconnect.');
});
rpc.on('error', (error) => {
  rpcReady = false;
  console.error('[AniVault RPC]', error?.message || error);
});

async function connectRpc() {
  try {
    await rpc.login();
  } catch (error) {
    rpcReady = false;
    console.error('[AniVault RPC] Could not connect to Discord:', error?.message || error);
    setTimeout(connectRpc, 5000);
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildActivity(data) {
  const current = Math.max(0, Number(data.currentTime) || 0);
  const duration = Math.max(0, Number(data.duration) || 0);
  const playing = Boolean(data.playing);
  const sourceAt = Number(data.at) || Date.now();

  const episodeText = `Episode ${Number(data.episode) || 0}`;
  const episodeTitle = typeof data.episodeTitle === 'string' && data.episodeTitle.trim()
    ? ` — ${data.episodeTitle.trim()}`
    : '';

  // Use the browser's exact currentTime and its event timestamp. This keeps
  // the Discord clock accurate even when the phone's request reaches the PC
  // a little later over Wi-Fi.
  const start = sourceAt - Math.round(current * 1000);
  const end = duration > 0 ? start + Math.round(duration * 1000) : undefined;

  return {
    type: 3,
    details: `Watching ${String(data.title || 'Anime')}`.slice(0, 128),
    state: `${episodeText}${episodeTitle}`.slice(0, 128),
    startTimestamp: playing ? new Date(start) : undefined,
    endTimestamp: playing && end ? new Date(end) : undefined,
    largeImageKey: 'anivault',
    largeImageText: 'AniVault',
    buttons: [{ label: 'Watch on AniVault', url: String(data.url || 'https://www.anivault.co/') }],
    instance: false,
  };
}

async function clearPresence() {
  if (!rpcReady) return;
  try {
    await rpc.user?.clearActivity();
  } catch (error) {
    console.error('[AniVault RPC] Could not clear activity:', error?.message || error);
  }
}

async function setPresence(data) {
  if (!rpcReady) return;

  if (!data || data.event === 'ended' || data.event === 'pagehide') {
    await clearPresence();
    return;
  }

  if (!data.playing || data.event === 'pause' || data.event === 'waiting' || data.event === 'stalled') {
    const current = clamp(Number(data.currentTime) || 0, 0, Number.MAX_SAFE_INTEGER);
    const mins = Math.floor(current / 60);
    const secs = Math.floor(current % 60).toString().padStart(2, '0');
    await rpc.user?.setActivity({
      type: 3,
      details: `Paused · ${String(data.title || 'Anime')}`.slice(0, 128),
      state: `Episode ${Number(data.episode) || 0} · ${mins}:${secs}`.slice(0, 128),
      largeImageKey: 'anivault',
      largeImageText: 'AniVault',
      buttons: [{ label: 'Resume on AniVault', url: String(data.url || 'https://www.anivault.co/') }],
      instance: false,
    });
    return;
  }

  await rpc.user?.setActivity(buildActivity(data));
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-AniVault-Bridge-Secret');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/presence') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  if (BRIDGE_SECRET && req.headers['x-anivault-bridge-secret'] !== BRIDGE_SECRET) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  let body = '';
  req.setEncoding('utf8');
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      if (body.length > 64 * 1024) throw new Error('Payload too large');
      const data = JSON.parse(body);
      await setPresence(data);
      res.writeHead(204);
      res.end();
    } catch (error) {
      console.error('[AniVault Bridge]', error?.message || error);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid presence payload' }));
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[AniVault Bridge] Listening on http://${HOST}:${PORT}`);
});

connectRpc();
