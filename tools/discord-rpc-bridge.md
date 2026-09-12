# AniVault PC Discord RPC bridge

This helper connects the normal AniVault web player to the Discord desktop client through Discord's local RPC/IPC interface.

## Setup

1. Install Node.js 18+.
2. From the AniVault repository root run:

```powershell
npm install
npm run discord:pc
```

The AniVault Discord application ID is built in as the default. You can override it with:

```powershell
npm run discord:pc -- YOUR_DISCORD_APPLICATION_ID
```

3. Keep the helper running and keep Discord desktop open.
4. Open `https://www.anivault.co/watch?...` in Chrome/Edge and start an episode.

The watch page talks only to `127.0.0.1:27123`. If the helper is not running, the site behaves normally and no error is shown to visitors.

## What it sends

- Activity type: Watching
- Application: AniVault (the Discord application's configured name)
- Details: anime title
- State: episode number + episode title
- Episode thumbnail: the same episode-specific `og:image` used by the watch page
- Fallback artwork: anime poster/banner
- Start/end timestamps: calculated from the current video position and duration
- Button: Watch/Resume on AniVault
- Heartbeat: every 10 seconds so the local helper can expire a stale session after 25 seconds

The helper throttles RPC writes to avoid flooding Discord while seeking or changing player state.

## Important

Discord's classic PC RPC uses the application's configured name for the activity's top line. The Discord Developer Portal application should therefore be named **AniVault**. The Android Social SDK can override the displayed name at runtime, but classic RPC cannot override the application name.
