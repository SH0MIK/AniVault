import http from 'node:http';
import process from 'node:process';
import { Client } from '@xhayper/discord-rpc';

const HOST = '127.0.0.1';
const PORT = Number(process.env.ANIVAULT_RPC_PORT || 27123);
const CLIENT_ID = process.env.ANIVAULT_DISCORD_CLIENT_ID || process.argv[2] || '1505538731791093820';
const SITE_ORIGIN = process.env.ANIVAULT_RPC_ORIGIN || 'https://www.anivault.co';
const MIN_UPDATE_GAP_MS = 4000;
const STALE_SESSION_MS = 25000;

if (!CLIENT_ID) {
  console.error('Missing Discord application ID.');
  console.error('Run: npm run discord:pc -- YOUR_DISCORD_APPLICATION_ID');
  console.error('Or set ANIVAULT_DISCORD_CLIENT_ID in your environment.');
  process.exit(1);
}

let client = null;
let ready = false;
let connecting = null;
let latestPayload = null;
let lastSeenAt = 0;
let lastAppliedKey = '';
let lastAppliedAt = 0;
let queuedTimer = null;

function log(message) {
  console.log(`[AniVault RPC] ${message}`);
}

function clean(value, max = 128) {
  return String(value || '').trim().slice(0, max);
}

function normalizePayload(input) {
  if (!input || typeof input !== 'object') return null;

  const title = clean(input.title || 'Anime');
  const episode = Math.max(0, Number(input.episode) || 0);
  const episodeTitle = clean(input.episodeTitle || '');
  const url = String(input.url || 'https://www.anivault.co/');
  const image = String(input.image || input.banner || '').trim().slice(0, 300);
  const currentTime = Math.max(0, Number(input.currentTime) || 0);
  const duration = Math.max(0, Number(input.duration) || 0);
  const playing = Boolean(input.playing);
  const event = String(input.event || '');

  return { title, episode, episodeTitle, url, image, currentTime, duration, playing, event };
}

async function ensureConnected() {
  if (ready && client?.user) return true;
  if (connecting) return connecting;

  connecting = (async () => {
    if (client) {
      try { await client.destroy(); } catch (_) {}
    }

    client = new Client({ clientId: CLIENT_ID });
    ready = false;

    client.on('ready', () => {
      ready = true;
      log('Connected to Discord desktop.');
    });

    client.on('disconnected', () => {
      ready = false;
      log('Discord disconnected; waiting for the next update to reconnect.');
    });

    try {
      await client.login();
      ready = true;
      return true;
    } catch (error) {
      ready = false;
      log(`Discord connection failed: ${error?.message || error}`);
      try { await client.destroy(); } catch (_) {}
      client = null;
      return false;
    }
  })().finally(() => {
    connecting = null;
  });

  return connecting;
}

async function clearPresence() {
  latestPayload = null;
  lastSeenAt = 0;
  lastAppliedKey = '';
  if (!client?.user) return;
  try {
    await client.user.clearActivity();
  } catch (_) {
    ready = false;
  }
}

async function applyPresence(payload) {
  if (!payload) return;

  if (payload.event === 'ended' || payload.event === 'pagehide') {
    await clearPresence();
    return;
  }

  latestPayload = payload;
  lastSeenAt = Date.now();

  const key = JSON.stringify({
    title: payload.title,
    episode: payload.episode,
    episodeTitle: payload.episodeTitle,
    url: payload.url,
    image: payload.image,
    currentTime: Math.floor(payload.currentTime),
    duration: Math.floor(payload.duration),
    playing: payload.playing,
  });

  const now = Date.now();
  if (key === lastAppliedKey && now - lastAppliedAt < MIN_UPDATE_GAP_MS) return;

  const elapsedSinceLast = now - lastAppliedAt;
  if (lastAppliedAt && elapsedSinceLast < MIN_UPDATE_GAP_MS) {
    if (!queuedTimer) {
      queuedTimer = setTimeout(() => {
        queuedTimer = null;
        const next = latestPayload;
        if (next) applyPresence(next).catch(() => {});
      }, MIN_UPDATE_GAP_MS - elapsedSinceLast);
    }
    return;
  }

  if (!(await ensureConnected()) || !client?.user) return;

  const details = clean(payload.title);
  const state = clean(
    `Episode ${payload.episode}${payload.episodeTitle ? ` — ${payload.episodeTitle}` : ''}${payload.playing ? '' : ' · Paused'}`
  );

  const activity = {
    type: 3,
    details,
    state,
    detailsUrl: payload.url,
    assets: payload.image
      ? {
          largeImageKey: payload.image,
          largeImageText: clean(payload.title),
          largeImageUrl: payload.url,
        }
      : undefined,
    buttons: [
      {
        label: payload.playing ? 'Watch on AniVault' : 'Resume on AniVault',
        url: payload.url,
      },
    ],
  };

  if (payload.playing && payload.duration > 0) {
    const start = Date.now() - payload.currentTime * 1000;
    activity.startTimestamp = Math.floor(start);
    activity.endTimestamp = Math.floor(start + payload.duration * 1000);
  }

  try {
    await client.user.setActivity(activity, process.pid);
    lastAppliedKey = key;
    lastAppliedAt = Date.now();
  } catch (error) {
    ready = false;
    log(`Presence update failed: ${error?.message || error}`);
  }
}

function corsHeaders(origin) {
  const allowed = origin === SITE_ORIGIN || origin === 'https://anivault.co';
  return {
    'Access-Control-Allow-Origin': allowed ? origin : SITE_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Private-Network': 'true',
    'Vary': 'Origin',
  };
}

function sendJson(res, status, body, origin) {
  const headers = corsHeaders(origin);
  res.writeHead(status, {
    ...headers,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64 * 1024) throw new Error('Payload too large');
  }
  return raw;
}

const server = http.createServer(async (req, res) => {
  const origin = String(req.headers.origin || '');
  const headers = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true, discord: ready }, origin);
    return;
  }

  if (req.method !== 'POST' || req.url !== '/presence') {
    sendJson(res, 404, { ok: false, error: 'Not found' }, origin);
    return;
  }

  try {
    const body = JSON.parse(await readBody(req));
    const payload = normalizePayload(body);
    if (!payload) {
      sendJson(res, 400, { ok: false, error: 'Invalid presence payload' }, origin);
      return;
    }

    await applyPresence(payload);
    sendJson(res, 200, { ok: true, discord: ready }, origin);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error?.message || String(error) }, origin);
  }
});

const staleTimer = setInterval(() => {
  if (lastSeenAt && Date.now() - lastSeenAt > STALE_SESSION_MS) {
    clearPresence().catch(() => {});
  }
}, 10000);
staleTimer.unref?.();

server.listen(PORT, HOST, () => {
  log(`Listening on http://${HOST}:${PORT}`);
  log(`Allowed origin: ${SITE_ORIGIN}`);
  log('Keep Discord desktop open while watching AniVault.');
});

const shutdown = async () => {
  if (queuedTimer) clearTimeout(queuedTimer);
  clearInterval(staleTimer);
  await clearPresence();
  if (client) {
    try { await client.destroy(); } catch (_) {}
  }
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
