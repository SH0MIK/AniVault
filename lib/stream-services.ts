// Ports the $serviceDefs map and streamWatchOn()/matchService() functions
// from pages/anime.php. Logo files (assets/img/streaming/*.png) need to be
// copied into public/assets/img/streaming/ — same as the other image assets
// that weren't part of the code upload.
import { h } from './helpers';

export interface ServiceDef {
  label: string;
  logo: string;
  regional?: boolean;
  region_label?: string;
}

export const SERVICE_DEFS: Record<string, ServiceDef> = {
  crunchyroll: { label: 'Crunchyroll', logo: 'crunchyroll.png' },
  netflix: { label: 'Netflix', logo: 'netflix.png' },
  funimation: { label: 'Funimation', logo: 'funimation.png' },
  hidive: { label: 'HIDIVE', logo: 'hidive.png' },
  hulu: { label: 'Hulu', logo: 'hulu.png' },
  amazon: { label: 'Prime Video', logo: 'amazon-prime-video.png' },
  prime: { label: 'Prime Video', logo: 'amazon-prime-video.png' },
  disney: { label: 'Disney+', logo: 'disney-plus.png' },
  apple: { label: 'Apple TV+', logo: 'apple-tv.png' },
  tubi: { label: 'Tubi TV', logo: 'tubi-tv.png' },
  youtube: { label: 'YouTube', logo: 'youtube.png' },
  vrv: { label: 'VRV', logo: 'vrv.png' },
  peacock: { label: 'Peacock', logo: 'peacock.png' },
  max: { label: 'Max', logo: 'max.png' },
  plex: { label: 'Plex', logo: 'plex.png' },
  retrocrush: { label: 'RetroCrush', logo: 'retrocrush.png' },
  bilibili: { label: 'Bilibili', logo: 'bilibili.png', regional: true, region_label: 'China only' },
  iqiyi: { label: 'iQIYI', logo: 'iqiyi.png', regional: true, region_label: 'China & select Asia only' },
  youku: { label: 'Youku', logo: 'youku.png', regional: true, region_label: 'China only' },
  tencent: { label: 'Tencent Video', logo: 'tencent-video.png', regional: true, region_label: 'China only' },
  abema: { label: 'Abema', logo: 'abema.png', regional: true, region_label: 'Japan only' },
  niconico: { label: 'Niconico', logo: 'niconico.png', regional: true, region_label: 'Japan only' },
  'd anime': { label: 'd Anime Store', logo: 'd-anime-store.png', regional: true, region_label: 'Japan only' },
  lemino: { label: 'Lemino', logo: 'lemino.png', regional: true, region_label: 'Japan only' },
  'u-next': { label: 'U-NEXT', logo: 'u-next.png', regional: true, region_label: 'Japan only' },
  unext: { label: 'U-NEXT', logo: 'u-next.png', regional: true, region_label: 'Japan only' },
  laftel: { label: 'Laftel', logo: 'laftel.png', regional: true, region_label: 'South Korea only' },
  aniplus: { label: 'Aniplus', logo: 'aniplus.png', regional: true, region_label: 'Southeast Asia only' },
  viu: { label: 'Viu', logo: 'viu.png', regional: true, region_label: 'Asia & Middle East only' },
  mewatch: { label: 'meWATCH', logo: 'mewatch.png', regional: true, region_label: 'Singapore only' },
  shahid: { label: 'Shahid', logo: 'shahid.png', regional: true, region_label: 'Middle East & North Africa only' },
  wakanim: { label: 'Wakanim', logo: 'wakanim.png', regional: true, region_label: 'Europe only' },
  'anime digital network': { label: 'ADN', logo: 'adn.png', regional: true, region_label: 'France & Belgium only' },
  adn: { label: 'ADN', logo: 'adn.png', regional: true, region_label: 'France & Belgium only' },
  'anime on demand': { label: 'Anime on Demand', logo: 'anime-on-demand.png', regional: true, region_label: 'Germany & Austria only' },
};

function matchService(name: string, url: string): ServiceDef {
  const lower = (name + ' ' + url).toLowerCase();
  for (const [key, info] of Object.entries(SERVICE_DEFS)) {
    if (lower.includes(key)) return info;
  }
  return { label: name, logo: '' };
}

export function streamWatchOn(links: { name?: string; url?: string }[], animeId: number, siteUrl: string): string {
  const limit = 3;
  let out = '<p style="font-size:0.7rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;">Watch on</p>';
  out += `<div style="display:flex;flex-direction:column;gap:7px;" id="stream-list-${animeId}">`;

  links.forEach((s, i) => {
    const sName = s.name ?? '';
    const sUrl = s.url ?? '#';
    const si = matchService(sName, sUrl);
    const logoPath = `${siteUrl}/assets/img/streaming/${si.logo ?? ''}`;
    const hasLogo = !!si.logo;
    const hidden = i >= limit ? ' stream-hidden' : '';
    out += `<div class="stream-item${hidden}" data-stream-id="${animeId}">`;
    out += `<a href="${h(sUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;text-decoration:none;color:var(--text-main);font-size:0.85rem;font-weight:500;transition:opacity .15s;" onmouseover="this.style.opacity='.7'" onmouseout="this.style.opacity='1'">`;
    out += hasLogo
      ? `<img src="${h(logoPath)}" alt="${h(si.label)}" style="width:22px;height:22px;object-fit:contain;border-radius:4px;flex-shrink:0;">`
      : `<span style="width:22px;height:22px;border-radius:4px;background:rgba(255,255,255,0.08);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:var(--text-muted);">?</span>`;
    out += h(si.label) + '</a>';
    if (si.regional) {
      out += `<span class="stream-region-tip" style="margin-left:3px;"><span style="color:#e53e3e;font-size:0.75rem;font-weight:700;line-height:1;">*</span><span class="stream-tooltip">${h(si.region_label ?? '')}</span></span>`;
    }
    out += '</div>';
  });
  out += '</div>';

  const total = links.length;
  if (total > limit) {
    const extra = total - limit;
    out += `<button onclick="toggleStreamList(${animeId},this)" style="margin-top:8px;background:none;border:none;padding:0;font-size:0.75rem;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;gap:4px;" onmouseover="this.style.color='var(--text-main)'" onmouseout="this.style.color='var(--text-muted)'">`;
    out += `<span class="stream-toggle-label">+ ${extra} more</span><span style="font-size:0.65rem;">▼</span></button>`;
    out += `<script>if(!window._streamToggleDefined){window._streamToggleDefined=true;function toggleStreamList(id,btn){const items=document.querySelectorAll(\`.stream-item[data-stream-id="\${id}"]\`);const label=btn.querySelector('.stream-toggle-label');const arrow=btn.querySelector('span:last-child');const hidden=[...items].some(el=>el.classList.contains('stream-hidden'));items.forEach((el,i)=>{if(i>=3)el.classList.toggle('stream-hidden',!hidden)});const ex=${extra};label.textContent=hidden?'Show less':\`+ \${ex} more\`;arrow.textContent=hidden?'▲':'▼';}}</script>`;
  }
  return out;
}
