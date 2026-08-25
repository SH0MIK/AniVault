// Ports pages/anime.php. Episodes, Characters, and Related/Recommendations
// tabs are populated entirely client-side (fetching Jikan/AniList directly,
// same as the PHP version) -- that whole 19KB tail of JS is carried over
// verbatim in anime-tail.ts. This route only needs to server-render the
// skeleton: poster, meta, genres, action buttons, and tab containers.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { MalAPI } from '../lib/mal-api';
import { AnimeTracker } from '../lib/tracker';
import { Notification } from '../lib/notification';
import { h, statusBadge } from '../lib/helpers';
import { icon } from '../lib/icons';
import { renderHeader, renderFooter, CurrentUser } from '../render/layout';
import { animeTailScript } from '../render/anime-tail';
import { getBannerData } from '../lib/settings';
import { rowNavScript } from '../render/home-js';
import { EpisodeAir } from '../lib/episode-air';
import { DubStatus } from '../lib/dub-status';

export const animeRoutes = new Hono<{ Bindings: Env }>();

const SERIES_RELATION_TYPES = ['Sequel', 'Prequel', 'Alternative Version', 'Alternative Setting', 'Side Story', 'Parent Story', 'Full Story', 'Summary', 'Movie', 'Spin-off'];

animeRoutes.get('/anime', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  const mal = new MalAPI(c.env, c.env.API_CACHE, db);
  const siteUrl = c.env.SITE_URL;

  const id = parseInt(c.req.query('id') ?? '0', 10) || 0;
  if (!id) return c.redirect(siteUrl + '/');

  const result = await mal.getAnime(id);
  const anime = result.data;
  if (!anime) {
    return c.html(`<script>location.replace(${JSON.stringify(siteUrl + '/')});</script>`);
  }

  let videoEpRows: { episode_num: number; qualities: string | null }[] = [];
  try {
    videoEpRows = await db.fetchAll('SELECT episode_num, qualities FROM episode_videos WHERE anime_id = ? AND is_active = 1', [id]);
  } catch { /* table may not exist on fresh install */ }

  const videoEpSet: Record<number, { sub: boolean; dub: boolean }> = {};
  for (const row of videoEpRows) {
    let hasDub = false;
    if (row.qualities) {
      try { hasDub = !!JSON.parse(row.qualities).dub; } catch { /* ignore */ }
    }
    videoEpSet[row.episode_num] = { sub: true, dub: hasDub };
  }

  let animeDubConfirmed = false;
  try {
    const dubRow = await db.fetchOne('SELECT has_dub FROM anime_dub_status WHERE anime_id = ? AND has_dub = 1', [id]);
    animeDubConfirmed = !!dubRow;
    if (animeDubConfirmed) {
      for (const epNum of Object.keys(videoEpSet)) videoEpSet[Number(epNum)].dub = true;
    }
  } catch { /* ignore */ }

  const title = anime.title_english && anime.title_english !== anime.title ? anime.title_english : anime.title || 'Unknown';

  const seriesEntries = (anime.related_anime ?? [])
    .filter((rel: any) => rel && SERIES_RELATION_TYPES.includes(rel.relation_type_formatted ?? ''))
    .map((rel: any) => ({ id: rel?.entry?.mal_id ?? 0, title: rel?.entry?.title ?? '', type: rel?.relation_type_formatted ?? '' }));
  const hasSeriesLinks = seriesEntries.length > 0;

  const jpTitle = anime.title_japanese || null;
  const image = anime.images?.jpg?.large_image_url ?? '';

  // MAL's own episode count only firms up once a show finishes airing —
  // prefer the Jikan-derived "aired so far" count when we have it. This is
  // the one page where the extra round trip on a cache miss is worth it
  // (single anime, not a grid), so it's a live refresh-if-stale rather
  // than a cache-only lookup.
  const { info: airedInfo, isFresh: airedInfoFresh } = await EpisodeAir.getCachedAny(db, id);
  const totalEps = airedInfo?.total ?? anime.episodes ?? 0;
  const airedSoFar = airedInfo?.aired ?? null;
  // Nothing cached (or nothing from MAL) to show at all -- render a
  // skeleton for the ep count and fill it in client-side once
  // /api/ep_count.php resolves, instead of blocking this page on the
  // scraper API. If we DO have a number (even a stale one), show it
  // immediately and just quietly refresh it in the background.
  const epsUnknown = totalEps === 0;
  const epsNeedsRefresh = !airedInfoFresh;
  const dubbedLangs = await DubStatus.getFor(db, id);

  // Logo + cover both come pre-resolved on `anime` itself -- getAnime()
  // already ran them through getAnimeArt() (scraper poster/cover/logo,
  // blended with your admin-saved overrides per the Image Source Priority
  // setting on admin/anime_images.php). Plus a simple sub/dub yes-no
  // readout for the meta row -- replaces the old "Watch on" list of every
  // streaming provider with just the two badges that actually matter.
  const titleLogo = anime.logo_image ?? '';
  const hasSub = videoEpRows.length > 0;
  const hasDub = animeDubConfirmed || dubbedLangs.length > 0 || Object.values(videoEpSet).some((v) => v.dub);

  const backdrop = anime.cover_image || image;
  const hasBanner = !!anime.cover_image;

  const currentUser = auth.check() ? await auth.getCurrentUser() : null;
  let userEntry: any = null;
  let isFav = false;
  if (currentUser) {
    userEntry = await AnimeTracker.getUserEntry(db, currentUser.id, id);
    isFav = await AnimeTracker.isFavorite(db, currentUser.id, id);
  }
  const unreadCount = currentUser ? await Notification.unreadCount(db, currentUser.id) : 0;
  const layoutUser: CurrentUser | null = currentUser
    ? { id: currentUser.id, username: currentUser.username, avatar_url: currentUser.avatar_url, role: currentUser.role }
    : null;

  const __banner = await getBannerData(db);
  let html = renderHeader({
    ...__banner,    siteUrl, siteName: c.env.SITE_NAME, pageTitle: title, currentPage: 'anime', currentUser: layoutUser, unreadCount,
    requestUrl: c.req.url,
    ogData: {
      title, description: (anime.synopsis ?? '').substring(0, 200), image, image_width: 600, image_height: 850,
      url: `${siteUrl}/anime?id=${id}`, type: 'video.tv_show',
    },
  });

  const jTitle = JSON.stringify(title);
  const jImage = JSON.stringify(image);

  html += `
<section class="ih-hero${hasBanner ? '' : ' ih-hero-no-banner'}">
  <div class="ih-bg${hasBanner ? '' : ' ih-bg-fallback'}" style="background-image:url('${h(backdrop)}')"></div>
  <div class="ih-bg-scrim"></div>
  ${(titleLogo && hasBanner) ? `<img class="ih-logo-bg" src="${h(titleLogo)}" alt="" aria-hidden="true">` : ''}

  <div class="container ih-inner">
    <div class="ih-thumb">
      <img src="${h(image || backdrop)}" alt="${h(title)}">
    </div>

    <div class="ih-content">
      <div class="ih-plaintitle">${h(title)}</div>

      ${titleLogo ? `<img class="ih-logo" src="${h(titleLogo)}" alt="${h(title)}" loading="eager">` : `<h1 class="ih-title">${h(title)}</h1>`}

      <div class="ih-meta-row">
        ${anime.score ? `<span class="ih-meta-item ih-meta-score">${icon('star', 'icon-inline')} ${anime.score.toFixed(1)}</span>` : ''}
        <span class="ih-meta-item">${icon('tv', 'icon-inline')} ${h(titleCase(anime.type || 'TV'))}</span>
        <span class="ih-meta-item">${icon('list', 'icon-inline')} <span id="ih-eps-text"${epsUnknown ? ' class="eps-skel"' : ''}>${epsUnknown ? '' : (airedSoFar !== null && airedSoFar > 0 && airedSoFar !== totalEps ? `Ep ${airedSoFar}/${totalEps || '?'} aired` : `${totalEps} eps`)}</span></span>
        ${anime.duration_mins ? `<span class="ih-meta-item">${icon('clock', 'icon-inline')} ${anime.duration_mins}m</span>` : ''}
        ${seasonYearLabel(anime.start_date) ? `<span class="ih-meta-item">${icon('calendar', 'icon-inline')} ${h(seasonYearLabel(anime.start_date)!)}</span>` : ''}
        <span class="ih-meta-item${anime.status === 'Currently Airing' ? ' ih-meta-airing' : ''}">${icon(anime.status === 'Currently Airing' ? 'airing' : anime.status === 'Finished Airing' ? 'finished' : anime.status === 'Not yet aired' ? 'upcoming' : 'info', 'icon-inline')} ${h(anime.status || '—')}</span>
        <span class="ih-meta-item">${icon('captions', 'icon-inline')} Sub</span>
        ${hasDub ? `<span class="ih-meta-item">${icon('mic', 'icon-inline')} Dub</span>` : ''}
      </div>

      ${(anime.genres?.length ?? 0) > 0 ? `
      <div class="ih-genres">
        ${anime.genres.filter(Boolean).map((g) => `<a href="${siteUrl}/browse?genre=${g?.mal_id ?? ''}" class="ih-genre-tag">${h(g?.name ?? '')}</a>`).join('')}
      </div>` : ''}

      <div class="ih-infoline">
        <span>Studio: <strong>${h((anime.studios ?? []).filter(Boolean).map((s) => s?.name ?? '').filter(Boolean).join(', ') || '—')}</strong></span>
        <span>Source: <strong>${h(anime.source || '—')}</strong></span>
      </div>

      <div class="ih-cta">
        <a href="#episodes-section" class="ih-btn-play" onclick="var s=document.getElementById('episodes-section'); if(s) s.scrollIntoView({behavior:'smooth'});">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
          Play Episode 1
        </a>
        <button class="ih-btn-secondary" id="ih-add-list-btn" onclick='addToList(${id}, ${jTitle}, ${jImage}, ${totalEps})'>
          ${icon(userEntry ? 'edit' : 'heart', 'icon-inline')} ${userEntry ? 'Edit in List' : 'Add to list'}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <button class="ih-btn-secondary ih-btn-subscribe" id="fav-btn" style="${isFav ? 'color:var(--accent-2)' : ''}" onclick='toggleFavorite(this, ${id}, ${jTitle}, ${jImage})'>
          ${icon('bell', 'icon-inline')} ${isFav ? 'Subscribed' : 'Subscribe'}
        </button>
      </div>

      <div id="anime-user-status" class="mt-2" data-total-eps="${totalEps}" data-eps-watched="${userEntry?.episodes_watched ?? 0}">
        ${userEntry ? `
        <div class="flex gap-1" style="gap:8px;align-items:center;justify-content:center;">
          <span id="anime-status-badge">${statusBadge(userEntry.status)}</span>
          <span id="anime-score-badge" style="color:var(--gold);font-size:0.9rem;">${userEntry.score ? `⭐ ${userEntry.score}/10` : ''}</span>
          <span id="anime-eps-badge" class="text-muted" style="font-size:0.85rem;">${totalEps > 0 ? `${userEntry.episodes_watched}/${totalEps} eps` : ''}</span>
        </div>
        <div id="anime-progress-wrap" class="progress-bar mt-1" style="max-width:400px;margin-left:auto;margin-right:auto;${totalEps > 0 && userEntry.episodes_watched ? '' : 'display:none'}">
          <div id="anime-progress-fill" class="progress-fill" style="width:${totalEps > 0 ? Math.min(100, Math.round((userEntry.episodes_watched / totalEps) * 100)) : 0}%"></div>
        </div>` : `
        <div class="flex gap-1" style="gap:8px;align-items:center;justify-content:center;">
          <span id="anime-status-badge"></span>
          <span id="anime-score-badge" style="color:var(--gold);font-size:0.9rem;"></span>
          <span id="anime-eps-badge" class="text-muted" style="font-size:0.85rem;"></span>
        </div>
        <div id="anime-progress-wrap" class="progress-bar mt-1" style="max-width:400px;margin-left:auto;margin-right:auto;display:none;"><div id="anime-progress-fill" class="progress-fill" style="width:0%"></div></div>`}
      </div>
    </div>
  </div>
</section>

<div class="container info-body">
  <div class="info-section">
    <div class="info-grid-2">
      <div>
        <h2 class="info-section-title">Synopsis</h2>
        ${anime.synopsis ? `<p class="info-desc" id="info-desc">${h(anime.synopsis).replace(/\n/g, '<br>')}</p><button id="info-desc-toggle" class="info-desc-toggle" style="display:none;" type="button" onclick="var d=document.getElementById('info-desc'); d.classList.toggle('expanded'); this.textContent = d.classList.contains('expanded') ? 'Show less' : 'Show more';">Show more</button>
        <script>(function(){var d=document.getElementById('info-desc'),t=document.getElementById('info-desc-toggle'); if(d&&t&&d.scrollHeight>d.clientHeight+4){t.style.display='inline-block';}})();</script>` : `<p class="text-muted">No synopsis available.</p>`}
        ${anime.background ? `<h2 class="info-section-title" style="margin-top:28px;">Background</h2><p style="color:var(--text-secondary);line-height:1.75;">${h(anime.background).replace(/\n/g, '<br>')}</p>` : ''}
      </div>
      <div>
        <h2 class="info-section-title">Information</h2>
        <div class="info-stats">
          ${infoStatRow('Type', anime.type || '—')}
          ${infoStatRow('Episodes', `<span id="info-eps-value"${epsUnknown ? ' class="eps-skel"' : ''}>${epsUnknown ? '' : (airedSoFar !== null && airedSoFar > 0 && airedSoFar !== totalEps ? `${airedSoFar} aired${totalEps ? ' / ' + totalEps + ' total' : ''}` : String(totalEps))}</span>`, true)}
          ${infoStatRow('Status', anime.status || '—')}
          ${infoStatRow('Aired', anime.aired?.string || '—')}
          ${infoStatRow('Duration', anime.duration || '—')}
          ${infoStatRow('Rating', anime.rating || '—')}
          ${infoStatRow('Studio', (anime.studios ?? []).filter(Boolean).map((s) => s?.name ?? '').filter(Boolean).join(', ') || '—')}
          ${infoStatRow('Source', anime.source || '—')}
        </div>
      </div>
    </div>
  </div>

  ${(anime.themes?.length ?? 0) > 0 ? `
  <div class="info-section">
    <h2 class="info-section-title">Themes</h2>
    <div class="info-tags">${anime.themes.filter(Boolean).map((t: any) => `<span class="info-tag">${h(t?.name ?? '')}</span>`).join('')}</div>
  </div>` : ''}

  <div class="info-section" id="episodes-section">
    <h2 class="info-section-title" id="ep-tab-btn">Episodes <span id="ep-tab-count"${epsUnknown ? ' class="eps-skel"' : ''}>${epsUnknown ? '' : `(${totalEps})`}</span></h2>
    <div id="ep-range-wrap" style="display:none;margin-bottom:.9rem;"></div>
    <div class="ep-grid" id="ep-grid-loading" aria-hidden="true">${Array.from({ length: 6 }).map(() => `
      <div class="ep-card-skel">
        <div class="ep-skel-thumb"></div>
        <div class="ep-skel-info">
          <div class="ep-skel-line"></div>
          <div class="ep-skel-line short"></div>
        </div>
      </div>`).join('')}
    </div>
    <div class="ep-grid" id="ep-grid-js" style="display:none;"></div>
  </div>

  <div class="modal-overlay" id="ep-modal">
    <div class="modal" style="max-width:620px;width:100%;">
      <div class="modal-header" style="padding:1rem 1.25rem;display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;">
        <div style="flex:1;min-width:0;">
          <div id="ep-modal-title" style="font-size:1.1rem;font-weight:700;line-height:1.4;"></div>
          <div style="display:flex;align-items:center;gap:10px;margin-top:5px;flex-wrap:wrap;">
            <span id="ep-modal-meta" style="font-size:0.82rem;color:var(--text-muted);"></span>
            <span id="ep-modal-score" style="color:var(--gold);font-size:0.85rem;font-weight:600;"></span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          ${(layoutUser?.role === 'admin' || layoutUser?.role === 'owner') ? `<button id="ep-modal-edit-btn" class="btn btn-sm btn-secondary" style="font-size:0.78rem;padding:4px 10px;">✏️ Edit</button>` : ''}
          <button class="modal-close" onclick="closeModal('ep-modal')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.3rem;padding:0;line-height:1;">✕</button>
        </div>
      </div>
      <div id="ep-modal-thumb-wrap" style="display:none;width:100%;aspect-ratio:16/9;background:var(--bg-base);overflow:hidden;">
        <img id="ep-modal-thumb" src="" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">
      </div>
      <div class="modal-body">
        <p id="ep-modal-synopsis" style="color:var(--text-secondary);line-height:1.8;font-size:0.93rem;margin:0 0 1rem;"></p>
        <div id="ep-modal-watch"></div>
      </div>
    </div>
  </div>

  ${(layoutUser?.role === 'admin' || layoutUser?.role === 'owner') ? renderEpisodeEditorModal() : ''}

  <div class="info-section">
    <div class="section-header">
      <h2 class="info-section-title" style="margin-bottom:0;">Characters</h2>
      <div style="display:flex;align-items:center;gap:12px;">
        <button class="btn btn-ghost btn-sm btn-icon row-nav-btn" data-target="char-grid-js" data-dir="prev" aria-label="Previous">${icon('chevron-left', 'icon-small')}</button>
        <button class="btn btn-ghost btn-sm btn-icon row-nav-btn" data-target="char-grid-js" data-dir="next" aria-label="Next">${icon('chevron-right', 'icon-small')}</button>
      </div>
    </div>
    <div id="char-grid-loading" style="text-align:center;padding:2.5rem 0;color:var(--text-muted);">
      <div class="av-loader" style="margin:0 auto 1rem;transform:scale(.6);"></div>
      Loading characters…
    </div>
    <div class="scroll-row" id="char-grid-js" style="display:none;"></div>
  </div>

  <div class="info-section" id="video-section">
    <h2 class="info-section-title">Trailer</h2>
    <div id="video-loading" style="text-align:center;padding:2.5rem 0;color:var(--text-muted);">
      <div class="av-loader" style="margin:0 auto 1rem;transform:scale(.6);"></div>
      Loading videos…
    </div>
    <div id="video-js" style="display:none;">
      <div id="video-player-wrap" style="position:relative;width:100%;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:var(--bg-base);margin-bottom:14px;"></div>
      <div class="video-tabs" style="display:flex;gap:8px;margin-bottom:12px;">
        <button class="btn btn-sm video-tab-btn" data-tab="trailers" onclick="switchVideoTab('trailers')">Trailers</button>
        <button class="btn btn-sm video-tab-btn" data-tab="opening" onclick="switchVideoTab('opening')">Opening</button>
        <button class="btn btn-sm video-tab-btn" data-tab="ending" onclick="switchVideoTab('ending')">Ending</button>
      </div>
      <div class="scroll-row" id="video-list-js"></div>
    </div>
  </div>

  <div class="info-section" id="pictures-section">
    <div class="section-header">
      <h2 class="info-section-title" style="margin-bottom:0;">Pictures</h2>
      <div style="display:flex;align-items:center;gap:12px;">
        <button class="btn btn-ghost btn-sm btn-icon row-nav-btn" data-target="pictures-grid-js" data-dir="prev" aria-label="Previous">${icon('chevron-left', 'icon-small')}</button>
        <button class="btn btn-ghost btn-sm btn-icon row-nav-btn" data-target="pictures-grid-js" data-dir="next" aria-label="Next">${icon('chevron-right', 'icon-small')}</button>
      </div>
    </div>
    <div id="pictures-grid-loading" style="text-align:center;padding:2.5rem 0;color:var(--text-muted);">
      <div class="av-loader" style="margin:0 auto 1rem;transform:scale(.6);"></div>
      Loading pictures…
    </div>
    <div class="scroll-row" id="pictures-grid-js" style="display:none;"></div>
  </div>

  <div class="info-section">
    <div class="section-header">
      <h2 class="info-section-title" style="margin-bottom:0;">You Might Also Like</h2>
      <div style="display:flex;align-items:center;gap:12px;">
        <button class="btn btn-ghost btn-sm btn-icon row-nav-btn" data-target="related-grid-js" data-dir="prev" aria-label="Previous">${icon('chevron-left', 'icon-small')}</button>
        <button class="btn btn-ghost btn-sm btn-icon row-nav-btn" data-target="related-grid-js" data-dir="next" aria-label="Next">${icon('chevron-right', 'icon-small')}</button>
      </div>
    </div>
    <div id="related-grid-loading" style="text-align:center;padding:2.5rem 0;color:var(--text-muted);">
      <div class="av-loader" style="margin:0 auto 1rem;transform:scale(.6);"></div>
      Loading recommendations…
    </div>
    <div class="scroll-row" id="related-grid-js" style="display:none;"></div>
  </div>
</div>
${rowNavScript()}

<script>window.__animeTitle = ${JSON.stringify(title)};</script>
<script>window.__animeId   = ${JSON.stringify(id)};</script>
<script>window.__siteUrl   = ${JSON.stringify(siteUrl)};</script>
<script>window.__totalEps  = ${JSON.stringify(totalEps)};</script>
<script>window.__animeCover = ${JSON.stringify(image)};</script>
<script>window.__tmdbKey    = ${JSON.stringify(c.env.TMDB_API_KEY ?? '')};</script>
<script>window.__videoEps  = ${JSON.stringify(videoEpSet)};</script>
${epsNeedsRefresh ? epsLiveScript(id) : ''}
${animeTailScript(animeDubConfirmed)}`;

  html += renderFooter({ siteUrl, currentUser: layoutUser });
  await session.save(c, lifetime);
  return c.html(html);
});

