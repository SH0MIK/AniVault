// Ports pages/importexport.php + pages/import_ajax.php.
// Workers has no simplexml_load_string, so the XML import uses a small
// regex-based extractor tailored to MAL's known, predictable export
// schema -- safe here since we're parsing a known format we control, not
// arbitrary untrusted XML (no external entity expansion risk either).
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { Logger } from '../lib/logger';
import { AnimeTracker } from '../lib/tracker';
import { icon } from '../lib/icons';
import { renderHeader, renderFooter, CurrentUser } from '../render/layout';
import { getBannerData } from '../lib/settings';

export const importExportRoutes = new Hono<{ Bindings: Env }>();

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const STATUS_TO_MAL: Record<string, string> = {
  watching: 'Watching', completed: 'Completed', plan_to_watch: 'Planning', on_hold: 'On-Hold', dropped: 'Dropped',
};
const MAL_TO_STATUS: Record<string, string> = {
  Watching: 'watching', Completed: 'completed', Planning: 'plan_to_watch', 'On-Hold': 'on_hold', Dropped: 'dropped',
};

async function getLocalAnimeImage(db: Db, animeId: number): Promise<string> {
  if (!animeId) return '';
  const row = await db.fetchOne<{ image_url: string }>('SELECT image_url FROM anime_images WHERE anime_id = ?', [animeId]);
  return row ? row.image_url : '';
}

