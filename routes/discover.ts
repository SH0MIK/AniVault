import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { MalAPI, NormalisedAnime } from '../lib/mal-api';
import { Notification } from '../lib/notification';
import { getUserAnimeStatuses } from '../lib/user-list';
import { h, getAnimeTitle, statusBadge } from '../lib/helpers';
import { renderAnimeCard, buildCardMetaMap, AnimeCardMeta, LANG_CODE } from '../lib/anime-card';
import { renderHeader, renderFooter, CurrentUser } from '../render/layout';
import { getBannerData } from '../lib/settings';

export const discoverRoutes = new Hono<{ Bindings: Env }>();

async function commonCtx(c: any) {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  const mal = new MalAPI(c.env, c.env.API_CACHE, db);
  const currentUser = auth.check() ? await auth.getCurrentUser() : null;
  const unreadCount = currentUser ? await Notification.unreadCount(db, currentUser.id) : 0;
  const userStatuses = currentUser ? await getUserAnimeStatuses(db, currentUser.id) : {};
  const layoutUser: CurrentUser | null = currentUser
    ? { id: currentUser.id, username: currentUser.username, avatar_url: currentUser.avatar_url, role: currentUser.role }
    : null;
  return { db, session, lifetime, auth, mal, currentUser, unreadCount, userStatuses, layoutUser };
}

// ── pages/seasonal.php ────────────────────────────────────────────────────
discoverRoutes.get('/seasonal', async (c) => {
  const { db, session, lifetime, mal, unreadCount, userStatuses, layoutUser } = await commonCtx(c);
  const siteUrl = c.env.SITE_URL;
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const season = c.req.query('season') ?? 'now';

  const result = season === 'upcoming' ? await mal.getSeasonUpcoming() : await mal.getSeasonNow(page);
  const items = result.data ?? [];
  const totalPages = (result as any).pagination?.last_visible_page ?? 1;
  const cardMeta = await buildCardMetaMap(db, items);

  const __banner = await getBannerData(db);
  let html = renderHeader({ ...__banner, siteUrl, siteName: c.env.SITE_NAME, pageTitle: 'Seasonal Anime', currentPage: 'seasonal', currentUser: layoutUser, unreadCount, requestUrl: c.req.url });
  const seasonYear = new Date().getUTCFullYear();
  const seasonLabel = mal.currentSeasonPublic().replace(/^./, (c) => c.toUpperCase());
  html += `
<div class="container section">
  <div class="flex-between mb-3" style="flex-wrap:wrap;gap:1rem;">
    <div>
      <h1>🌸 Seasonal Anime</h1>
      <p class="text-muted" style="font-size:.85rem;margin-top:2px;">${season === 'upcoming' ? 'Next season' : `${seasonLabel} ${seasonYear}`}</p>
    </div>
    <div class="flex gap-1">
      <a href="/seasonal?season=now" class="filter-pill ${season !== 'upcoming' ? 'active' : ''}">Airing Now</a>
      <a href="/seasonal?season=upcoming" class="filter-pill ${season === 'upcoming' ? 'active' : ''}">Upcoming</a>
    </div>
  </div>
  ${items.length === 0 ? `<p class="text-muted text-center">API may be rate-limited. Please wait a moment and refresh.</p>` : `
  <div class="anime-grid">${items.map((a) => renderAnimeCard(a, siteUrl, userStatuses[a.mal_id] ?? null, cardMeta.get(a.mal_id))).join('')}</div>
  ${totalPages > 1 ? `<div class="pagination">${Array.from({ length: totalPages }, (_, i) => i + 1).map((i) => `<a href="/seasonal?season=${season}&page=${i}" class="${i === page ? 'current' : ''}">${i}</a>`).join('')}</div>` : ''}`}
</div>`;

  html += renderFooter({ siteUrl, currentUser: layoutUser });
  await session.save(c, lifetime);
  return c.html(html);
});

