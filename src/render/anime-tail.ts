export function animeTailScript(animeDubConfirmed: boolean): string {
  return `<style>
/* Episode card: highlight when it has a video */
.ep-card.has-video-ep .ep-thumb { position: relative; }
.ep-card.has-video-ep {
  /*border-color: var(--accent) !important;
  box-shadow: 0 0 0 1px var(--accent); */
  cursor: pointer;
}
.ep-card.has-video-ep .ep-title { color: var(--accent); }
/* Sub / Dub badge icons on episode thumb */
.ep-audio-badges {
  position: absolute;
  bottom: 5px;
  left: 5px;
  display: flex;
  gap: 4px;
  align-items: center;
}
.ep-audio-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px 2px 4px;
  border-radius: 5px;
  font-size: .63rem;
  font-weight: 800;
  letter-spacing: .03em;
  border: 1px solid;
  backdrop-filter: blur(4px);
}
.ep-audio-badge.sub-badge {
  background: rgba(230,80,60,.82);
  border-color: rgba(255,120,100,.5);
  color: #fff;
}
.ep-audio-badge.dub-badge {
  background: rgba(30,160,80,.82);
  border-color: rgba(60,210,110,.5);
  color: #fff;
}
/* Spinner in tabs */
#ep-grid-loading .av-loader,
#char-grid-loading .av-loader,
#related-grid-loading .av-loader {
  width: 40px; height: 40px;
}
</style>

<script>
// ── Series / Season Dropdown ──────────────────────────────────
(async function initSeriesDropdown() {
  const sd = window.__seriesData;
  if (!sd) return;

  const { currentId, currentTitle, siteUrl, entries } = sd;
  const btnLabel = document.getElementById('series-btn-label');
  const menuEl   = document.getElementById('series-dropdown-menu');
  const loadingEl= document.getElementById('series-menu-loading');
  if (!btnLabel || !menuEl) return;

  // Relation types that count as a numbered "season" vs special entry
  const SEASON_TYPES    = new Set(['Sequel', 'Prequel', 'Alternative Version', 'Alternative Setting', 'Parent Story', 'Full Story']);
  const SPECIAL_TYPES   = new Set(['Movie', 'Side Story', 'Spin-off', 'Summary', 'Other']);

  // Fetch start_date for a single MAL id via Jikan
  async function fetchDate(id) {
    try {
      const res  = await fetch(\`https://api.jikan.moe/v4/anime/\${id}\`);
      const data = await res.json();
      return data?.data?.aired?.from ?? null; // ISO string or null
    } catch { return null; }
  }

  // Build full list: current + related entries
  const allIds = [currentId, ...entries.map(e => e.id).filter(Boolean)];

  // Fetch dates in parallel (rate-limit: small stagger)
  const dateMap = {};
  await Promise.all(allIds.map((id, i) =>
    new Promise(res => setTimeout(async () => {
      dateMap[id] = await fetchDate(id);
      res();
    }, i * 340))
  ));

  // Separate season-like entries from specials
  const seasonEntries = entries.filter(e => SEASON_TYPES.has(e.type));
  const specialEntries= entries.filter(e => !SEASON_TYPES.has(e.type));

  // Build combined list: current + season entries, sorted by air date
  const seasonList = [
    { id: currentId, title: currentTitle, type: 'current' },
    ...seasonEntries.map(e => ({ id: e.id, title: e.title, type: e.type }))
  ].sort((a, b) => {
    const da = dateMap[a.id] ? new Date(dateMap[a.id]) : new Date('9999');
    const db = dateMap[b.id] ? new Date(dateMap[b.id]) : new Date('9999');
    return da - db;
  });

  // Assign season numbers
  seasonList.forEach((entry, idx) => { entry.seasonNum = idx + 1; });

  // Find current season number
  const currentEntry = seasonList.find(e => e.id === currentId);
  const currentSeasonNum = currentEntry ? currentEntry.seasonNum : 1;

  // Update button label
  if (btnLabel) btnLabel.textContent = 'Season ' + currentSeasonNum;

  // Build menu HTML
  let html = '';

  seasonList.forEach(entry => {
    const isCurrent = entry.id === currentId;
    const label = 'Season ' + entry.seasonNum;
    if (isCurrent) {
      html += \`
        <div style="padding:9px 14px;background:rgba(99,102,241,.15);display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border);">
          <span style="width:6px;height:6px;border-radius:50%;background:var(--accent);flex-shrink:0;"></span>
          <span style="font-size:0.85rem;font-weight:700;color:var(--text-main);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">\${label}</span>
          <span style="font-size:0.7rem;color:var(--accent);font-weight:700;flex-shrink:0;">Current</span>
        </div>\`;
    } else {
      html += \`
        <a href="\${siteUrl}/anime?id=\${entry.id}"
          style="display:flex;align-items:center;gap:10px;padding:9px 14px;color:var(--text-main);text-decoration:none;font-size:0.85rem;border-bottom:1px solid rgba(255,255,255,0.04);transition:background .12s;"
          onmouseover="this.style.background='rgba(255,255,255,0.06)'"
          onmouseout="this.style.background=''"
          role="option">
          <span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.2);flex-shrink:0;"></span>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">\${label}</span>
        </a>\`;
    }
  });

  // Append special entries (Movies, Side Stories) with their original type label
  if (specialEntries.length) {
    html += \`<div style="padding:5px 14px 3px;font-size:0.68rem;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:.07em;border-top:1px solid var(--border);margin-top:2px;">Also in this series</div>\`;
    specialEntries.forEach(e => {
      html += \`
        <a href="\${siteUrl}/anime?id=\${e.id}"
          style="display:flex;align-items:center;gap:10px;padding:8px 14px;color:var(--text-main);text-decoration:none;font-size:0.85rem;border-bottom:1px solid rgba(255,255,255,0.04);transition:background .12s;"
          onmouseover="this.style.background='rgba(255,255,255,0.06)'"
          onmouseout="this.style.background=''"
          role="option">
          <span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15);flex-shrink:0;"></span>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">\${e.title.replace(/</g,'&lt;')}</span>
          <span style="font-size:0.7rem;color:var(--text-muted);flex-shrink:0;">\${e.type}</span>
        </a>\`;
    });
  }

  if (loadingEl) loadingEl.remove();
  menuEl.insertAdjacentHTML('beforeend', html);
})();

function toggleSeriesDropdown(e) {
  e.stopPropagation();
  const menu  = document.getElementById('series-dropdown-menu');
  const btn   = document.getElementById('series-dropdown-btn');
  const arrow = document.getElementById('series-dropdown-arrow');
  const isOpen = menu.style.display === 'block';
  menu.style.display    = isOpen ? 'none' : 'block';
  arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
  btn.setAttribute('aria-expanded', String(!isOpen));
}
document.addEventListener('click', function(e) {
  const wrap = document.getElementById('series-dropdown-wrap');
  if (wrap && !wrap.contains(e.target)) {
    const menu  = document.getElementById('series-dropdown-menu');
    const btn   = document.getElementById('series-dropdown-btn');
    const arrow = document.getElementById('series-dropdown-arrow');
    if (menu) { menu.style.display = 'none'; arrow.style.transform = ''; btn.setAttribute('aria-expanded','false'); }
  }
});


// __videoEps is now an object {epNum: {sub:true, dub:bool}}
const __videoEpMap = window.__videoEps || {};
const __animeDubConfirmed = ${animeDubConfirmed ? "true" : "false"};

// SVG icons (inline, sized for the badge)
const SVG_SUB = \`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 10.5h2.5M11.5 10.5h5.5M7 14.5h5.5M15.5 14.5h1.5"/></svg>\`;
const SVG_DUB = \`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>\`;

// ── Fetch episode thumbnails (admin overrides + scraper fallback) ─────────
// An admin-saved override wins where one exists (episode_overrides table,
// set via the Episode Thumbnails admin panel); episodes without one are
// filled in server-side with a live lookup against our own scraper API (see
// api-episode-override.ts's ?all=1 handler). Only falls back to the anime
// cover if the scraper has nothing for that episode either.
async function fetchAniListThumbnails(malId) {
  try {
    const res = await fetch((window.__siteUrl || '') + '/api/episode_override.php?anime_id=' + malId + '&all=1');
    if (!res.ok) return {};
    const data = await res.json();
    const overrides = data?.overrides || [];
    const result = {};
    overrides.forEach(o => { if (o.image_url) result[parseInt(o.episode_num)] = o.image_url; });
    return result;
  } catch(e) { return {}; }
}

// ── Build an ep-card element from Jikan episode data ─────────────────────────
function buildEpCard(ep, animeId, cover, thumbMap) {
  const epNum   = ep.mal_id ?? '?';
  const epTitle = ep.title  ?? 'TBA';
  const aired   = ep.aired  ? new Date(ep.aired).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}) : null;
  const score   = ep.score  ?? null;
  const label   = 'S1E' + epNum;
  const meta    = label + (aired ? ' • ' + aired : '');
  const filler  = ep.filler ?? false;
  const recap   = ep.recap  ?? false;
  const vidInfo = __videoEpMap[String(epNum)] || __videoEpMap[Number(epNum)] || null;
  const hasVid  = !!vidInfo;
  const hasDub  = __animeDubConfirmed || !!(vidInfo && vidInfo.dub);

  // Use admin-saved override thumbnail if available, fall back to anime cover
  const thumb = (thumbMap && thumbMap[parseInt(epNum)]) || cover;

  const div = document.createElement('a');
  div.href      = (window.__siteUrl || '') + '/watch?anime=' + animeId + '&ep=' + epNum;
  div.className = 'ep-card' + (hasVid ? ' has-video-ep' : '');
  div.dataset.title    = epTitle;
  div.dataset.meta     = meta;
  div.dataset.score    = score !== null ? '⭐ ' + score : '';
  div.dataset.animeid  = animeId;
  div.dataset.epnum    = epNum;
  div.dataset.cover    = thumb;
  div.dataset.hasVideo = hasVid ? '1' : '0';

  const badgesHtml = hasVid ? \`
    <div class="ep-audio-badges">
      <span class="ep-audio-badge sub-badge">\${SVG_SUB}</span>
      \${hasDub ? \`<span class="ep-audio-badge dub-badge">\${SVG_DUB}</span>\` : ''}
    </div>\` : '';

  div.innerHTML = \`
    <div class="ep-thumb" style="background-image:url('\${thumb}');background-size:cover;background-position:center;">
      <div class="ep-thumb-placeholder">\${epNum}</div>
      \${filler ? '<span class="ep-badge ep-badge-filler">Filler</span>' : ''}
      \${recap  ? '<span class="ep-badge ep-badge-recap">Recap</span>'   : ''}
      \${badgesHtml}
    </div>
    <div class="ep-info">
      <div class="ep-title">\${epNum}. \${epTitle.replace(/</g,'&lt;')}</div>
      <div class="ep-meta">\${meta}\${score !== null ? ' • ⭐ ' + score : ''}</div>
    </div>\`;
  return div;
}

// ── Ep-tab header count ─────────────────────────────────────────────
// The tab title must always agree with the Info panel's episode count.
// Jikan/DB-derived lists only contain episodes that have actually
// aired/been scraped (e.g. 1 for a currently-airing 8-ep show), so we
// never trust that length on its own -- we take whichever is larger:
// the show's known total (window.__totalEps, kept in sync by
// epsLiveScript) or the actual list we just rendered.
function updateEpTabCount(actualCount) {
  const total = window.__totalEps || 0;
  const count = Math.max(total, actualCount);
  const span  = document.getElementById('ep-tab-count');
  if (!span) return;
  span.classList.remove('eps-skel');
  span.textContent = count > 0 ? '(' + count + ')' : '';
}

// ── Episode range chunking ──────────────────────────────────────────
// Long-running shows (Naruto, One Piece...) are unusable as one giant
// scroll of cards. Past EP_CHUNK_SIZE episodes we split into fixed-size
// numeric ranges and only render the active chunk into the grid, with a
// pill + modal (like Kazekage Rescue · 1-32 style pickers) to jump
// between them. Shows at or under the threshold render exactly as
// before -- no picker, no chunking.
const EP_CHUNK_SIZE = 30;

function renderEpisodeGrid(fullEps, animeId, cover, thumbMap) {
  const grid     = document.getElementById('ep-grid-js');
  const rangeWrap = document.getElementById('ep-range-wrap');
  if (!grid) return;
  fullEps = fullEps.slice().sort((a, b) => Number(a.mal_id ?? 0) - Number(b.mal_id ?? 0));

  function paint(list) {
    grid.innerHTML = '';
    list.forEach(ep => grid.appendChild(buildEpCard(ep, animeId, cover, thumbMap)));
    grid.style.display = '';
    // Previously also called loadEpCardThumbnails() here, which re-fetched
    // every thumbnail directly from graphql.anilist.co (uncached) and
    // overwrote what buildEpCard() had just painted from thumbMap -- the
    // exact same D1-cached data from getAnimeEpisodeThumbnails (permanent
    // for aired/finished episodes, TTL-gated re-checks for ongoing shows).
    // That overwrite was pure redundant work with no benefit, so it's
    // removed: the grid now shows the cache-backed thumbnail as painted.
  }

  if (fullEps.length <= EP_CHUNK_SIZE) {
    if (rangeWrap) rangeWrap.style.display = 'none';
    paint(fullEps);
    return;
  }

  const chunks = [];
  for (let i = 0; i < fullEps.length; i += EP_CHUNK_SIZE) chunks.push(fullEps.slice(i, i + EP_CHUNK_SIZE));

  function closeRangeModal() {
    const m = document.getElementById('ep-range-modal');
    if (m) m.classList.remove('open');
  }

  function renderChunk(idx) {
    paint(chunks[idx]);
    const first = chunks[idx][0].mal_id, last = chunks[idx][chunks[idx].length - 1].mal_id;
    const label = document.getElementById('ep-range-label');
    if (label) label.textContent = 'Episodes ' + first + '\u2013' + last;
    document.querySelectorAll('.ep-range-row').forEach((row, i) => {
      row.classList.toggle('active', i === idx);
    });
    closeRangeModal();
  }

  if (rangeWrap) {
    rangeWrap.style.display = '';
    rangeWrap.innerHTML =
      '<button type="button" class="ep-range-btn" id="ep-range-toggle">' +
        '<span id="ep-range-label"></span>' +
        '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>' +
      '</button>' +
      '<div class="modal-overlay" id="ep-range-modal">' +
        '<div class="modal" style="max-width:420px;">' +
          '<div class="modal-header"><span style="font-weight:700;">Jump to episodes</span><button type="button" class="modal-close" id="ep-range-close">&times;</button></div>' +
          '<div class="modal-body" style="padding:.5rem 0;max-height:60vh;overflow-y:auto;" id="ep-range-list"></div>' +
        '</div>' +
      '</div>';

    const list = document.getElementById('ep-range-list');
    chunks.forEach((chunk, idx) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ep-range-row';
      row.innerHTML = '<span>Episodes ' + chunk[0].mal_id + '\u2013' + chunk[chunk.length - 1].mal_id + '</span><span class="ep-range-radio"></span>';
      row.onclick = () => renderChunk(idx);
      list.appendChild(row);
    });

    document.getElementById('ep-range-toggle').onclick = () => document.getElementById('ep-range-modal').classList.add('open');
    document.getElementById('ep-range-close').onclick = closeRangeModal;
    document.getElementById('ep-range-modal').onclick = (e) => { if (e.target.id === 'ep-range-modal') closeRangeModal(); };
  }

  renderChunk(0);
}

// ── Fetch and render episodes (all pages) ─────────────────────────────
async function lazyLoadEpisodes() {
  const animeId = window.__animeId;
  const cover   = window.__animeCover || '';
  const grid    = document.getElementById('ep-grid-js');
  const loading = document.getElementById('ep-grid-loading');
  if (!grid) return;
  try {
    // Fetch Jikan episodes + admin-saved thumbnail overrides in parallel
    const [thumbMap, jikanEps] = await Promise.all([
      fetchAniListThumbnails(animeId),
      (async () => {
        let allEps  = [];
        let page    = 1;
        let hasNext = true;
        while (hasNext) {
          if (page > 1) await new Promise(r => setTimeout(r, 400));
          const res  = await fetch(\`\${window.__siteUrl || ''}/api/anime_episodes.php?anime=\${animeId}&page=\${page}\`);
          const data = await res.json();
          const eps  = data.data || [];
          allEps = allEps.concat(eps);
          const pagination = data.pagination || {};
          hasNext = !!(pagination.has_next_page) && eps.length > 0;
          page++;
        }
        return allEps;
      })()
    ]);

    if (loading) loading.style.display = 'none';
    // If Jikan has no episode data yet (common for airing anime),
    // generate numbered stubs from the DB videos we already have
    if (!jikanEps.length) {
      const totalEps = window.__totalEps || 0;
      const videoEps = Object.keys(window.__videoEpMap || {}).map(Number).sort((a,b)=>a-b);
      // Use DB video episodes + fill up to totalEps if known
      const epNums = new Set(videoEps);
      if (totalEps > 0) for (let i = 1; i <= totalEps; i++) epNums.add(i);
      if (!epNums.size) {
        grid.style.display = 'block';
        grid.innerHTML = '<p class="text-muted text-center">No episode data available yet.</p>';
        return;
      }
      const stubEps = [...epNums].sort((a,b)=>a-b).map(n => ({
        mal_id: n, title: null, aired: null, score: null, filler: false, recap: false
      }));
      updateEpTabCount(stubEps.length);
      renderEpisodeGrid(stubEps, animeId, cover, thumbMap);
      return;
    }
    updateEpTabCount(jikanEps.length);
    // Jikan's per-episode data commonly lags behind the show's real total
    // (currently-airing shows especially -- it only lists episodes that
    // have actually aired/been indexed). Pad the grid out with numbered
    // stubs for anything beyond what Jikan gave us, up to the known
    // total, so the card count always matches the "(N)" in the tab title
    // instead of silently showing fewer cards than it claims.
    const totalEps = window.__totalEps || 0;
    const jikanNums = new Set(jikanEps.map(ep => Number(ep.mal_id ?? 0)));
    const fullEps = jikanEps.slice();
    if (totalEps > jikanEps.length) {
      for (let n = 1; n <= totalEps; n++) {
        if (!jikanNums.has(n)) {
          fullEps.push({ mal_id: n, title: null, aired: null, score: null, filler: false, recap: false });
        }
      }
    }
    renderEpisodeGrid(fullEps, animeId, cover, thumbMap);
  } catch(e) {
    if (loading) loading.innerHTML = '<p class="text-muted" style="grid-column:1/-1;text-align:center;padding:1rem 0;">Failed to load episodes. <button class="btn btn-ghost btn-sm" onclick="lazyLoadEpisodes()">Retry</button></p>';
  }
}

// ── Fetch and render characters ────────────────────────────────
async function lazyLoadCharacters() {
  const animeId = window.__animeId;
  const grid    = document.getElementById('char-grid-js');
  const loading = document.getElementById('char-grid-loading');
  if (!grid) return;
  try {
    const res  = await fetch(\`\${window.__siteUrl || ''}/api/anime_characters.php?anime=\${animeId}\`);
    const data = await res.json();
    const chars = (data.data || []).slice(0, 12);
    if (loading) loading.style.display = 'none';
    if (!chars.length) {
      grid.style.display = 'block';
      grid.innerHTML = '<p class="text-muted text-center">No character data available.</p>';
      return;
    }
    chars.forEach(ch => {
      const char   = ch.character || {};
      const va     = (ch.voice_actors || []).find(v => v.language === 'Japanese')?.person || ch.voice_actors?.[0]?.person || null;
      const role   = ch.role || '';
      const charId = char.mal_id || 0;
      const img    = char.images?.jpg?.image_url || '';
      const isMain = role.toLowerCase() === 'main';
      const div = document.createElement('div');
      div.className = 'anime-card char-card';
      div.style.cursor = 'pointer';
      div.onclick = () => { window.location.href = window.__siteUrl + '/character?id=' + charId; };
      div.innerHTML = \`
        <div class="anime-card-poster char-card-poster">
          \${img ? \`<img src="\${img}" alt="\${char.name || ''}" loading="lazy">\` : ''}
          \${isMain ? '<span style="position:absolute;top:6px;left:6px;background:var(--accent);color:#fff;font-size:.65rem;font-weight:700;padding:2px 7px;border-radius:10px;text-transform:uppercase;letter-spacing:.04em;z-index:2;">Main</span>' : ''}
        </div>
        <div class="anime-card-info" style="text-align:center;">
          <div class="anime-card-title">\${(char.name||'').replace(/</g,'&lt;')}</div>
          <div class="anime-card-meta">\${role}\${va ? '<br><span style="color:var(--text-muted);">' + (va.name||'').replace(/</g,'&lt;') + '</span>' : ''}</div>
        </div>\`;
      grid.appendChild(div);
    });
    grid.style.display = '';
  } catch(e) {
    if (loading) loading.innerHTML = '<p class="text-muted">Failed to load characters. <button class="btn btn-ghost btn-sm" onclick="lazyLoadCharacters()">Retry</button></p>';
  }
}

// ── Trailer/Opening/Ending video hub ──────────────────────────────
// Combines trailers.php and themes.php into one tabbed section: Trailers
// tab lists PVs directly; Opening/Ending tabs list each theme song and,
// where MAL has a matching official music video (matched by label, e.g.
// "ED 2 (Artist ver.)" -> ending theme #2), let it play inline -- entries
// without a matching video still show their Spotify link instead.
let __videoData = { trailers: [], opening: [], ending: [] };

async function lazyLoadVideos() {
  const animeId = window.__animeId;
  const section = document.getElementById('video-section');
  const wrap    = document.getElementById('video-js');
  const loading = document.getElementById('video-loading');
  if (!wrap || !section) return;
  try {
    const [videosRes, themesRes] = await Promise.all([
      fetch(\`\${window.__siteUrl || ''}/api/anime_videos.php?anime=\${animeId}\`),
      fetch(\`\${window.__siteUrl || ''}/api/anime_themes.php?anime=\${animeId}\`),
    ]);
    const videosData = await videosRes.json();
    const themesData = await themesRes.json();

    const sortByLabelNumber = (arr) => [...arr].sort((a, b) => {
      const na = parseInt((a.label || '').match(/\d+/)?.[0] || '0', 10);
      const nb = parseInt((b.label || '').match(/\d+/)?.[0] || '0', 10);
      return na - nb;
    });
    const trailers = sortByLabelNumber(videosData.trailers || []);
    const musicVideos = videosData.musicVideos || [];

    const videoByKey = {};
    musicVideos.forEach(v => {
      const m = (v.label || '').match(/^(OP|ED)\s*(\d+)/i);
      if (m) videoByKey[m[1].toUpperCase() + m[2]] = v;
    });

    const mapTheme = (list, prefix) => (list || []).map(t => {
      const v = videoByKey[prefix + t.number];
      return {
        title: t.title,
        subtitle: [t.artist, t.episodes ? \`eps \${t.episodes}\` : null].filter(Boolean).join(' · '),
        embedUrl: v ? v.embedUrl : null,
        youtubeId: v ? v.youtubeId : null,
        hasVideo: !!v,
        spotifyUrl: t.spotifyUrl || null,
      };
    });

    __videoData = {
      trailers: trailers.map(v => ({
        title: v.label,
        subtitle: null,
        embedUrl: v.embedUrl,
        youtubeId: v.youtubeId,
        hasVideo: !!v.youtubeId,
        spotifyUrl: null,
      })),
      opening: mapTheme(themesData.opening, 'OP'),
      ending: mapTheme(themesData.ending, 'ED'),
    };

    if (loading) loading.style.display = 'none';

    const hasAny = __videoData.trailers.length || __videoData.opening.length || __videoData.ending.length;
    if (!hasAny) {
      section.style.display = 'none'; // nothing at all available -- hide rather than show an empty player
      return;
    }

    document.querySelectorAll('.video-tab-btn').forEach(btn => {
      const tab = btn.getAttribute('data-tab');
      btn.style.display = __videoData[tab] && __videoData[tab].length ? '' : 'none';
    });
    const defaultTab = ['trailers', 'opening', 'ending'].find(t => __videoData[t].length) || 'trailers';
    wrap.style.display = '';
    switchVideoTab(defaultTab);
  } catch(e) {
    if (loading) loading.innerHTML = '<p class="text-muted">Failed to load videos. <button class="btn btn-ghost btn-sm" onclick="lazyLoadVideos()">Retry</button></p>';
  }
}

function switchVideoTab(tab) {
  document.querySelectorAll('.video-tab-btn').forEach(btn => {
    const isActive = btn.getAttribute('data-tab') === tab;
    btn.classList.toggle('btn-primary', isActive);
    btn.classList.toggle('btn-ghost', !isActive);
  });
  renderVideoList(tab);
}

function renderVideoList(tab) {
  const listEl = document.getElementById('video-list-js');
  if (!listEl) return;
  const items = __videoData[tab] || [];
  listEl.innerHTML = '';

  items.forEach((item, i) => {
    const card = document.createElement('div');
    card.className = 'anime-card';
    card.style.cssText = 'flex-shrink:0;width:160px;' + (item.hasVideo ? 'cursor:pointer;' : 'opacity:.55;');
    const thumb = item.youtubeId ? \`https://img.youtube.com/vi/\${item.youtubeId}/mqdefault.jpg\` : '';
    card.innerHTML = \`
      <div class="anime-card-poster" style="aspect-ratio:16/9;">
        \${thumb ? \`<img src="\${thumb}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;">\` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--bg-elevated);color:var(--text-muted);font-size:1.5rem;">♪</div>'}
      </div>
      <div style="padding:6px 2px;">
        <div style="font-weight:600;font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">\${(item.title||'').replace(/</g,'&lt;')}</div>
        \${item.subtitle ? \`<div style="color:var(--text-muted);font-size:0.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">\${item.subtitle.replace(/</g,'&lt;')}</div>\` : ''}
        \${!item.hasVideo && item.spotifyUrl ? \`<a href="\${item.spotifyUrl}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm" style="margin-top:4px;padding:2px 8px;font-size:.75rem;" onclick="event.stopPropagation();">Spotify</a>\` : ''}
      </div>\`;
    if (item.hasVideo) card.onclick = () => selectVideo(tab, i);
    listEl.appendChild(card);
  });

  const firstPlayable = items.findIndex(x => x.hasVideo);
  const playerWrap = document.getElementById('video-player-wrap');
  if (firstPlayable !== -1) {
    selectVideo(tab, firstPlayable);
  } else if (playerWrap) {
    playerWrap.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);">No video available</div>';
  }
}

function selectVideo(tab, index) {
  const item = (__videoData[tab] || [])[index];
  const playerWrap = document.getElementById('video-player-wrap');
  if (!item || !item.hasVideo || !playerWrap) return;
  // MAL/Jikan's embed_url comes with autoplay=1 baked in, which auto-plays
  // the trailer the moment the page/tab loads (before any user click).
  // Force it off here so playback only starts when the user presses play.
  const src = (item.embedUrl || '').replace(/([?&])autoplay=1\\b/i, '$1autoplay=0');
  playerWrap.innerHTML = \`<iframe src="\${src}" title="\${(item.title||'Video').replace(/</g,'&lt;')}" style="position:absolute;inset:0;width:100%;height:100%;border:0;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>\`;
  document.querySelectorAll('#video-list-js .anime-card').forEach((el, i) => {
    el.style.outline = i === index ? '2px solid var(--accent, #8b5cf6)' : '';
  });
}

// ── Fetch and render the picture gallery ─────────────────────────
async function lazyLoadPictures() {
  const animeId = window.__animeId;
  const section = document.getElementById('pictures-section');
  const grid    = document.getElementById('pictures-grid-js');
  const loading = document.getElementById('pictures-grid-loading');
  if (!grid || !section) return;
  try {
    const res  = await fetch(\`\${window.__siteUrl || ''}/api/anime_pictures.php?anime=\${animeId}\`);
    const data = await res.json();
    const pics = (data.data || []).slice(0, 24);
    if (loading) loading.style.display = 'none';
    if (!pics.length) {
      section.style.display = 'none';
      return;
    }
    pics.forEach(p => {
      const a = document.createElement('a');
      a.href = p.image;
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'anime-card';
      a.style.cssText = 'flex-shrink:0;width:140px;';
      a.innerHTML = \`<div class="anime-card-poster" style="aspect-ratio:2/3;"><img src="\${p.thumbnail || p.image}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;"></div>\`;
      grid.appendChild(a);
    });
    grid.style.display = '';
  } catch(e) {
    if (loading) loading.innerHTML = '<p class="text-muted">Failed to load pictures. <button class="btn btn-ghost btn-sm" onclick="lazyLoadPictures()">Retry</button></p>';
  }
}

// ── Fetch and render related/recommendations ───────────────────
async function lazyLoadRelated() {
  const animeId = window.__animeId;
  const grid    = document.getElementById('related-grid-js');
  const loading = document.getElementById('related-grid-loading');
  if (!grid) return;
  try {
    const res  = await fetch(\`https://api.jikan.moe/v4/anime/\${animeId}/recommendations\`);
    const data = await res.json();
    const recs = (data.data || []).slice(0, 8);
    if (loading) loading.style.display = 'none';
    if (!recs.length) {
      grid.style.display = 'block';
      grid.innerHTML = '<p class="text-muted text-center">No recommendations available.</p>';
      return;
    }
    recs.forEach(r => {
      const a      = r.entry || {};
      const aid    = a.mal_id || 0;
      const atitle = a.title  || '';
      const aimg   = a.images?.jpg?.image_url || '';
      const div = document.createElement('div');
      div.className = 'anime-card';
      div.style.cursor = 'pointer';
      div.onclick = () => { window.location.href = window.__siteUrl + '/anime?id=' + aid; };
      div.innerHTML = \`
        <div class="anime-card-poster">
          \${aimg ? \`<img src="\${aimg}" alt="\${atitle.replace(/"/g,'&quot;')}" loading="lazy">\` : ''}
        </div>
        <div class="anime-card-info">
          <div class="anime-card-title">\${atitle.replace(/</g,'&lt;')}</div>
        </div>\`;
      grid.appendChild(div);
    });
    grid.style.display = '';
  } catch(e) {
    if (loading) loading.innerHTML = '<p class="text-muted">Failed to load recommendations. <button class="btn btn-ghost btn-sm" onclick="lazyLoadRelated()">Retry</button></p>';
  }
}

// ── Fire once DOM is ready ─────────────────────────────────────
// Use requestIdleCallback so the loader gets dismissed first
function afterPaint(fn) {
  if (window.requestIdleCallback) {
    requestIdleCallback(fn, { timeout: 3000 });
  } else {
    setTimeout(fn, 100);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  afterPaint(() => {
    lazyLoadEpisodes();
    lazyLoadCharacters();
    lazyLoadRelated();
    lazyLoadVideos();
    lazyLoadPictures();
  });
});

// ── Redirect ep-cards to watch page via data attribute ──
// Handled by wrapping ep-cards in <a> tags inside buildEpCard()
</script>

`;
}
