import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { getHoshikaAnimeById, searchHoshikaAnime } from '../../lib/hoshika-api';
import { findIdentityByLegacyMalId, findIdentityByHoshikaId } from '../../lib/anime-identity';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';
import { renderLuluStreamAdmin } from '../../render/admin-lulustream';
import { resolveLuluStream } from '../../lib/lulustream-resolver';

export const adminLuluStreamServerRoutes = new Hono<{ Bindings: Env }>();

function validLuluUrl(value: string): boolean {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    return u.protocol === 'https:' && (host === 'lulust.com' || host.endsWith('.lulust.com') || host === 'luluvido.com' || host.endsWith('.luluvido.com'));
  } catch { return false; }
}
function normalizeLuluUrl(value: string): string {
  try {
    const u = new URL(value.trim());
    const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || !['lulust.com', 'luluvido.com'].some(root => host === root || host.endsWith('.' + root))) return value.trim();
    const match = u.pathname.match(/^\/(?:d|e)\/([^/]+)\/?$/i);
    if (match) u.pathname = '/e/' + match[1];
    return u.toString().replace(/\/$/, '');
  } catch { return value.trim(); }
}
function trackGroup(track: { label?: string; lang?: string; default?: boolean }): 'sub'|'dub'|'hindi'|'multi' {
  const label = String(track.label || '').trim().toLowerCase();
  const lang = String(track.lang || '').trim().toLowerCase();
  const text = label + ' ' + lang;
  if (/^hi$|^hin$|hindi|हिन्दी|हिंदी/.test(text)) return 'hindi';
  if (/^en$|^eng$|english/.test(text)) return 'dub';
  if (/^ja$|^jpn$|japanese|日本語|\b(sub|subtitle|original)\b/.test(text)) return 'sub';
  return track.default ? 'sub' : 'multi';
}
function trackKey(track: { label?: string; lang?: string; default?: boolean }, occurrence: number): string {
  return [String(track.label || '').trim().toLowerCase(), String(track.lang || '').trim().toLowerCase(), trackGroup(track), occurrence].join('|');
}
function autoLabel(audio: any[]): string {
  const labels = Array.from(new Set((audio || []).map((a:any) => String(a.label || a.lang || '').trim()).filter(Boolean)));
  return labels.length ? labels.join(' · ') : 'LuluStream';
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

adminLuluStreamServerRoutes.get('/admin/lulustream_servers.php', (c) => {\n  const target = new URL(c.req.url);\n  target.pathname = target.pathname.replace('/admin/lulustream_servers.php', '/admin/self-host.php');\n  return c.redirect(target.toString(), 301);\n});\n\nadminLuluStreamServerRoutes.get('/admin/self-host.php', async (c) => {
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
      'SELECT id, anime_id, episode_num, label, embed_url, is_active, updated_at FROM lulustream_servers WHERE anime_id=? AND episode_num=? ORDER BY id',
      [anime, episode]
    );
    return c.json({ success:true, sources:rows });
  }

  const seriesRows = await db.fetchAll<any>(
    `SELECT anime_id,
            COUNT(DISTINCT episode_num) AS episode_count,
            COUNT(*) AS source_count,
            MAX(updated_at) AS last_updated
       FROM lulustream_servers
      WHERE is_active=1
      GROUP BY anime_id
      ORDER BY MAX(updated_at) DESC`
  );

  const statsRows = await db.fetchAll<any>('SELECT audio_tracks FROM lulustream_servers WHERE is_active=1');
  const streamStats = { titles: seriesRows.length, episodes: seriesRows.reduce((n:any, r:any) => n + Number(r.episode_count || 0), 0), englishDub: 0, hindiDub: 0, otherDub: 0, subtitles: 0 };
  for (const row of statsRows) { try { const tracks = JSON.parse(String(row.audio_tracks || '[]')); if (Array.isArray(tracks)) for (const track of tracks) { const group = String(track?.group || '').toLowerCase(); if (group === 'dub') streamStats.englishDub++; else if (group === 'hindi') streamStats.hindiDub++; else if (group === 'multi') streamStats.otherDub++; else if (group === 'sub') streamStats.subtitles++; } } catch {} }

  // Only resolve verified mappings. Legacy IDs remain the keys used by saved
  // stream rows, so unresolved entries remain editable without guessed metadata.
  const metadataRows = seriesRows;
  if (selectedAnime && !metadataRows.some((row:any) => Number(row.anime_id) === selectedAnime)) {
    const selectedRow = seriesRows.find((row:any) => Number(row.anime_id) === selectedAnime);
    if (selectedRow) metadataRows.push(selectedRow);
  }
  const metadataById = new Map<number, any>();
  await Promise.all(metadataRows.map(async (row:any) => {
    try {
      // LuluStream rows can contain either a legacy MAL ID or a Hoshika shortId.
      // Resolve the legacy mapping first, then accept a verified direct Hoshika-ID mapping.
      const legacyId = Number(row.anime_id);
      const legacyIdentity = await findIdentityByLegacyMalId(db, legacyId);
      const identity = legacyIdentity?.verified === 1 && legacyIdentity.hoshika_short_id
        ? legacyIdentity
        : await findIdentityByHoshikaId(db, legacyId);
      if (!identity || identity.verified !== 1 || !identity.hoshika_short_id) return;
      // A verified mapping remains valid even when Hoshika metadata is unavailable.
      const fallback = {
        title: identity.title || `Anime #${row.anime_id}`,
        poster: '',
        hoshikaShortId: identity.hoshika_short_id,
        images: { jpg: { large_image_url: '', image_url: '' } },
        episodes: 0,
        status: '',
        type: '',
      };
      const a = await getHoshikaAnimeById(identity.hoshika_short_id, c.env.HOSHIKA_API_KEY);
      metadataById.set(Number(row.anime_id), a
        ? { ...fallback, ...a, title: a.title || identity.title || fallback.title, images: { jpg: { large_image_url: a.poster || '', image_url: a.poster || '' } } }
        : fallback);
    } catch { /* decorative metadata; preserve stream administration */ }
  }));

  const series = seriesRows.map((row:any) => {
    const a = metadataById.get(Number(row.anime_id));
    return {
      ...row,
      title: a?.title || `Anime #${row.anime_id} · mapping required`,
      hoshikaShortId: String(a?.hoshikaShortId || a?.shortId || metadataById.get(Number(row.anime_id))?.hoshikaShortId || row.anime_id),
      hoshikaShortId: String(a?.hoshikaShortId || a?.shortId || metadataById.get(Number(row.anime_id))?.hoshikaShortId || row.anime_id),
      image: a?.poster || a?.images?.jpg?.large_image_url || a?.images?.jpg?.image_url || '',
      totalEps: Number(a?.episodes || 0),
      status: a?.status || '',
      type: a?.type || ''
    };
  });

  const selected = selectedAnime
    ? series.find((s:any) => Number(s.anime_id) === selectedAnime) || null
    : null;

  const episodes = selectedAnime
    ? await db.fetchAll<any>(
        `SELECT episode_num,
                COUNT(*) AS source_count,
                GROUP_CONCAT(label, ' | ') AS sources,
                GROUP_CONCAT(audio_tracks, '|||') AS track_data,
                MAX(updated_at) AS updated_at
           FROM lulustream_servers
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

  let html = renderAdminHeader({
    siteUrl,
    pageTitle: 'Self Host',
    adminPage: 'self-host',
    isOwner,
    impersonating
  });
  html += renderLuluStreamAdmin({
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

adminLuluStreamServerRoutes.post('/admin/self-host.php', async (c) => {
  const ctx=await buildAdminCtx(c); if(!ctx)return c.json({error:'Forbidden'},403);
  const body:any=(c.req.header('content-type')||'').includes('application/json') ? await c.req.json().catch(()=>null) : await c.req.parseBody().catch(()=>null);
  if (body?.action === 'search-hoshika') {
    const query = String(body?.query || '').trim();
    if (!query) return c.json({ success: false, error: 'Enter an anime title to search Hoshika.' }, 400);
    const results = await searchHoshikaAnime(query, 12, c.env.HOSHIKA_API_KEY);
    return c.json({ success: true, results: results.map(a => ({ shortId: a.shortId, title: a.title, titleEnglish: a.titleEnglish, titleRomaji: a.titleRomaji, poster: a.poster, type: a.type })) });
  }
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
      'SELECT id, embed_url FROM lulustream_servers WHERE anime_id=?',
      [animeId]
    );
    if (!rows.length) return c.json({ success: true, refreshed: 0, failed: 0, message: 'No saved sources found for this series.' });
    let refreshed = 0;
    const failures: Array<{ id: number; error: string }> = [];
    for (const row of rows) {
      try {
        const resolved = await resolveLuluStream(String(row.embed_url || ''));
        if (!resolved.audio.length) throw new Error('No audio/subtitle tracks found in the playlist.');
        const audioTracks = trackMeta(resolved.audio);
        const label = autoLabel(resolved.audio);
        await ctx.db.query(
          "UPDATE lulustream_servers SET label=?,audio_tracks=?,updated_at=datetime('now') WHERE id=?",
          [label, audioTracks, Number(row.id)]
        );
        refreshed++;
      } catch (error) {
        failures.push({ id: Number(row.id), error: error instanceof Error ? error.message : String(error) });
      }
    }
    return c.json({ success: true, refreshed, failed: failures.length, failures });
  }
  const id=Number(body?.id||0), animeId=Number(body?.anime_id||0), ep=Number(body?.episode_num||0), url=normalizeLuluUrl(String(body?.embed_url||'')), active=Number(body?.is_active?1:0);
  if(!animeId||!ep||!validLuluUrl(url))return c.json({error:'Use an HTTPS lulust.com or luluvido.com /d/ or /e/ URL'},400);
  let audioTracks='[]';
  let label='LuluStream';
  try {
    const resolved=await resolveLuluStream(url);
    audioTracks=trackMeta(resolved.audio);
    if (!resolved.audio.length) return c.json({error:'LuluStream resolved, but no audio tracks were found in the master playlist.'},422);
    label=autoLabel(resolved.audio);
  } catch (e) {
    return c.json({error:'Could not resolve LuluStream while saving: '+(e instanceof Error ? e.message : String(e))},502);
  }
  if(id) await ctx.db.query("UPDATE lulustream_servers SET anime_id=?,episode_num=?,label=?,embed_url=?,audio_tracks=?,is_active=?,updated_at=datetime('now') WHERE id=?",[animeId,ep,label,url,audioTracks,active,id]);
  else await ctx.db.query("INSERT INTO lulustream_servers (anime_id,episode_num,label,embed_url,audio_tracks,is_active,updated_at) VALUES (?,?,?,?,?,?,datetime('now')) ON CONFLICT(anime_id,episode_num) DO UPDATE SET label=excluded.label,embed_url=excluded.embed_url,audio_tracks=excluded.audio_tracks,is_active=excluded.is_active,updated_at=datetime('now')",[animeId,ep,label,url,audioTracks,active]);
  return c.json({success:true});
});

adminLuluStreamServerRoutes.delete('/admin/self-host.php', async (c) => { const ctx=await buildAdminCtx(c); if(!ctx)return c.json({error:'Forbidden'},403); const id=Number(c.req.query('id')||0); if(!id)return c.json({error:'Missing id'},400); await ctx.db.query('DELETE FROM lulustream_servers WHERE id=?',[id]); return c.json({success:true}); });