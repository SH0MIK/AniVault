// Ports admin/survey.php. Table already exists via the Phase 1 D1 migration.
import { Hono } from 'hono';
import type { Env } from '../../index';
import { buildAdminCtx } from '../../lib/admin-ctx';
import { Settings } from '../../lib/settings';
import { Logger } from '../../lib/logger';
import { h } from '../../lib/helpers';
import { renderAdminHeader, renderAdminFooter } from '../../render/admin-layout';

export const adminSurveyRoutes = new Hono<{ Bindings: Env }>();

adminSurveyRoutes.on(['GET', 'POST'], '/admin/survey.php', async (c) => {
  const ctx = await buildAdminCtx(c);
  const siteUrl = c.env.SITE_URL;
  if (!ctx) return c.redirect(siteUrl + '/');
  const { db, session, lifetime, isOwner, impersonating, userId } = ctx;
  const settings = new Settings(db);

  if (c.req.method === 'POST') {
    const body = await c.req.parseBody();
    const action = (body.action as string) ?? '';

    if (action === 'save_settings') {
      const enabled = body.survey_popup_enabled !== undefined ? '1' : '0';
      const cutoff = ((body.survey_popup_cutoff_date as string) ?? '2026-06-23').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
        session.setFlash('error', 'Invalid cutoff date format. Use YYYY-MM-DD.');
        await session.save(c, lifetime);
        return c.redirect(`${siteUrl}/admin/survey.php`);
      }
      const title = ((body.survey_popup_title as string) ?? '').trim() || 'Important Announcement';
      const subtitle = ((body.survey_popup_subtitle as string) ?? '').trim() || 'Please read this';
      const bodyText = ((body.survey_popup_body as string) ?? '').trim();
      const discordUrl = ((body.survey_popup_discord_url as string) ?? '').trim();
      const opt1 = ((body.survey_popup_option1 as string) ?? '').trim() || "I'm okay with ads";
      const opt2 = ((body.survey_popup_option2 as string) ?? '').trim() || 'I will donate a little amount';

      await settings.set('survey_popup_enabled', enabled);
      await settings.set('survey_popup_cutoff_date', cutoff);
      await settings.set('survey_popup_title', title);
      await settings.set('survey_popup_subtitle', subtitle);
      await settings.set('survey_popup_body', bodyText);
      await settings.set('survey_popup_discord_url', discordUrl);
      await settings.set('survey_popup_option1', opt1);
      await settings.set('survey_popup_option2', opt2);
      await Logger.log(db, userId, 'admin_survey_settings', `Survey popup ${enabled === '1' ? 'enabled' : 'disabled'}`);
      session.setFlash('success', 'Settings saved.');
    } else if (action === 'clear_votes') {
      await db.query('DELETE FROM hosting_survey_votes');
      await Logger.log(db, userId, 'admin_survey_clear', 'All survey votes cleared');
      session.setFlash('success', 'All votes cleared.');
    } else if (action === 'delete_vote') {
      const id = parseInt((body.vote_id as string) ?? '0', 10) || 0;
      if (id > 0) { await db.query('DELETE FROM hosting_survey_votes WHERE id=?', [id]); session.setFlash('success', 'Vote removed.'); }
    }
    await session.save(c, lifetime);
    return c.redirect(`${siteUrl}/admin/survey.php`);
  }

  const enabled = (await settings.get('survey_popup_enabled', '0')) === '1';
  const cutoff = (await settings.get('survey_popup_cutoff_date', '2026-06-23')) ?? '2026-06-23';
  const title = (await settings.get('survey_popup_title', 'Important Announcement')) ?? 'Important Announcement';
  const subtitle = (await settings.get('survey_popup_subtitle', 'Please read this')) ?? 'Please read this';
  const bodyText = (await settings.get('survey_popup_body', '')) ?? '';
  const discordUrl = (await settings.get('survey_popup_discord_url', '')) ?? '';
  const opt1 = (await settings.get('survey_popup_option1', "I'm okay with ads")) ?? "I'm okay with ads";
  const opt2 = (await settings.get('survey_popup_option2', 'I will donate a little amount')) ?? 'I will donate a little amount';

  const totalVotes = await db.count('SELECT COUNT(*) as cnt FROM hosting_survey_votes');
  const adsVotes = await db.count("SELECT COUNT(*) as cnt FROM hosting_survey_votes WHERE vote = 'ads'");
  const donateVotes = await db.count("SELECT COUNT(*) as cnt FROM hosting_survey_votes WHERE vote = 'donate'");
  const adsPercent = totalVotes > 0 ? Math.round((adsVotes / totalVotes) * 100) : 0;
  const donatePercent = totalVotes > 0 ? Math.round((donateVotes / totalVotes) * 100) : 0;

  const recentVotes = await db.fetchAll<any>(
    `SELECT v.id, v.vote, v.voted_at, u.username, u.id AS user_id FROM hosting_survey_votes v JOIN users u ON v.user_id = u.id ORDER BY v.voted_at DESC LIMIT 100`
  );
  const eligibleCount = await db.count('SELECT COUNT(*) as cnt FROM users WHERE date(created_at) < ?', [cutoff]);

  const flash = session.takeFlash();
  const err = flash?.type === 'error' ? flash.message : null;
  const suc = flash?.type === 'success' ? flash.message : null;

  let html = renderAdminHeader({ siteUrl, pageTitle: 'Hosting Survey', adminPage: 'survey', isOwner, impersonating });
  html += `
<style>
.sv-stat-box { background: var(--bg-card, #1c1c2e); border: 1px solid var(--border, #2e2e45); border-radius: 14px; padding: 1.4rem 1.6rem; }
.sv-bar-wrap { background: var(--bg-surface, #12121e); border-radius: 999px; height: 18px; overflow: hidden; margin-top: 8px; }
.sv-bar-fill { height: 100%; border-radius: 999px; transition: width 0.6s ease; }
.sv-field label { display: block; font-size: 0.78rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #888); margin-bottom: 6px; }
.sv-field input, .sv-field textarea, .sv-field select { width: 100%; box-sizing: border-box; background: var(--bg-surface, #12121e); color: var(--text-primary, #f0f0f0); border: 1px solid var(--border, #2e2e45); border-radius: 8px; padding: 9px 12px; font-size: 0.87rem; font-family: inherit; outline: none; transition: border-color 0.2s; }
.sv-field input:focus, .sv-field textarea:focus { border-color: var(--accent, #7c3aed); }
.sv-field textarea { resize: vertical; }
</style>

<div class="admin-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:1.6rem;">
  <h1>📊 Hosting Survey</h1>
  <form method="POST" onsubmit="return confirm('Delete ALL votes? This cannot be undone.')">
    <input type="hidden" name="action" value="clear_votes"><button class="btn btn-danger" ${totalVotes === 0 ? 'disabled' : ''}>🗑 Clear All Votes</button>
  </form>
</div>
${err ? `<div class="alert alert-error mb-2">⚠️ ${h(err)}</div>` : ''}
${suc ? `<div class="alert alert-success mb-2">✅ ${h(suc)}</div>` : ''}

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:1.8rem;">
  <div class="sv-stat-box" style="text-align:center;"><div style="font-size:2rem;font-weight:800;color:var(--text-primary,#f0f0f0);">${totalVotes}</div><div style="font-size:0.82rem;color:var(--text-muted,#888);margin-top:3px;">Total Votes</div></div>
  <div class="sv-stat-box">
    <div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:0.88rem;color:var(--text-primary,#f0f0f0);">😶 Okay with Ads</span><span style="font-size:1.1rem;font-weight:700;color:#f59e0b;">${adsVotes} <small style="font-size:0.7rem;font-weight:400;color:#888;">(${adsPercent}%)</small></span></div>
    <div class="sv-bar-wrap"><div class="sv-bar-fill" style="width:${adsPercent}%;background:#f59e0b;"></div></div>
  </div>
  <div class="sv-stat-box">
    <div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:0.88rem;color:var(--text-primary,#f0f0f0);">💜 Will Donate</span><span style="font-size:1.1rem;font-weight:700;color:#a78bfa;">${donateVotes} <small style="font-size:0.7rem;font-weight:400;color:#888;">(${donatePercent}%)</small></span></div>
    <div class="sv-bar-wrap"><div class="sv-bar-fill" style="width:${donatePercent}%;background:#a78bfa;"></div></div>
  </div>
  <div class="sv-stat-box" style="text-align:center;"><div style="font-size:2rem;font-weight:800;color:var(--text-primary,#f0f0f0);">${eligibleCount}</div><div style="font-size:0.82rem;color:var(--text-muted,#888);margin-top:3px;">Eligible Users<br><span style="font-size:0.74rem;">(joined before ${h(cutoff)})</span></div></div>
</div>

<div class="sv-stat-box" style="margin-bottom:1.8rem;">
  <h2 style="font-size:1rem;margin:0 0 1.2rem;color:var(--text-primary,#f0f0f0);">⚙️ Survey Settings</h2>
  <form method="POST">
    <input type="hidden" name="action" value="save_settings">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
      <div class="sv-field"><label>Popup Title</label><input type="text" name="survey_popup_title" value="${h(title)}" maxlength="80" required></div>
      <div class="sv-field"><label>Subtitle / Tag</label><input type="text" name="survey_popup_subtitle" value="${h(subtitle)}" maxlength="120"></div>
      <div class="sv-field"><label>Option 1 Label (vote = ads)</label><input type="text" name="survey_popup_option1" value="${h(opt1)}" maxlength="100" required></div>
      <div class="sv-field"><label>Option 2 Label (vote = donate)</label><input type="text" name="survey_popup_option2" value="${h(opt2)}" maxlength="100" required></div>
      <div class="sv-field"><label>Cutoff Date — show only to users joined BEFORE this date (YYYY-MM-DD)</label><input type="date" name="survey_popup_cutoff_date" value="${h(cutoff)}" required></div>
      <div class="sv-field"><label>Discord Server URL</label><input type="url" name="survey_popup_discord_url" value="${h(discordUrl)}" placeholder="https://discord.gg/yourcode"></div>
    </div>
    <div class="sv-field" style="margin-bottom:14px;"><label>Popup Body Text</label><textarea name="survey_popup_body" rows="8">${h(bodyText)}</textarea></div>
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.9rem;color:var(--text-primary,#f0f0f0);"><input type="checkbox" name="survey_popup_enabled" value="1" ${enabled ? 'checked' : ''}><strong>Enable Survey Popup</strong><span style="font-size:0.78rem;color:var(--text-muted,#888);">(only shows to eligible logged-in users who haven't voted)</span></label>
      <button type="submit" class="btn btn-primary">💾 Save Settings</button>
    </div>
  </form>
</div>

<div class="sv-stat-box">
  <h2 style="font-size:1rem;margin:0 0 1.2rem;color:var(--text-primary,#f0f0f0);">🗳️ Vote Log (latest 100)</h2>
  ${recentVotes.length === 0 ? `<p style="color:var(--text-muted,#888);font-size:0.88rem;">No votes yet.</p>` : `
  <div style="overflow-x:auto;">
    <table class="admin-table" style="width:100%;">
      <thead><tr><th>User</th><th>Vote</th><th>Voted At</th><th style="width:60px;"></th></tr></thead>
      <tbody>
      ${recentVotes.map((v) => {
        const ts = v.voted_at ? Math.floor(new Date(v.voted_at.replace(' ', 'T') + 'Z').getTime() / 1000) : 0;
        const dateStr = v.voted_at ? new Date(v.voted_at.replace(' ', 'T') + 'Z').toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '';
        return `
      <tr>
        <td><a href="users.php?search=${encodeURIComponent(v.username)}" style="color:var(--accent,#7c3aed);text-decoration:none;">${h(v.username)}</a></td>
        <td>${v.vote === 'ads' ? `<span style="color:#f59e0b;font-weight:600;">😶 Okay with Ads</span>` : `<span style="color:#a78bfa;font-weight:600;">💜 Will Donate</span>`}</td>
        <td style="font-size:0.82rem;color:var(--text-muted,#888);"><time class="local-ts" data-ts="${ts}" data-full="1">${dateStr}</time></td>
        <td><form method="POST" onsubmit="return confirm('Remove this vote?')"><input type="hidden" name="action" value="delete_vote"><input type="hidden" name="vote_id" value="${v.id}"><button class="btn btn-sm btn-danger" title="Remove vote">✕</button></form></td>
      </tr>`;
      }).join('')}
      </tbody>
    </table>
  </div>`}
</div>`;
  html += renderAdminFooter(siteUrl);
  await session.save(c, lifetime);
  return c.html(html);
});
