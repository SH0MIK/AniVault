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
let _hoshikaId = '';

document.getElementById('thumb-anime-search').addEventListener('input', function () {
    clearTimeout(_searchTimer);
    const q = this.value.trim();
    if (q.length < 2) { hideDD(); return; }
    _searchTimer = setTimeout(() => hoshikaSearch(q), 350);
});
document.addEventListener('click', function (e) {
    if (!document.getElementById('thumb-anime-wrap').contains(e.target)) hideDD();
});

async function hoshikaSearch(q) {
    const dd = document.getElementById('thumb-anime-dropdown');
    dd.style.display = 'block';
    dd.innerHTML = '<div style="padding:.5rem .75rem;color:var(--text-muted);font-size:.83rem;">Searching Hoshika…</div>';
    try {
        const r = await fetch('${siteUrl}/api/hoshika/search?q=' + encodeURIComponent(q) + '&limit=8', { cache: 'no-store' });
        if (!r.ok) throw new Error('Hoshika search failed');
        const json = await r.json();
        const data = json.data || [];
        if (!data.length) { dd.innerHTML = '<div style="padding:.5rem .75rem;color:var(--text-muted);">No Hoshika results</div>'; return; }
        const rows = await Promise.all(data.map(async a => {
            const shortId = String(a.shortId || '');
            if (!shortId) return '';
            let identity = null;
            try {
                const ir = await fetch('${siteUrl}/api/hoshika/identity/' + encodeURIComponent(shortId), { cache: 'no-store' });
                if (ir.ok) identity = await ir.json();
            } catch (_) {}
            const title = a.title || a.titleEnglish || a.titleRomaji || '';
            const img = a.poster || '';
            if (!identity || identity.verified !== true || !identity.legacyMalId) {
                return '<div class="ta-result" style="opacity:.65;cursor:not-allowed;" title="Needs a verified legacy mapping">' +
                    (img ? '<img src="' + eh(img) + '" alt="" onerror="this.style.display=\'none\'">' : '') +
                    '<div><div style="font-weight:600;">' + eh(title) + '</div><div style="font-size:.73rem;color:var(--text-muted);">Hoshika ID: ' + eh(shortId) + ' · No verified legacy mapping</div></div></div>';
            }
            const legacyId = Number(identity.legacyMalId);
            _cache[legacyId] = { id: legacyId, shortId: shortId, title: title, img: img, episodes: Number(a.episodes || 0) };
            return '<div class="ta-result" onclick="selectAnime(' + legacyId + ')">' +
                (img ? '<img src="' + eh(img) + '" alt="" onerror="this.style.display=\'none\'">' : '') +
                '<div><div style="font-weight:600;">' + eh(title) + '</div><div style="font-size:.73rem;color:var(--text-muted);">Hoshika ID: ' + eh(shortId) + ' · Verified legacy ID: ' + legacyId + ' · ' + (a.episodes || '?') + ' eps</div></div></div>';
        }));
        const visible = rows.filter(Boolean);
        dd.innerHTML = visible.length ? visible.join('') : '<div style="padding:.5rem .75rem;color:var(--text-muted);">No verified Hoshika mappings found</div>';
    } catch (e) {
        dd.innerHTML = '<div style="padding:.5rem .75rem;color:var(--text-muted);">Hoshika search failed</div>';
    }
}

function selectAnime(id) {
    const a = _cache[id]; if (!a) return;
    _animeId = a.id;
    _hoshikaId = a.shortId;
    _animeTitle = a.title;
    document.getElementById('thumb-anime-id').value = a.id;
    document.getElementById('thumb-anime-title-val').value = a.title;
    document.getElementById('thumb-anime-search').value = a.title;
    const sel = document.getElementById('thumb-anime-selected');
    sel.textContent = '✓ ' + a.title + ' (verified legacy ID: ' + a.id + ')';
    sel.style.display = 'block';
    hideDD();
    document.getElementById('btn-load-eps').disabled = false;
    document.getElementById('btn-auto-search').disabled = false;
    document.getElementById('btn-debug').disabled = false;
    _episodes = [];
    document.getElementById('ep-grid-wrap').style.display = 'none';
    document.getElementById('btn-save-all').style.display = 'none';
    document.getElementById('thumb-stats').textContent = '';
}