// ── pages/importexport.php (export=xml / export=json handled first) ───────
importExportRoutes.get('/importexport', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  const siteUrl = c.env.SITE_URL;

  if (!auth.check()) return c.redirect(siteUrl + '/');
  const userId = session.user_id!;
  const user = await auth.getCurrentUser();

  const exportFormat = c.req.query('export');
  if (exportFormat) {
    const list = await db.fetchAll<any>('SELECT * FROM anime_list WHERE user_id=? ORDER BY updated_at DESC', [userId]);

    if (exportFormat === 'xml') {
      const count = (status: string) => list.filter((i) => i.status === status).length;
      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<myanimelist>\n  <myinfo>\n';
      xml += `    <user_name>${xmlEscape(user?.username ?? '')}</user_name>\n`;
      xml += `    <user_export_type>1</user_export_type>\n`;
      xml += `    <user_total_anime>${list.length}</user_total_anime>\n`;
      xml += `    <user_total_watching>${count('watching')}</user_total_watching>\n`;
      xml += `    <user_total_completed>${count('completed')}</user_total_completed>\n`;
      xml += `    <user_total_onhold>${count('on_hold')}</user_total_onhold>\n`;
      xml += `    <user_total_dropped>${count('dropped')}</user_total_dropped>\n`;
      xml += `    <user_total_plantowatch>${count('plan_to_watch')}</user_total_plantowatch>\n`;
      xml += '  </myinfo>\n\n';
      for (const item of list) {
        xml += '  <anime>\n';
        xml += `    <series_animedb_id>${item.anime_id}</series_animedb_id>\n`;
        xml += `    <series_title>${xmlEscape(item.anime_title ?? '')}</series_title>\n`;
        xml += `    <series_episodes>${item.anime_episodes ?? 0}</series_episodes>\n`;
        xml += `    <my_watched_episodes>${item.episodes_watched ?? 0}</my_watched_episodes>\n`;
        xml += `    <my_start_date>${item.started_at ?? '0000-00-00'}</my_start_date>\n`;
        xml += `    <my_finish_date>${item.completed_at ?? '0000-00-00'}</my_finish_date>\n`;
        xml += `    <my_score>${item.score ?? 0}</my_score>\n`;
        xml += `    <my_status>${STATUS_TO_MAL[item.status] ?? 'Planning'}</my_status>\n`;
        xml += `    <my_comments>${xmlEscape(item.review ?? '')}</my_comments>\n`;
        xml += `    <update_on_import>1</update_on_import>\n`;
        xml += '  </anime>\n';
      }
      xml += '</myanimelist>\n';
      await Logger.log(db, userId, 'export_xml', `Exported ${list.length} entries as XML`);
      await session.save(c, lifetime);
      return new Response(xml, {
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Content-Disposition': `attachment; filename="anivault_export_${new Date().toISOString().split('T')[0].replace(/-/g, '')}.xml"`,
        },
      });
    }

    if (exportFormat === 'json') {
      const exportData = list.map((i) => ({
        anime_id: i.anime_id, anime_title: i.anime_title, anime_image: i.anime_image,
        anime_episodes: i.anime_episodes, status: i.status, episodes_watched: i.episodes_watched,
        score: i.score ?? null, review: i.review, started_at: i.started_at, completed_at: i.completed_at, updated_at: i.updated_at,
      }));
      await Logger.log(db, userId, 'export_json', `Exported ${list.length} entries as JSON`);
      await session.save(c, lifetime);
      return new Response(JSON.stringify({ exported_by: user?.username, exported_at: new Date().toISOString(), total: exportData.length, anime: exportData }, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="anivault_export_${new Date().toISOString().split('T')[0].replace(/-/g, '')}.json"`,
        },
      });
    }
  }

  // Normal page load
  const stats = await AnimeTracker.getStats(db, userId);
  const imported = c.req.query('imported') !== undefined;
  const currentUser = user;
  const { Notification } = await import('../lib/notification');
  const unreadCount = currentUser ? await Notification.unreadCount(db, currentUser.id) : 0;
  const layoutUser: CurrentUser | null = currentUser
    ? { id: currentUser.id, username: currentUser.username, avatar_url: currentUser.avatar_url, role: currentUser.role }
    : null;

  const __banner = await getBannerData(db);
  let html = renderHeader({ ...__banner, siteUrl, siteName: c.env.SITE_NAME, pageTitle: 'Import / Export', currentPage: 'importexport', currentUser: layoutUser, unreadCount, requestUrl: c.req.url });
  html += `
<div class="container section">
  <h1 class="mb-1">📦 Import / Export</h1>
  <p class="text-muted mb-3">Transfer your anime list to/from MyAnimeList and other sites.</p>

  ${imported ? `<div class="alert alert-success mb-2">✅ Import completed successfully! <a href="/mylist">View your updated list →</a></div>` : ''}

  <div class="grid-2" style="gap:1.5rem;margin-bottom:1.5rem;">
    <div class="card card-body">
      <h2 class="mb-1">📤 Export Your List</h2>
      <p class="text-muted mb-2" style="font-size:0.9rem;">Download your ${stats.total.toLocaleString('en-US')} anime entries. Import the XML directly into MyAnimeList.</p>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:1rem;">
          <div class="flex-between mb-1">
            <div><div style="font-weight:600;color:var(--text-primary);">📄 MAL XML Format</div><div class="text-muted" style="font-size:0.82rem;">Compatible with MyAnimeList import</div></div>
            <span class="badge badge-completed">Recommended</span>
          </div>
          <a href="/importexport?export=xml" class="btn btn-primary btn-sm">⬇ Download XML</a>
        </div>
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:1rem;">
          <div class="mb-1"><div style="font-weight:600;color:var(--text-primary);">🗂 AniVault JSON Format</div><div class="text-muted" style="font-size:0.82rem;">Full data backup with images &amp; reviews</div></div>
          <a href="/importexport?export=json" class="btn btn-ghost btn-sm">⬇ Download JSON</a>
        </div>
      </div>
      <details style="margin-top:1rem;">
        <summary style="cursor:pointer;color:var(--text-secondary);font-size:0.88rem;padding:6px 0;">How to import XML into MyAnimeList →</summary>
        <ol style="margin-top:8px;padding-left:1.25rem;color:var(--text-muted);font-size:0.85rem;line-height:2;">
          <li>Go to <strong style="color:var(--text-primary);">myanimelist.net</strong> and log in</li>
          <li>Go to <strong style="color:var(--text-primary);">Profile → Import/Export</strong></li>
          <li>Select <strong style="color:var(--text-primary);">"Anime List"</strong> and choose your XML file</li>
          <li>Click <strong style="color:var(--text-primary);">Import</strong> — done!</li>
        </ol>
      </details>
    </div>

    <div class="card card-body">
      <h2 class="mb-1">📥 Import a List</h2>
      <p class="text-muted mb-2" style="font-size:0.9rem;">
        Import from MyAnimeList XML export or a previous AniVault JSON backup. Existing entries will be updated, new ones added.
        <strong>Note:</strong> Imports use your local image library first. Missing posters can be filled from the admin image healer.
      </p>
      <form id="import-form" enctype="multipart/form-data">
        <div class="form-group">
          <label class="form-label">Select File (.xml or .json)</label>
          <div id="drop-zone" style="border: 2px dashed var(--border);border-radius: var(--radius-lg);padding: 2rem;text-align: center;cursor: pointer;transition: var(--trans);"
               onclick="document.getElementById('import_file').click()"
               ondragover="event.preventDefault(); this.style.borderColor='var(--accent)'"
               ondragleave="this.style.borderColor='var(--border)'" ondrop="handleDrop(event)">
            <div style="font-size:2rem;margin-bottom:8px;">📁</div>
            <div style="color:var(--text-secondary);font-size:0.9rem;">Drop file here or <span style="color:var(--accent);">click to browse</span></div>
            <div id="drop-filename" style="margin-top:8px;color:var(--teal);font-size:0.85rem;"></div>
          </div>
          <input type="file" name="import_file" id="import_file" accept=".xml,.json" style="display:none" onchange="showFilename(this)">
        </div>
        <div style="background:rgba(232,69,60,0.08);border:1px solid var(--border-accent);border-radius:var(--radius-md);padding:12px;margin-bottom:1rem;font-size:0.85rem;">
          ⚠️ <strong>Important:</strong> Existing entries with the same anime ID will be overwritten. Imported entries use your local image library first. Use the admin image healer afterward to save any missing posters locally.
        </div>
        <button type="submit" class="btn btn-primary btn-block" id="import-btn">⬆ Import List</button>
      </form>
      <div id="progress-container" style="display: none; margin-top: 1.5rem;">
        <div class="flex-between mb-1">
          <span id="progress-status" style="font-size: 0.85rem; color: var(--text-secondary);">Preparing import...</span>
          <span id="progress-percent" style="font-size: 0.85rem; font-weight: 600; color: var(--accent);">0%</span>
        </div>
        <div class="progress-bar" style="height: 8px; background: var(--bg-surface);"><div id="progress-fill" class="progress-fill" style="width: 0%; transition: width 0.3s ease;"></div></div>
        <div id="progress-details" style="margin-top: 8px; font-size: 0.75rem; color: var(--text-muted); text-align: center;">Waiting to start...</div>
      </div>
      <div style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border);">
        <div class="text-muted" style="font-size:0.78rem;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Supported Sources</div>
        <div class="flex flex-wrap" style="gap:6px;">
          ${['MyAnimeList XML', 'AniList (via MAL export)', 'Kitsu (via MAL export)', 'AniVault JSON'].map((s) => `<span class="genre-tag" style="font-size:0.75rem;">${s}</span>`).join('')}
        </div>
      </div>
    </div>
  </div>

  <div class="card card-body">
    <h2 class="mb-2">📖 How to Export from Other Sites</h2>
    <div class="grid-3" style="gap:1.25rem;">
      <div><h3 style="color:var(--blue);font-size:1rem;margin-bottom:8px;">MyAnimeList</h3>
        <ol style="padding-left:1.25rem;color:var(--text-secondary);font-size:0.85rem;line-height:2;">
          <li>Log in to myanimelist.net</li><li>Go to <strong>Profile → Import/Export</strong></li>
          <li>Click <strong>"Export Anime List"</strong></li><li>Download the .xml file</li><li>Import it here ↑</li>
        </ol></div>
      <div><h3 style="color:var(--teal);font-size:1rem;margin-bottom:8px;">AniList</h3>
        <ol style="padding-left:1.25rem;color:var(--text-secondary);font-size:0.85rem;line-height:2;">
          <li>Log in to anilist.co</li><li>Go to <strong>Settings → Import</strong></li>
          <li>Use a tool like <strong>anilist-to-mal</strong> to convert</li><li>Import the resulting XML here</li>
        </ol></div>
      <div><h3 style="color:var(--purple);font-size:1rem;margin-bottom:8px;">Kitsu</h3>
        <ol style="padding-left:1.25rem;color:var(--text-secondary);font-size:0.85rem;line-height:2;">
          <li>Log in to kitsu.io</li><li>Go to <strong>Account Settings</strong></li>
          <li>Use the <strong>Export</strong> option</li><li>Convert to MAL XML format</li><li>Import it here</li>
        </ol></div>
    </div>
  </div>
</div>

<script>
let importInProgress = false;
function showFilename(input) {
  const el = document.getElementById('drop-filename');
  if (input.files[0]) {
    el.textContent = '✅ ' + input.files[0].name + ' (' + (input.files[0].size / 1024).toFixed(1) + ' KB)';
    document.getElementById('drop-zone').style.borderColor = 'var(--teal)';
  }
}
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('drop-zone').style.borderColor = 'var(--border)';
  const file = e.dataTransfer.files[0];
  if (file) {
    const input = document.getElementById('import_file');
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    showFilename(input);
  }
}
function updateProgress(percent, status, details) {
  const fill = document.getElementById('progress-fill');
  const percentSpan = document.getElementById('progress-percent');
  const statusSpan = document.getElementById('progress-status');
  const detailsSpan = document.getElementById('progress-details');
  if (fill) fill.style.width = percent + '%';
  if (percentSpan) percentSpan.textContent = percent + '%';
  if (statusSpan) statusSpan.textContent = status;
  if (detailsSpan) detailsSpan.textContent = details;
}
function showProgress() { const c = document.getElementById('progress-container'); if (c) c.style.display = 'block'; }
function hideProgress() { const c = document.getElementById('progress-container'); if (c) c.style.display = 'none'; }
document.getElementById('import-form')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  if (importInProgress) { showToast('Import already in progress!', 'error'); return; }
  const fileInput = document.getElementById('import_file');
  const file = fileInput.files[0];
  if (!file) { showToast('Please select a file first', 'error'); return; }
  showProgress();
  updateProgress(0, 'Starting import...', 'Reading file...');
  importInProgress = true;
  const importBtn = document.getElementById('import-btn');
  const originalBtnText = importBtn.textContent;
  importBtn.disabled = true;
  importBtn.textContent = '⏳ Importing...';
  const formData = new FormData();
  formData.append('import_file', file);
  let progressInterval = setInterval(() => {
    const fill = document.getElementById('progress-fill');
    if (fill && fill.style.width) {
      let currentWidth = parseInt(fill.style.width) || 0;
      if (currentWidth < 90) {
        let newWidth = currentWidth + Math.random() * 5;
        if (newWidth > 90) newWidth = 90;
        fill.style.width = newWidth + '%';
        document.getElementById('progress-percent').textContent = Math.floor(newWidth) + '%';
      }
    }
  }, 1000);
  try {
    const response = await fetch('${siteUrl}/pages/import_ajax.php', { method: 'POST', body: formData });
    const result = await response.json();
    clearInterval(progressInterval);
    if (result.success) {
      updateProgress(100, '✅ Import complete!', \`Imported \${result.imported} entries. \${result.skipped} skipped, \${result.errors} errors.\`);
      showToast(\`Import complete! \${result.imported} entries added.\`, 'success');
      setTimeout(() => { window.location.href = '/importexport?imported=1'; }, 2000);
    } else {
      updateProgress(0, '❌ Import failed', result.message || 'Unknown error occurred');
      showToast(result.message || 'Import failed', 'error');
      setTimeout(() => hideProgress(), 3000);
    }
  } catch (error) {
    clearInterval(progressInterval);
    updateProgress(0, '❌ Import failed', 'Network error or server issue');
    showToast('Import failed. Please try again.', 'error');
    setTimeout(() => hideProgress(), 3000);
  } finally {
    importInProgress = false;
    importBtn.disabled = false;
    importBtn.textContent = originalBtnText;
  }
});
</script>`;

  html += renderFooter({ siteUrl, currentUser: layoutUser });
  await session.save(c, lifetime);
  return c.html(html);
});

// ── Minimal MAL-XML extractor for the known <anime>...</anime> schema ──────
interface ParsedMalEntry {
  animeId: number; title: string; episodes: number; watched: number; score: number;
  status: string; review: string; started: string; finished: string;
}

export function parseMalXml(xmlText: string): ParsedMalEntry[] {
  const entries: ParsedMalEntry[] = [];
  const animeBlocks = xmlText.match(/<anime>[\s\S]*?<\/anime>/g) ?? [];
  const field = (block: string, tag: string): string => {
    const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
    if (!m) return '';
    return m[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
      .trim();
  };
  for (const block of animeBlocks) {
    entries.push({
      animeId: parseInt(field(block, 'series_animedb_id'), 10) || 0,
      title: field(block, 'series_title'),
      episodes: parseInt(field(block, 'series_episodes'), 10) || 0,
      watched: parseInt(field(block, 'my_watched_episodes'), 10) || 0,
      score: parseInt(field(block, 'my_score'), 10) || 0,
      status: field(block, 'my_status'),
      review: field(block, 'my_comments'),
      started: field(block, 'my_start_date'),
      finished: field(block, 'my_finish_date'),
    });
  }
  return entries;
}

// ── pages/import_ajax.php ──────────────────────────────────────────────────
importExportRoutes.post('/pages/import_ajax.php', async (c) => {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');

  if (!auth.check()) {
    await session.save(c, lifetime);
    return c.json({ success: false, message: 'Not logged in.' }, 401);
  }
  const userId = session.user_id!;

  const formData = await c.req.formData();
  const file = formData.get('import_file') as File | null;
  if (!file) {
    await session.save(c, lifetime);
    return c.json({ success: false, message: 'No file received.' });
  }

  const content = await file.text();
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  let imported = 0, skipped = 0, errors = 0, total = 0;

  if (ext === 'xml') {
    const entries = parseMalXml(content);
    total = entries.length;
    for (const entry of entries) {
      if (!entry.animeId || !entry.title) { skipped++; continue; }
      const status = MAL_TO_STATUS[entry.status] ?? 'plan_to_watch';
      const scoreVal = entry.score > 0 ? entry.score : null;
      const startVal = entry.started && entry.started !== '0000-00-00' ? entry.started : null;
      const finishVal = entry.finished && entry.finished !== '0000-00-00' ? entry.finished : null;
      try {
        const animeImage = await getLocalAnimeImage(db, entry.animeId);
        const existing = await db.fetchOne<{ id: number }>('SELECT id FROM anime_list WHERE user_id=? AND anime_id=?', [userId, entry.animeId]);
        if (existing) {
          if (animeImage) {
            await db.query(
              `UPDATE anime_list SET anime_title=?, anime_image=CASE WHEN anime_image IS NULL OR anime_image='' THEN ? ELSE anime_image END,
               status=?, episodes_watched=?, score=?, review=?, started_at=?, completed_at=?, updated_at=datetime('now')
               WHERE user_id=? AND anime_id=?`,
              [entry.title, animeImage, status, entry.watched, scoreVal, entry.review || null, startVal, finishVal, userId, entry.animeId]
            );
          } else {
            await db.query(
              `UPDATE anime_list SET anime_title=?, status=?, episodes_watched=?, score=?, review=?, started_at=?, completed_at=?, updated_at=datetime('now')
               WHERE user_id=? AND anime_id=?`,
              [entry.title, status, entry.watched, scoreVal, entry.review || null, startVal, finishVal, userId, entry.animeId]
            );
          }
        } else {
          await db.insert(
            `INSERT INTO anime_list (user_id, anime_id, anime_title, anime_image, anime_episodes, status, episodes_watched, score, review, started_at, completed_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [userId, entry.animeId, entry.title, animeImage, entry.episodes, status, entry.watched, scoreVal, entry.review || null, startVal, finishVal]
          );
        }
        imported++;
      } catch {
        errors++;
      }
    }
    await Logger.log(db, userId, 'import_xml', `Imported ${imported} entries from MAL XML`);
    await session.save(c, lifetime);
    return c.json({ success: true, imported, skipped, errors, total, message: `Imported ${imported} entries` });
  }

  if (ext === 'json') {
    let data: any;
    try { data = JSON.parse(content); } catch {
      await session.save(c, lifetime);
      return c.json({ success: false, message: 'Invalid JSON file. Must be AniVault export format.' });
    }
    if (!data?.anime) {
      await session.save(c, lifetime);
      return c.json({ success: false, message: 'Invalid JSON file. Must be AniVault export format.' });
    }
    total = data.anime.length;
    for (const entry of data.anime) {
      const animeId = parseInt(entry.anime_id ?? '0', 10) || 0;
      const title = entry.anime_title ?? '';
      if (!animeId || !title) { skipped++; continue; }
      try {
        const animeImage = await getLocalAnimeImage(db, animeId);
        const existing = await db.fetchOne<{ id: number }>('SELECT id FROM anime_list WHERE user_id=? AND anime_id=?', [userId, animeId]);
        if (existing) {
          if (animeImage) {
            await db.query(
              `UPDATE anime_list SET anime_image=CASE WHEN anime_image IS NULL OR anime_image='' THEN ? ELSE anime_image END,
               status=?, episodes_watched=?, score=?, review=?, updated_at=datetime('now') WHERE user_id=? AND anime_id=?`,
              [animeImage, entry.status ?? 'plan_to_watch', parseInt(entry.episodes_watched ?? '0', 10) || 0, entry.score || null, entry.review || null, userId, animeId]
            );
          } else {
            await db.query(
              `UPDATE anime_list SET status=?, episodes_watched=?, score=?, review=?, updated_at=datetime('now') WHERE user_id=? AND anime_id=?`,
              [entry.status ?? 'plan_to_watch', parseInt(entry.episodes_watched ?? '0', 10) || 0, entry.score || null, entry.review || null, userId, animeId]
            );
          }
        } else {
          await db.insert(
            `INSERT INTO anime_list (user_id, anime_id, anime_title, anime_image, anime_episodes, status, episodes_watched, score, review, started_at, completed_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [userId, animeId, title, animeImage, parseInt(entry.anime_episodes ?? '0', 10) || 0, entry.status ?? 'plan_to_watch',
             parseInt(entry.episodes_watched ?? '0', 10) || 0, entry.score || null, entry.review || null, entry.started_at || null, entry.completed_at || null]
          );
        }
        imported++;
      } catch {
        errors++;
      }
    }
    await Logger.log(db, userId, 'import_json', `Imported ${imported} entries from JSON`);
    await session.save(c, lifetime);
    return c.json({ success: true, imported, skipped, errors, total, message: `Imported ${imported} entries` });
  }

  await session.save(c, lifetime);
  return c.json({ success: false, message: 'Unsupported file type. Use .xml or .json' });
});
