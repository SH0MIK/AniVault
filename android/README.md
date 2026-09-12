# AniVault Android + Discord Rich Presence

This module turns AniVault into a phone-only playback app that can publish the **user's own** Rich Presence directly to the Discord Android app.

## Why this is different from the browser extension

The browser extension/PC bridge requires Discord Desktop. This Android app embeds AniVault in an Android WebView and forwards the real HTML5 video position to the native Discord Social SDK.

`AniVault WebView → Kotlin JS bridge → Discord Social SDK → Discord Android`

Discord added unauthenticated Rich Presence RPC on Android in Social SDK 1.10+. The Android Discord app must be installed and signed in. No personal Discord account token is used. See Discord's official Rich Presence documentation for the Android requirement.

## What is implemented

- AniVault WebView player.
- Detects `#sp-video` or the first HTML5 `<video>`.
- Reads `currentTime`, `duration`, play/pause/buffering and episode metadata.
- Native Discord Rich Presence via `discordpp::Client`.
- Exact elapsed + remaining timestamps derived from the browser's real playback position.
- Seek/resume recalculates timestamps instead of running a local counter.
- Pause/buffering removes active timestamps.
- Episode end/page exit clears the presence.
- AniVault application asset and `Watch on AniVault` button.
- No Discord account token.

## One required proprietary dependency

Discord distributes the Social SDK binaries through the Discord Developer Portal rather than Maven Central. The repository intentionally does **not** contain Discord's proprietary AAR.

1. Create/configure the AniVault Discord application.
2. Enable Discord Social SDK for the application.
3. Download the Android/C++ Social SDK package.
4. Put the supplied `discord_partner_sdk.aar` at:

```text
android/app/libs/discord_partner_sdk.aar
```

Discord's Android setup also requires Prefab/CMake integration; this project already has those Gradle/CMake hooks.

## Configure the Application ID

Use the Discord application ID as a Gradle property. Do not put a user/account token here.

For Android Studio, add this to `android/gradle.properties` locally (do not commit secrets):

```properties
discordApplicationId=YOUR_DISCORD_APPLICATION_ID
```

Or pass it on the Gradle command line:

```powershell
./gradlew assembleDebug -PdiscordApplicationId=YOUR_DISCORD_APPLICATION_ID
```

The same ID is used to generate the required Android `discord-YOUR_APPLICATION_ID` scheme.

## Build

Open the `android/` folder in Android Studio with an Android SDK/NDK/CMake installation, then build the `app` module.

The current project targets Android 7.0+ (API 24).

## Discord setup

Discord's current Social SDK documentation says Rich Presence without authentication is supported on Android when the Discord app is installed and signed in. The app only needs a registered Discord Application ID for this direct presence path.

The Rich Presence uses:

```text
Playing AniVault
Watching Attack on Titan
Episode 12 — ...
00:00 ───────── 24:00
[Watch on AniVault]
```

The visible timer is Discord's own timestamp renderer. The app supplies absolute start/end times calculated from the actual HTML5 video position.

## Current limitation

This is an Android app wrapper around AniVault, not a background service that can inspect playback happening in Chrome. To get the native Rich Presence, playback must happen inside this AniVault Android app.

If later we want normal Chrome Android playback to control the presence, Android would need a separate native companion/accessibility-style integration; that is intentionally not used here.
