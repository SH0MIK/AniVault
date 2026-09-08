export function continueWatchingScript(siteUrl: string): string {
  return `<script>
  var __cwSiteUrl = '${siteUrl}';

  // Episode thumbnails on this page are server-rendered: an admin-saved
  // override (episode_overrides.image_url) wins if one exists, otherwise
  // the server fetches it live from our own scraper API. No client-side
  // fetching of any kind happens here. If an episode has no saved override,
  // its card just shows the placeholder icon.

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
      var thumb     = nextItem.anime_image || '';
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

      // Pick up an admin-saved thumbnail override for this episode, if any
      // (this card was built client-side so it didn't go through the
      // server-side render that normally injects it).
      if (nextItem.anime_id) {
        fetch(__cwSiteUrl + '/api/episode_override.php?anime_id=' + nextItem.anime_id + '&ep=' + epNum)
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(od) {
            var url = od && od.override && od.override.image_url;
            if (!url) return;
            var img = newCard.querySelector('.wh-ep-thumb');
            if (img) { img.src = url; return; }
            var thumbWrap = newCard.querySelector('.cw-thumb');
            if (!thumbWrap) return;
            var newImg = document.createElement('img');
            newImg.src = url; newImg.className = 'wh-ep-thumb'; newImg.loading = 'lazy'; newImg.alt = '';
            thumbWrap.insertBefore(newImg, thumbWrap.firstChild);
            var ph = thumbWrap.querySelector('.cw-placeholder');
            if (ph) ph.style.display = 'none';
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
