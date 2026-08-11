export function continueWatchingScript(siteUrl: string): string {
  return `<script>
  (function(){
    var BEARER = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI5MGM2MTA0NGEzODMxYWM1NDQ4Y2ZmYzg5YWU4Nzk0YiIsIm5iZiI6MTc3ODM3NTk5NC45MTI5OTk5LCJzdWIiOiI2OWZmZGQzYWQ5ZTdhZDY1NTIxZTEyYTgiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.NeITU3u5e-9-_YaN_zrQQCUp4u8tKSXpZDOWlouxjps';

    function tmdbFetch(url) {
      return fetch(url, { headers: { Authorization: 'Bearer ' + BEARER } })
        .then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; });
    }

    function applyThumb(img, url, epTitle) {
      var tmp = new Image();
      tmp.onload = function(){
        img.src = url;
        img.style.display = '';
        img.style.position = '';
        img.style.inset = '';
        img.style.width = '';
        img.style.height = '';
        img.style.objectFit = '';
        var phId = img.dataset.phId;
        if (phId) { var ph = document.getElementById(phId); if (ph) ph.style.display = 'none'; }
        var prev = img.previousElementSibling;
        if (prev && prev.classList && prev.classList.contains('cw-placeholder')) prev.style.display = 'none';
        var payload = { action:'set_ep_info', anime_id:parseInt(img.dataset.animeId), episode_num:parseInt(img.dataset.ep), ep_thumb:url };
        if (epTitle) payload.ep_title = epTitle;
        fetch('${siteUrl}/api/watch_history.php', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(payload)
        }).catch(function(){});
      };
      tmp.src = url;
    }

    // ── Episode thumbnails: TMDB primary, AniList fallback ────────────────────
    var pending = {};
    document.querySelectorAll('.wh-ep-thumb').forEach(function(img) {
      var rawSrc = img.getAttribute('src') || '';
      if (rawSrc !== '') return; // already has a stored thumb
      var aid = img.dataset.animeId;
      if (!pending[aid]) pending[aid] = [];
      pending[aid].push(img);
    });

    Object.keys(pending).forEach(async function(aid) {
      var imgs = pending[aid];

      // ── Step 1: Try TMDB ───────────────────────────────────────────────
      var tmdbId = null;
      var extRes = await fetch('https://api.jikan.moe/v4/anime/' + aid + '/external')
        .then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; });
      if (extRes && extRes.data) {
        var entry = extRes.data.find(function(e){ return e.url && e.url.includes('themoviedb.org/tv/'); });
        if (entry) { var m = entry.url.match(/themoviedb\\.org\\/tv\\/(\\d+)/); if (m) tmdbId = m[1]; }
      }
      if (!tmdbId) {
        var title = imgs[0].dataset.animeTitle || '';
        if (title) {
          var sr = await tmdbFetch('https://api.themoviedb.org/3/search/tv?query=' + encodeURIComponent(title));
          if (sr && sr.results && sr.results.length) tmdbId = sr.results[0].id;
        }
      }

      if (tmdbId) {
        var season = await tmdbFetch('https://api.themoviedb.org/3/tv/' + tmdbId + '/season/1');
        if (season && season.episodes) {
          var tmdbMap = {};
          season.episodes.forEach(function(ep){
            if (ep.still_path && ep.episode_number)
              tmdbMap[ep.episode_number] = { thumb: 'https://image.tmdb.org/t/p/w500' + ep.still_path, title: ep.name || '' };
          });
          var missing = [];
          imgs.forEach(function(img){
            var ep = parseInt(img.dataset.ep);
            if (tmdbMap[ep]) applyThumb(img, tmdbMap[ep].thumb, tmdbMap[ep].title);
            else missing.push(img);
          });
          imgs = missing; // only fall through to AniList for episodes TMDB didn't cover
        }
      }

      // ── Step 2: AniList fallback for any remaining images ────────────
      if (!imgs.length) return;
      try {
        var res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'query ($malId: Int) { Media(idMal: $malId, type: ANIME) { streamingEpisodes { title thumbnail site } } }',
            variables: { malId: parseInt(aid) }
          })
        });
        var data = await res.json();
        var eps  = data && data.data && data.data.Media && data.data.Media.streamingEpisodes || [];
        var SKIP = ['netflix','amazon','prime','disney','hulu','apple'];
        var PREF = ['crunchyroll','funimation','hidive','vrv'];
        function siteScore(site) {
          var s = (site||'').toLowerCase();
          if (SKIP.some(function(x){ return s.indexOf(x)!==-1; })) return -1;
          if (PREF.some(function(x){ return s.indexOf(x)!==-1; })) return 2;
          return 1;
        }
        var rawMap = {};
        eps.forEach(function(ep){
          var match = (ep.title||'').match(/Episode\\s+(\\d+)/i);
          if (!match || !ep.thumbnail) return;
          var n = parseInt(match[1]), s = siteScore(ep.site);
          if (s < 0) return;
          if (!rawMap[n] || s > rawMap[n].score) rawMap[n] = { url: ep.thumbnail, score: s };
        });
        imgs.forEach(function(img){
          var epNum = parseInt(img.dataset.ep);
          if (rawMap[epNum]) applyThumb(img, rawMap[epNum].url, '');
        });
      } catch(e) {}
    });
  })();
  </script>
  </script>
  <script>
  var __cwSiteUrl = '${siteUrl}';

  async function removeFromHistory(animeId, btn) {
    var card = document.getElementById('whcard-' + animeId);
    if (!card) return;

    // How many cards are currently visible in the grid?
    var grid  = document.getElementById('watch-history-grid');
    var cards = grid ? Array.from(grid.querySelectorAll('.cw-card')) : [];
    var total = cards.length;

    // Remove from DB
    try {
      var res = await fetch(__cwSiteUrl + '/api/watch_history.php', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({action:'remove', anime_id:animeId})
      });
      if (!(await res.json()).success) return;
    } catch(e) { return; }

    // Fade out the removed card
    card.style.transition = 'opacity .2s, transform .2s';
    card.style.opacity    = '0';
    card.style.transform  = 'scale(0.92)';

    // Fetch the next item (offset = current total, since we just deleted one the server now has total-1 items,
    // but we want the item that was just beyond what we were showing, so offset = total - 1)
    var nextItem = null;
    try {
      var nr   = await fetch(__cwSiteUrl + '/api/watch_history.php', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({action:'get_at_offset', offset: total - 1})
      });
      var nd = await nr.json();
      nextItem = nd.item || null;
    } catch(e) {}

    setTimeout(function() {
      card.remove();

      if (!nextItem || !grid) return;

      // Build replacement card HTML
      var watchUrl  = __cwSiteUrl + '/watch?anime=' + nextItem.anime_id + '&ep=' + nextItem.episode_num;
      var epNum     = nextItem.episode_num;
      var epTitle   = nextItem.ep_title  || ('Episode ' + epNum);
      var animeName = nextItem.anime_title || ('Anime #' + nextItem.anime_id);
      var thumb     = nextItem.ep_thumb  || nextItem.anime_image || '';
      var imgHtml   = thumb
        ? '<img src="'+thumb+'" class="wh-ep-thumb" data-anime-id="'+nextItem.anime_id+'" data-ep="'+epNum+'" loading="lazy" alt="">'
        : '<div class="cw-placeholder"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>';

      var watchTime  = parseInt(nextItem.watch_time       || 0);
      var duration   = parseInt(nextItem.episode_duration || 0);
      var pct        = duration > 0 ? Math.min(100, Math.round(watchTime / duration * 100)) : 0;
      var secsLeft   = duration > 0 && watchTime > 0 ? Math.max(0, duration - watchTime) : 0;
      var minsLeft   = secsLeft > 60 ? Math.round(secsLeft / 60) : 0;
      var timeLeft   = minsLeft >= 60
        ? Math.floor(minsLeft/60)+'h '+(minsLeft%60)+'m left'
        : (minsLeft > 0 ? minsLeft+'m left' : '');
      var resumeUrl  = watchTime >= 30 ? watchUrl + '&t=' + watchTime : watchUrl;
      var progressHtml = (pct > 0 ? '<div class="cw-progress-bar"><div class="cw-progress-fill" style="--pct:'+pct+'%"></div></div>' : '');
      var timeHtml     = (timeLeft ? '<span class="cw-time-left">'+timeLeft+'</span>' : '');

      var newCard = document.createElement('a');
      newCard.className   = 'cw-card';
      newCard.id          = 'whcard-' + nextItem.anime_id;
      newCard.href        = resumeUrl;
      newCard.style.opacity   = '0';
      newCard.style.transform = 'scale(0.92)';
      newCard.style.transition = 'opacity .25s, transform .25s';
      newCard.innerHTML = '<div class="cw-thumb">'
        + imgHtml
        + '<div class="cw-play"><div class="cw-play-circle"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></div></div>'
        + '<div class="cw-ep-badge">Ep ' + epNum + '</div>'
        + timeHtml
        + progressHtml
        + '<button class="cw-remove" onclick="event.preventDefault();event.stopPropagation();removeFromHistory(' + nextItem.anime_id + ',this)" title="Remove">✕</button>'
        + '</div>'
        + '<div class="cw-info">'
        + '<div class="cw-anime-name">' + animeName.replace(/</g,'&lt;') + '</div>'
        + '<div class="cw-ep-title">E' + epNum + ' – ' + epTitle.replace(/</g,'&lt;') + '</div>'
        + '</div>';

      grid.appendChild(newCard);

      // Trigger AniList thumb refresh for the new card if no thumb
      if (!thumb && nextItem.anime_id) {
        fetch('https://graphql.anilist.co', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            query: 'query ($malId: Int) { Media(idMal: $malId, type: ANIME) { streamingEpisodes { title thumbnail site } } }',
            variables: { malId: parseInt(nextItem.anime_id) }
          })
        }).then(function(r){ return r.json(); }).then(function(data) {
          var eps = data && data.data && data.data.Media && data.data.Media.streamingEpisodes || [];
          var SKIP = ['netflix','amazon','prime','disney','hulu','apple'];
          eps.forEach(function(ep) {
            var m = (ep.title||'').match(/Episode\\s+(\\d+)/i);
            if (!m || !ep.thumbnail) return;
            if (SKIP.some(function(x){ return (ep.site||'').toLowerCase().indexOf(x)!==-1; })) return;
            if (parseInt(m[1]) === parseInt(epNum)) {
              var img = newCard.querySelector('.wh-ep-thumb');
              if (img) img.src = ep.thumbnail;
            }
          });
        }).catch(function(){});
      }

      // Animate in
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          newCard.style.opacity   = '1';
          newCard.style.transform = 'scale(1)';
        });
      });
    }, 230);
  }
  async function clearWatchHistory(btn) {
    if (!confirm('Clear your entire watch history?')) return;
    btn.disabled = true;
    try {
      var res = await fetch('${siteUrl}/api/watch_history.php', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({action:'clear'})
      });
      if ((await res.json()).success) {
        var sec = btn.closest('.content-section');
        if (sec) { sec.style.transition='opacity .25s'; sec.style.opacity='0'; setTimeout(function(){ sec.remove(); },260); }
      }
    } catch(e){ btn.disabled=false; }
  }
  </script>
  `;
}

