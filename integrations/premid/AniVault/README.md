# AniVault PreMiD Activity

A standalone PreMiD Activity prototype for https://www.anivault.co/.

## Current prototype

- Detects AniVault pages.
- Reads the page title and Open Graph poster where available.
- Detects a standard HTML video element and reports playing/paused state and timestamps.
- Tries a few generic episode-title selectors; these will be replaced with verified AniVault selectors after testing against the live watch page.

## Setup

1. Clone the official [PreMiD Activities repository](https://github.com/PreMiD/Activities) and install its dependencies using the official instructions.
2. Copy this folder into `websites/A/AniVault/` in that checkout.
3. Create a Discord Developer Portal application for the activity and copy its Application ID into `REPLACE_WITH_DISCORD_APPLICATION_ID` in `presence.ts`. Keep this separate from AniVault production OAuth credentials.
4. Replace `REPLACE_WITH_DISCORD_USER_ID` in `metadata.json` with the activity author's Discord user ID before validation/submission.
5. Run `npx pmd dev AniVault` from the PreMiD Activities repository.
5. Install the PreMiD browser extension, enable Activity Developer Mode, open AniVault in the same desktop browser, and check Discord Rich Presence.

## Important limitations

- This activity is for desktop browsers with PreMiD installed. It does not make PreMiD work in mobile browsers.
- The player may be embedded in a cross-origin iframe. If so, the activity cannot read that iframe's video element directly; we will need to verify whether the parent AniVault page exposes the current episode/player state.
- This prototype is isolated from AniVault's production runtime. It does not add scripts or make backend changes to the live site.
- Test the activity locally before submitting it to PreMiD's official Activities repository.
