// Ports includes/anime_card.php. Takes a normalised anime object plus the
// viewer's list-status map (so "Add to List" vs "Edit in List" matches).
import { h } from './helpers';
import { icon } from './icons';
import { NormalisedAnime } from './mal-api';
import { AiredInfo, EpisodeAir } from './episode-air';
import { DubStatus } from './dub-status';
import { Db } from './db';

const STATUS_LABELS: Record<string, string> = { watching: 'Watching', completed: 'Completed', plan_to_watch: 'Planning', dropped: 'Dropped', on_hold: 'On Hold' };
const STATUS_CLASSES: Record<string, string> = { watching: 'badge-watching', completed: 'badge-completed', plan_to_watch: 'badge-ptw', dropped: 'badge-dropped', on_hold: 'badge-onhold' };
export const LANG_CODE: Record<string, string> = { english: 'EN', hindi: 'HI', spanish: 'ES', german: 'DE', french: 'FR', portuguese: 'PT', italian: 'IT', korean: 'KO' };

export interface AnimeCardMeta { airedInfo?: AiredInfo | null; dubbedLangs?: string[]; }

/** One bulk lookup covering a whole page of cards — every route with a
 *  grid should call this once and pass the result to renderAnimeCard per
 *  item, rather than querying per-card. Cache-only (see episode-air.ts /
 *  dub-status.ts), so this is always fast regardless of grid size. */
export async function buildCardMetaMap(db: Db, items: NormalisedAnime[]): Promise<Map<number, AnimeCardMeta>> {
  const ids = [...new Set(items.map((a) => a.mal_id).filter((id): id is number => !!id))];
  const out = new Map<number, AnimeCardMeta>();
  if (!ids.length) return out;
  const [airedMap, dubMap] = await Promise.all([
    EpisodeAir.getForMany(db, ids),
    DubStatus.getForMany(db, ids),
  ]);
  for (const id of ids) out.set(id, { airedInfo: airedMap.get(id) ?? null, dubbedLangs: dubMap.get(id) ?? [] });
  return out;
}

export function renderAnimeCard(a: NormalisedAnime, siteUrl: string, userStatus: string | null, meta?: AnimeCardMeta): string {
  const aid = a.mal_id ?? 0;
  const atitle = a.title_english && a.title_english !== a.title ? a.title_english : (a.title || 'Unknown');
  const aimg = a.images?.jpg?.image_url ?? '';
  const ascore = a.score;
  const atype = a.type ?? '';
  const aeps = a.episodes ?? 0;
  const aurl = `${siteUrl}/anime?id=${aid}`;

  const jTitle = JSON.stringify(atitle);
  const jImage = JSON.stringify(aimg);
  const inUserList = userStatus !== null;

  // MAL's own episode count is only reliable once a show has finished —
  // prefer the Jikan-derived "aired so far" count when we have one cached.
  const airedInfo = meta?.airedInfo;
  let epsLabel = aeps ? `${aeps} eps` : '';
  if (airedInfo && airedInfo.aired > 0) {
    epsLabel = airedInfo.total && airedInfo.total !== airedInfo.aired ? `Ep ${airedInfo.aired}/${airedInfo.total}` : `Ep ${airedInfo.aired}`;
  }

  const dubbed = meta?.dubbedLangs ?? [];
  const dubCodes = dubbed.map((l) => LANG_CODE[l] ?? l.slice(0, 2).toUpperCase());
  const dubLabel = dubCodes.length ? (dubCodes.length > 3 ? `${dubCodes.slice(0, 3).join(' ')} +${dubCodes.length - 3}` : dubCodes.join(' ')) : '';

  return `
<div class="anime-card" onclick="window.location.href='${h(aurl)}'">
  <div class="anime-card-poster">
    ${aimg
      ? `<img src="${h(aimg)}" alt="${h(atitle)}" loading="lazy">`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:2rem;">${icon('user', 'icon-xl')}</div>`}
    ${ascore ? `<div class="anime-card-score">${icon('star', 'icon-small')} ${ascore.toFixed(1)}</div>` : ''}
    ${dubLabel ? `<div class="anime-card-dub" title="Dubbed: ${h(dubbed.join(', '))}">${icon('mic', 'icon-small')} ${h(dubLabel)}</div>` : ''}
    ${userStatus ? `<div class="anime-card-user-status badge ${STATUS_CLASSES[userStatus] ?? 'badge-default'}" data-anime-id="${aid}">${STATUS_LABELS[userStatus] ?? userStatus}</div>` : ''}
    <div class="anime-card-overlay">
      <button class="btn btn-primary btn-sm" onclick='event.stopPropagation(); addToList(${aid}, ${jTitle}, ${jImage}, ${Number(aeps)})'>
        ${inUserList ? '✏️ Edit in List' : `${icon('plus', 'icon-small')} Add to List`}
      </button>
    </div>
    <div class="anime-card-bottom-mobile">
      <button class="anime-card-add-mobile" onclick='event.stopPropagation(); addToList(${aid}, ${jTitle}, ${jImage}, ${Number(aeps)})' title="${inUserList ? 'Edit in List' : 'Add to List'}">
        ${inUserList ? icon('edit', 'icon-small') : '+'}
      </button>
      ${userStatus ? `<span class="anime-card-status-mobile badge ${STATUS_CLASSES[userStatus] ?? 'badge-default'}">${STATUS_LABELS[userStatus] ?? userStatus}</span>` : ''}
    </div>
  </div>
  <div class="anime-card-info">
    <div class="anime-card-title">${h(atitle)}</div>
    <div class="anime-card-meta">${h(atype)}${epsLabel ? ` · ${epsLabel}` : ''}</div>
  </div>
</div>`;
}
