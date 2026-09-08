export function epThumbnailsScript(siteUrl: string, tmdbKey: string): string {
  return `<script>
/* ═══════════════════════════════════════════════════════════════
   State
═══════════════════════════════════════════════════════════════ */
let _animeId    = null;
let _animeTitle = '';
let _episodes   = [];   // [{num, title, existing_thumb, found_thumb, status}]
let _cache      = {};
let _tpmEpIdx   = null; // which ep is being edited in picker modal
let _tpmSelected = null;

/* ═══════════════════════════════════════════════════════════════
   Anime search (same pattern as videos.php)
═══════════════════════════════════════════════════════════════ */
let _searchTimer = null;
document.getElementById('thumb-anime-search').addEventListener('input', function () {
    clearTimeout(_searchTimer);
    const q = this.value.trim();
    if (q.length < 2) { hideDD(); return; }
    _searchTimer = setTimeout(() => jikanSearch(q), 350);
});
document.addEventListener('click', function (e) {
    if (!document.getElementById('thumb-anime-wrap').contains(e.target)) hideDD();
});

async function jikanSearch(q) {
    const dd = document.getElementById('thumb-anime-dropdown');
    dd.style.display = 'block';
    dd.innerHTML = '<div style="padding:.5rem .75rem;color:var(--text-muted);font-size:.83rem;">Searching…</div>';
    try {
        const r    = await fetch('https://api.jikan.moe/v4/anime?q=' + encodeURIComponent(q) + '&limit=8&sfw=true');
        const json = await r.json();
        const data = json.data;
        if (!data || !data.length) { dd.innerHTML = '<div style="padding:.5rem .75rem;color:var(--text-muted);">No results</div>'; return; }
        dd.innerHTML = data.map(a => {
            const title = a.title || a.title_english || '';
            const img   = a.images?.jpg?.small_image_url || '';
            _cache[a.mal_id] = { id: a.mal_id, title, img, episodes: a.episodes || 0 };
            return \`<div class="ta-result" onclick="selectAnime(\${a.mal_id})">
                      <img src="\${eh(img)}" alt="" onerror="this.style.display='none'">
                      <div>
                        <div style="font-weight:600;">\${eh(title)}</div>
                        <div style="font-size:.73rem;color:var(--text-muted);">\${eh(a.type||'')} &middot; \${a.episodes||'?'} eps &middot; ID:\${a.mal_id}</div>
                      </div>
                    </div>\`;
        }).join('');
    } catch(e) {
        dd.innerHTML = '<div style="padding:.5rem .75rem;color:var(--text-muted);">Search failed</div>';
    }
}

function selectAnime(id) {
    const a = _cache[id]; if (!a) return;
    _animeId    = a.id;
    _animeTitle = a.title;
    document.getElementById('thumb-anime-id').value        = a.id;
    document.getElementById('thumb-anime-title-val').value = a.title;
    document.getElementById('thumb-anime-search').value    = a.title;
    const sel = document.getElementById('thumb-anime-selected');
    sel.textContent = '✓ ' + a.title + ' (ID: ' + a.id + ')';
    sel.style.display = 'block';
    hideDD();
    document.getElementById('btn-load-eps').disabled       = false;
    document.getElementById('btn-auto-search').disabled    = false;
    document.getElementById('btn-debug').disabled          = false;
    // Reset grid
    _episodes = [];
    document.getElementById('ep-grid-wrap').style.display  = 'none';
    document.getElementById('btn-save-all').style.display  = 'none';
    document.getElementById('thumb-stats').textContent     = '';
}

function hideDD() { document.getElementById('thumb-anime-dropdown').style.display = 'none'; }
function eh(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ═══════════════════════════════════════════════════════════════
   Load episodes (AniList + existing overrides)
═══════════════════════════════════════════════════════════════ */
async function loadEpisodes() {
    if (!_animeId) return;
    const btn = document.getElementById('btn-load-eps');
    btn.disabled = true; btn.textContent = 'Loading…';

    try {
        // 1. Fetch existing overrides from your own API
        const overRes  = await fetch(\`${siteUrl}/api/episode_override.php?anime_id=\${_animeId}&all=1\`);
        const overData = await overRes.json();
        const overMap  = {};
        (overData.overrides || []).forEach(r => { overMap[parseInt(r.episode_num)] = r.image_url || ''; });
        let totalEps = overData.total_eps || 0;

        // 2. Fetch episode list from AniList (thumbnails + count fallback)
        const { eps: aniListEps, count: aniListCount } = await fetchAniListEpisodes(_animeId);

        // 3. Fallback: your own scraper API (episodeCount reflects what's
        // actually indexed across streaming providers, so this is checked
        // before falling further back to Jikan). Proxied through your own
        // site so the private scraper base never touches the browser.
        let scraperCount = 0;
        if (!totalEps && !aniListCount) {
            try {
                const sr = await fetch(\`${siteUrl}/api/anime_info.php?malId=\${_animeId}\`);
                if (sr.ok) {
                    const sj = await sr.json();
                    scraperCount = parseInt(sj?.episodeCount) || 0;
                }
            } catch(e) {}
        }

        // 4. Fallback: Jikan /anime/{id} for episode count
        let jikanCount = 0;
        if (!totalEps && !aniListCount && !scraperCount) {
            try {
                const jr = await fetch(\`https://api.jikan.moe/v4/anime/\${_animeId}\`);
                if (jr.ok) {
                    const jj = await jr.json();
                    jikanCount = parseInt(jj?.data?.episodes) || 0;
                }
            } catch(e) {}
        }

        // 5. Fallback: Jikan episodes list — count how many pages exist
        let jikanListCount = 0;
        if (!totalEps && !aniListCount && !scraperCount && !jikanCount) {
            try {
                const jr = await fetch(\`https://api.jikan.moe/v4/anime/\${_animeId}/episodes\`);
                if (jr.ok) {
                    const jj = await jr.json();
                    jikanListCount = jj?.pagination?.items?.total || (jj?.data?.length) || 0;
                }
            } catch(e) {}
        }

        // 6. Fallback: let admin enter manually
        const overMapMax = Object.keys(overMap).length ? Math.max(...Object.keys(overMap).map(Number)) : 0;
        let count = Math.max(totalEps, aniListCount, aniListEps.length, scraperCount, jikanCount, jikanListCount, overMapMax);

        if (count === 0) {
            // Last resort: ask admin
            const input = prompt(\`Could not auto-detect episode count for "\${_animeTitle}".\\nEnter the number of episodes manually:\`);
            count = parseInt(input) || 0;
            if (!count || count < 1) {
                showToast('Episode count unknown — enter it manually.', 'error');
                return;
            }
        }

        _episodes = [];
        for (let n = 1; n <= count; n++) {
            const ali = aniListEps.find(e => e.num === n) || {};
            _episodes.push({
                num:            n,
                title:          ali.title || '',
                existing_thumb: overMap[n] || '',
                anilist_thumb:  ali.thumb  || '',
                found_thumb:    '',
                status:         overMap[n] ? 'saved' : (ali.thumb ? 'anilist' : 'none'),
            });
        }

        renderGrid();
        document.getElementById('ep-grid-wrap').style.display = 'block';
        updateStats();
    } catch(e) {
        showToast('Error loading episodes: ' + e.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = '📋 Load Episodes';
    }
}

async function fetchAniListEpisodes(malId) {
    // Returns { eps: [{num, title, thumb}], count: N }
    // count = episodes field from AniList (reliable for finished anime)
    const query = \`
        query($malId:Int){
          Media(idMal:$malId,type:ANIME){
            id
            episodes
            nextAiringEpisode { episode }
            streamingEpisodes { title thumbnail url site }
          }
        }\`;
    try {
        const r = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: {'Content-Type':'application/json','Accept':'application/json'},
            body: JSON.stringify({ query, variables: { malId: parseInt(malId) } })
        });
        const j     = await r.json();
        const media = j?.data?.Media;
        if (!media) return { eps: [], count: 0 };

        // Episode count: prefer declared total, fall back to nextAiring-1 (currently airing)
        let count = parseInt(media.episodes) || 0;
        if (!count && media.nextAiringEpisode?.episode) {
            count = media.nextAiringEpisode.episode - 1; // episodes aired so far
        }

        const rawEps = media.streamingEpisodes || [];
        const eps = rawEps.map(ep => {
            // Titles like "Episode 1 - Some Title" or "Ep.1" or just "1"
            const m = ep.title?.match(/(?:episode|ep\\.?)\\s*(\\d+)/i) || ep.title?.match(/^(\\d+)/);
            return { num: m ? parseInt(m[1]) : null, title: ep.title || '', thumb: ep.thumbnail || '' };
        }).filter(e => e.num !== null);

        // Also infer count from streaming eps if still 0
        if (!count && eps.length) count = Math.max(...eps.map(e => e.num));

        return { eps, count };
    } catch(e) {
        return { eps: [], count: 0 };
    }
}

/* ═══════════════════════════════════════════════════════════════
   Render grid
═══════════════════════════════════════════════════════════════ */
function renderGrid() {
    const missingOnly = document.getElementById('filter-missing').checked;
    const foundOnly   = document.getElementById('filter-found').checked;
    const heading     = document.getElementById('ep-grid-heading');
    heading.textContent = \`\${_animeTitle} — \${_episodes.length} Episodes\`;

    let shown = _episodes;
    if (missingOnly) shown = shown.filter(e => !e.existing_thumb && !e.anilist_thumb && !e.found_thumb);
    if (foundOnly)   shown = shown.filter(e => e.found_thumb || e.anilist_thumb);

    const grid = document.getElementById('ep-grid');
    grid.innerHTML = shown.map((ep, rawIdx) => {
        const idx     = _episodes.indexOf(ep);
        const thumb   = ep.found_thumb || ep.anilist_thumb || ep.existing_thumb;
        const hasSaved = !!ep.existing_thumb;
        const hasFound = !hasSaved && !!(ep.found_thumb || ep.anilist_thumb);
        let statusLabel = '';
        let statusClass = '';
        if (hasSaved)          { statusLabel = '✓ Saved';  statusClass = 'saved'; }
        else if (ep.found_thumb){ statusLabel = '⬇ Found'; statusClass = 'found'; }
        else if (ep.anilist_thumb){statusLabel='AL';       statusClass = 'found'; }
        else if (ep.status==='error'){ statusLabel='Error'; statusClass='error';}
        else if (ep.status==='searching'){ statusLabel='…';statusClass='none';}

        return \`<div class="ep-card \${hasSaved?'has-thumb':''} \${ep.status==='searching'?'searching':''}" id="ep-card-\${idx}">
          \${thumb
            ? \`<img class="ep-card-img" src="\${eh(thumb)}" alt="" onerror="this.src='';">\`
            : \`<div class="ep-card-img-placeholder">🖼️</div>\`}
          \${statusLabel ? \`<span class="ep-status \${statusClass}">\${statusLabel}</span>\` : ''}
          <div class="ep-card-body">
            <div class="ep-card-label">Episode \${ep.num}</div>
            \${ep.title ? \`<div class="ep-card-title" title="\${eh(ep.title)}">\${eh(ep.title)}</div>\` : ''}
            <div class="ep-card-actions">
              <button class="btn btn-sm btn-secondary" onclick="openPickerForEp(\${idx})" style="font-size:.7rem;padding:2px 7px;">
                🔍 Pick
              </button>
              \${(ep.found_thumb || ep.anilist_thumb) && !hasSaved
                ? \`<button class="btn btn-sm btn-primary" onclick="saveEpThumb(\${idx})" style="font-size:.7rem;padding:2px 7px;">💾</button>\`
                : ''}
              \${hasSaved
                ? \`<button class="btn btn-sm btn-danger" onclick="clearEpThumb(\${idx})" style="font-size:.7rem;padding:2px 7px;">✕</button>\`
                : ''}
            </div>
          </div>
        </div>\`;
    }).join('');

    updateStats();
}

function updateStats() {
    const total   = _episodes.length;
    const saved   = _episodes.filter(e => e.existing_thumb).length;
    const found   = _episodes.filter(e => !e.existing_thumb && (e.found_thumb || e.anilist_thumb)).length;
    const missing = total - saved - found;
    document.getElementById('thumb-stats').textContent =
        \`\${saved} saved · \${found} found · \${missing} missing\`;

    const saveAllBtn = document.getElementById('btn-save-all');
    if (found > 0) {
        saveAllBtn.style.display = '';
        saveAllBtn.textContent   = \`💾 Save All Found (\${found})\`;
    } else {
        saveAllBtn.style.display = 'none';
    }
}

/* ═══════════════════════════════════════════════════════════════
   Auto-search all missing thumbnails
═══════════════════════════════════════════════════════════════ */
let _autoStop = false;

async function autoSearchAll() {
    if (!_animeId || !_episodes.length) { showToast('Load episodes first.', 'error'); return; }
    _autoStop = false;
    const btn = document.getElementById('btn-auto-search');
    btn.textContent = '⏹ Stop';
    btn.onclick = () => { _autoStop = true; btn.textContent = 'Stopping…'; btn.disabled = true; };

    const missing = _episodes.filter(e => !e.existing_thumb && !e.anilist_thumb && !e.found_thumb);
    const pw = document.getElementById('progress-wrap');
    const pb = document.getElementById('progress-bar-fill');
    const pl = document.getElementById('progress-label');
    pw.style.display = 'block';

    let done = 0;
    for (const ep of missing) {
        if (_autoStop) break;
        const idx = _episodes.indexOf(ep);
        ep.status = 'searching';
        updateCardStatus(idx);
        pl.textContent = \`Searching episode \${ep.num} of \${_animeTitle}…\`;

        try {
            const thumbs = await searchThumbsForEp(_animeTitle, ep.num);
            if (thumbs.length) {
                ep.found_thumb = thumbs[0];
                ep.status = 'found';
            } else {
                ep.status = 'none';
            }
        } catch(e) {
            ep.status = 'error';
        }

        done++;
        pb.style.width = Math.round((done / missing.length) * 100) + '%';
        updateCardStatus(idx);
        await sleep(400); // be gentle on external APIs
    }

    pw.style.display = 'none';
    btn.textContent = '🔍 Auto Search Thumbnails';
    btn.onclick = autoSearchAll;
    btn.disabled = false;
    renderGrid();
    showToast('Auto-search complete!', 'success');
}

/* ── External thumbnail search: tries multiple free sources ── */
// TMDB key — output from PHP so it's never exposed in source as a hardcoded string
const TMDB_KEY = ${JSON.stringify(tmdbKey)};

/* ── TMDB: called directly from browser (no CORS issues) ── */
async function tmdbEpisodeStills(animeTitle, epNum, listMode = false) {
    if (!TMDB_KEY) return [];
    const thumbs = [];
    try {
        const sq = encodeURIComponent(animeTitle);
        const sr = await fetch(\`https://api.themoviedb.org/3/search/tv?api_key=\${TMDB_KEY}&query=\${sq}&language=en-US\`);
        if (!sr.ok) return [];
        const sj      = await sr.json();
        const results = sj.results || [];

        for (const show of results.slice(0, 3)) {
            for (const season of [1, 2]) {
                try {
                    const er = await fetch(\`https://api.themoviedb.org/3/tv/\${show.id}/season/\${season}/episode/\${epNum}?api_key=\${TMDB_KEY}\`);
                    if (!er.ok) continue;
                    const ej    = await er.json();
                    const still = ej.still_path;
                    if (still) {
                        thumbs.push(\`https://image.tmdb.org/t/p/w780\${still}\`);
                        if (listMode) thumbs.push(\`https://image.tmdb.org/t/p/original\${still}\`);
                        return thumbs; // found — stop
                    }
                } catch(e) {}
            }
        }
    } catch(e) {}
    return thumbs;
}

/* ── Auto search (one best thumb per episode) ── */
async function searchThumbsForEp(animeTitle, epNum) {
    const ep = _episodes.find(e => e.num === epNum);

    // 1. TMDB from browser (works even when server can't reach it)
    const tmdbThumbs = await tmdbEpisodeStills(animeTitle, epNum, false);
    if (tmdbThumbs.length) return tmdbThumbs;

    // 2. PHP proxy (Kitsu / AniList / Jikan)
    try {
        const url = \`${siteUrl}/api/thumb_search.php?mode=auto\`
            + \`&anime=\${encodeURIComponent(animeTitle)}&ep=\${epNum}&mal_id=\${_animeId}\`;
        const j = await fetch(url).then(r => r.json());
        if (j.thumb) return [j.thumb];
    } catch(e) {}

    // 3. AniList thumb already loaded
    return ep?.anilist_thumb ? [ep.anilist_thumb] : [];
}

/* ── Picker: multiple candidates ── */
async function searchThumbsListForEp(animeTitle, epNum) {
    const ep     = _episodes.find(e => e.num === epNum);
    const thumbs = [];
    if (ep?.existing_thumb) thumbs.push(ep.existing_thumb);
    if (ep?.found_thumb   && !thumbs.includes(ep.found_thumb))    thumbs.push(ep.found_thumb);
    if (ep?.anilist_thumb && !thumbs.includes(ep.anilist_thumb))  thumbs.push(ep.anilist_thumb);

    // TMDB from browser
    const tmdbThumbs = await tmdbEpisodeStills(animeTitle, epNum, true);
    for (const u of tmdbThumbs) if (!thumbs.includes(u)) thumbs.push(u);

    // PHP proxy
    try {
        const url = \`${siteUrl}/api/thumb_search.php?mode=list\`
            + \`&anime=\${encodeURIComponent(animeTitle)}&ep=\${epNum}&mal_id=\${_animeId}\`;
        const j = await fetch(url).then(r => r.json());
        for (const u of (j.thumbs || [])) if (!thumbs.includes(u)) thumbs.push(u);
    } catch(e) {}

    return thumbs;
}


function updateCardStatus(idx) {
    const ep   = _episodes[idx];
    const card = document.getElementById('ep-card-' + idx);
    if (!card) return;
    // Re-render just this card by refreshing full grid (simpler, grid is usually <200 items)
    renderGrid();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ═══════════════════════════════════════════════════════════════
   Thumbnail picker modal
═══════════════════════════════════════════════════════════════ */
async function openPickerForEp(idx) {
    _tpmEpIdx    = idx;
    _tpmSelected = null;
    const ep     = _episodes[idx];
    document.getElementById('tpm-heading').textContent = \`Choose Thumbnail — Episode \${ep.num}\`;
    document.getElementById('tpm-loading').style.display = 'block';
    document.getElementById('tpm-grid').style.display    = 'none';
    document.getElementById('tpm-custom-url').value      = ep.found_thumb || ep.anilist_thumb || ep.existing_thumb || '';
    openModal('thumb-pick-modal');

    const thumbs = await searchThumbsListForEp(_animeTitle, ep.num);

    const grid = document.getElementById('tpm-grid');
    if (thumbs.length) {
        grid.innerHTML = thumbs.map((url, i) => \`
            <div class="thumb-option \${i===0?'selected':''}" onclick="tpmSelect(this,'\${eh(url)}')" data-url="\${eh(url)}">
              <img src="\${eh(url)}" alt="" loading="lazy" onerror="this.closest('.thumb-option').style.display='none'">
              <div style="font-size:.72rem;color:var(--text-muted);padding:3px 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                \${url.split('/').pop()}
              </div>
            </div>\`).join('');
        if (thumbs.length) { _tpmSelected = thumbs[0]; }
    } else {
        grid.innerHTML = '<div style="color:var(--text-muted);font-size:.85rem;padding:.5rem 0;">No thumbnails found automatically. Paste a URL below.</div>';
    }

    document.getElementById('tpm-loading').style.display = 'none';
    document.getElementById('tpm-grid').style.display    = 'grid';
}

function tpmSelect(el, url) {
    document.querySelectorAll('#tpm-grid .thumb-option').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');
    _tpmSelected = url;
    document.getElementById('tpm-custom-url').value = '';
}

function tpmSelectCustom() {
    const url = document.getElementById('tpm-custom-url').value.trim();
    if (!url) return;
    _tpmSelected = url;
    document.querySelectorAll('#tpm-grid .thumb-option').forEach(e => e.classList.remove('selected'));
}

async function tpmSave() {
    const url = document.getElementById('tpm-custom-url').value.trim() || _tpmSelected;
    if (!url) { showToast('No thumbnail selected.', 'error'); return; }
    const ep  = _episodes[_tpmEpIdx];
    const btn = document.getElementById('tpm-save-btn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
        await saveThumbToServer(_animeId, ep.num, url);
        ep.existing_thumb = url;
        ep.found_thumb    = '';
        ep.status         = 'saved';
        closeModal('thumb-pick-modal');
        renderGrid();
        showToast(\`Episode \${ep.num} thumbnail saved!\`, 'success');
    } catch(e) {
        showToast('Save failed: ' + e.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'Save Thumbnail';
    }
}

/* ═══════════════════════════════════════════════════════════════
   Individual save / clear
═══════════════════════════════════════════════════════════════ */
async function saveEpThumb(idx) {
    const ep  = _episodes[idx];
    const url = ep.found_thumb || ep.anilist_thumb;
    if (!url) return;
    try {
        await saveThumbToServer(_animeId, ep.num, url);
        ep.existing_thumb = url;
        ep.found_thumb    = '';
        ep.status         = 'saved';
        renderGrid();
        showToast(\`Ep \${ep.num} saved!\`, 'success');
    } catch(e) {
        showToast('Error: ' + e.message, 'error');
    }
}

async function clearEpThumb(idx) {
    if (!confirm('Remove the saved thumbnail for this episode?')) return;
    const ep = _episodes[idx];
    try {
        await saveThumbToServer(_animeId, ep.num, ''); // empty = clear
        ep.existing_thumb = '';
        ep.status         = 'none';
        renderGrid();
        showToast(\`Ep \${ep.num} thumbnail cleared.\`, 'success');
    } catch(e) {
        showToast('Error: ' + e.message, 'error');
    }
}

/* ═══════════════════════════════════════════════════════════════
   Save all found in one go
═══════════════════════════════════════════════════════════════ */
async function saveAllFound() {
    const toSave = _episodes.filter(e => !e.existing_thumb && (e.found_thumb || e.anilist_thumb));
    if (!toSave.length) return;
    if (!confirm(\`Save thumbnails for \${toSave.length} episodes?\`)) return;

    const btn = document.getElementById('btn-save-all');
    btn.disabled = true;

    // Show progress bar
    const pw = document.getElementById('progress-wrap');
    const pb = document.getElementById('progress-bar-fill');
    const pl = document.getElementById('progress-label');
    pw.style.display = 'block';
    pb.style.width   = '0%';

    let saved = 0, failed = 0;
    for (let i = 0; i < toSave.length; i++) {
        const ep  = toSave[i];
        const url = ep.found_thumb || ep.anilist_thumb;
        pl.textContent = \`Saving episode \${ep.num}… (\${i + 1}/\${toSave.length})\`;
        pb.style.width = Math.round(((i + 1) / toSave.length) * 100) + '%';
        try {
            await saveThumbToServer(_animeId, ep.num, url);
            ep.existing_thumb = url;
            ep.found_thumb    = '';
            ep.status         = 'saved';
            saved++;
        } catch(e) {
            failed++;
        }
    }

    pw.style.display = 'none';
    btn.disabled = false;
    renderGrid(); // hides button automatically via updateStats if none left
    const msg = failed > 0
        ? \`\${saved} saved, \${failed} failed\`
        : \`\${saved} thumbnails saved!\`;
    showToast(msg, failed > 0 ? 'error' : 'success');
}

/* ═══════════════════════════════════════════════════════════════
   Debug — calls ?mode=debug and shows full server log
═══════════════════════════════════════════════════════════════ */
async function runDebug() {
    const out = document.getElementById('debug-out');
    out.style.display = 'block';
    out.textContent   = 'Running debug for episode 1…';
    try {
        const url = \`${siteUrl}/api/thumb_search.php?mode=debug\`
            + \`&anime=\${encodeURIComponent(_animeTitle)}\`
            + \`&ep=1\`
            + \`&mal_id=\${_animeId}\`;
        const r = await fetch(url);
        const j = await r.json();
        out.textContent = JSON.stringify(j, null, 2);
    } catch(e) {
        out.textContent = 'Debug request failed: ' + e.message;
    }
}

async function saveThumbToServer(animeId, epNum, imageUrl) {
    // First get existing override so we don't wipe synopsis / watch_links
    const getRes  = await fetch(\`${siteUrl}/api/episode_override.php?anime_id=\${animeId}&ep=\${epNum}\`);
    const getData = await getRes.json();
    const existing = getData.override || {};
    const links    = getData.watch_links || [];

    const res = await fetch('${siteUrl}/api/episode_override.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            anime_id:    animeId,
            episode_num: epNum,
            image_url:   imageUrl,
            synopsis:    existing.synopsis   || '',
            watch_links: links,
        })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Unknown error');
}
</script>
`;
}