// ── pages/top.php ─────────────────────────────────────────────────────────
const TOP_FILTERS: Record<string, string> = {
  bypopularity: 'Most Popular', favorite: 'Most Favorited', airing: 'Top Airing', upcoming: 'Upcoming', byrank: 'By Score',
};

discoverRoutes.get('/top', async (c) => {
  const { db, session, lifetime, mal, unreadCount, userStatuses, layoutUser } = await commonCtx(c);
  const siteUrl = c.env.SITE_URL;
  const filter = c.req.query('filter') ?? 'bypopularity';
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);

  const result = await mal.getTopAnime(filter, page);
  const items = result.data ?? [];
  const totalPages = result.pagination?.last_visible_page ?? 1;
  const cardMeta = await buildCardMetaMap(db, items);

  const __banner = await getBannerData(db);
  let html = renderHeader({ ...__banner, siteUrl, siteName: c.env.SITE_NAME, pageTitle: 'Top Anime', currentPage: 'top', currentUser: layoutUser, unreadCount, requestUrl: c.req.url });
  html += `
<style>
.table-responsive{overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%;border-radius:8px;}
.data-table{width:100%;min-width:850px;border-collapse:collapse;}
.pagination{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:0.5rem;margin-top:2rem;margin-bottom:2rem;}
.pagination a{padding:8px 14px;border-radius:6px;background:rgba(255,255,255,0.05);color:var(--text-main);text-decoration:none;transition:0.2s;}
.pagination a:hover{background:rgba(255,255,255,0.1);}
.pagination a.current{background:var(--primary-color,#6c5ce7);color:white;font-weight:bold;}
.pager-gap{color:#666;padding:0 4px;}
</style>

<div class="container section">
  <div class="flex-between mb-3" style="flex-wrap:wrap;gap:1rem;">
    <h1>🏆 Top Anime</h1>
    <div class="flex gap-1 flex-wrap">
      ${Object.entries(TOP_FILTERS).map(([k, v]) => `<a href="/top?filter=${k}" class="filter-pill ${filter === k ? 'active' : ''}">${v}</a>`).join('')}
    </div>
  </div>

  <div class="card" style="margin-bottom:1.5rem; padding:0; overflow: hidden;">
    <div class="table-responsive">
      <div class="data-table-wrap"><div class="data-table-wrap"><table class="data-table">
        <thead><tr><th>Rank</th><th>Anime</th><th>Type</th><th>Eps</th><th>Score</th><th>Members</th><th></th></tr></thead>
        <tbody>
          ${items.map((a, i) => renderTopRow(a, i, page, siteUrl, userStatuses[a.mal_id] ?? null, cardMeta.get(a.mal_id))).join('')}
        </tbody>
      </table></div></div>
    </div>
  </div>

  ${totalPages > 1 ? renderTopPagination(filter, page, totalPages) : ''}
</div>`;

  html += renderFooter({ siteUrl, currentUser: layoutUser });
  await session.save(c, lifetime);
  return c.html(html);
});

