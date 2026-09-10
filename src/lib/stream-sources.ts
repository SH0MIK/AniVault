// Canonical "fixed server button" definitions shared between the watch
// page markup (watch.ts — renders the buttons server-side, always
// visible) and the player script (watch-script1.ts — resolves each
// button's actual stream in the background and wires up same-group
// fallback). Keeping this in one place means the button list rendered
// server-side and the resolution list used client-side can never drift
// out of sync with each other.
//
// One button per PROVIDER, not per source — a source with 4 providers
// (e.g. AnimeNoSub: Moon/Omega/Nova/Turbo) gets 4 separate fixed buttons,
// each hardcoded to that exact provider name and checking it directly.
// `provider` must be the EXACT string the scraper expects as its
// `server=` query param (case is handled server-side, but the text
// itself must match); `null` means the source has no server selector at
// all (AnimeHeaven only exposes one stream, no `server=` param needed).

export interface FixedProviderDef {
  source: string;
  provider: string | null;
  label: string;
}

// Sub tab.
export const SUB_PROVIDERS: FixedProviderDef[] = [
  { source: 'anikoto', provider: 'Hd-1', label: 'Hd-1' },
  { source: 'anikoto', provider: 'Vidstream-2', label: 'Vidstream-2' },
  { source: 'anizone', provider: 'Japanese', label: 'Japanese (Zone)' },
  { source: 'animeheaven', provider: null, label: 'AnimeHeaven' },
  { source: 'reanime', provider: 'Hd-2', label: 'Hd-2' },
  { source: 'aniwaves', provider: 'Vidplay', label: 'Vidplay' },
  { source: 'aniwaves', provider: 'BYFMS', label: 'BYFMS' },
  { source: 'watchanimeworld', provider: 'Japanese', label: 'Japanese' },
  { source: 'animenosub', provider: 'Sub - Moon', label: 'Moon' },
  { source: 'animenosub', provider: 'Sub - Omega', label: 'Omega' },
  { source: 'animenosub', provider: 'Sub - Nova', label: 'Nova' },
  { source: 'animenosub', provider: 'Sub - Turbo', label: 'Turbo' },
];

// Dub (English) tab. AnimeHeaven and DesiDub have no English dub, so
// they're excluded here entirely.
export const DUB_PROVIDERS: FixedProviderDef[] = [
  { source: 'anikoto', provider: 'Hd-1', label: 'Hd-1' },
  { source: 'anikoto', provider: 'Vidstream-2', label: 'Vidstream-2' },
  { source: 'anizone', provider: 'English', label: 'English (Zone),
  { source: 'reanime', provider: 'Hd-2', label: 'Hd-2' },
  { source: 'aniwaves', provider: 'Vidplay', label: 'Vidplay' },
  { source: 'aniwaves', provider: 'BYFMS', label: 'BYFMS' },
  { source: 'watchanimeworld', provider: 'English', label: 'English' },
  { source: 'animenosub', provider: 'Dub - Moon', label: 'Moon' },
  { source: 'animenosub', provider: 'Dub - Omega', label: 'Omega' },
  { source: 'animenosub', provider: 'Dub - Nova', label: 'Nova' },
  { source: 'animenosub', provider: 'Dub - Turbo', label: 'Turbo' },
];

// Hindi Dub group — its own separate fallback pool, independent of the
// English Dub group above.
export const HINDI_PROVIDERS: FixedProviderDef[] = [
  { source: 'watchanimeworld', provider: 'Hindi', label: 'Hindi' },
  { source: 'desidub', provider: 'Abyssdub', label: 'Abyss' },
  { source: 'desidub', provider: 'VMolydub', label: 'VMoly' },
  { source: 'desidub', provider: 'Mirrordub', label: 'Mirror' },
  { source: 'desidub', provider: 'Rubydub', label: 'Ruby' },
  { source: 'desidub', provider: 'VMoly (Muse)dub', label: 'VMoly (Muse)' },
  { source: 'desidub', provider: 'Mirror (Muse)dub', label: 'Mirror (Muse)' },
  { source: 'desidub', provider: 'Abyss (Muse)dub', label: 'Abyss (Muse)' },
  { source: 'desidub', provider: 'FileMoondub', label: 'FileMoon' },
  { source: 'desidub', provider: 'PlayerXdub', label: 'PlayerX' },
];

// AniZone + WatchAnimeWorld also carry OTHER languages (Tamil, Telugu,
// Spanish, ...) beyond English/Hindi — those stay fully dynamic (Multi
// Dub group, built per-anime, no fixed buttons, no fallback), per the
// explicit call not to combine/fallback multi-dub languages.
export const MULTI_LANG_SOURCES = ['anizone', 'watchanimeworld'];

function h(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Stable per-button id derived from source+provider — used as the
// data-server suffix so the button can be looked up again client-side.
// Slugged because provider names contain spaces/parens ("Sub - Moon",
// "Mirror (Muse)dub") that aren't safe inside an attribute-selector.
export function providerId(source: string, provider: string | null): string {
  const slug = (provider || source).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
  return `${source}__${slug}`;
}

// Server-rendered button markup. Every button exists in the HTML from
// the first response — nothing is created/removed by JS anymore. The
// `server-btn-pending` class shows a small spinner (see watch-css.ts)
// until the player script resolves (or fails to resolve) that EXACT
// provider in the background; `data-server` is the STABLE key
// (`fixed:<group>:<providerId>`) used for click handling + active-button
// highlighting, independent of which underlying provider ends up
// actually playing behind it once same-group fallback kicks in (see
// `data-real-server`, set by the player script). `data-fixed-key` stays
// the SOURCE (not the provider) purely so multiple providers from the
// same source share that source's accent color in watch-css.ts.
export function fixedServerBtn(group: string, source: string, provider: string | null, label: string): string {
  const id = providerId(source, provider);
  return `<button class="server-btn server-btn-pending" data-server="fixed:${h(group)}:${h(id)}" data-fixed-key="${h(source)}"><span class="server-btn-spin"></span>${h(label)}</button>`;
}