function infoStatRow(label: string, value: string | number, rawHtml = false): string {
  return `<div class="info-stat-row"><span class="label">${h(label)}</span><span class="value">${rawHtml ? value : h(String(value))}</span></div>`;
}

// Fetches /api/ep_count.php (the slow scraper/Jikan lookup) in the
// background and fills in every spot on the page that shows an episode
// count -- meta badge, info panel, the user's watched/total badge +
// progress bar, and the "Add to list" episode total -- once it resolves.
// Only emitted when the server-rendered page didn't already have a fresh
// cached number (see epsNeedsRefresh in the route handler above).
function epsLiveScript(animeId: number): string {
  return `<script>
(function(){
  // ep_count.php can legitimately take several seconds on a cold cache
  // (scraper timeout + Jikan pagination fallback), so a dropped connection,
  // a backgrounded tab, or a Worker hiccup is enough for this one-shot
  // fetch to fail silently -- and until this fix, a failure here just left
  // the skeleton spinning forever with nothing else ever touching it
  // (only a full page reload, which re-reads the cache this same lookup
  // writes through to, would pick it up). This adds a timeout, one retry,
  // and -- if both attempts fail -- an explicit fallback so the UI always
  // resolves out of the skeleton state instead of hanging indefinitely.
  function fetchWithTimeout(ms) {
    var ctrl = new AbortController();
    var t = setTimeout(function(){ ctrl.abort(); }, ms);
    return fetch(window.__siteUrl + '/api/ep_count.php?anime_id=${animeId}', { signal: ctrl.signal })
      .then(function(r){ clearTimeout(t); return r.ok ? r.json() : null; })
      .catch(function(){ clearTimeout(t); return null; });
  }

  function apply(d) {
    if (!d || !d.total) return false;
    var total = d.total, aired = d.aired;
    window.__totalEps = total;
    var label = (aired !== null && aired > 0 && aired !== total) ? ('Ep ' + aired + '/' + total + ' aired') : (total + ' eps');
    var infoLabel = (aired !== null && aired > 0 && aired !== total) ? (aired + ' aired / ' + total + ' total') : String(total);

    var badge = document.getElementById('ih-eps-text');
    if (badge) { badge.classList.remove('eps-skel'); badge.textContent = label; }

    var infoVal = document.getElementById('info-eps-value');
    if (infoVal) { infoVal.classList.remove('eps-skel'); infoVal.textContent = infoLabel; }

    var tabCount = document.getElementById('ep-tab-count');
    if (tabCount) { tabCount.classList.remove('eps-skel'); tabCount.textContent = '(' + total + ')'; }

    var listBtn = document.getElementById('ih-add-list-btn');
    if (listBtn) listBtn.setAttribute('onclick', "addToList(${animeId}, " + JSON.stringify(window.__animeTitle) + ", " + JSON.stringify(window.__animeCover) + ", " + total + ")");

    var statusWrap = document.getElementById('anime-user-status');
    if (statusWrap) {
      statusWrap.setAttribute('data-total-eps', String(total));
      var watched = parseInt(statusWrap.getAttribute('data-eps-watched') || '0', 10);
      var epsBadge = document.getElementById('anime-eps-badge');
      if (epsBadge && watched) epsBadge.textContent = watched + '/' + total + ' eps';
      var progWrap = document.getElementById('anime-progress-wrap');
      var progFill = document.getElementById('anime-progress-fill');
      if (progWrap && progFill && watched) {
        progWrap.style.display = '';
        progFill.style.width = Math.min(100, Math.round((watched / total) * 100)) + '%';
      }
    }
    return true;
  }

  function fail() {
    // Both attempts failed (or returned nothing usable) -- stop pretending
    // it's still loading. Clear the skeleton so it isn't stuck forever;
    // a later grid view / refresh will pick up a real number once the
    // scraper resolves it on the backend.
    var badge = document.getElementById('ih-eps-text');
    if (badge) { badge.classList.remove('eps-skel'); badge.textContent = '? eps'; }
    var infoVal = document.getElementById('info-eps-value');
    if (infoVal) { infoVal.classList.remove('eps-skel'); infoVal.textContent = 'Unknown'; }
    var tabCount = document.getElementById('ep-tab-count');
    if (tabCount) { tabCount.classList.remove('eps-skel'); tabCount.textContent = ''; }
  }

  // Must stay comfortably above the server's own worst case: ep_count.php
  // allows up to 5s for the scraper lookup, then up to another 5s for the
  // Jikan pagination fallback (~10s total on a cold, currently-airing
  // title). A shorter client timeout just aborts a request that was about
  // to succeed -- which still leaves it looking "stuck" until reload,
  // since the abort doesn't stop the server from finishing the lookup and
  // writing it to cache anyway. 14s covers the 10s server budget with room
  // for network overhead.
  fetchWithTimeout(14000).then(function(d){
    if (apply(d)) return;
    // One retry after a short delay before giving up -- this is now only
    // for a genuine failure (network drop, 5xx, etc.), not an impatient abort.
    setTimeout(function(){
      fetchWithTimeout(14000).then(function(d2){
        if (!apply(d2)) fail();
      });
    }, 1500);
  });
})();
</script>`;
}