function renderTopRow(a: NormalisedAnime, i: number, page: number, siteUrl: string, userStatus: string | null, meta?: AnimeCardMeta): string {
  const displayTitle = getAnimeTitle(a);
  const safeTitle = h(displayTitle);
  const safeImg = h(a.images?.jpg?.image_url ?? '');
  const animeId = a.mal_id;
  const airedInfo = meta?.airedInfo;
  const epsDisplay = airedInfo && airedInfo.aired > 0
    ? (airedInfo.total && airedInfo.total !== airedInfo.aired ? `${airedInfo.aired}/${airedInfo.total}` : `${airedInfo.aired}`)
    : (a.episodes || '—');
  const dubbed = meta?.dubbedLangs ?? [];
  const dubCodes = dubbed.map((l) => LANG_CODE[l] ?? l.slice(0, 2).toUpperCase());
  const dubBadge = dubCodes.length
    ? ` <span title="Dubbed: ${h(dubbed.join(', '))}" style="font-size:.65rem;font-weight:700;color:var(--teal,#2dd4bf);letter-spacing:.02em;">🎙️ ${h(dubCodes.length > 3 ? dubCodes.slice(0, 3).join(' ') + ' +' + (dubCodes.length - 3) : dubCodes.join(' '))}</span>`
    : '';
  return `
<tr onclick="window.location.href='/anime?id=${animeId}'" style="cursor:pointer;">
  <td><strong style="color:var(--gold); font-family:var(--font-display);">#${(page - 1) * 25 + i + 1}</strong></td>
  <td><div class="flex" style="gap:12px; align-items:center;"><img src="${safeImg}" alt="" style="width:36px; height:50px; object-fit:cover; border-radius:4px;"><span style="font-weight:500;">${safeTitle}</span>${dubBadge}</div></td>
  <td>${h(a.type || '—')}</td>
  <td>${epsDisplay}</td>
  <td style="color:var(--gold); font-weight:600;">${a.score ? a.score.toFixed(2) : 'N/A'}</td>
  <td>${a.members ? a.members.toLocaleString('en-US') : '—'}</td>
  <td class="schedule-action" data-anime-id="${animeId}" onclick="event.stopPropagation()">
    ${userStatus
      ? `<span onclick="addToList(${animeId}, '${safeTitle}', '${safeImg}', ${a.episodes || 0})" style="cursor:pointer;">${statusBadge(userStatus)}</span>`
      : `<button class="btn btn-ghost btn-sm" onclick="addToList(${animeId}, '${safeTitle}', '${safeImg}', ${a.episodes || 0})">+ List</button>`}
  </td>
</tr>`;
}

export function renderTopPagination(filter: string, page: number, totalPages: number): string {
  const range = 2;
  const start = Math.max(1, page - range);
  const end = Math.min(totalPages, page + range);
  let out = '<div class="pagination">';
  if (page > 1) out += `<a href="/top?filter=${filter}&page=${page - 1}">‹ Prev</a>`;
  if (start > 1) {
    out += `<a href="/top?filter=${filter}&page=1">1</a>`;
    if (start > 2) out += `<span class="pager-gap">...</span>`;
  }
  for (let i = start; i <= end; i++) {
    out += `<a href="/top?filter=${filter}&page=${i}" class="${i === page ? 'current' : ''}">${i}</a>`;
  }
  if (end < totalPages) {
    if (end < totalPages - 1) out += `<span class="pager-gap">...</span>`;
    out += `<a href="/top?filter=${filter}&page=${totalPages}">${totalPages}</a>`;
  }
  if (page < totalPages) out += `<a href="/top?filter=${filter}&page=${page + 1}">Next ›</a>`;
  out += '</div>';
  return out;
}

// ── pages/schedule.php ────────────────────────────────────────────────────
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