// Auto-rotating hero carousel: dots + prev/next buttons, pauses on hover.
export function heroSliderScript(slideCount: number): string {
  if (slideCount <= 1) return '';
  return `<script>
  (function(){
    var idx = 0, total = ${slideCount}, timer = null;
    var slides = document.querySelectorAll('#hero-slides .hero-slide');
    var dots = document.querySelectorAll('#hero-dots .hero-dot');
    function show(n) {
      idx = (n + total) % total;
      slides.forEach(function(s, i){ s.classList.toggle('active', i === idx); });
      dots.forEach(function(d, i){ d.classList.toggle('active', i === idx); });
    }
    function next() { show(idx + 1); }
    function prev() { show(idx - 1); }
    function restart() { clearInterval(timer); timer = setInterval(next, 7000); }
    document.getElementById('hero-next').addEventListener('click', function(){ next(); restart(); });
    document.getElementById('hero-prev').addEventListener('click', function(){ prev(); restart(); });
    dots.forEach(function(d){ d.addEventListener('click', function(){ show(parseInt(d.dataset.idx, 10)); restart(); }); });
    var hero = document.getElementById('hero');
    hero.addEventListener('mouseenter', function(){ clearInterval(timer); });
    hero.addEventListener('mouseleave', restart);
    restart();
  })();
  </script>`;
}

// Prev/next arrows for the genre bar and every horizontally-scrolling
// anime row (Continue Watching, Watch Now, Trending, etc).
export function rowNavScript(): string {
  return `<script>
  (function(){
    document.querySelectorAll('[data-target][data-dir]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var row = document.getElementById(btn.dataset.target);
        if (!row) return;
        var amount = Math.max(row.clientWidth * 0.85, 240);
        row.scrollBy({ left: btn.dataset.dir === 'prev' ? -amount : amount, behavior: 'smooth' });
      });
    });
  })();
  </script>`;
}
