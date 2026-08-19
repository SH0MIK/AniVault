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

// ── Fetch AniList episode thumbnails via MAL id ─────────────────────────
async function fetchAniListThumbnails(malId) {
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: \`query ($malId: Int) {
          Media(idMal: $malId, type: ANIME) {
            streamingEpisodes { title thumbnail site }
          }
        }\`,
        variables: { malId: parseInt(malId) }
      })
    });
    const data = await res.json();
    const eps  = data?.data?.Media?.streamingEpisodes || [];

    // Skip live-action/non-anime streaming sources (e.g. Netflix live action)
    // Prefer anime-specific sites (Crunchyroll, Funimation, HIDIVE)
    const SKIP  = ['netflix', 'amazon', 'prime', 'disney', 'hulu', 'apple'];
    const PREF  = ['crunchyroll', 'funimation', 'hidive', 'vrv'];
    function score(site) {
      const s = (site || '').toLowerCase();
      if (SKIP.some(x => s.includes(x))) return -1;
      if (PREF.some(x => s.includes(x))) return 2;
      return 1;
    }

    // Build map: keep highest-scored thumbnail per episode number
    const thumbMap = {};
    eps.forEach(ep => {
      const match = (ep.title || '').match(/Episode\\s+(\\d+)/i);
      if (!match || !ep.thumbnail) return;
      const n = parseInt(match[1]);
      const s = score(ep.site);
      if (s < 0) return; // skip Netflix/live-action
      if (!thumbMap[n] || s > thumbMap[n].score) thumbMap[n] = { url: ep.thumbnail, score: s };
    });

    // Return flat map: epNum -> url
    const result = {};
    Object.keys(thumbMap).forEach(n => { result[n] = thumbMap[n].url; });
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

  // Use AniList thumbnail if available, fall back to anime cover
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
    if (typeof loadEpCardThumbnails === 'function') loadEpCardThumbnails();
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
    // Fetch Jikan episodes + AniList thumbnails in parallel
    const [thumbMap, jikanEps] = await Promise.all([
      fetchAniListThumbnails(animeId),
      (async () => {
        let allEps  = [];
        let page    = 1;
        let hasNext = true;
        while (hasNext) {
          if (page > 1) await new Promise(r => setTimeout(r, 400));
          const res  = await fetch(\`https://api.jikan.moe/v4/anime/\${animeId}/episodes?page=\${page}\`);
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
    const res  = await fetch(\`https://api.jikan.moe/v4/anime/\${animeId}/characters\`);
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
  });
});

// ── Redirect ep-cards to watch page via data attribute ──
// Handled by wrapping ep-cards in <a> tags inside buildEpCard()
</script>

`;
}