discoverRoutes.get('/schedule', async (c) => {
  const { db, session, lifetime, mal, unreadCount, userStatuses, layoutUser } = await commonCtx(c);
  const siteUrl = c.env.SITE_URL;

  const todayIdx = new Date().getUTCDay(); // 0=Sun
  const today = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][todayIdx];
  let day = c.req.query('day') ?? today;
  if (!DAYS.includes(day)) day = today;

  const result = await mal.getSchedule(day);
  const items = result.data ?? [];
  const cardMeta = await buildCardMetaMap(db, items);

  const __banner = await getBannerData(db);
  let html = renderHeader({ ...__banner, siteUrl, siteName: c.env.SITE_NAME, pageTitle: 'Schedule', currentPage: 'schedule', currentUser: layoutUser, unreadCount, requestUrl: c.req.url });
  const now = new Date();
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

  html += `
<style>
.schedule-list{display:flex;flex-direction:column;gap:1px;}
.schedule-row{display:grid;grid-template-columns:56px 70px 1fr auto auto auto;align-items:center;gap:1rem;padding:12px 16px;background:var(--card-bg);border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.15s;}
.schedule-row:first-child{border-radius:10px 10px 0 0;}
.schedule-row:last-child{border-radius:0 0 10px 10px;border-bottom:none;}
.schedule-row:hover{background:var(--card-hover, rgba(255,255,255,0.04));}
.schedule-thumb{width:56px;height:78px;object-fit:cover;border-radius:6px;flex-shrink:0;}
.schedule-thumb-placeholder{width:56px;height:78px;border-radius:6px;background:var(--border);flex-shrink:0;}
.schedule-time{font-size:0.95rem;font-weight:700;color:var(--accent, #6c5ce7);white-space:nowrap;text-align:center;}
.schedule-time small{display:block;font-size:0.7rem;font-weight:400;color:var(--text-muted);margin-top:2px;}
.schedule-info{min-width:0;}
.schedule-title{font-weight:600;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px;}
.schedule-meta{display:flex;flex-wrap:wrap;gap:6px;font-size:0.78rem;color:var(--text-muted);align-items:center;}
.schedule-meta .dot{color:var(--border);}
.schedule-score{color:var(--gold);font-weight:600;font-size:0.85rem;white-space:nowrap;}
.schedule-eps{white-space:nowrap;font-size:0.85rem;color:var(--text-secondary);}
.schedule-action{white-space:nowrap;}
.day-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:1.5rem;}
.day-tab{padding:7px 16px;border-radius:20px;font-size:0.85rem;font-weight:500;text-decoration:none;border:1px solid var(--border);color:var(--text-secondary);transition:0.15s;text-transform:capitalize;}
.day-tab:hover{border-color:var(--accent);color:var(--accent);}
.day-tab.active{background:var(--accent);border-color:var(--accent);color:#fff;}
.day-tab.today-tab{position:relative;}
.today-dot{display:inline-block;width:6px;height:6px;background:var(--gold);border-radius:50%;margin-left:5px;vertical-align:middle;}
.sched-now-divider{display:flex;align-items:center;gap:10px;padding:8px 16px;background:rgba(124,58,237,0.04);}
.sched-now-divider::before,.sched-now-divider::after{content:'';flex:1;height:1px;background:var(--accent);opacity:.45;}
.sched-now-divider span{font-size:.66rem;font-weight:800;letter-spacing:.1em;color:var(--accent);white-space:nowrap;}
.schedule-row.sched-aired{opacity:.5;}
.schedule-row.sched-aired:hover{opacity:.8;}
.schedule-row.sched-next-up{background:rgba(124,58,237,.07);box-shadow:inset 3px 0 0 var(--accent);}
.sched-countdown{display:block;font-size:.65rem;color:var(--accent);font-weight:700;margin-top:3px;white-space:nowrap;}
.sched-countdown.sched-elapsed{color:var(--text-muted);font-weight:600;}
@media(max-width:640px){.schedule-row{grid-template-columns:44px 60px 1fr auto;gap:10px;}.schedule-score,.schedule-eps{display:none;}.schedule-thumb{width:44px;height:62px;}.schedule-thumb-placeholder{width:44px;height:62px;}}
</style>

<div class="container section">
  <div class="flex-between mb-3" style="flex-wrap:wrap;gap:1rem;">
    <h1>📺 Airing Schedule</h1>
    <span style="font-size:0.85rem;color:var(--text-muted);">${dateLabel} · ${cap(mal.currentSeasonPublic())} Season</span>
  </div>

  <div class="day-tabs">
    ${DAYS.map((d) => `<a href="/schedule?day=${d}" class="day-tab ${d === day ? 'active' : ''} ${d === today ? 'today-tab' : ''}">${cap(d)}${d === today ? '<span class="today-dot"></span>' : ''}</a>`).join('')}
  </div>

  ${items.length === 0 ? `
  <div class="card card-body text-center" style="padding:3rem;">
    <div style="font-size:2.5rem;margin-bottom:1rem;">📭</div>
    <p class="text-muted">No anime airing on ${cap(day)} this season.</p>
    <p class="text-muted" style="font-size:0.85rem;margin-top:0.5rem;">Try another day or check back later.</p>
  </div>` : `
  <div class="card" style="overflow:hidden;padding:0;">
    <div class="schedule-list">
      ${items.map((a) => renderScheduleRow(a, day, userStatuses[a.mal_id] ?? null, cardMeta.get(a.mal_id))).join('')}
    </div>
  </div>
  <p class="text-muted" style="font-size:0.78rem;margin-top:0.75rem;text-align:right;">${items.length} anime airing ${cap(day)} · Times in <span id='tz-label'>JST</span></p>`}
</div>

<script>
(function() {
  const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  function getLocalDay() { return days[new Date().getDay()]; }
  function msUntilMidnight() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    return next - now;
  }
  function applyNewDay(newDay, oldDay) {
    document.querySelectorAll('.day-tab').forEach(tab => {
      const href = tab.getAttribute('href') || '';
      const tabDay = href.replace(/.*day=/, '');
      tab.classList.remove('today-tab');
      const dot = tab.querySelector('.today-dot');
      if (dot) dot.remove();
      if (tabDay === newDay) {
        tab.classList.add('today-tab');
        const dotEl = document.createElement('span');
        dotEl.className = 'today-dot';
        tab.appendChild(dotEl);
      }
    });
    const dateEl = document.querySelector('.flex-between span[style*="text-muted"]');
    if (dateEl) {
      const now = new Date();
      const label = now.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
      const parts = dateEl.textContent.split('·');
      dateEl.textContent = label + (parts.length > 1 ? ' ·' + parts.slice(1).join('·') : '');
    }
    const params = new URLSearchParams(window.location.search);
    const urlDay = params.get('day');
    if (!urlDay || urlDay === oldDay) {
      params.set('day', newDay);
      window.location.search = params.toString();
    }
  }
  function scheduleMidnight() {
    const ms = msUntilMidnight();
    const oldDay = getLocalDay();
    setTimeout(() => { applyNewDay(getLocalDay(), oldDay); scheduleMidnight(); }, ms);
  }
  scheduleMidnight();
})();
(function() {
  const items = document.querySelectorAll('.local-time[data-jst]');
  if (!items.length) return;
  const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzLabel = document.getElementById('tz-label');
  try {
    const shortTz = new Intl.DateTimeFormat('en', {timeZoneName:'short', timeZone:userTz}).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || userTz;
    if (tzLabel) tzLabel.textContent = shortTz;
    items.forEach(el => {
      const iso = el.getAttribute('data-jst');
      if (!iso) return;
      const date = new Date(iso);
      if (isNaN(date)) return;
      const local = new Intl.DateTimeFormat('en', { hour:'numeric', minute:'2-digit', hour12:true, timeZone:userTz }).format(date);
      el.textContent = local;
      const tzEl = el.nextElementSibling;
      if (tzEl && tzEl.classList.contains('local-tz')) tzEl.textContent = shortTz;
    });
  } catch(e) {}
})();
(function() {
  // Rows are already sorted by broadcast time server-side, and each
  // carries the exact broadcast instant in data-jst — so a straight
  // chronological walk tells us what's already aired vs what's next,
  // regardless of the viewer's timezone or which day is being browsed.
  const rows = Array.from(document.querySelectorAll('.schedule-row'));
  if (!rows.length) return;
  const now = new Date();
  let dividerPlaced = false;
  let nextUpRow = null;

  function formatCountdown(ms) {
    const mins = Math.max(0, Math.round(ms / 60000));
    if (mins < 60) return 'in ' + mins + 'm';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return 'in ' + hrs + 'h ' + (mins % 60) + 'm';
    return 'in ' + Math.floor(hrs / 24) + 'd ' + (hrs % 24) + 'h';
  }
  function formatElapsed(ms) {
    const mins = Math.max(0, Math.round(ms / 60000));
    if (mins < 60) return 'Aired ' + mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return 'Aired ' + hrs + 'h ' + (mins % 60) + 'm ago';
    return 'Aired ' + Math.floor(hrs / 24) + 'd ' + (hrs % 24) + 'h ago';
  }

  rows.forEach(row => {
    const timeEl = row.querySelector('.local-time[data-jst]');
    if (!timeEl) return;
    const iso = timeEl.getAttribute('data-jst');
    if (!iso) return;
    const airDate = new Date(iso);
    if (isNaN(airDate)) return;

    // Every row gets a status label — aired X ago, or upcoming in X —
    // so it's never ambiguous why a row is faded or highlighted.
    const badge = document.createElement('small');
    badge.className = 'sched-countdown';

    if (airDate < now) {
      row.classList.add('sched-aired');
      badge.classList.add('sched-elapsed');
      badge.textContent = formatElapsed(now - airDate);
      timeEl.closest('.schedule-time')?.appendChild(badge);
      return;
    }

    badge.textContent = formatCountdown(airDate - now);
    timeEl.closest('.schedule-time')?.appendChild(badge);

    if (!dividerPlaced) {
      const divider = document.createElement('div');
      divider.className = 'sched-now-divider';
      divider.innerHTML = '<span>NOW</span>';
      row.parentNode.insertBefore(divider, row);
      row.classList.add('sched-next-up');
      dividerPlaced = true;
      nextUpRow = row;
    }
  });

  // Jump straight to what's next instead of making people scroll past
  // everything that's already aired today.
  if (nextUpRow) {
    requestAnimationFrame(() => {
      const headerOffset = 90; // clears the sticky site header + day-tabs
      const y = nextUpRow.getBoundingClientRect().top + window.scrollY - headerOffset;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    });
  }
})();
</script>`;

  html += renderFooter({ siteUrl, currentUser: layoutUser });
  await session.save(c, lifetime);
  return c.html(html);
});

