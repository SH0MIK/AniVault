export function continueWatchingScript(siteUrl: string): string {
  return `<script>
  (function(){
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

    // ── Episode thumbnails: AniVault's own API, single source of truth ──────
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
      try {
        var res = await fetch('${siteUrl}/api/episode_thumb.php?malId=' + aid);
        var data = await res.json();
        var map  = data && data.episodes || {};
        imgs.forEach(function(img){
          var epNum = img.dataset.ep;
          if (map[epNum]) applyThumb(img, map[epNum], '');
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

      // Trigger a thumb refresh for the new card if no thumb, from our own API
      if (!thumb && nextItem.anime_id) {
        fetch(__cwSiteUrl + '/api/episode_thumb.php?malId=' + nextItem.anime_id + '&ep=' + epNum)
          .then(function(r){ return r.json(); })
          .then(function(data) {
            if (data && data.thumbnail) {
              var img = newCard.querySelector('.wh-ep-thumb');
              if (img) img.src = data.thumbnail;
            }
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
