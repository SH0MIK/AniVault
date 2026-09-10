# AniVault Discord Rich Presence bridge

This is an opt-in bridge for AniVault playback → the user's own Discord Rich Presence.

## Architecture

PC playback:

`AniVault player → browser extension → local bridge → Discord desktop IPC`

Phone playback:

`AniVault player → Android browser extension → Wi-Fi/LAN bridge → Discord desktop IPC`

The AniVault site itself never receives a Discord account token and the bot does not impersonate the user.

> Important: stock Chrome on Android does **not** support Chrome extensions. Phone mode therefore requires an Android browser that can run this MV3 extension, or a future native AniVault companion app.

## Exact timing

The extension reads the real `HTMLVideoElement.currentTime` and `duration`.

When playback is active, the companion uses the browser event timestamp plus the real playback position:

`start = sourceEventTime - currentTime * 1000`

`end = start + duration * 1000`

That means Discord performs the visible ticking itself. We do **not** increment a local counter, so seeks and pauses cannot accumulate drift. A seek/resume immediately creates a new timestamp from the video's actual position. Buffering removes the active timestamp until playback resumes.

## PC setup

1. Create a Discord application and use its Application ID as `DISCORD_CLIENT_ID`.
2. In `tools/discord-presence-bridge`, run:

```powershell
$env:DISCORD_CLIENT_ID="YOUR_APPLICATION_ID"
npm install
npm start
```

3. Keep the Discord desktop app running.
4. Open Chrome/Edge → `chrome://extensions` or `edge://extensions`.
5. Enable Developer mode → Load unpacked → select `tools/discord-presence-bridge/extension`.
6. The extension defaults to `http://127.0.0.1:6463`.
7. Open an AniVault watch page and play an episode.

## Phone setup

The PC running Discord must stay on and be connected to the same Wi-Fi/LAN as the phone.

1. Generate a long random bridge secret, for example:

```powershell
$env:ANIVAULT_BRIDGE_SECRET="PUT_A_LONG_RANDOM_SECRET_HERE"
$env:ANIVAULT_RPC_HOST="0.0.0.0"
$env:DISCORD_CLIENT_ID="YOUR_APPLICATION_ID"
npm start
```

2. Allow Node.js/port `6463` through the **private** Windows Firewall network only if Windows asks.
3. Find the PC's LAN IPv4 address with `ipconfig`, for example `192.168.1.10`.
4. On the phone's extension settings, set:
   - Bridge URL: `http://192.168.1.10:6463`
   - Bridge secret: the same value as `ANIVAULT_BRIDGE_SECRET`
5. Open AniVault on the phone and play.

Do **not** port-forward 6463 to the public internet. The bridge is intended for the local network only.

## Discord assets

Register an asset named `anivault` in the Discord application's Rich Presence art assets. The current bridge uses that static asset because arbitrary AniVault cover URLs are not assumed to be valid Rich Presence asset keys.

## Discord account tokens

No Discord account token is needed. Do not put a personal Discord token in the site, extension, bridge, or Android device.