/** Ports the currentEpisode() helper from schedule.php: estimates the
 * currently-airing episode number from air-start-date + weeks elapsed,
 * using JST (matches MAL broadcast convention). */
export function currentEpisode(startDate: string, broadcastDay: string, totalEps: number): number | null {
  try {
    const start = new Date(startDate + 'T00:00:00+09:00');
    const nowJst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    if (nowJst < start) return null;
    const diffDays = Math.floor((nowJst.getTime() - start.getTime()) / 86400000);
    const weeks = Math.floor(diffDays / 7);
    const dayNums: Record<string, number> = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };
    const broadcastNum = dayNums[broadcastDay.toLowerCase()] ?? 0;
    const todayNum = nowJst.getDay() === 0 ? 7 : nowJst.getDay();
    let ep = weeks + (todayNum >= broadcastNum ? 1 : 0);
    if (totalEps > 0) ep = Math.min(ep, totalEps);
    return Math.max(1, ep);
  } catch {
    return null;
  }
}

function renderScheduleRow(a: NormalisedAnime, day: string, userStatus: string | null, meta?: AnimeCardMeta): string {
  const aid = a.mal_id ?? 0;
  const title = getAnimeTitle(a);
  const img = a.images?.jpg?.image_url ?? '';
  const score = a.score;
  const eps = a.episodes ?? 0;
  const type = a.type ?? '';
  const duration = a.duration_mins;
  const genres = (a.genres ?? []).slice(0, 2);
  const studios = a.studios ?? [];
  const btime = a.broadcast?.time ?? null;
  const jTitle = h(title);
  const jImg = h(img);

  let timeDisplay = '—';
  if (btime) {
    const [hh, mm] = btime.split(':').map(Number);
    if (!Number.isNaN(hh)) {
      const d = new Date(Date.UTC(2000, 0, 1, hh, mm ?? 0));
      timeDisplay = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' });
    } else {
      timeDisplay = btime;
    }
  }

  // This broadcast's actual instant in JST, as ISO — used both for the
  // client-side tz conversion AND (as of the NOW-divider feature) for
  // deciding whether it's already aired.
  //
  // JST runs far enough ahead (UTC+9) that "today" in JST can already be
  // tomorrow for viewers west of it — e.g. 10:48 PM in GMT+6 is already
  // 1:48 AM the next day in Tokyo. So "the next occurrence going forward"
  // is the wrong question once that's happened: JST's Sunday slot may
  // have technically just ended, and jumping forward lands 6 days away
  // instead of recognizing it aired a few hours ago. Instead, compute
  // both the forward and the week-earlier occurrence and take whichever
  // is actually closest to right now — that's the one a viewer means.
  let jstIso = '';
  if (btime) {
    const dayIdx: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    const targetDay = dayIdx[day] ?? 1;
    const now = new Date();
    const nowJstDay = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })).getDay();
    const daysAhead = (targetDay - nowJstDay + 7) % 7;
    const [hh, mm] = btime.split(':').map(Number);

    const forward = new Date();
    forward.setUTCDate(forward.getUTCDate() + daysAhead);
    forward.setUTCHours((hh ?? 0) - 9, mm ?? 0, 0, 0); // JST is UTC+9

    const backward = new Date(forward);
    backward.setUTCDate(backward.getUTCDate() - 7);

    const nowMs = now.getTime();
    const closest = Math.abs(forward.getTime() - nowMs) <= Math.abs(backward.getTime() - nowMs) ? forward : backward;
    jstIso = closest.toISOString();
  }

  const startDate = a.start_date;
  const bday = a.broadcast?.day ?? day;
  const currentEp = startDate ? currentEpisode(startDate, bday, eps) : null;

  // Jikan's actual per-episode air-date count (cached, see episode-air.ts)
  // is more reliable than the start-date/cadence guess above once we have
  // it — MAL/the cadence math can drift for shows with breaks or delays.
  const airedInfo = meta?.airedInfo;
  const epNum = airedInfo && airedInfo.aired > 0 ? airedInfo.aired : currentEp;
  const epTotal = airedInfo?.total ?? eps;

  const dubbed = meta?.dubbedLangs ?? [];
  const dubCodes = dubbed.map((l) => LANG_CODE[l] ?? l.slice(0, 2).toUpperCase());
  const dubBadge = dubCodes.length
    ? `<span class="dot">·</span><span title="Dubbed: ${h(dubbed.join(', '))}" style="color:var(--teal,#2dd4bf);font-weight:700;">🎙️ ${h(dubCodes.length > 3 ? dubCodes.slice(0, 3).join(' ') + ' +' + (dubCodes.length - 3) : dubCodes.join(' '))}</span>`
    : '';

  return `
<div class="schedule-row" onclick="window.location.href='/anime?id=${aid}'">
  ${img ? `<img src="${h(img)}" alt="" class="schedule-thumb" loading="lazy">` : `<div class="schedule-thumb-placeholder"></div>`}
  <div class="schedule-time">
    <span class="local-time" data-jst="${h(jstIso)}">${h(timeDisplay)}</span>
    <small class="local-tz">JST</small>
  </div>
  <div class="schedule-info">
    <div class="schedule-title" title="${h(title)}">${h(title)}</div>
    <div class="schedule-meta">
      ${type ? `<span>${h(type)}</span>` : ''}
      ${duration ? `<span class="dot">·</span><span>${duration} min</span>` : ''}
      ${genres.map((g) => `<span class="dot">·</span><span>${h(g.name)}</span>`).join('')}
      ${studios[0] ? `<span class="dot">·</span><span style="color:var(--accent);">${h(studios[0].name)}</span>` : ''}
      ${dubBadge}
    </div>
  </div>
  <div class="schedule-score">${score ? '⭐ ' + score.toFixed(2) : '—'}</div>
  <div class="schedule-eps">
    ${epNum ? `<span style="color:var(--accent);font-weight:600;">EP ${epNum}</span><span style="color:var(--text-muted);font-size:0.75rem;">/${epTotal || '?'}</span>` : `<span style="color:var(--text-muted);">Soon</span>`}
  </div>
  <div class="schedule-action" data-anime-id="${aid}" onclick="event.stopPropagation()">
    ${userStatus
      ? `<span onclick="addToList(${aid}, '${jTitle}', '${jImg}', ${eps})" style="cursor:pointer;">${statusBadge(userStatus)}</span>`
      : `<button class="btn btn-ghost btn-sm" onclick="addToList(${aid}, '${jTitle}', '${jImg}', ${eps})">+ List</button>`}
  </div>
</div>`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
