export function videosScript(siteUrl: string): string {
  return `<script>
/* ─── State ─────────────────────────────────────────────────── */
let _searchTimer2       = null;
let _selectedAnimeId    = null;
let _selectedAnimeTitle = '';
let _rowCounter         = 0;
let _currentAudioTab    = 'sub';

/* ─── Sub / Dub tab switch ───────────────────────────────────── */
function switchAudioTab(tab) {
  _currentAudioTab = tab;
  ['sub','dub'].forEach(t => {
    const on = t === tab;
    document.getElementById('sdtab-' + t).classList.toggle('active', on);
    document.getElementById('vm-quality-list-' + t).style.display = on ? 'flex' : 'none';
    document.getElementById('add-btn-' + t).style.display         = on ? ''     : 'none';
  });
  renderEmbedPreview('');
}

function updateDubBadge() {
  const count = document.getElementById('vm-quality-list-dub').querySelectorAll('.quality-row').length;
  const badge = document.getElementById('dub-badge');
  badge.textContent   = count;
  badge.style.display = count ? 'inline-flex' : 'none';
}

/* ─── Quality row management ─────────────────────────────────── */
const QUALITY_PRESETS = ['1080p','720p','480p','360p','Auto'];

function addQualityRow(track, label, url) {
  track = track || 'sub';
  label = label || '';
  url   = url   || '';

  const id  = 'qrow-' + (++_rowCounter);
  const row = document.createElement('div');
  row.className = 'quality-row';
  row.id = id;

  const presetOpts = QUALITY_PRESETS.map(function(p) {
    return '<option value="' + p + '"' + (label === p ? ' selected' : '') + '>' + p + '</option>';
  }).join('');
  const hasCustom = label && !QUALITY_PRESETS.includes(label);

  row.innerHTML =
    '<div>' +
      '<select class="form-control q-label" style="font-size:.82rem;" onchange="onQualityLabelChange(this,\\'' + id + '\\')">' +
        presetOpts +
        '<option value="__custom__"' + (hasCustom ? ' selected' : '') + '>Custom\\u2026</option>' +
      '</select>' +
      '<input type="text" class="form-control q-label-custom" placeholder="e.g. 4K"' +
        ' style="display:' + (hasCustom ? 'block' : 'none') + ';margin-top:.35rem;font-size:.82rem;"' +
        ' value="' + ehAttr(hasCustom ? label : '') + '">' +
    '</div>' +
    '<input type="url" class="form-control q-url"' +
      ' placeholder="Paste link or iframe code\\u2026"' +
      ' value="' + ehAttr(url) + '"' +
      ' oninput="onQualityUrlInput(this)"' +
      ' onfocus="previewQualityRow(this)">' +
    '<button type="button" class="q-remove" title="Remove" onclick="removeQualityRow(\\'' + id + '\\',\\'' + track + '\\')">&#10005;</button>';

  document.getElementById('vm-quality-list-' + track).appendChild(row);
  if (track === 'dub') updateDubBadge();
}

function ehAttr(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function onQualityLabelChange(sel, rowId) {
  const el = document.getElementById(rowId);
  if (!el) return;
  el.querySelector('.q-label-custom').style.display = sel.value === '__custom__' ? 'block' : 'none';
}

function removeQualityRow(id, track) {
  const el = document.getElementById(id);
  if (el) el.remove();
  const list = document.getElementById('vm-quality-list-' + (track || 'sub'));
  if (track === 'dub') updateDubBadge();
  if (list && !list.children.length && track === 'sub') addQualityRow('sub');
}

function onQualityUrlInput(input) { previewQualityRow(input); }

function previewQualityRow(input) {
  var raw = input.value.trim();
  var iframe = raw.startsWith('<') ? raw : linkToIframe(raw);
  renderEmbedPreview(iframe);
}

/* Returns {sub:[{label,embed},...], dub:[...]} */
function collectAllQualities() {
  var result = { sub: [], dub: [] };
  ['sub','dub'].forEach(function(track) {
    var rows = document.getElementById('vm-quality-list-' + track).querySelectorAll('.quality-row');
    rows.forEach(function(row) {
      var sel   = row.querySelector('select.q-label');
      var label = sel.value === '__custom__'
                    ? (row.querySelector('.q-label-custom').value.trim() || 'Custom')
                    : sel.value;
      var raw   = row.querySelector('.q-url').value.trim();
      if (!raw) return;
      var embed = raw.startsWith('<') ? raw : linkToIframe(raw);
      if (embed) result[track].push({ label: label, embed: embed });
    });
  });
  return result;
}

/* Load from saved {sub:[...],dub:[...]} or legacy flat array */
function loadAllQualities(data) {
  document.getElementById('vm-quality-list-sub').innerHTML = '';
  document.getElementById('vm-quality-list-dub').innerHTML = '';
  _rowCounter = 0;

  var sub = [], dub = [];
  if (data && Array.isArray(data.sub)) {
    sub = data.sub;
    dub = Array.isArray(data.dub) ? data.dub : [];
  } else if (Array.isArray(data) && data.length) {
    // Legacy flat array — treat all as sub
    sub = data;
  }

  if (!sub.length) {
    addQualityRow('sub');
  } else {
    sub.forEach(function(q) { addQualityRow('sub', q.label || '1080p', q.embed || q.url || ''); });
  }
  dub.forEach(function(q) { addQualityRow('dub', q.label || '1080p', q.embed || q.url || ''); });
  updateDubBadge();

  // Start on sub tab
  switchAudioTab('sub');
}

/* ─── Link → iFrame auto-generator ──────────────────────────── */
function linkToIframe(url) {
  if (!url || url.startsWith('<')) return url || '';
  var ytMatch = url.match(/(?:youtu\\.be\\/|youtube\\.com\\/(?:watch\\?v=|embed\\/|shorts\\/|v\\/))([A-Za-z0-9_\\-]{11})/);
  if (ytMatch) return buildIframe('https://www.youtube.com/embed/' + ytMatch[1] + '?rel=0',
    'YouTube video player','accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
  if (/facebook\\.com\\/(watch|video)/i.test(url))
    return buildIframe('https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(url) + '&show_text=false&width=734',
      'Facebook video','autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share');
  var dmMatch = url.match(/dailymotion\\.com\\/(?:video|embed\\/video)\\/([A-Za-z0-9]+)/);
  if (dmMatch) return buildIframe('https://www.dailymotion.com/embed/video/' + dmMatch[1],
    'Dailymotion video','autoplay; fullscreen; picture-in-picture');
  var vimeoMatch = url.match(/vimeo\\.com\\/(?:video\\/)?(\\d+)/);
  if (vimeoMatch) return buildIframe('https://player.vimeo.com/video/' + vimeoMatch[1],
    'Vimeo video','autoplay; fullscreen; picture-in-picture');
  if (/^https?:\\/\\//i.test(url))
    return buildIframe(url.replace(/^http:\\/\\//i,'https://'), 'Video player','autoplay; fullscreen; picture-in-picture');
  return '';
}
function buildIframe(src, title, allow) {
  return '<iframe src="' + ea(src) + '" title="' + ea(title) + '" frameborder="0" allow="' + ea(allow) + '" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>';
}
function ea(s)  { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function eh(s)  { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ─── Embed preview ──────────────────────────────────────────── */
function renderEmbedPreview(code) {
  var wrap = document.getElementById('vm-embed-preview');
  if (!code) { wrap.className='embed-preview-empty'; wrap.innerHTML='Preview will appear here'; return; }
  if (!code.toLowerCase().includes('<iframe')) {
    wrap.className='embed-preview-empty';
    wrap.innerHTML='&#9888; Could not generate iframe — check your URL or paste the full &lt;iframe&gt; code';
    return;
  }
  wrap.className='embed-preview';
  wrap.innerHTML=code;
}

/* ─── Anime search ───────────────────────────────────────────── */
const _animeCache = {};

document.getElementById('vm-anime-search').addEventListener('input', function() {
  clearTimeout(_searchTimer2);
  var q = this.value.trim();
  if (!q) { hideDropdown(); return; }
  if (/^\\d+$/.test(q)) {
    _searchTimer2 = setTimeout(function() { lookupById(parseInt(q,10)); }, 350);
  } else if (q.length >= 2) {
    _searchTimer2 = setTimeout(function() { searchByName(q); }, 420);
  }
});
document.getElementById('vm-anime-search').addEventListener('blur', function() { setTimeout(hideDropdown, 200); });

async function lookupById(id) {
  var dd = document.getElementById('anime-search-dropdown');
  dd.style.display='block';
  dd.innerHTML='<div style="padding:.5rem .75rem;color:var(--text-muted);font-size:.83rem;">Looking up ID ' + id + '\\u2026</div>';
  try {
    var r = await fetch('https://api.jikan.moe/v4/anime/' + id);
    if (!r.ok) throw new Error();
    var json = await r.json();
    var a = json.data;
    if (!a) throw new Error();
    dd.innerHTML = renderResult(a);
  } catch(e) { dd.innerHTML='<div style="padding:.5rem .75rem;color:var(--text-muted);">No anime found for ID ' + id + '</div>'; }
}

async function searchByName(q) {
  var dd = document.getElementById('anime-search-dropdown');
  dd.style.display='block';
  dd.innerHTML='<div style="padding:.5rem .75rem;color:var(--text-muted);font-size:.83rem;">Searching\\u2026</div>';
  try {
    var r = await fetch('https://api.jikan.moe/v4/anime?q=' + encodeURIComponent(q) + '&limit=8&sfw=true');
    var json = await r.json();
    var data = json.data;
    if (!data || !data.length) { dd.innerHTML='<div style="padding:.5rem .75rem;color:var(--text-muted);">No results</div>'; return; }
    dd.innerHTML = data.map(renderResult).join('');
  } catch(e) { dd.innerHTML='<div style="padding:.5rem .75rem;color:var(--text-muted);">Search failed</div>'; }
}

function renderResult(a) {
  var title = a.title || a.title_english || '';
  var img   = (a.images && a.images.jpg && a.images.jpg.small_image_url) ? a.images.jpg.small_image_url : '';
  _animeCache[a.mal_id] = { id: a.mal_id, title: title, img: img, synopsis: a.synopsis || '' };
  return '<div class="anime-search-result" data-mal-id="' + a.mal_id + '" onclick="selectAnimeById(' + a.mal_id + ')">' +
    '<img src="' + eh(img) + '" alt="" onerror="this.style.display=\\'none\\'">' +
    '<div>' +
      '<div style="font-weight:600;">' + eh(title) + '</div>' +
      '<div style="font-size:.73rem;color:var(--text-muted);">' + eh(a.type||'') + ' &middot; ' + (a.episodes||'?') + ' eps &middot; ID: ' + a.mal_id + '</div>' +
    '</div>' +
  '</div>';
}

function selectAnimeById(id) {
  var a = _animeCache[id]; if (!a) return;
  _selectedAnimeId    = a.id;
  _selectedAnimeTitle = a.title;
  document.getElementById('vm-anime-id').value     = a.id;
  document.getElementById('vm-anime-search').value = a.title;
  var sel = document.getElementById('vm-anime-selected');
  sel.textContent = '\\u2713 ' + a.title + ' (ID: ' + a.id + ')';
  sel.style.display = 'block';
  hideDropdown();
  // Keep hidden fields in sync (title/description no longer shown to admin)
  document.getElementById('vm-title').value = a.title;
  if (!document.getElementById('vm-description').value.trim() && a.synopsis)
    document.getElementById('vm-description').value = a.synopsis.slice(0,500);
}

function hideDropdown() { document.getElementById('anime-search-dropdown').style.display='none'; }

/* ─── Modal open / edit ──────────────────────────────────────── */
function openVideoModal() {
  ['vm-id','vm-anime-id','vm-anime-search','vm-ep-num','vm-title','vm-description'].forEach(function(id){
    document.getElementById(id).value='';
  });
  document.getElementById('vm-anime-selected').style.display='none';
  document.getElementById('vm-is-active').checked=true;
  document.getElementById('vm-heading').textContent='Add Episode Video';
  _selectedAnimeId=null; _selectedAnimeTitle='';
  loadAllQualities(null);
  renderEmbedPreview('');
  openModal('video-modal');
}

function editVideo(data) {
  document.getElementById('vm-id').value           = data.id;
  document.getElementById('vm-anime-id').value     = data.anime_id;
  document.getElementById('vm-anime-search').value = data.anime_title||'';
  _selectedAnimeId    = data.anime_id;
  _selectedAnimeTitle = data.anime_title||'';
  var sel = document.getElementById('vm-anime-selected');
  sel.textContent = '\\u2713 ' + (data.anime_title||'#'+data.anime_id) + ' (ID: ' + data.anime_id + ')';
  sel.style.display='block';
  document.getElementById('vm-ep-num').value      = data.episode_num;
  document.getElementById('vm-title').value       = data.title       || '';
  document.getElementById('vm-description').value = data.description || '';
  document.getElementById('vm-is-active').checked = !!data.is_active;
  document.getElementById('vm-heading').textContent = 'Edit Episode Video';

  var parsed = null;
  try { parsed = data.qualities ? JSON.parse(data.qualities) : null; } catch(e){}
  // Legacy flat array → wrap as sub
  if (Array.isArray(parsed)) parsed = { sub: parsed, dub: [] };
  // No qualities at all → fall back to single embed_code as sub 1080p
  if (!parsed && data.embed_code) parsed = { sub: [{ label:'1080p', embed: data.embed_code }], dub: [] };
  loadAllQualities(parsed);

  var firstEmbed = (parsed && parsed.sub && parsed.sub[0]) ? parsed.sub[0].embed : (data.embed_code||'');
  renderEmbedPreview(firstEmbed);
  openModal('video-modal');
}

/* ─── Save ───────────────────────────────────────────────────── */
async function saveVideo() {
  var animeId = parseInt(document.getElementById('vm-anime-id').value);
  var epNum   = parseInt(document.getElementById('vm-ep-num').value);
  var allQ    = collectAllQualities();

  if (!animeId)           { alert('Please select an anime first.'); return; }
  if (!epNum || epNum<1)  { alert('Please enter a valid episode number.'); return; }
  if (!allQ.sub.length)   { alert('Please add at least one Sub video source.'); return; }

  var payload = {
    id:          parseInt(document.getElementById('vm-id').value)||null,
    anime_id:    animeId,
    episode_num: epNum,
    video_type:  'Review',
    platform:    'other',
    qualities:   allQ,
    embed_code:  allQ.sub[0]&&allQ.sub[0].embed ? allQ.sub[0].embed : '',
    title:       document.getElementById('vm-title').value.trim(),
    description: document.getElementById('vm-description').value.trim(),
    is_active:   document.getElementById('vm-is-active').checked ? 1 : 0,
  };

  var saveBtn = document.getElementById('vm-save-btn');
  var nextBtn = document.getElementById('vm-next-btn');
  saveBtn.disabled=true; saveBtn.textContent='Saving\\u2026';
  nextBtn.disabled=true;
  try {
    var res  = await fetch('${siteUrl}/api/videos.php',{
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
    });
    var data = await res.json();
    if (!data.success){alert('Error: '+(data.error||'Unknown'));return;}
    closeModal('video-modal');
    showToast('Video saved!','success');
    setTimeout(function(){location.reload();},700);
  } catch(e){ alert('Network error: '+e.message); }
  finally {
    saveBtn.disabled=false; saveBtn.textContent='Save Video';
    nextBtn.disabled=false;
  }
}

/* ─── Save & Next Episode ────────────────────────────────────── */
async function saveAndNextEpisode() {
  var animeId   = parseInt(document.getElementById('vm-anime-id').value);
  var epNum     = parseInt(document.getElementById('vm-ep-num').value);
  var allQ      = collectAllQualities();

  if (!animeId)           { alert('Please select an anime first.'); return; }
  if (!epNum || epNum<1)  { alert('Please enter a valid episode number.'); return; }
  if (!allQ.sub.length)   { alert('Please add at least one Sub video source.'); return; }

  var payload = {
    id:          parseInt(document.getElementById('vm-id').value)||null,
    anime_id:    animeId,
    episode_num: epNum,
    video_type:  'Review',
    platform:    'other',
    qualities:   allQ,
    embed_code:  allQ.sub[0]&&allQ.sub[0].embed ? allQ.sub[0].embed : '',
    title:       document.getElementById('vm-title').value.trim(),
    description: document.getElementById('vm-description').value.trim(),
    is_active:   document.getElementById('vm-is-active').checked ? 1 : 0,
  };

  var saveBtn = document.getElementById('vm-save-btn');
  var nextBtn = document.getElementById('vm-next-btn');
  saveBtn.disabled=true;
  nextBtn.disabled=true; nextBtn.textContent='Saving\\u2026';

  try {
    var res  = await fetch('${siteUrl}/api/videos.php',{
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
    });
    var data = await res.json();
    if (!data.success){ alert('Error: '+(data.error||'Unknown')); return; }

    showToast('Ep ' + epNum + ' saved! Loading next\\u2026', 'success');

    // ── Prepare modal for the NEXT episode ──────────────────────
    var nextEp = epNum + 1;

    // Clear the record ID so it's treated as a new insert
    document.getElementById('vm-id').value = '';

    // Bump episode number
    document.getElementById('vm-ep-num').value = nextEp;

    // Keep anime selection intact (search box + hidden id + badge)
    // _selectedAnimeId and _selectedAnimeTitle are already set

    // Clear video sources so admin pastes fresh links
    loadAllQualities(null);
    renderEmbedPreview('');

    // Active toggle stays as-is
    document.getElementById('vm-heading').textContent = 'Add Episode Video — Ep ' + nextEp;

    // Make sure the modal stays open / re-focus episode field
    openModal('video-modal');

  } catch(e){ alert('Network error: '+e.message); }
  finally {
    saveBtn.disabled=false;
    nextBtn.disabled=false; nextBtn.textContent='Save \\u0026 Next \\u25b6';
  }
}

/* ─── Delete ─────────────────────────────────────────────────── */
async function deleteVideo(id, btn) {
  if (!confirm('Delete this video entry? This cannot be undone.')) return;
  btn.disabled=true; btn.textContent='\\u2026';
  try {
    var res  = await fetch('${siteUrl}/api/videos.php?action=delete&id='+id,{method:'POST'});
    var data = await res.json();
    if (data.success){
      var row=btn.closest('tr'); row.style.opacity='0'; row.style.transition='opacity .3s';
      setTimeout(function(){row.remove();},300); showToast('Deleted','success');
    } else {
      alert('Delete failed: '+(data.error||'')); btn.disabled=false; btn.textContent='Delete';
    }
  } catch(e){ alert('Error: '+e.message); btn.disabled=false; btn.textContent='Delete'; }
}
</script>
`;
}