function hideDD() { document.getElementById('thumb-anime-dropdown').style.display = 'none'; }
function eh(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function loadEpisodes() {
    if (!_animeId || !_hoshikaId) return;
    const btn = document.getElementById('btn-load-eps');
    btn.disabled = true; btn.textContent = 'Loading…';
    try {
        const overRes = await fetch('${siteUrl}/api/episode_override.php?anime_id=' + _animeId + '&all=1');
        if (!overRes.ok) throw new Error('Could not load saved episode overrides');
        const overData = await overRes.json();
        const overMap = {};
        (overData.overrides || []).forEach(r => { overMap[parseInt(r.episode_num, 10)] = r.image_url || ''; });

        // Hoshika is the only episode metadata and thumbnail API. The legacy ID
        // is used only after the identity endpoint confirms the mapping.
        const epsRes = await fetch('${siteUrl}/api/hoshika/anime/' + encodeURIComponent(_hoshikaId) + '/episodes', { cache: 'no-store' });
        if (!epsRes.ok) throw new Error('Hoshika episode data is unavailable');
        const epsPayload = await epsRes.json();
        const hoshikaEps = Array.isArray(epsPayload.data) ? epsPayload.data : [];
        const overMapMax = Object.keys(overMap).length ? Math.max(...Object.keys(overMap).map(Number)) : 0;
        const count = Math.max(hoshikaEps.length, Number(overData.total_eps || 0), overMapMax);
        if (!count) {
            showToast('Hoshika did not return an episode count for this title.', 'error');
            return;
        }
        _episodes = [];
        for (let n = 1; n <= count; n++) {
            const he = hoshikaEps.find(e => Number(e.number) === n) || {};
            _episodes.push({
                num: n,
                title: he.title || '',
                existing_thumb: overMap[n] || '',
                hoshika_thumb: he.thumbnail || '',
                found_thumb: '',
                status: overMap[n] ? 'saved' : (he.thumbnail ? 'hoshika' : 'none'),
            });
        }
        renderGrid();
        document.getElementById('ep-grid-wrap').style.display = 'block';
        updateStats();
    } catch(e) {
        showToast('Error loading Hoshika episodes: ' + e.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = '📋 Load Episodes';
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
    if (missingOnly) shown = shown.filter(e => !e.existing_thumb && !e.hoshika_thumb && !e.found_thumb);
    if (foundOnly)   shown = shown.filter(e => e.found_thumb || e.hoshika_thumb);

    const grid = document.getElementById('ep-grid');
    grid.innerHTML = shown.map((ep, rawIdx) => {
        const idx     = _episodes.indexOf(ep);
        const thumb   = ep.found_thumb || ep.hoshika_thumb || ep.existing_thumb;
        const hasSaved = !!ep.existing_thumb;
        const hasFound = !hasSaved && !!(ep.found_thumb || ep.hoshika_thumb);
        let statusLabel = '';
        let statusClass = '';
        if (hasSaved)          { statusLabel = '✓ Saved';  statusClass = 'saved'; }
        else if (ep.found_thumb){ statusLabel = '⬇ Found'; statusClass = 'found'; }
        else if (ep.hoshika_thumb){statusLabel='H';       statusClass = 'found'; }
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
              \${(ep.found_thumb || ep.hoshika_thumb) && !hasSaved
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
    const found   = _episodes.filter(e => !e.existing_thumb && (e.found_thumb || e.hoshika_thumb)).length;
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

    const missing = _episodes.filter(e => !e.existing_thumb && !e.hoshika_thumb && !e.found_thumb);
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
/* Hoshika-only thumbnail candidates; other metadata providers are intentionally disabled. */
async function searchThumbsForEp(animeTitle, epNum) {
    const ep = _episodes.find(e => e.num === epNum);
    return ep && ep.hoshika_thumb ? [ep.hoshika_thumb] : [];
}

async function searchThumbsListForEp(animeTitle, epNum) {
    const ep = _episodes.find(e => e.num === epNum);
    const thumbs = [];
    if (ep && ep.existing_thumb) thumbs.push(ep.existing_thumb);
    if (ep && ep.found_thumb && !thumbs.includes(ep.found_thumb)) thumbs.push(ep.found_thumb);
    if (ep && ep.hoshika_thumb && !thumbs.includes(ep.hoshika_thumb)) thumbs.push(ep.hoshika_thumb);
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
    document.getElementById('tpm-custom-url').value      = ep.found_thumb || ep.hoshika_thumb || ep.existing_thumb || '';
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
    const url = ep.found_thumb || ep.hoshika_thumb;
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
    const toSave = _episodes.filter(e => !e.existing_thumb && (e.found_thumb || e.hoshika_thumb));
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
        const url = ep.found_thumb || ep.hoshika_thumb;
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

/* Debug reports only the selected Hoshika record and loaded episode data. */
async function runDebug() {
    const out = document.getElementById('debug-out');
    out.style.display = 'block';
    out.textContent = JSON.stringify({
        hoshikaId: _hoshikaId || null,
        verifiedLegacyId: _animeId || null,
        loadedEpisodes: _episodes.length,
        episodesWithHoshikaThumbnails: _episodes.filter(e => !!e.hoshika_thumb).length
    }, null, 2);
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
