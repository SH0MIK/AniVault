import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { MalAPI } from '../../lib/mal-api';
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

adminLuluStreamServerRoutes.get('/admin/lulustream_servers.php', async (c) => {
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

  const mal = new MalAPI(c.env as any, c.env.API_CACHE, db);
  const series = await Promise.all(seriesRows.map(async (row:any) => {
    try {
      const a = (await mal.getAnime(Number(row.anime_id), true)).data;
      return {
        ...row,
        title: a?.title || `Anime #${row.anime_id}`,
        image: a?.images?.jpg?.large_image_url || a?.images?.jpg?.image_url || '',
        totalEps: Number(a?.episodes || 0),
        status: a?.status || '',
        type: a?.type || ''
      };
    } catch {
      return {
        ...row,
        title: `Anime #${row.anime_id}`,
        image: '',
        totalEps: 0,
        status: '',
        type: ''
      };
    }
  }));

  const selected = selectedAnime
    ? series.find((s:any) => Number(s.anime_id) === selectedAnime) || null
    : null;

  const episodes = selectedAnime
    ? await db.fetchAll<any>(
        `SELECT episode_num,
                COUNT(*) AS source_count,
                GROUP_CONCAT(label, ' | ') AS sources,
                MAX(updated_at) AS updated_at
           FROM lulustream_servers
          WHERE anime_id=? AND is_active=1
          GROUP BY episode_num
          ORDER BY episode_num DESC`,
        [selectedAnime]
      )
    : [];

  let html = renderAdminHeader({
    siteUrl,
    pageTitle: 'LuluStream Servers',
    adminPage: 'lulustream_servers',
    isOwner,
    impersonating
  });
  html += renderLuluStreamAdmin({
    siteUrl,
    series,
    selected,
    episodes,
    selectedAnime
  });
  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});

adminLuluStreamServerRoutes.post('/admin/lulustream_servers.php', async (c) => {
  const ctx=await buildAdminCtx(c); if(!ctx)return c.json({error:'Forbidden'},403);
  const body:any=(c.req.header('content-type')||'').includes('application/json') ? await c.req.json().catch(()=>null) : await c.req.parseBody().catch(()=>null);
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

adminLuluStreamServerRoutes.delete('/admin/lulustream_servers.php', async (c) => { const ctx=await buildAdminCtx(c); if(!ctx)return c.json({error:'Forbidden'},403); const id=Number(c.req.query('id')||0); if(!id)return c.json({error:'Missing id'},400); await ctx.db.query('DELETE FROM lulustream_servers WHERE id=?',[id]); return c.json({success:true}); });