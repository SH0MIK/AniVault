// Canonical "fixed server button" definitions shared between the watch
// page markup (watch.ts — renders the buttons server-side, always
// visible) and the player script (watch-script1.ts — resolves each
// button's actual stream in the background and wires up same-group
// fallback). Keeping this in one place means the button list rendered
// server-side and the priority/fallback order used client-side can never
// drift out of sync with each other.
//
// IMPORTANT: `key` values must exactly match the `source` identifiers
// used by the scraper API routes (anikoto_stream.php, reanime_stream.php,
// etc.) — these are not just labels.

export interface FixedSourceDef {
  key: string;
  label: string;
}

// Sub tab — every source that can serve a sub stream. Order here is the
// fallback priority: if a button's own source has nothing for this
// episode, the first other source in this list that DOES have something
// is what actually plays behind that button.
export const SUB_SOURCES: FixedSourceDef[] = [
  { key: 'anizone', label: 'AniZone' },
  { key: 'anikoto', label: 'Anikoto' },
  { key: 'animeheaven', label: 'AnimeHeaven' },
  { key: 'reanime', label: 'ReAnime' },
  { key: 'aniwaves', label: 'AniWaves' },
  { key: 'watchanimeworld', label: 'WatchAnimeWorld' },
  { key: 'animenosub', label: 'AnimeNoSub' },
];

// Dub (English) tab — AnimeHeaven has no dub, so it's excluded here.
export const DUB_SOURCES: FixedSourceDef[] = [
  { key: 'anizone', label: 'AniZone' },
  { key: 'anikoto', label: 'Anikoto' },
  { key: 'reanime', label: 'ReAnime' },
  { key: 'aniwaves', label: 'AniWaves' },
  { key: 'watchanimeworld', label: 'WatchAnimeWorld' },
  { key: 'animenosub', label: 'AnimeNoSub' },
];

// Hindi Dub group — its own separate fallback pair, independent of the
// English Dub group above.
export const HINDI_SOURCES: FixedSourceDef[] = [
  { key: 'watchanimeworld', label: 'WatchAnimeWorld' },
  { key: 'desidub', label: 'DesiDub' },
];

// The two multi-dub-language-capable sources (Tamil/Telugu/Spanish/etc).
// Multi Dub buttons stay fully dynamic (built per-language, per-anime) —
// no fixed buttons, no cross-source fallback, per product decision.
export const MULTI_LANG_SOURCES = ['anizone', 'watchanimeworld'];

function h(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Server-rendered button markup. Every button exists in the HTML from
// the first response — nothing is created/removed by JS anymore. The
// `server-btn-pending` class shows a small spinner (see watch-css.ts)
// until the player script resolves (or fails to resolve) that source in
// the background; `data-server` is a STABLE key (`fixed:<group>:<key>`)
// used for click handling + active-button highlighting, independent of
// which underlying source ends up actually playing behind it once
// fallback is resolved (see `data-real-server`, set by the player
// script). `group` (sub/dub/hindi) is part of the key because the SAME
// source (e.g. AniZone) gets its own separate button — and its own
// separate fallback resolution — in more than one group; without the
// group prefix the two buttons would collide on the same data-server
// value and stomp on each other's state.
export function fixedServerBtn(group: string, key: string, label: string): string {
  return `<button class="server-btn server-btn-pending" data-server="fixed:${h(group)}:${h(key)}" data-fixed-key="${h(key)}"><span class="server-btn-spin"></span>${h(label)}</button>`;
}