// "2004-10-05" -> "Fall 2004" (Jan-Mar Winter, Apr-Jun Spring, Jul-Sep
// Summer, Oct-Dec Fall — same quarter boundaries AniList uses), so the meta
// row shows one compact season badge instead of a full aired date range.
function seasonYearLabel(startDate: string | null | undefined): string | null {
  if (!startDate) return null;
  const d = new Date(startDate + 'T00:00:00Z');
  if (isNaN(d.getTime())) return null;
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear();
  const season = month <= 3 ? 'Winter' : month <= 6 ? 'Spring' : month <= 9 ? 'Summer' : 'Fall';
  return `${season} ${year}`;
}

// "TV" -> "Tv", "OVA" -> "Ova" — matches the reference's title-case badge
// instead of MAL's all-caps media type.
function titleCase(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

function renderEpisodeEditorModal(): string {
  return `
<div class="modal-overlay" id="ep-editor-modal">
  <div class="modal" style="max-width:580px;width:100%;">
    <div class="modal-header" style="padding:1rem 1.25rem;display:flex;justify-content:space-between;align-items:center;">
      <h3 id="eped-heading" style="margin:0;font-size:1rem;">Edit Episode</h3>
      <button class="modal-close" onclick="closeModal('ep-editor-modal')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.3rem;padding:0;line-height:1;">✕</button>
    </div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:1rem;">
      <input type="hidden" id="eped-anime-id">
      <input type="hidden" id="eped-ep-num">
      <div>
        <label class="ep-editor-label">Thumbnail URL</label>
        <input type="url" id="eped-image" class="form-control" placeholder="https://... (paste any image URL)">
        <div id="eped-img-preview" style="display:none;margin-top:8px;"><img id="eped-img-tag" src="" style="width:100%;max-height:180px;object-fit:cover;border-radius:6px;"></div>
      </div>
      <div>
        <label class="ep-editor-label">Synopsis</label>
        <textarea id="eped-synopsis" class="form-control" rows="4" placeholder="Episode synopsis…" style="resize:vertical;"></textarea>
      </div>
      <div>
        <label class="ep-editor-label">Watch Links</label>
        <div id="eped-links-list"></div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap;">
          <select id="eped-new-service" class="form-control" style="flex:0 0 150px;">
            <option value="">— Service —</option>
            <option value="crunchyroll">Crunchyroll</option><option value="netflix">Netflix</option>
            <option value="hidive">HIDIVE</option><option value="funimation">Funimation</option>
            <option value="amazon">Prime Video</option><option value="hulu">Hulu</option>
            <option value="apple">Apple TV+</option><option value="disney">Disney+</option>
            <option value="youtube">YouTube</option><option value="bilibili">Bilibili</option>
          </select>
          <input type="url" id="eped-new-url" class="form-control" placeholder="https://..." style="flex:1;min-width:150px;">
          <button class="btn btn-secondary" onclick="epedAddLink()">+ Add</button>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:0.5rem;border-top:1px solid var(--border);">
        <button class="btn btn-secondary" onclick="closeModal('ep-editor-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="epedSave()">Save Changes</button>
      </div>
    </div>
  </div>
</div>`;
}
