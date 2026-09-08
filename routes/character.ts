// Ports pages/character.php. Unlike anime.php, this fetches everything
// server-side (character data, anime appearances, voice actors) since
// Jikan's character endpoints are cheap and there's no lazy-load pattern
// in the original.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { MalAPI } from '../lib/mal-api';
import { Notification } from '../lib/notification';
import { h } from '../lib/helpers';
import { renderHeader, renderFooter, CurrentUser } from '../render/layout';
import { CHARACTER_CSS } from '../render/character-css';
import { getBannerData } from '../lib/settings';

export const characterRoutes = new Hono<{ Bindings: Env }>();

characterRoutes.get('/character', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  const mal = new MalAPI(c.env, c.env.API_CACHE, db);
  const siteUrl = c.env.SITE_URL;

  const charId = parseInt(c.req.query('id') ?? '0', 10) || 0;
  if (!charId) return c.redirect(siteUrl + '/');

  const { character: charData, animeography: charAnimeData, voices: charVoicesData } = await mal.getCharacterFull(charId);
  const picturesData = await mal.getCharacterPictures(charId);

  const char = charData?.data;
  if (!char) {
    return c.html(`<script>window.location.href=${JSON.stringify(siteUrl + '/')};</script>`);
  }

  const name = char.name ?? 'Unknown Character';
  const nameKanji = char.name_kanji ?? null;
  const nicknames: string[] = char.nicknames ?? [];
  const about: string | null = char.about ?? null;
  const note: string | null = char.note ?? null;
  const spoilers: string[] = char.spoilers ?? [];
  const favorites: number = char.favorites ?? 0;
  const imageLarge = char.images?.jpg?.image_url ?? '';

  const animeList = (charAnimeData?.data ?? []).slice(0, 12);
  const voiceList = charVoicesData?.data ?? [];
  const pictureList = (picturesData?.data ?? []).slice(0, 24);

  const currentUser = auth.check() ? await auth.getCurrentUser() : null;
  const unreadCount = currentUser ? await Notification.unreadCount(db, currentUser.id) : 0;
  const layoutUser: CurrentUser | null = currentUser
    ? { id: currentUser.id, username: currentUser.username, avatar_url: currentUser.avatar_url, role: currentUser.role }
    : null;

  const charOgDescription = about
    ? about.replace(/\s+/g, ' ').substring(0, 200)
    : `Character info, appearances & voice actors for ${name} on AniVault.`;

  const __banner = await getBannerData(db);
  let html = renderHeader({
    ...__banner,    siteUrl, siteName: c.env.SITE_NAME, pageTitle: name, currentPage: 'character', currentUser: layoutUser, unreadCount,
    requestUrl: c.req.url,
    ogData: {
      title: name, description: charOgDescription, image: imageLarge || `${siteUrl}/assets/img/site-img/icon.png`,
      image_width: imageLarge ? 400 : 512, image_height: imageLarge ? 600 : 512,
      url: `${siteUrl}/character?id=${charId}`, type: 'profile',
    },
  });

  html += `
<style>${CHARACTER_CSS}</style>

<div class="container section">
  <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:1.5rem;">
    <a href="${siteUrl}/" style="color:var(--text-muted);text-decoration:none;">Home</a>
    <span style="margin:0 6px;">›</span>
    <span style="color:var(--text-secondary);">Character</span>
    <span style="margin:0 6px;">›</span>
    <span style="color:var(--text-primary);">${h(name)}</span>
  </div>

  <div class="char-hero">
    <div class="char-poster-wrap">
      ${imageLarge ? `<img src="${h(imageLarge)}" alt="${h(name)}" class="char-poster" loading="eager">` : `<div class="char-poster-placeholder">👤</div>`}
      <div class="char-glow-ring"></div>
    </div>

    <div class="char-meta">
      <h1 class="char-name">${h(name)}</h1>
      ${nameKanji && nameKanji !== name ? `<div class="char-name-kanji">${h(nameKanji)}</div>` : ''}

      ${nicknames.length > 0 ? `<div class="char-nicknames">${nicknames.map((n) => `<span class="char-nickname-tag">"${h(n)}"</span>`).join('')}</div>` : ''}

      <div class="char-stat-row">
        ${favorites ? `<span class="favorites-badge">♥ ${favorites.toLocaleString('en-US')} <span style="font-weight:400;font-size:0.78rem;color:var(--gold);opacity:0.75;">favorites</span></span>` : ''}
        ${animeList.length > 0 ? `<div class="char-stat-pill"><span class="stat-val">${animeList.length}</span><span class="stat-lbl">anime appearance${animeList.length !== 1 ? 's' : ''}</span></div>` : ''}
        ${voiceList.length > 0 ? `<div class="char-stat-pill"><span class="stat-val">${voiceList.length}</span><span class="stat-lbl">voice actor${voiceList.length !== 1 ? 's' : ''}</span></div>` : ''}
      </div>

      ${about ? `
      <div class="card card-body" style="position:relative;overflow:hidden;padding-bottom:0;">
        <h3 class="mb-1" style="font-size:0.9rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);">About</h3>
        <div class="char-about" id="char-about-text">${h(about)}</div>
        <div class="char-about-fade" id="char-about-fade"></div>
        <button class="btn-read-more" id="char-read-more-btn" onclick="toggleAbout()" style="margin-bottom:0.75rem;">▾ Read more</button>
        ${spoilers.length > 0 ? spoilers.map((s) => `
        <details class="char-spoiler" style="margin:0.5rem 0;">
          <summary style="cursor:pointer;color:var(--text-muted);font-size:0.85rem;">⚠ Click to show spoiler</summary>
          <div style="margin-top:0.5rem;">${h(s)}</div>
        </details>`).join('') : ''}
        ${note ? `<p style="font-size:0.8rem;color:var(--text-muted);font-style:italic;margin:0.5rem 0 0.75rem;">${h(note)}</p>` : ''}
      </div>` : ''}
    </div>
  </div>

  <div class="tabs-container">
    <div class="tabs">
      ${animeList.length > 0 ? `<button class="tab-btn active" data-tab="char-anime">Anime (${animeList.length})</button>` : ''}
      ${voiceList.length > 0 ? `<button class="tab-btn ${animeList.length === 0 ? 'active' : ''}" data-tab="char-voices">Voice Actors (${voiceList.length})</button>` : ''}
      ${pictureList.length > 0 ? `<button class="tab-btn ${animeList.length === 0 && voiceList.length === 0 ? 'active' : ''}" data-tab="char-pictures">Pictures (${pictureList.length})</button>` : ''}
    </div>

    ${animeList.length > 0 ? `
    <div id="tab-char-anime" class="tab-content active">
      <div class="char-anime-grid">
        ${animeList.map((entry: any) => {
          const a = entry.anime ?? {};
          const aid = a.mal_id ?? 0;
          const atitle = a.title ?? 'Unknown';
          const aimg = a.images?.jpg?.image_url ?? '';
          const role = entry.role ?? '';
          const isMain = role.toLowerCase() === 'main';
          return `
        <a href="${siteUrl}/anime?id=${aid}" class="char-anime-item">
          <div class="char-anime-poster">${aimg ? `<img src="${h(aimg)}" alt="${h(atitle)}" loading="lazy">` : ''}</div>
          <div class="char-anime-info">
            <div class="char-anime-title">${h(atitle)}</div>
            <div class="char-anime-role ${isMain ? 'main' : ''}">${h(role)}</div>
          </div>
        </a>`;
        }).join('')}
      </div>
    </div>` : ''}

    ${voiceList.length > 0 ? `
    <div id="tab-char-voices" class="tab-content ${animeList.length === 0 ? 'active' : ''}">
      <div class="va-grid">
        ${voiceList.map((va: any) => {
          const person = va.person ?? {};
          const vaName = person.name ?? 'Unknown';
          const vaImg = person.images?.jpg?.image_url ?? '';
          const vaLang = va.language ?? '';
          const vaUrl = person.url ?? '';
          const avatarHtml = vaImg
            ? `<img src="${h(vaImg)}" alt="${h(vaName)}" class="va-avatar" loading="lazy">`
            : `<div class="va-avatar-placeholder">🎙</div>`;
          const infoHtml = `<div class="va-info"><div class="va-name">${h(vaName)}</div><div class="va-lang">${h(vaLang)}</div></div>`;
          return vaUrl
            ? `<a href="${h(vaUrl)}" target="_blank" rel="noopener" class="va-card" style="text-decoration:none;">${avatarHtml}${infoHtml}</a>`
            : `<div class="va-card">${avatarHtml}${infoHtml}</div>`;
        }).join('')}
      </div>
    </div>` : ''}

    ${pictureList.length > 0 ? `
    <div id="tab-char-pictures" class="tab-content ${animeList.length === 0 && voiceList.length === 0 ? 'active' : ''}">
      <div class="char-anime-grid">
        ${pictureList.map((p: any) => `
        <a href="${h(p.image)}" target="_blank" rel="noopener" class="char-anime-item">
          <div class="char-anime-poster"><img src="${h(p.thumbnail || p.image)}" alt="${h(name)}" loading="lazy"></div>
        </a>`).join('')}
      </div>
    </div>` : ''}

    ${animeList.length === 0 && voiceList.length === 0 && pictureList.length === 0 ? `<p class="text-muted text-center" style="padding:2rem 0;">No additional information available for this character.</p>` : ''}
  </div>
</div>

<script>
function toggleAbout() {
    const el  = document.getElementById('char-about-text');
    const btn = document.getElementById('char-read-more-btn');
    const fade = document.getElementById('char-about-fade');
    if (!el) return;
    const expanded = el.classList.toggle('expanded');
    btn.textContent  = expanded ? '▴ Show less' : '▾ Read more';
    if (fade) fade.style.opacity = expanded ? '0' : '1';
}
(function() {
    const el  = document.getElementById('char-about-text');
    const btn = document.getElementById('char-read-more-btn');
    const fade = document.getElementById('char-about-fade');
    if (!el || !btn) return;
    if (el.scrollHeight <= el.clientHeight + 5) {
        btn.style.display = 'none';
        if (fade) fade.style.display = 'none';
        el.style.maxHeight = 'none';
    }
})();
</script>`;

  html += renderFooter({ siteUrl, currentUser: layoutUser });
  await session.save(c, lifetime);
  return c.html(html);
});
