import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { getHoshikaAnimeById, searchHoshikaAnime } from '../../lib/hoshika-api';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';
import { renderVdoHideAdmin } from '../../render/admin-vdohide';
import { resolveVdoHide } from '../../lib/vdohide-resolver';
import { vdoProxyUrl, extractVdoId, getCdnStreamUrl } from '../api-vdohide';

export const adminVdoHideServerRoutes = new Hono<{ Bindings: Env }>();

export function convertSrtToVtt(content: string): string {
  let text = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }
  if (text.startsWith('WEBVTT')) {
    return text;
  }
  text = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  text = text.replace(/(^|\n)(\d{2}:\d{2}),(\d{3})/g, '$100:$2.$3');
  text = text.replace(/( --> )(\d{2}:\d{2}),(\d{3})/g, '$100:$2.$3');
  return 'WEBVTT\n\n' + text;
}

function validVdoUrl(value: string): boolean {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    return u.protocol === 'https:' && (
      host === 'vdohide.com' || host.endsWith('.vdohide.com') ||
      host === 'fembed.co' || host.endsWith('.fembed.co') ||
      host === 'vidhidepro.com' || host.endsWith('.vidhidepro.com') ||
      host === 'vidhide.com' || host.endsWith('.vidhide.com')
    );
  } catch { return false; }
}
function normalizeVdoUrl(value: string): string {
  try {
    const u = new URL(value.trim());
    const host = u.hostname.toLowerCase();
    const validRoots = ['vdohide.com', 'fembed.co', 'vidhidepro.com', 'vidhide.com'];
    if (u.protocol !== 'https:' || !validRoots.some(root => host === root || host.endsWith('.' + root))) return value.trim();
    return u.toString().replace(/\/$/, '');
  } catch { return value.trim(); }
}
function trackGroup(track: { label?: string; lang?: string; default?: boolean }): 'sub'|'dub'|'hindi'|'multi' {
  const label = String(track.label || '').trim().toLowerCase();
  const lang = String(track.lang || '').trim().toLowerCase();
  const text = (label + ' ' + lang).trim();
  if (lang === 'hi' || lang === 'hin' || /^hi$|^hin$|hindi|हिन्दी|हिंदी/.test(text) || /hindi/.test(label)) return 'hindi';
  if (lang === 'en' || lang === 'eng' || /^en$|^eng$|english/.test(text) || /english/.test(label)) return 'dub';
  if (lang === 'ja' || lang === 'jpn' || /^ja$|^jpn$|japanese|日本語|\b(sub|subtitle|original)\b/.test(text)) return 'sub';
  return track.default ? 'sub' : 'multi';
}
function trackKey(track: { label?: string; lang?: string; default?: boolean }, occurrence: number): string {
  return [String(track.label || '').trim().toLowerCase(), String(track.lang || '').trim().toLowerCase(), trackGroup(track), occurrence].join('|');
}
function autoLabel(audio: any[]): string {
  const labels = Array.from(new Set((audio || []).map((a:any) => String(a.label || a.lang || '').trim()).filter(Boolean)));
  return labels.length ? labels.join(' · ') : 'VdoHide';
}
function trackMeta(audio: any[]): string {
  const seen: Record<string, number> = {};
  return JSON.stringify((audio || []).map((a:any) => {
    const base = String(a.label || '').trim().toLowerCase() + '|' + String(a.lang || '').trim().toLowerCase() + '|' + trackGroup(a);
    const occurrence = seen[base] || 0; seen[base] = occurrence + 1;
    return { key: trackKey(a, occurrence), label: a.label || a.lang || 'Audio', lang: a.lang || '', group: trackGroup(a), default: !!a.default };
  }));
}
function esc(value: unknown): string {
  return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

adminVdoHideServerRoutes.get('/admin/vdohide_servers.php', (c) => {
  const target = new URL(c.req.url);
  target.pathname = target.pathname.replace('/admin/vdohide_servers.php', '/admin/vdohide.php');
  return c.redirect(target.toString(), 301);
});

adminVdoHideServerRoutes.get('/admin/vdohide.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating } = ctx;
  const selectedAnime = Number(c.req.query('anime') || 0) || 0;

  if (c.req.query('json') === '1') {
    const anime = Number(c.req.query('anime') || 0);
    const episode = Number(c.req.query('episode') || 0);
    if (!anime || !episode) return c.json({ error: 'Missing anime or episode' }, 400);
    const rows = await db.fetchAll<any>(
      'SELECT id, anime_id, episode_num, label, embed_url, master_url, proxy_url, qualities_json, subtitles_json, is_active, updated_at FROM vdohide_servers WHERE anime_id=? AND episode_num=? ORDER BY id',
      [anime, episode]
    );
    return c.json({ success:true, sources:rows });
  }

  const seriesRows = await db.fetchAll<any>(
    `SELECT anime_id,
            COUNT(DISTINCT episode_num) AS episode_count,
            COUNT(*) AS source_count,
            MAX(updated_at) AS last_updated
       FROM vdohide_servers
      WHERE is_active=1
      GROUP BY anime_id
      ORDER BY MAX(updated_at) DESC`
  );

  const statsRows = await db.fetchAll<any>('SELECT audio_tracks FROM vdohide_servers WHERE is_active=1');
  const streamStats = { titles: seriesRows.length, episodes: seriesRows.reduce((n:any, r:any) => n + Number(r.episode_count || 0), 0), englishDub: 0, hindiDub: 0, otherDub: 0, subtitles: 0 };
  for (const row of statsRows) { try { const tracks = JSON.parse(String(row.audio_tracks || '[]')); if (Array.isArray(tracks)) for (const track of tracks) { const group = String(track?.group || '').toLowerCase(); if (group === 'dub') streamStats.englishDub++; else if (group === 'hindi') streamStats.hindiDub++; else if (group === 'multi') streamStats.otherDub++; else if (group === 'sub') streamStats.subtitles++; } } catch {} }

  // Directly resolve Hoshika metadata without legacy MAL identity mapping
  const metadataRows = [...seriesRows];
  if (selectedAnime && !metadataRows.some((row:any) => Number(row.anime_id) === selectedAnime)) {
    metadataRows.push({ anime_id: selectedAnime, episode_count: 0, source_count: 0 });
  }
  const metadataById = new Map<number, any>();
  await Promise.all(metadataRows.map(async (row:any) => {
    try {
      const hoshikaId = String(row.anime_id);
      const a = await getHoshikaAnimeById(hoshikaId, c.env.HOSHIKA_API_KEY);
      if (a) {
        metadataById.set(Number(row.anime_id), {
          title: a.title || a.titleEnglish || a.titleRomaji || `Anime #${row.anime_id}`,
          image: a.poster || '',
          hoshikaShortId: a.shortId || String(row.anime_id),
          totalEps: Number(a.episodes || 0),
          status: a.status || '',
          type: a.type || '',
        });
      }
    } catch { /* decorative metadata; preserve stream administration */ }
  }));

  const series = seriesRows.map((row:any) => {
    const a = metadataById.get(Number(row.anime_id));
    return {
      ...row,
      title: a?.title || `Anime #${row.anime_id}`,
      hoshikaShortId: String(a?.hoshikaShortId || row.anime_id),
      image: a?.image || '',
      totalEps: Number(a?.totalEps || 0),
      status: a?.status || '',
      type: a?.type || ''
    };
  });

  const episodes = selectedAnime
    ? await db.fetchAll<any>(
        `SELECT episode_num,
                COUNT(*) AS source_count,
                GROUP_CONCAT(label, ' | ') AS sources,
                GROUP_CONCAT(audio_tracks, '|||') AS track_data,
                MAX(updated_at) AS updated_at
           FROM vdohide_servers
          WHERE anime_id=? AND is_active=1
          GROUP BY episode_num
          ORDER BY episode_num DESC`,
        [selectedAnime]
      )
    : [];

  // One saved server row can contain multiple audio tracks, so count the
  // resolved tracks rather than database rows for the episode server badge.
  for (const ep of episodes) {
    const chunks = String(ep.track_data || '').split('|||').filter(Boolean);
    let tracks = 0;
    for (const chunk of chunks) {
      try { const parsed = JSON.parse(chunk); if (Array.isArray(parsed)) tracks += parsed.length; }
      catch { /* retain the database-row fallback */ }
    }
    ep.source_count = tracks || Number(ep.source_count || 0);
  }

  const selected = selectedAnime
    ? series.find((s:any) => Number(s.anime_id) === selectedAnime) || (() => {
        const a = metadataById.get(selectedAnime);
        return a ? {
          anime_id: selectedAnime,
          episode_count: episodes.length,
          source_count: episodes.reduce((n:number, ep:any) => n + Number(ep.source_count || 0), 0),
          title: a.title,
          hoshikaShortId: a.hoshikaShortId,
          image: a.image,
          totalEps: a.totalEps,
          status: a.status,
          type: a.type
        } : null;
      })()
    : null;

  let html = renderAdminHeader({
    siteUrl,
    pageTitle: 'VdoHide',
    adminPage: 'vdohide',
    isOwner,
    impersonating
  });
  html += renderVdoHideAdmin({
    siteUrl,
    series,
    selected,
    episodes,
    selectedAnime,
    streamStats
  });
  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});

