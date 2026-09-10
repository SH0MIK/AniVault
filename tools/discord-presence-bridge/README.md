# AniVault Discord Rich Presence bridge

This is an opt-in local bridge for AniVault playback → the user's own Discord Rich Presence.

## Architecture

`AniVault player → Chrome/Edge extension → 127.0.0.1:6463 → Discord desktop IPC`

The AniVault site itself never receives a Discord token and the bot does not impersonate the user.

## Exact timing

The extension reads the real `HTMLVideoElement.currentTime` and `duration`.

When playback is active, the companion sends Discord absolute timestamps:

`start = Date.now() - currentTime * 1000`

`end = start + duration * 1000`

That means Discord performs the visible ticking itself. We do **not** increment a local counter, so seeks and pauses cannot accumulate drift. A seek/resume immediately creates a new timestamp from the video's actual position. Buffering removes the active timestamp until playback resumes.

## Setup

1. Create a Discord application and use its Application ID as `DISCORD_CLIENT_ID`.
2. In `tools/discord-presence-bridge`, run:

```bash
npm install
set DISCORD_CLIENT_ID=YOUR_APPLICATION_ID
npm start
```

PowerShell:

```powershell
$env:DISCORD_CLIENT_ID="YOUR_APPLICATION_ID"
npm install
npm start
```

3. Keep the Discord desktop app running.
4. Open Chrome/Edge → `chrome://extensions` or `edge://extensions`.
5. Enable Developer mode → Load unpacked → select `tools/discord-presence-bridge/extension`.
6. Open an AniVault watch page and play an episode.

The extension is deliberately optional: if the companion is not running, the player continues normally.

## Discord assets

Register an asset named `anivault` in the Discord application's Rich Presence art assets. The current bridge uses that static asset because arbitrary AniVault cover URLs are not assumed to be valid Rich Presence asset keys.