adminVdoHideServerRoutes.post('/admin/vdohide.php', async (c) => {
  const ctx=await buildAdminCtx(c); if(!ctx)return c.json({error:'Forbidden'},403);
  const body:any=(c.req.header('content-type')||'').includes('application/json') ? await c.req.json().catch(()=>null) : await c.req.parseBody().catch(()=>null);
  if (body?.action === 'search-hoshika') {
    const query = String(body?.query || '').trim();
    if (!query) return c.json({ success: false, error: 'Enter an anime title to search Hoshika.' }, 400);
    const results = await searchHoshikaAnime(query, 12, c.env.HOSHIKA_API_KEY);
    return c.json({ success: true, results: results.map(a => ({ shortId: a.shortId, title: a.title, titleEnglish: a.titleEnglish, titleRomaji: a.titleRomaji, poster: a.poster, type: a.type })) });
  }
  if (body?.action === 'refresh-series') {
    const animeId = Number(body?.anime_id || 0);
    if (!animeId) return c.json({ error: 'Missing anime ID' }, 400);
    const rows = await ctx.db.fetchAll<any>(
      'SELECT id, embed_url, subtitles_json FROM vdohide_servers WHERE anime_id=?',
      [animeId]
    );
    if (!rows.length) return c.json({ success: true, refreshed: 0, failed: 0, message: 'No saved sources found for this series.' });
    let refreshed = 0;
    const failures: Array<{ id: number; error: string }> = [];
    for (const row of rows) {
      try {
        const resolved = await resolveVdoHide(String(row.embed_url || ''));
        const audioTracks = trackMeta(resolved.audioTracks);
        const label = autoLabel(resolved.audioTracks) || 'VdoHide';
        const vdoId = extractVdoId(String(row.embed_url || '')) || extractVdoId(resolved.masterUrl || '');
        const masterUrl = vdoId ? getCdnStreamUrl(vdoId) : (resolved.masterUrl || '');
        const proxyUrl = masterUrl;
        const qualitiesJson = JSON.stringify(resolved.qualities);

        // Preserve custom uploaded subtitles
        let prevSubs: any[] = [];
        try { prevSubs = JSON.parse(String(row.subtitles_json || '[]')); } catch {}
        const customSubs = Array.isArray(prevSubs) ? prevSubs.filter(s => s && s.custom) : [];
        const subtitlesJson = JSON.stringify([...resolved.subtitles, ...customSubs]);

        await ctx.db.query(
          "UPDATE vdohide_servers SET label=?,master_url=?,proxy_url=?,qualities_json=?,audio_tracks=?,subtitles_json=?,updated_at=datetime('now') WHERE id=?",
          [label, masterUrl, proxyUrl, qualitiesJson, audioTracks, subtitlesJson, Number(row.id)]
        );
        refreshed++;
      } catch (error) {
        failures.push({ id: Number(row.id), error: error instanceof Error ? error.message : String(error) });
      }
    }
    return c.json({ success: true, refreshed, failed: failures.length, failures });
  }

  if (body?.action === 'upload-subtitle') {
    const sourceId = Number(body?.source_id || 0);
    if (!sourceId) return c.json({ success: false, error: 'Missing source ID' }, 400);

    const source = await ctx.db.fetchOne<any>('SELECT * FROM vdohide_servers WHERE id=?', [sourceId]);
    if (!source) return c.json({ success: false, error: 'Source not found' }, 404);

    let fileContent = '';
    const file = body?.file;
    if (file && typeof file === 'object' && typeof (file as any).text === 'function') {
      fileContent = await (file as any).text();
    } else if (typeof body?.content === 'string') {
      fileContent = body.content;
    }

    if (!fileContent.trim()) {
      return c.json({ success: false, error: 'Please choose an .srt or .vtt file to upload.' }, 400);
    }

    const vttText = convertSrtToVtt(fileContent);
    const lang = String(body?.lang || 'en').trim().toLowerCase().slice(0, 10) || 'en';
    const label = String(body?.label || 'English [Full]').trim().slice(0, 100) || 'English';
    const isDefault = body?.is_default === '1' || body?.is_default === 'true' || body?.is_default === true;

    const filename = `sub_${source.anime_id}_ep${source.episode_num}_${Date.now()}_${lang}.vtt`;

    // Put into R2 bucket
    await c.env.AVATARS.put(`subtitles/${filename}`, vttText, {
      httpMetadata: {
        contentType: 'text/vtt; charset=utf-8'
      }
    });

    const siteUrl = c.env.SITE_URL;
    const subUrl = `${siteUrl}/api/subtitles/${filename}`;

    let currentSubs: any[] = [];
    try { currentSubs = JSON.parse(String(source.subtitles_json || '[]')); } catch {}
    if (!Array.isArray(currentSubs)) currentSubs = [];

    if (isDefault) {
      currentSubs.forEach(s => { if (s) s.default = false; });
    }

    const newTrack = {
      label,
      lang,
      url: subUrl,
      default: isDefault,
      custom: true,
      filename
    };

    currentSubs.push(newTrack);

    await ctx.db.query(
      "UPDATE vdohide_servers SET subtitles_json=?, updated_at=datetime('now') WHERE id=?",
      [JSON.stringify(currentSubs), sourceId]
    );

    return c.json({ success: true, subtitle: newTrack, subtitles: currentSubs });
  }

  if (body?.action === 'delete-subtitle') {
    const sourceId = Number(body?.source_id || 0);
    const filename = String(body?.filename || '').trim();
    const url = String(body?.url || '').trim();
    if (!sourceId || (!filename && !url)) {
      return c.json({ success: false, error: 'Missing source ID or subtitle identifier' }, 400);
    }

    const source = await ctx.db.fetchOne<any>('SELECT * FROM vdohide_servers WHERE id=?', [sourceId]);
    if (!source) return c.json({ success: false, error: 'Source not found' }, 404);

    let currentSubs: any[] = [];
    try { currentSubs = JSON.parse(String(source.subtitles_json || '[]')); } catch {}
    if (!Array.isArray(currentSubs)) currentSubs = [];

    const toDelete = currentSubs.find(s => (filename && s.filename === filename) || (url && s.url === url));
    const targetFilename = filename || toDelete?.filename;
    if (targetFilename) {
      try {
        await c.env.AVATARS.delete(`subtitles/${targetFilename}`);
      } catch {}
    }

    const updatedSubs = currentSubs.filter(s => s !== toDelete && (filename ? s.filename !== filename : s.url !== url));

    await ctx.db.query(
      "UPDATE vdohide_servers SET subtitles_json=?, updated_at=datetime('now') WHERE id=?",
      [JSON.stringify(updatedSubs), sourceId]
    );

    return c.json({ success: true, subtitles: updatedSubs });
  }
  const id=Number(body?.id||0), animeId=Number(body?.anime_id||0), ep=Number(body?.episode_num||0), url=normalizeVdoUrl(String(body?.embed_url||'')), active=Number(body?.is_active?1:0);
  if(!animeId||!ep||!validVdoUrl(url))return c.json({error:'Use an HTTPS vdohide.com, fembed.co, vidhidepro.com, or vidhide.com URL'},400);
  let audioTracks='[]';
  let label='VdoHide';
  let masterUrl='';
  let proxyUrl='';
  let qualitiesJson='[]';
  let subtitlesJson='[]';
  try {
    const resolved=await resolveVdoHide(url);
    const vdoId = extractVdoId(url) || extractVdoId(resolved.masterUrl || '');
    masterUrl=vdoId ? getCdnStreamUrl(vdoId) : (resolved.masterUrl || '');
    proxyUrl=masterUrl;
    qualitiesJson=JSON.stringify(resolved.qualities);

    let prevSubs: any[] = [];
    if (id) {
      const existing = await ctx.db.fetchOne<any>('SELECT subtitles_json FROM vdohide_servers WHERE id=?', [id]);
      try { prevSubs = JSON.parse(String(existing?.subtitles_json || '[]')); } catch {}
    } else {
      const existing = await ctx.db.fetchOne<any>('SELECT subtitles_json FROM vdohide_servers WHERE anime_id=? AND episode_num=?', [animeId, ep]);
      try { prevSubs = JSON.parse(String(existing?.subtitles_json || '[]')); } catch {}
    }
    const customSubs = Array.isArray(prevSubs) ? prevSubs.filter(s => s && s.custom) : [];
    subtitlesJson=JSON.stringify([...resolved.subtitles, ...customSubs]);
    audioTracks=trackMeta(resolved.audioTracks);
    label=autoLabel(resolved.audioTracks)||'VdoHide';
  } catch (e) {
    return c.json({error:'Could not resolve VdoHide while saving: '+(e instanceof Error ? e.message : String(e))},502);
  }
  if(id) await ctx.db.query("UPDATE vdohide_servers SET anime_id=?,episode_num=?,label=?,embed_url=?,master_url=?,proxy_url=?,qualities_json=?,audio_tracks=?,subtitles_json=?,is_active=?,updated_at=datetime('now') WHERE id=?",[animeId,ep,label,url,masterUrl,proxyUrl,qualitiesJson,audioTracks,subtitlesJson,active,id]);
  else await ctx.db.query("INSERT INTO vdohide_servers (anime_id,episode_num,label,embed_url,master_url,proxy_url,qualities_json,audio_tracks,subtitles_json,is_active,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(anime_id,episode_num) DO UPDATE SET label=excluded.label,embed_url=excluded.embed_url,master_url=excluded.master_url,proxy_url=excluded.proxy_url,qualities_json=excluded.qualities_json,audio_tracks=excluded.audio_tracks,subtitles_json=excluded.subtitles_json,is_active=excluded.is_active,updated_at=datetime('now')",[animeId,ep,label,url,masterUrl,proxyUrl,qualitiesJson,audioTracks,subtitlesJson,active]);
  return c.json({success:true});
});

adminVdoHideServerRoutes.delete('/admin/vdohide.php', async (c) => { const ctx=await buildAdminCtx(c); if(!ctx)return c.json({error:'Forbidden'},403); const id=Number(c.req.query('id')||0); if(!id)return c.json({error:'Missing id'},400); await ctx.db.query('DELETE FROM vdohide_servers WHERE id=?',[id]); return c.json({success:true}); });
