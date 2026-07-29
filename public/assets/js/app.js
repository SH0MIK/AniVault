// AnimeVault — Main JS

// ══════════════════════════════════════════════════════════════
//  AUTH POPUP MODAL
//  requireLogin()  — call instead of redirecting to login.php
// ══════════════════════════════════════════════════════════════

/** Open the auth popup. Stores current page so we can redirect back after login/signup. */
function requireLogin(tab) {
  // Remember where the user was so we can return after auth
  window.__authRedirect = window.location.href;
  authSwitchTab(tab || 'login');
  openModal('auth-modal');
}

function authSwitchTab(tab) {
  document.getElementById('auth-panel-login') .style.display = tab === 'login'  ? '' : 'none';
  document.getElementById('auth-panel-signup').style.display = tab === 'signup' ? '' : 'none';
  document.getElementById('auth-tab-login') .classList.toggle('active', tab === 'login');
  document.getElementById('auth-tab-signup').classList.toggle('active', tab === 'signup');
  // Clear messages on tab switch
  ['auth-login-error','auth-login-success','auth-signup-error','auth-signup-success'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.textContent = ''; }
  });
}

/** Redirect to Google OAuth, saving the intended post-auth destination */
function authGoogleRedirect(e) {
  e.preventDefault();
  const base    = window.__siteUrl || '';
  const redirect = window.__authRedirect || window.location.href;
  // Store it so oauth_google.php can pick it up via ?redirect=
  const url = base + '/pages/login.php?popup=1&redirect=' + encodeURIComponent(redirect);
  // We need the server to set the Google URL with the right state and redirect.
  // Easiest: do a tiny fetch to get the constructed Google OAuth URL, then navigate.
  fetch(base + '/api/auth_google_url.php?redirect=' + encodeURIComponent(redirect))
    .then(r => r.json())
    .then(d => { if (d.url) window.location.href = d.url; })
    .catch(() => { window.location.href = url; });
}

/** Redirect to Discord OAuth, saving the intended post-auth destination */
function authDiscordRedirect(e) {
  e.preventDefault();
  const base     = window.__siteUrl || '';
  const redirect = window.__authRedirect || window.location.href;
  fetch(base + '/api/auth_discord_url.php?redirect=' + encodeURIComponent(redirect))
    .then(r => r.json())
    .then(d => { if (d.url) window.location.href = d.url; })
    .catch(() => {});
}

/** AJAX login via the auth popup */
async function authSubmitLogin() {
  const username = document.getElementById('auth-login-username').value.trim();
  const password = document.getElementById('auth-login-password').value;
  const errEl    = document.getElementById('auth-login-error');
  const sucEl    = document.getElementById('auth-login-success');
  errEl.style.display = 'none';
  sucEl.style.display = 'none';
  if (!username || !password) { errEl.textContent = 'Please fill in all fields.'; errEl.style.display = ''; return; }

  const base = window.__siteUrl || '';
  const fd   = new FormData();
  fd.append('username', username);
  fd.append('password', password);
  fd.append('ajax', '1');

  try {
    const res  = await fetch(base + '/api/auth_ajax.php', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) {
      sucEl.textContent = 'Signed in! Redirecting…';
      sucEl.style.display = '';
      setTimeout(() => {
        window.location.href = window.__authRedirect || (window.__siteUrl + '/');
      }, 600);
    } else {
      errEl.textContent = data.message || 'Invalid credentials.';
      errEl.style.display = '';
    }
  } catch(e) {
    errEl.textContent = 'Network error, please try again.';
    errEl.style.display = '';
  }
}

/** AJAX register via the auth popup */
async function authSubmitSignup() {
  const username = document.getElementById('auth-signup-username').value.trim();
  const email    = document.getElementById('auth-signup-email').value.trim();
  const password = document.getElementById('auth-signup-password').value;
  const confirm  = document.getElementById('auth-signup-confirm').value;
  const errEl    = document.getElementById('auth-signup-error');
  const sucEl    = document.getElementById('auth-signup-success');
  errEl.style.display = 'none';
  sucEl.style.display = 'none';

  if (!username || !email || !password || !confirm) {
    errEl.textContent = 'Please fill in all fields.'; errEl.style.display = ''; return;
  }
  if (password !== confirm) {
    errEl.textContent = 'Passwords do not match.'; errEl.style.display = ''; return;
  }

  const base = window.__siteUrl || '';
  const fd   = new FormData();
  fd.append('action',   'register');
  fd.append('username', username);
  fd.append('email',    email);
  fd.append('password', password);
  fd.append('ajax',     '1');

  try {
    const res  = await fetch(base + '/api/auth_ajax.php', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) {
      sucEl.textContent = 'Account created! Welcome to AniVault 🎌 Redirecting…';
      sucEl.style.display = '';
      setTimeout(() => {
        window.location.href = window.__authRedirect || (window.__siteUrl + '/');
      }, 800);
    } else {
      errEl.textContent = data.message || 'Registration failed.';
      errEl.style.display = '';
    }
  } catch(e) {
    errEl.textContent = 'Network error, please try again.';
    errEl.style.display = '';
  }
}

// Allow Enter key in auth modal inputs
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return;
  const modal = document.getElementById('auth-modal');
  if (!modal || !modal.classList.contains('open')) return;
  const loginPanel  = document.getElementById('auth-panel-login');
  const signupPanel = document.getElementById('auth-panel-signup');
  if (loginPanel  && loginPanel.style.display  !== 'none') authSubmitLogin();
  if (signupPanel && signupPanel.style.display !== 'none') authSubmitSignup();
});



// ── Toast notification ──────────────────────────────────
function showToast(msg, type = 'success') {
  const c = document.getElementById('toast-container') || (() => {
    const d = document.createElement('div');
    d.id = 'toast-container';
    document.body.appendChild(d);
    return d;
  })();
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── Tab switching ───────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      const parent = btn.closest('.tabs-container') || document;
      parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      parent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const tc = parent.querySelector(`#tab-${target}`);
      if (tc) tc.classList.add('active');
    });
  });
}

// ── Score buttons ───────────────────────────────────────
function initScoreButtons() {
  document.querySelectorAll('.score-input').forEach(wrap => {
    wrap.querySelectorAll('.score-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(wrap.dataset.target);
        if (btn.classList.contains('active')) {
          btn.classList.remove('active');
          if (input) input.value = '';
        } else {
          wrap.querySelectorAll('.score-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          if (input) input.value = btn.dataset.score;
        }
      });
    });
  });
}

// ── Dropdown (click-toggle, not hover) ─────────────────
function initDropdowns() {
  document.querySelectorAll('.dropdown').forEach(drop => {
    const trigger = drop.querySelector('.nav-avatar, .dropdown-trigger');
    if (!trigger) return;
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = drop.classList.contains('open');
      document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
      if (!isOpen) drop.classList.add('open');
    });
  });
  // Close when clicking outside
  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
  });
  // Prevent menu internal clicks from closing dropdown immediately
  document.querySelectorAll('.dropdown-menu').forEach(menu => {
    menu.addEventListener('click', e => e.stopPropagation());
  });
}

// ── Modal ───────────────────────────────────────────────
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}
document.addEventListener('click', e => {
  if (e.target.id === 'cropper-modal') return;
  if (e.target.classList.contains('modal-overlay') && e.target.dataset.static !== '1') e.target.classList.remove('open');
  const closeBtn = e.target.closest('.modal-close');
  if (closeBtn) {
    closeBtn.closest('.modal-overlay')?.classList.remove('open');
    // Reset the add-to-list form (same as Cancel)
    document.getElementById('al_status').value  = 'plan_to_watch';
    document.getElementById('al_watched').value = '0';
    const reviewEl1 = document.getElementById('al_review'); if (reviewEl1) reviewEl1.value = '';
    document.getElementById('al_score').value   = '';
    document.querySelectorAll('.score-btn').forEach(b => b.classList.remove('active'));
  }
});

// ── Add to list ─────────────────────────────────────────
async function addToList(animeId, title, image, totalEpisodes) {
  if (!window.__loggedIn) {
    requireLogin();
    return;
  }
  const base = window.__siteUrl || '';

  // Set hidden fields
  document.getElementById('al_anime_id').value       = animeId;
  document.getElementById('al_anime_title').value    = title;
  document.getElementById('al_anime_image').value    = image;
  document.getElementById('al_anime_eps').value      = totalEpisodes || 0;
  document.getElementById('modal-title').textContent = title;

  // Reset form to defaults first
  document.getElementById('al_status').value  = 'plan_to_watch';
  document.getElementById('al_watched').value = '0';
  const reviewEl2 = document.getElementById('al_review'); if (reviewEl2) reviewEl2.value = '';
  document.getElementById('al_score').value   = '';
  document.querySelectorAll('.score-btn').forEach(b => b.classList.remove('active'));

  // Show loading state in submit button
  const submitBtn = document.querySelector('#add-to-list-form [type=submit]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Loading...'; }

  openModal('add-to-list-modal');

  // Fetch existing entry and populate form
  const deleteBtn = document.getElementById('modal-delete-btn');
  if (deleteBtn) deleteBtn.style.display = 'none';

  try {
    const res  = await fetch(`${base}/api/list.php?action=get&anime_id=${animeId}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.entry) {
      const e = data.entry;
      document.getElementById('al_status').value  = e.status  || 'plan_to_watch';
      document.getElementById('al_watched').value = e.episodes_watched || 0;
      const reviewEl3 = document.getElementById('al_review'); if (reviewEl3) reviewEl3.value = e.review || '';
      document.getElementById('al_score').value   = e.score   || '';
      if (e.score) {
        const scoreBtn = document.querySelector(`.score-btn[data-score="${e.score}"]`);
        if (scoreBtn) scoreBtn.classList.add('active');
      }
      // Show delete button only when the anime is already in the list
      if (deleteBtn) deleteBtn.style.display = 'inline-flex';
    }
  } catch(err) {
    console.error('addToList fetch error:', err);
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Save to List'; }
  }
}

// ── Anime detail page: live status update ───────────────
function updateAnimePageStatus(entry) {
  const statusBadgeEl  = document.getElementById('anime-status-badge');
  if (!statusBadgeEl) return; // not on anime.php

  const scoreBadgeEl   = document.getElementById('anime-score-badge');
  const epsBadgeEl     = document.getElementById('anime-eps-badge');
  const progressWrap   = document.getElementById('anime-progress-wrap');
  const progressFill   = document.getElementById('anime-progress-fill');
  const totalEps       = parseInt(document.getElementById('anime-user-status')?.dataset.totalEps || '0');

  const statusMap = {
    watching:      { label: 'Watching',   cls: 'badge-watching'  },
    completed:     { label: 'Completed',  cls: 'badge-completed' },
    plan_to_watch: { label: 'Planning',   cls: 'badge-ptw'       },
    dropped:       { label: 'Dropped',    cls: 'badge-dropped'   },
    on_hold:       { label: 'On Hold',    cls: 'badge-onhold'    },
  };

  if (!entry) {
    // Deleted — clear everything
    statusBadgeEl.innerHTML = '';
    if (scoreBadgeEl)  scoreBadgeEl.textContent  = '';
    if (epsBadgeEl)    epsBadgeEl.textContent     = '';
    if (progressWrap)  progressWrap.style.display = 'none';
    if (progressFill)  progressFill.style.width   = '0%';
    return;
  }

  const s = statusMap[entry.status] || { label: entry.status, cls: 'badge-default' };
  statusBadgeEl.innerHTML = `<span class="badge ${s.cls}">${s.label}</span>`;

  if (scoreBadgeEl)
    scoreBadgeEl.textContent = entry.score ? `⭐ ${entry.score}/10` : '';

  if (epsBadgeEl) {
    epsBadgeEl.textContent = totalEps > 0
      ? `${entry.episodes_watched || 0}/${totalEps} eps`
      : (entry.episodes_watched ? `${entry.episodes_watched} eps` : '');
  }

  if (progressWrap && progressFill && totalEps > 0) {
    const pct = Math.min(100, Math.round((entry.episodes_watched || 0) / totalEps * 100));
    progressFill.style.width   = pct + '%';
    progressWrap.style.display = pct > 0 ? 'block' : 'none';
  }
}

// ── Delete from list ────────────────────────────────────
async function deleteFromList() {
  const animeId = document.getElementById('al_anime_id').value;
  if (!animeId) return;
  const deleteBtn = document.getElementById('modal-delete-btn');
  if (deleteBtn) { deleteBtn.disabled = true; deleteBtn.textContent = 'Removing...'; }
  try {
    const fd = new FormData();
    fd.append('action', 'remove');
    fd.append('anime_id', animeId);
    const res  = await fetch((window.__siteUrl || '') + '/api/list.php', { method: 'POST', body: fd });
    const data = await res.json();
    showToast(data.message || (data.success ? 'Removed from list' : 'Error'), data.success ? 'success' : 'error');
    if (data.success) {
      closeModal('add-to-list-modal');
      updateAnimePageStatus(null); // clear status on anime detail page
      document.querySelectorAll('.anime-card-overlay .btn').forEach(btn => {
        const oc = btn.getAttribute('onclick') || '';
        if (oc.includes('addToList(' + animeId + ',') || oc.includes('addToList(' + animeId + ' ,')) {
          btn.innerHTML = '+ Add to List';
        }
      });
      document.querySelectorAll('.anime-card-add-mobile').forEach(btn => {
        const oc = btn.getAttribute('onclick') || '';
        if (oc.includes('addToList(' + animeId + ',') || oc.includes('addToList(' + animeId + ' ,')) {
          btn.innerHTML = `<svg class="icon icon-edit icon-small" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="${window.__siteUrl}/assets/img/icons.svg#icon-plus"/></svg>`;
          btn.title = 'Add to List';
        }
      });
      // Remove status badges on cards
      document.querySelectorAll('.anime-card-poster').forEach(poster => {
        const refBtn = poster.querySelector('.anime-card-overlay .btn') || poster.querySelector('.anime-card-add-mobile');
        if (!refBtn) return;
        const oc = refBtn.getAttribute('onclick') || '';
        if (!oc.includes('addToList(' + animeId + ',') && !oc.includes('addToList(' + animeId + ' ,')) return;
        const badge = poster.querySelector('.anime-card-status-mobile');
        if (badge) badge.remove();
      });
      // Revert detail-page button
      document.querySelectorAll('button.btn-primary').forEach(btn => {
        const oc = btn.getAttribute('onclick') || '';
        if ((oc.includes('addToList(' + animeId + ',') || oc.includes('addToList(' + animeId + ' ,')) && !btn.closest('.anime-card-overlay')) {
          btn.textContent = '+ Add to List';
        }
      });
      // Revert schedule page action column to '+ List' button (delete)
      const scheduleActionDel = document.querySelector(`.schedule-action[data-anime-id="${animeId}"]`);
      if (scheduleActionDel) {
        const origOnclick = scheduleActionDel.querySelector('[onclick*="addToList"]')?.getAttribute('onclick') || `addToList(${animeId})`;
        scheduleActionDel.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="${origOnclick}">+ List</button>`;
      }
      // Revert top.php table row status badge/button back to '+ List' (delete)
      document.querySelectorAll('td button.btn-ghost, td span[onclick]').forEach(el => {
        const oc = el.getAttribute('onclick') || '';
        if (!oc.includes('addToList(' + animeId + ',') && !oc.includes('addToList(' + animeId + ' ,')) return;
        const row = el.closest('tr');
        if (row && row.querySelector('[data-cell="status"]')) return; // skip mylist/profile rows
        if (el.tagName === 'BUTTON') return; // already a '+ List' button, nothing to do
        // It's a badge <span> — replace it with a plain '+ List' button
        const btn = document.createElement('button');
        btn.className = 'btn btn-ghost btn-sm';
        btn.setAttribute('onclick', oc);
        btn.textContent = '+ List';
        el.replaceWith(btn);
      });
    }
  } catch(e) { showToast('Error removing from list', 'error'); }
  finally {
    if (deleteBtn) { deleteBtn.disabled = false; deleteBtn.textContent = 'Delete from List'; }
  }
}

// ── Favorite toggle ─────────────────────────────────────
async function toggleFavorite(btn, animeId, title, image) {
  if (!window.__loggedIn) { requireLogin(); return; }
  try {
    const fd = new FormData();
    fd.append('action', 'favorite');
    fd.append('anime_id', animeId);
    fd.append('anime_title', title);
    fd.append('anime_image', image);
    const res  = await fetch((window.__siteUrl || '') + '/api/list.php', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) {
      btn.textContent = data.favorited ? '♥ Favorited' : '♡ Favorite';
      btn.style.color = data.favorited ? '#e8453c' : '';
      showToast(data.favorited ? 'Added to favorites!' : 'Removed from favorites');
    }
  } catch(e) { showToast('Error', 'error'); }
}

// ── Image preview for avatar upload ────────────────────
function previewAvatar(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = e => {
      const prev = document.getElementById('avatar-preview');
      if (prev) { prev.src = e.target.result; prev.style.display = 'block'; }
    };
    reader.readAsDataURL(input.files[0]);
  }
}

// ── Main init ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initScoreButtons();
  initDropdowns();

  // Navbar search
  const searchForm = document.getElementById('nav-search-form');
  if (searchForm) {
    searchForm.addEventListener('submit', e => {
      e.preventDefault();
      const q = searchForm.querySelector('input').value.trim();
      if (q) window.location.href = `/pages/search.php?q=${encodeURIComponent(q)}`;
    });
  }

  // Episode counter cap + auto-fill on Completed
  const watchedEl  = document.getElementById('al_watched');
  const maxEpEl    = document.getElementById('al_anime_eps');
  const statusEl   = document.getElementById('al_status');
  if (watchedEl && maxEpEl) {
    watchedEl.addEventListener('input', () => {
      const max = parseInt(maxEpEl.value || '99999');
      if (max > 0 && parseInt(watchedEl.value) > max) watchedEl.value = max;
    });
  }
  if (statusEl && watchedEl && maxEpEl) {
    statusEl.addEventListener('change', () => {
      if (statusEl.value === 'completed') {
        const max = parseInt(maxEpEl.value || '0');
        if (max > 0) watchedEl.value = max;
      }
    });
  }

  // Add to list form submit
  const alForm = document.getElementById('add-to-list-form');
  if (alForm) {
    alForm.addEventListener('submit', async e => {
      e.preventDefault();
      const fd  = new FormData(alForm);
      fd.append('action', 'add');
      const btn = alForm.querySelector('[type=submit]');
      btn.disabled = true; btn.textContent = 'Saving...';
      try {
        const res  = await fetch((window.__siteUrl || '') + '/api/list.php', { method: 'POST', body: fd });
        const data = await res.json();
        showToast(data.message, data.success ? 'success' : 'error');
        if (data.success) {
          closeModal('add-to-list-modal');
          const animeId = document.getElementById('al_anime_id').value;
          // Live-update the anime detail page status section
          updateAnimePageStatus({
            status:            fd.get('status'),
            score:             fd.get('score'),
            episodes_watched:  parseInt(fd.get('episodes_watched') || '0'),
          });
          // Update card overlay buttons for this anime across the whole page
          document.querySelectorAll('.anime-card-overlay .btn').forEach(btn => {
            const oc = btn.getAttribute('onclick') || '';
            if (oc.includes('addToList(' + animeId + ',') || oc.includes('addToList(' + animeId + ' ,')) {
              btn.innerHTML = '\u270f\ufe0f Edit in List';
            }
          });
          // Also update mobile add buttons
          document.querySelectorAll('.anime-card-add-mobile').forEach(btn => {
            const oc = btn.getAttribute('onclick') || '';
            if (oc.includes('addToList(' + animeId + ',') || oc.includes('addToList(' + animeId + ' ,')) {
              btn.innerHTML = `<svg class="icon icon-edit icon-small" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="${window.__siteUrl}/assets/img/icons.svg#icon-edit"/></svg>`;
              btn.title = 'Edit in List';
            }
          });
          // Update the detail-page Add/Edit button if on anime.php
          document.querySelectorAll('button.btn-primary').forEach(btn => {
            const oc = btn.getAttribute('onclick') || '';
            if ((oc.includes('addToList(' + animeId + ',') || oc.includes('addToList(' + animeId + ' ,')) && !btn.closest('.anime-card-overlay')) {
              btn.innerHTML = '\u270f\ufe0f Edit in List';
            }
          });
          // Update top-page table: replace '+ List' button with clickable status badge
          const newStatus     = fd.get('status') || 'plan_to_watch';
          const statusLabels  = {watching:'Watching',completed:'Completed',plan_to_watch:'Planning',dropped:'Dropped',on_hold:'On Hold'};
          const statusClasses = {watching:'badge-watching',completed:'badge-completed',plan_to_watch:'badge-ptw',dropped:'badge-dropped',on_hold:'badge-onhold'};
          // Update or create the user-status badge on any anime card for this anime
          document.querySelectorAll('.anime-card-poster').forEach(poster => {
            // Try overlay btn first (desktop), fall back to mobile btn (medium/mobile)
            const overlay = poster.querySelector('.anime-card-overlay .btn');
            const mobileAddBtn = poster.querySelector('.anime-card-add-mobile');
            const refBtn = overlay || mobileAddBtn;
            if (!refBtn) return;
            const oc = refBtn.getAttribute('onclick') || '';
            if (!oc.includes('addToList(' + animeId + ',') && !oc.includes('addToList(' + animeId + ' ,')) return;
            // Update mobile + button to ✏ after adding
            const mobileBtn = poster.querySelector('.anime-card-add-mobile');
            if (mobileBtn) {
              mobileBtn.innerHTML = `<svg class="icon icon-edit icon-small" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="${window.__siteUrl}/assets/img/icons.svg#icon-edit"/></svg>`;
              mobileBtn.title = 'Edit in List';
            }
            // Update mobile status label
            const bottomRow = poster.querySelector('.anime-card-bottom-mobile');
            if (bottomRow) {
              let mobileStatus = bottomRow.querySelector('.anime-card-status-mobile');
              if (!mobileStatus) {
                mobileStatus = document.createElement('span');
                bottomRow.appendChild(mobileStatus);
              }
              mobileStatus.className = 'anime-card-status-mobile badge ' + (statusClasses[newStatus] || 'badge-default');
              mobileStatus.textContent = statusLabels[newStatus] || newStatus;
            }
            // Update status badge
            let badge = poster.querySelector('.anime-card-user-status');
            if (!badge) {
              badge = document.createElement('div');
              poster.appendChild(badge);
            }
            badge.className = 'anime-card-user-status badge ' + (statusClasses[newStatus] || 'badge-default');
            badge.textContent = statusLabels[newStatus] || newStatus;
          });
          document.querySelectorAll('td button.btn-ghost, td span[onclick]').forEach(el => {
            const oc = el.getAttribute('onclick') || '';
            if (oc.includes('addToList(' + animeId + ',') || oc.includes('addToList(' + animeId + ' ,')) {
              // Skip rows that already have a separate status cell (mylist, user/profile pages).
              // Those rows have their own [data-cell="status"] column; the Edit button should stay as-is.
              const row = el.closest('tr');
              if (row && row.querySelector('[data-cell="status"]')) return;

              const label = statusLabels[newStatus] || newStatus;
              const cls   = statusClasses[newStatus] || 'badge-default';
              if (el.tagName === 'BUTTON') {
                const span = document.createElement('span');
                span.setAttribute('onclick', oc);
                span.style.cursor = 'pointer';
                span.innerHTML = '<span class="badge ' + cls + '">' + label + '</span>';
                el.replaceWith(span);
              } else {
                const badge = el.querySelector('.badge');
                if (badge) { badge.className = 'badge ' + cls; badge.textContent = label; }
              }
            }
          });
          // Update schedule page action column (save)
          const scheduleAction = document.querySelector(`.schedule-action[data-anime-id="${animeId}"]`);
          if (scheduleAction) {
            const label = statusLabels[newStatus] || newStatus;
            const cls   = statusClasses[newStatus] || 'badge-default';
            const origOnclick = scheduleAction.querySelector('[onclick*="addToList"]')?.getAttribute('onclick') || `addToList(${animeId})`;
            scheduleAction.innerHTML = `<span onclick="${origOnclick}" style="cursor:pointer;"><span class="badge ${cls}">${label}</span></span>`;
          }
          // Refresh the mylist table row if it exists on this page
          const row = document.querySelector(`tr[data-anime-id="${animeId}"]`);
          if (row) {
            const status   = document.getElementById('al_status').value;
            const watched  = document.getElementById('al_watched').value;
            const score    = document.getElementById('al_score').value;
            const maxEps   = document.getElementById('al_anime_eps').value;

            // Status badge
            const statusBadgeMap = {
              watching:      ['Watching',      'badge-watching'],
              completed:     ['Completed',     'badge-completed'],
              plan_to_watch: ['Planning', 'badge-ptw'],
              dropped:       ['Dropped',       'badge-dropped'],
              on_hold:       ['On Hold',       'badge-onhold'],
            };
            const [label, cls] = statusBadgeMap[status] ?? [status, 'badge-default'];
            const statusCell = row.querySelector('[data-cell="status"]');
            if (statusCell) statusCell.innerHTML = `<span class="badge ${cls}">${label}</span>`;

            // Progress
            const progressCell = row.querySelector('[data-cell="progress"]');
            if (progressCell) {
              const max = parseInt(maxEps) || 0;
              const pct = max > 0 ? Math.min(100, Math.round(parseInt(watched) / max * 100)) : 0;
              progressCell.innerHTML =
                `<span style="font-size:0.85rem;color:var(--text-secondary);">${watched}${max ? '/' + max : ''} eps</span>` +
                (max > 0 ? `<div class="progress-bar" style="width:80px;"><div class="progress-fill" style="width:${pct}%"></div></div>` : '');
            }

            // Score
            const scoreCell = row.querySelector('[data-cell="score"]');
            if (scoreCell) {
              scoreCell.innerHTML = score
                ? `<span style="color:var(--gold);font-weight:600;">⭐ ${score}</span>`
                : `<span class="text-muted">—</span>`;
            }

            // Updated time — stamp it to "just now" immediately
            const updatedCell = row.querySelector('[data-cell="updated"]');
            if (updatedCell) {
              const nowSec = Math.floor(Date.now() / 1000);
              updatedCell.innerHTML = `<time class="local-ts" data-ts="${nowSec}">just now</time>`;
            }

            // Flash the row so the user sees it updated
            row.style.transition = 'background 0.15s';
            row.style.background = 'rgba(var(--accent-rgb, 232,69,60),0.12)';
            setTimeout(() => { row.style.background = ''; }, 900);
          }
        }
      } catch(err) { showToast('Error occurred', 'error'); }
      btn.disabled = false; btn.textContent = 'Save to List';
    });
  }
});

// ── Notification Bell ───────────────────────────────────
let __notifOpen    = false;
let __notifLoaded  = false;
let __notifPolling = null;

function initNotifications() {
  const bell  = document.getElementById('notif-bell');
  const panel = document.getElementById('notif-panel');
  if (!bell || !panel) return;

  // Toggle on bell click
  bell.addEventListener('click', e => {
    e.stopPropagation();
    __notifOpen = !__notifOpen;
    panel.classList.toggle('open', __notifOpen);
    if (__notifOpen && !__notifLoaded) loadNotifications();
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!document.getElementById('notif-dropdown-wrap')?.contains(e.target)) {
      __notifOpen = false;
      panel.classList.remove('open');
    }
  });

  // Poll for new notifications every 45s
  __notifPolling = setInterval(pollUnreadCount, 45000);
}

async function loadNotifications() {
  const list = document.getElementById('notif-list');
  try {
    const res  = await fetch('/api/notifications.php?action=get');
    const data = await res.json();
    if (!data.success) return;
    __notifLoaded = true;
    renderNotifications(data.notifications, data.unread);
  } catch(e) {
    if (list) list.innerHTML = '<div class="notif-empty"><span>⚠️</span>Could not load.</div>';
  }
}

function renderNotifications(items, unread) {
  const list  = document.getElementById('notif-list');
  const badge = document.getElementById('notif-badge');
  const bell  = document.getElementById('notif-bell');
  if (!list) return;

  // Update badge
  if (badge) {
    if (unread > 0) {
      badge.textContent = unread > 99 ? '99+' : unread;
      badge.style.display = 'flex';
      bell?.classList.add('has-unread');
    } else {
      badge.style.display = 'none';
      bell?.classList.remove('has-unread');
    }
  }

  if (!items || items.length === 0) {
    list.innerHTML = '<div class="notif-empty"><span>🔔</span>You\'re all caught up!</div>';
    return;
  }

  list.innerHTML = items.map(n => `
    <a class="notif-item ${n.is_read ? '' : 'unread'}"
       href="${n.link}"
       onclick="onNotifClick(event, ${n.id}, '${n.link}')">
      <div class="notif-actor-wrap">
        <div class="notif-actor-avatar">
          ${n.actor_avatar
            ? `<img src="${n.actor_avatar}" alt="">`
            : `<span>${n.actor_name.charAt(0).toUpperCase()}</span>`}
        </div>
        <span class="notif-type-badge">${n.icon}</span>
      </div>
      <div class="notif-text">
        <p>${n.text}</p>
        <div class="notif-time">${n.time}</div>
      </div>
      ${!n.is_read ? '<div style="width:7px;height:7px;border-radius:50%;background:var(--accent);flex-shrink:0;"></div>' : ''}
    </a>
  `).join('');
}

async function onNotifClick(e, id, link) {
  e.preventDefault();
  // Mark as read silently
  const fd = new FormData();
  fd.append('action', 'read');
  fd.append('id', id);
  fetch('/api/notifications.php', {method:'POST', body:fd});
  // Navigate
  window.location.href = link;
}

async function markAllRead() {
  const fd = new FormData();
  fd.append('action', 'read_all');
  await fetch('/api/notifications.php', {method:'POST', body:fd});
  // Re-render with all read
  document.querySelectorAll('.notif-item').forEach(el => {
    el.classList.remove('unread');
    const dot = el.querySelector('[style*="var(--accent)"]');
    if (dot) dot.remove();
  });
  const badge = document.getElementById('notif-badge');
  if (badge) badge.style.display = 'none';
  document.getElementById('notif-bell')?.classList.remove('has-unread');
  showToast('All notifications marked as read', 'success');
}

async function pollUnreadCount() {
  if (!window.__loggedIn) return;
  try {
    const res  = await fetch('/api/notifications.php?action=count');
    const data = await res.json();
    if (!data.success) return;
    const badge = document.getElementById('notif-badge');
    const bell  = document.getElementById('notif-bell');
    if (badge) {
      if (data.unread > 0) {
        badge.textContent = data.unread > 99 ? '99+' : data.unread;
        badge.style.display = 'flex';
        bell?.classList.add('has-unread');
        // Trigger ring animation by briefly removing then re-adding class
        if (!bell?.classList.contains('has-unread')) {
          bell?.classList.add('has-unread');
        }
      } else {
        badge.style.display = 'none';
        bell?.classList.remove('has-unread');
      }
    }
    // Refresh panel if open
    if (__notifOpen) loadNotifications();
  } catch(e) {}
}

// ── Like a review ───────────────────────────────────────
async function likeReview(btn, reviewId) {
  if (!window.__loggedIn) { requireLogin(); return; }
  btn.disabled = true;
  const fd = new FormData();
  fd.append('action', 'like_review');
  fd.append('review_id', reviewId);
  try {
    const res  = await fetch('/api/notifications.php', {method:'POST', body:fd});
    const data = await res.json();
    if (data.success) {
      const countEl = document.getElementById(`like-count-${reviewId}`);
      if (countEl) countEl.textContent = data.count;
      btn.textContent = data.liked ? '♥' : '♡';
      btn.style.color = data.liked ? 'var(--accent)' : '';
      showToast(data.liked ? '♥ Liked!' : 'Unliked', data.liked ? 'success' : 'success');
    }
  } catch(e) { showToast('Error', 'error'); }
  btn.disabled = false;
}

// ── Community Chat widget ────────────────────────────────
// Visible to everyone; guests can read but the input row only exists in the
// DOM when logged in (server-rendered), so guests never get a live socket.
let __chatLatestId    = 0;
let __chatOldestId    = null;
let __chatLoadedOnce  = false;
let __chatPolling     = null;
const CHAT_GROUP_WINDOW = 600; // seconds — consecutive messages from the same sender within this window are grouped, Discord-style

function initChat() {
  const widget = document.getElementById('chat-widget');
  const fab    = document.getElementById('chat-fab');
  if (!widget || !fab) return;

  const stored = sessionStorage.getItem('av_chat_open');
  if (stored === '0') { widget.classList.remove('open'); } else { openChat(); }

  fab.addEventListener('click', openChat);
  document.getElementById('chat-minimize')?.addEventListener('click', closeChat);

  const form  = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  if (form && input) {
    form.addEventListener('submit', e => { e.preventDefault(); sendChatMessage(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 90) + 'px';
    });
  }

  document.getElementById('chat-load-more')?.addEventListener('click', loadOlderChatMessages);

  document.addEventListener('click', e => {
    if (!widget.classList.contains('open')) return;
    if (widget.contains(e.target)) return;
    closeChat();
  });

  loadChatMessages();
  __chatPolling = setInterval(chatPollTick, 4000);
}

function openChat() {
  const widget = document.getElementById('chat-widget');
  if (!widget) return;
  widget.classList.add('open');
  sessionStorage.setItem('av_chat_open', '1');
  scrollChatToBottom();
  hideChatBadge();
  if (window.__loggedIn && __chatLoadedOnce) markChatRead();
}

function closeChat() {
  const widget = document.getElementById('chat-widget');
  if (!widget) return;
  widget.classList.remove('open');
  sessionStorage.setItem('av_chat_open', '0');
}

async function loadChatMessages() {
  const list  = document.getElementById('chat-messages');
  const empty = document.getElementById('chat-empty');
  if (!list) return;
  try {
    const res  = await fetch('/api/chat?action=get');
    const data = await res.json();
    if (!data.success) return;
    __chatLoadedOnce = true;
    if (!data.messages.length) {
      if (empty) empty.innerHTML = 'No messages yet — say hi! 👋';
    } else {
      empty?.remove();
      let prevMsg = null;
      data.messages.forEach(m => {
        list.appendChild(buildChatMessageEl(m, isGroupedContinuation(prevMsg, m)));
        prevMsg = m;
      });
      __chatOldestId = data.messages[0].id;
      const loadMoreBtn = document.getElementById('chat-load-more');
      if (loadMoreBtn) loadMoreBtn.style.display = data.messages.length >= 50 ? 'block' : 'none';
    }
    __chatLatestId = data.latest_id || __chatLatestId;
    scrollChatToBottom();
    if (window.__loggedIn && document.getElementById('chat-widget')?.classList.contains('open')) markChatRead();
  } catch (e) {}
}

async function loadOlderChatMessages() {
  if (__chatOldestId == null) return;
  const list = document.getElementById('chat-messages');
  const btn  = document.getElementById('chat-load-more');
  if (!list) return;
  const prevHeight = list.scrollHeight;
  try {
    const res  = await fetch('/api/chat?action=get&before_id=' + __chatOldestId);
    const data = await res.json();
    if (!data.success || !data.messages.length) { if (btn) btn.style.display = 'none'; return; }
    const frag = document.createDocumentFragment();
    let prevMsg = null;
    data.messages.forEach(m => {
      frag.appendChild(buildChatMessageEl(m, isGroupedContinuation(prevMsg, m)));
      prevMsg = m;
    });
    list.insertBefore(frag, btn.nextSibling);
    __chatOldestId = data.messages[0].id;
    list.scrollTop = list.scrollHeight - prevHeight;
    if (data.messages.length < 50 && btn) btn.style.display = 'none';
  } catch (e) {}
}

async function chatPollTick() {
  const widget = document.getElementById('chat-widget');
  const isOpen = widget?.classList.contains('open');
  if (isOpen && __chatLoadedOnce) {
    try {
      const res  = await fetch('/api/chat?action=poll&after_id=' + __chatLatestId);
      const data = await res.json();
      if (data.success && data.messages.length) {
        data.messages.forEach(m => appendChatMessage(m));
        __chatLatestId = data.latest_id;
        scrollChatToBottom();
        if (window.__loggedIn) markChatRead();
      }
    } catch (e) {}
  } else if (window.__loggedIn) {
    try {
      const res  = await fetch('/api/chat?action=count');
      const data = await res.json();
      if (data.success) updateChatBadge(data.unread);
    } catch (e) {}
  }
}

function updateChatBadge(count) {
  const badge = document.getElementById('chat-fab-badge');
  if (!badge) return;
  if (count > 0) { badge.textContent = count > 99 ? '99+' : count; badge.style.display = 'flex'; }
  else badge.style.display = 'none';
}
function hideChatBadge() { updateChatBadge(0); }

async function markChatRead() {
  const fd = new FormData();
  fd.append('action', 'read');
  try { await fetch('/api/chat', { method: 'POST', body: fd }); } catch (e) {}
  hideChatBadge();
}

function isGroupedContinuation(prevMsg, m) {
  if (!prevMsg) return false;
  return prevMsg.user_id === m.user_id && (m.ts - prevMsg.ts) >= 0 && (m.ts - prevMsg.ts) <= CHAT_GROUP_WINDOW;
}

function lastChatMessageEl() {
  const list = document.getElementById('chat-messages');
  if (!list) return null;
  for (let i = list.children.length - 1; i >= 0; i--) {
    if (list.children[i].classList.contains('chat-msg')) return list.children[i];
  }
  return null;
}

function buildChatMessageEl(m, grouped) {
  const wrap = document.createElement('div');
  wrap.className = 'chat-msg' + (grouped ? ' chat-msg-grouped' : '');
  wrap.id = 'chat-msg-' + m.id;
  wrap.setAttribute('data-user-id', m.user_id);
  wrap.setAttribute('data-ts', m.ts);
  const profileUrl = (window.__siteUrl || '') + '/u/' + encodeURIComponent(m.username);
  const deleteBtn = m.can_delete
    ? `<button type="button" class="chat-msg-delete" title="Delete" onclick="deleteChatMessage(${m.id})">✕</button>`
    : '';

  if (grouped) {
    wrap.innerHTML = `
      <div class="chat-msg-gutter"><span class="chat-msg-hover-time">${m.time}</span></div>
      <div class="chat-msg-body"><div class="chat-text">${m.message}</div></div>
      ${deleteBtn}`;
  } else {
    const initial = m.username ? m.username.charAt(0).toUpperCase() : '?';
    const avatarPill = m.avatar_badge ? `<span class="chat-avatar-role-badge">${m.avatar_badge}</span>` : '';
    wrap.innerHTML = `
      <a class="chat-msg-avatar" href="${profileUrl}" title="${m.username}">
        ${m.avatar_url ? `<img src="${m.avatar_url}" alt="">` : `<span>${initial}</span>`}
        ${avatarPill}
      </a>
      <div class="chat-msg-body">
        <div class="chat-msg-meta">
          <span class="username-with-badges">
            <a class="chat-msg-name role-${m.role}" href="${profileUrl}">${m.username}</a>${m.badges_html || ''}
          </span>
          <span class="chat-msg-time">${m.time}</span>
        </div>
        <div class="chat-text">${m.message}</div>
      </div>
      ${deleteBtn}`;
  }
  return wrap;
}

function appendChatMessage(m) {
  const list = document.getElementById('chat-messages');
  if (!list || document.getElementById('chat-msg-' + m.id)) return;
  const prevEl = lastChatMessageEl();
  const prevMsg = prevEl ? { user_id: parseInt(prevEl.getAttribute('data-user-id'), 10), ts: parseInt(prevEl.getAttribute('data-ts'), 10) } : null;
  list.appendChild(buildChatMessageEl(m, isGroupedContinuation(prevMsg, m)));
}

function scrollChatToBottom() {
  const list = document.getElementById('chat-messages');
  if (list) list.scrollTop = list.scrollHeight;
}

async function sendChatMessage() {
  if (!window.__loggedIn) { requireLogin('login'); return; }
  const input = document.getElementById('chat-input');
  const btn   = document.getElementById('chat-send-btn');
  const text  = (input?.value || '').trim();
  if (!text) return;
  btn.disabled = true;
  const fd = new FormData();
  fd.append('action', 'send');
  fd.append('message', text);
  try {
    const res  = await fetch('/api/chat', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) {
      input.value = '';
      input.style.height = 'auto';
      appendChatMessage(data.message);
      __chatLatestId = Math.max(__chatLatestId, data.message.id);
      scrollChatToBottom();
    } else {
      showToast(data.message || 'Could not send message', 'error');
    }
  } catch (e) { showToast('Error sending message', 'error'); }
  btn.disabled = false;
}

async function deleteChatMessage(id) {
  if (!confirm('Delete this message?')) return;
  const fd = new FormData();
  fd.append('action', 'delete');
  fd.append('id', id);
  try {
    const res  = await fetch('/api/chat', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) document.getElementById('chat-msg-' + id)?.remove();
  } catch (e) {}
}

// init notifications + chat on load
document.addEventListener('DOMContentLoaded', () => {
  if (window.__loggedIn) initNotifications();
  initChat();
});

// ── Mobile Menu (Hamburger) ─────────────────────────────────
function initMobileMenu() {
  const btn = document.getElementById('nav-hamburger');
  const menu = document.getElementById('mobile-menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = menu.classList.contains('open');
    if (isOpen) {
      menu.classList.remove('open');
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    } else {
      menu.classList.add('open');
      btn.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }
  });

  // Close when clicking a link inside menu
  menu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      menu.classList.remove('open');
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });

  // Mobile search form
  const mobileSearchForm = document.getElementById('mobile-search-form');
  if (mobileSearchForm) {
    mobileSearchForm.addEventListener('submit', e => {
      e.preventDefault();
      const q = mobileSearchForm.querySelector('input').value.trim();
      if (q) window.location.href = `/pages/search.php?q=${encodeURIComponent(q)}`;
    });
  }

  // Close menu on resize back to desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      menu.classList.remove('open');
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
  });
}

// Admin sidebar toggle
function initAdminSidebar() {
  const toggle = document.querySelector('.admin-sidebar-toggle');
  const nav = document.querySelector('.admin-nav');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', () => {
    nav.classList.toggle('open');
    toggle.textContent = nav.classList.contains('open') ? '▲ Hide Navigation' : '☰ Show Navigation';
  });
}

// ── Mobile Search Popup ─────────────────────────────────────
function initMobileSearchPopup() {
  const iconBtn  = document.getElementById('nav-search-icon');
  const overlay  = document.getElementById('search-popup-overlay');
  const closeBtn = document.getElementById('search-popup-close');
  const form     = document.getElementById('search-popup-form');
  const input    = document.getElementById('search-popup-input');
  if (!iconBtn || !overlay) return;

  function openPopup() {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => input && input.focus(), 50);
  }
  function closePopup() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    if (input) input.value = '';
  }

  iconBtn.addEventListener('click', openPopup);
  if (closeBtn) closeBtn.addEventListener('click', closePopup);

  // Close on overlay backdrop click (outside the popup box)
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closePopup();
  });

  // Close on Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closePopup();
  });

  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const q = input ? input.value.trim() : '';
      if (q) window.location.href = `/pages/search.php?q=${encodeURIComponent(q)}`;
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
  initMobileSearchPopup();
  initAdminSidebar();
});
// ── Episode Card Thumbnails (AniList) ───────────────────────
const _anilistThumbCache = {}; // malId → { epNum: url }

async function fetchAniListThumbs(malId) {
  if (_anilistThumbCache[malId]) return _anilistThumbCache[malId];
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query ($malId: Int) { Media(idMal: $malId, type: ANIME) { streamingEpisodes { title thumbnail site } } }`,
        variables: { malId: parseInt(malId) }
      })
    });
    const data = await res.json();
    const eps  = data?.data?.Media?.streamingEpisodes || [];
    const SKIP = ['netflix','amazon','prime','disney','hulu','apple'];
    const PREF = ['crunchyroll','funimation','hidive','vrv'];
    const score = site => {
      const s = (site||'').toLowerCase();
      if (SKIP.some(x => s.includes(x))) return -1;
      if (PREF.some(x => s.includes(x))) return 2;
      return 1;
    };
    const raw = {};
    eps.forEach(ep => {
      const m = (ep.title||'').match(/Episode\s+(\d+)/i);
      if (!m || !ep.thumbnail) return;
      const n = parseInt(m[1]), s = score(ep.site);
      if (s < 0) return;
      if (!raw[n] || s > raw[n].s) raw[n] = { url: ep.thumbnail, s };
    });
    const map = {};
    Object.keys(raw).forEach(n => { map[n] = raw[n].url; });
    _anilistThumbCache[malId] = map;
    return map;
  } catch(e) { return {}; }
}

async function loadEpCardThumbnails() {
  const cards = document.querySelectorAll('.ep-card');
  if (!cards.length) return;
  const animeId = cards[0].dataset.animeid;
  if (!animeId) return;

  const [overrideMap, thumbMap] = await Promise.all([
    fetch(`/api/episode_override.php?anime_id=${animeId}&all=1`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { const m = {}; (data?.overrides||[]).forEach(o => { m[o.episode_num]=o; }); return m; })
      .catch(() => ({})),
    fetchAniListThumbs(animeId),
  ]);

  cards.forEach(card => {
    const epNum    = parseInt(card.dataset.epnum);
    const override = overrideMap[epNum];
    const imgUrl   = override?.image_url || thumbMap[epNum] || '';
    if (!imgUrl) return;
    const thumb       = card.querySelector('.ep-thumb');
    const placeholder = card.querySelector('.ep-thumb-placeholder');
    thumb.style.backgroundImage      = `url('${imgUrl}')`;
    thumb.style.backgroundSize       = 'cover';
    thumb.style.backdropFilter       = 'none';
    thumb.style.webkitBackdropFilter = 'none';
    if (placeholder) placeholder.style.display = 'none';
    const cacheKey = `${animeId}-${epNum}`;
    if (!_epCache[cacheKey]) _epCache[cacheKey] = {};
    _epCache[cacheKey].thumb = imgUrl;
    if (override?.synopsis)    _epCache[cacheKey].synopsis   = override.synopsis;
    if (override?.watch_links) _epCache[cacheKey].watchLinks = JSON.parse(override.watch_links||'[]');
  });
}

// ── Episode Modal ────────────────────────────────────────
const _epCache = {};   // "malId-epNum" → { synopsis, thumb }

// Streaming service display config
const STREAMING_SERVICES = {
  'crunchyroll': { label: 'Crunchyroll', color: '#f47521', icon: '🟠' },
  'netflix':     { label: 'Netflix',     color: '#e50914', icon: '🔴' },
  'hidive':      { label: 'HIDIVE',      color: '#00aeef', icon: '🔵' },
  'funimation':  { label: 'Funimation',  color: '#400080', icon: '🟣' },
  'amazon':      { label: 'Prime Video', color: '#00a8e0', icon: '🔵' },
  'hulu':        { label: 'Hulu',        color: '#1ce783', icon: '🟢' },
  'apple':       { label: 'Apple TV+',   color: '#555555', icon: '⬛' },
  'disney':      { label: 'Disney+',     color: '#113ccf', icon: '🔵' },
  'youtube':     { label: 'YouTube',     color: '#ff0000', icon: '🔴' },
  'bilibili':    { label: 'Bilibili',    color: '#00aeec', icon: '🔵' },
};

function getStreamingKey(url) {
  for (const key of Object.keys(STREAMING_SERVICES)) {
    if (url.toLowerCase().includes(key)) return key;
  }
  return null;
}

const _animeInfoCache = {};

async function getAnimeInfo(malId) {
  if (_animeInfoCache[malId]) return _animeInfoCache[malId];
  try {
    const streaming = await fetch(`https://api.jikan.moe/v4/anime/${malId}/streaming`)
      .then(r => r.ok ? r.json() : null);
    const streamingLinks = (streaming?.data || [])
      .filter(s => getStreamingKey(s.url))
      .map(s => ({ service: getStreamingKey(s.url), url: s.url }));
    const result = { streamingLinks };
    _animeInfoCache[malId] = result;
    return result;
  } catch(e) { return { streamingLinks: [] }; }
}

document.addEventListener('click', async function(e) {
  const card = e.target.closest('.ep-card');
  if (!card) return;
  // On watch page anime page, ep-cards are <a> tags that navigate directly — don't open modal
  if (card.tagName === 'A') return;

  const title      = card.dataset.title   || '';
  const meta       = card.dataset.meta    || '';
  const score      = card.dataset.score   || '';
  const animeId    = card.dataset.animeid || '';
  const epNum      = card.dataset.epnum   || '';
  const animeCover = card.dataset.cover   || '';

  document.getElementById('ep-modal-title').textContent = title;
  document.getElementById('ep-modal-meta').textContent  = meta;
  document.getElementById('ep-modal-score').textContent = score;

  // Show edit button only for admins
  const editBtn = document.getElementById('ep-modal-edit-btn');
  if (editBtn) {
    editBtn.onclick = () => openEpEditor(animeId, epNum);
  }

  const synopsisEl = document.getElementById('ep-modal-synopsis');
  const thumbWrap  = document.getElementById('ep-modal-thumb-wrap');
  const thumbImg   = document.getElementById('ep-modal-thumb');
  const watchEl    = document.getElementById('ep-modal-watch');

  // Show cover placeholder immediately
  if (animeCover) {
    thumbImg.src             = animeCover;
    thumbImg.style.objectFit = 'contain';
    thumbWrap.style.display  = 'block';
  } else {
    thumbWrap.style.display  = 'none';
  }
  synopsisEl.textContent = 'Loading…';
  if (watchEl) watchEl.innerHTML = '';
  openModal('ep-modal');

  if (!animeId || !epNum) { synopsisEl.textContent = 'No synopsis available.'; return; }

  const cacheKey = `${animeId}-${epNum}`;

  if (_epCache[cacheKey]) {
    renderEpModal(_epCache[cacheKey], thumbImg, thumbWrap, synopsisEl, watchEl, title);
    return;
  }

  try {
    // Fetch streaming info + overrides + synopsis + AniList thumbs in parallel
    const [animeInfo, thumbMap, overrideRes, jikanRes] = await Promise.all([
      getAnimeInfo(animeId),
      fetchAniListThumbs(animeId),
      fetch(`/api/episode_override.php?anime_id=${animeId}&ep=${epNum}`).then(r => r.ok ? r.json() : null),
      fetch(`https://api.jikan.moe/v4/anime/${animeId}/episodes/${epNum}`).then(r => r.ok ? r.json() : null),
    ]);

    const override      = overrideRes?.override || null;
    const jikanSynop    = jikanRes?.data?.synopsis || '';
    const overrideSynop = override?.synopsis || '';
    const synopsis      = overrideSynop || jikanSynop;

    // Thumbnail: admin override > AniList > cached > anime cover fallback
    const thumb = override?.image_url || thumbMap[parseInt(epNum)] || _epCache[cacheKey]?.thumb || '';

    // Watch links: override takes priority, then Jikan streaming
    const overrideLinks = override ? (JSON.parse(override.watch_links || '[]') || []) : [];
    const streamLinks   = animeInfo?.streamingLinks || [];
    const watchLinks    = overrideLinks.length ? overrideLinks : streamLinks;

    const cached = { synopsis, thumb, watchLinks };
    _epCache[cacheKey] = cached;

    if (document.getElementById('ep-modal-title').textContent === title) {
      renderEpModal(cached, thumbImg, thumbWrap, synopsisEl, watchEl, title);
    }
  } catch (err) {
    synopsisEl.textContent = 'No synopsis available.';
  }
});

function renderEpModal(data, thumbImg, thumbWrap, synopsisEl, watchEl, title) {
  synopsisEl.textContent = data.synopsis || 'No synopsis available.';

  if (data.thumb) {
    thumbImg.src             = data.thumb;
    thumbImg.style.objectFit = 'cover';
    thumbWrap.style.display  = 'block';
  }

  if (watchEl) {
    const links = data.watchLinks || [];
    if (links.length) {
      watchEl.innerHTML =
        '<div class="ep-watch-label">Watch on</div><div class="ep-watch-links">' +
        links.map(l => {
          const key = l.service || '';
          const svc = STREAMING_SERVICES[key] || { label: key || 'Watch', color: '#888' };
          const iconUrl = `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(l.url)}`;
          return `<a href="${l.url}" target="_blank" rel="noopener" class="ep-watch-btn" style="border-color:${svc.color}40;color:${svc.color}">
            <img src="${iconUrl}" onerror="this.style.display='none'" style="width:16px;height:16px;border-radius:3px;margin-right:5px;vertical-align:middle;">
            ${svc.label}
          </a>`;
        }).join('') +
        '</div>';
    } else {
      watchEl.innerHTML = '<p class="ep-no-watch">No watch links available.</p>';
    }
    watchEl.style.display = 'block';
  }
}

// ── Episode Editor (admin only) ──────────────────────────
let _editorLinks = [];

async function openEpEditor(animeId, epNum) {
  closeModal('ep-modal');
  const cacheKey = `${animeId}-${epNum}`;
  const cached   = _epCache[cacheKey] || {};

  document.getElementById('eped-anime-id').value  = animeId;
  document.getElementById('eped-ep-num').value    = epNum;
  document.getElementById('eped-heading').textContent = `Edit Episode ${epNum}`;
  document.getElementById('eped-image').value    = cached.thumb || '';
  document.getElementById('eped-synopsis').value = cached.synopsis || '';
  _editorLinks = (cached.watchLinks || []).map(l => ({ ...l }));
  epedRenderLinks();
  epedPreviewImage(cached.thumb || '');
  openModal('ep-editor-modal');
}

document.addEventListener('DOMContentLoaded', () => {
  const imgInput = document.getElementById('eped-image');
  if (imgInput) imgInput.addEventListener('input', function() { epedPreviewImage(this.value.trim()); });
});

function epedPreviewImage(url) {
  const wrap = document.getElementById('eped-img-preview');
  const img  = document.getElementById('eped-img-tag');
  if (!wrap) return;
  if (url) { img.src = url; wrap.style.display = 'block'; }
  else { wrap.style.display = 'none'; }
}

function epedRenderLinks() {
  const list = document.getElementById('eped-links-list');
  if (!list) return;
  list.innerHTML = _editorLinks.map((l, i) => {
    const key = l.service || l.key || '';
    const svc = STREAMING_SERVICES[key] || { label: key, color: '#888' };
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <span style="min-width:105px;font-size:0.82rem;font-weight:600;color:${svc.color}">${svc.label}</span>
      <input type="url" value="${l.url}" class="form-control" style="flex:1;" data-link-url="${i}">
      <button class="ep-editor-rm-btn" onclick="epedCollectLinks();_editorLinks.splice(${i},1);epedRenderLinks()">✕</button>
    </div>`;
  }).join('');
}

function epedCollectLinks() {
  // Read URL values directly from inputs — don't rely on oninput staying in sync
  document.querySelectorAll('#eped-links-list [data-link-url]').forEach(input => {
    const i = parseInt(input.getAttribute('data-link-url'));
    if (_editorLinks[i]) _editorLinks[i].url = input.value.trim();
  });
}

function epedAddLink() {
  epedCollectLinks(); // save pending edits before re-rendering
  const svc = document.getElementById('eped-new-service').value;
  const url = document.getElementById('eped-new-url').value.trim();
  if (!svc || !url) return;
  if (_editorLinks.find(l => (l.service||l.key) === svc)) return alert('Already added.');
  _editorLinks.push({ service: svc, url });
  document.getElementById('eped-new-service').value = '';
  document.getElementById('eped-new-url').value = '';
  epedRenderLinks();
}

async function epedSave() {
  epedCollectLinks(); // capture any unsaved URL edits before saving

  const animeId  = document.getElementById('eped-anime-id').value;
  const epNum    = document.getElementById('eped-ep-num').value;
  const imageUrl = document.getElementById('eped-image').value.trim();
  const synopsis = document.getElementById('eped-synopsis').value.trim();
  const links    = _editorLinks
    .map(l => ({ service: l.service || l.key, url: l.url }))
    .filter(l => l.url);

  const saveBtn = document.querySelector('#ep-editor-modal .btn-primary');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  try {
    const res  = await fetch((window.__siteUrl || '') + '/api/episode_override.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anime_id: parseInt(animeId), episode_num: parseInt(epNum), image_url: imageUrl, synopsis, watch_links: links }),
    });
    const data = await res.json();
    if (!data.success) { alert('Error: ' + (data.error || 'Unknown')); return; }

    // Update local cache so the view modal reflects changes immediately
    const cacheKey = `${animeId}-${epNum}`;
    _epCache[cacheKey] = { synopsis, thumb: imageUrl, watchLinks: _editorLinks.map(l => ({...l})) };

    // Auto-fill watch links to all other episodes if there are any
    if (links.length > 0) {
      const doAll = confirm('Apply these watch links to ALL episodes of this anime?');
      if (doAll) {
        // Collect all episode numbers from the DOM ep-cards (anime.php)
        const domEpNums = Array.from(document.querySelectorAll('.ep-card[data-epnum]'))
          .map(c => parseInt(c.dataset.epnum))
          .filter(n => !isNaN(n) && n !== parseInt(epNum));

        // Fetch existing DB overrides (to preserve image/synopsis) + total_eps
        const allRes  = await fetch((window.__siteUrl || '') + '/api/episode_override.php?anime_id=' + animeId + '&all=1');
        const allData = await allRes.json();
        const existing = allData.overrides || [];
        const totalEps = allData.total_eps || 0;
        const existingMap = {};
        existing.forEach(r => { existingMap[parseInt(r.episode_num)] = r; });

        // Build full episode range from total_eps, fall back to DOM + DB union
        let allEpNums;
        if (totalEps > 0) {
          allEpNums = Array.from({ length: totalEps }, (_, i) => i + 1).filter(n => n !== parseInt(epNum));
        } else {
          const dbEpNums = existing.map(r => parseInt(r.episode_num)).filter(n => n !== parseInt(epNum));
          allEpNums = [...new Set([...domEpNums, ...dbEpNums])];
        }

        await Promise.all(
          allEpNums.map(n => {
            const row = existingMap[n] || {};
            return fetch((window.__siteUrl || '') + '/api/episode_override.php', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                anime_id:    parseInt(animeId),
                episode_num: n,
                image_url:   row.image_url || '',
                synopsis:    row.synopsis  || '',
                watch_links: links,
              }),
            });
          })
        );
        showToast('Watch links applied to ' + allEpNums.length + ' episodes!', 'success');
      }
    }

    closeModal('ep-editor-modal');
    showToast('Episode saved!', 'success');
  } catch(e) {
    alert('Network error: ' + e.message);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
  }
}

// ── Intercept clicks on links to protected pages ─────────────
// When a guest clicks a link that would server-redirect to login,
// we catch it here and show the popup instead.
(function() {
  // Pages that call Auth::requireLogin() server-side
  const PROTECTED = [
    '/feed.php', '/pages/feed.php',
    '/mylist.php', '/pages/mylist.php',
    '/favorites.php', '/pages/favorites.php',
    '/profile.php', '/pages/profile.php',
    '/notifications.php', '/pages/notifications.php',
    '/importexport.php', '/pages/importexport.php',
    '/pages/wrapped.php',
  ];

  document.addEventListener('click', function(e) {
    if (window.__loggedIn) return;           // logged-in users: pass through
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript')) return;
    // Normalise: strip origin so we compare paths only
    let path = href;
    try { path = new URL(href, location.href).pathname; } catch(_) {}
    const isProtected = PROTECTED.some(p => path === p || path.endsWith(p));
    if (!isProtected) return;
    e.preventDefault();
    window.__authRedirect = href; // full href preserves query strings
    authSwitchTab('login');
    openModal('auth-modal');
  }, true); // capture phase so we fire before other handlers
})();

// ── Search Suggestions ──────────────────────────────────────────────────────
(function () {
  let _cache = {};
  let _userCache = {};
  let _debounceTimer = null;

  async function fetchSuggestions(query) {
    const q = query.trim();
    if (!q || q.length < 1) return [];
    if (_cache[q]) return _cache[q];
    try {
      const res = await fetch(`/api/search_suggest.php?q=${encodeURIComponent(q)}`);
      if (!res.ok) return [];
      const results = await res.json();
      _cache[q] = results;
      return results;
    } catch (e) {
      return [];
    }
  }

  async function fetchUserSuggestions(query) {
    const q = query.trim();
    if (!q || q.length < 2) return [];
    if (_userCache[q]) return _userCache[q];
    try {
      const res = await fetch(`/api/user_suggest.php?q=${encodeURIComponent(q)}`);
      if (!res.ok) return [];
      const results = await res.json();
      _userCache[q] = results;
      return results;
    } catch (e) {
      return [];
    }
  }

  function buildUserAvatar(u) {
    if (u.avatar_url) {
      return `<img class="search-sugg-img" src="${u.avatar_url}" alt="" loading="lazy" style="border-radius:50%;">`;
    }
    return `<div class="search-sugg-img search-sugg-initial">${u.initial}</div>`;
  }

  function buildDropdown(animeItems, userItems, query) {
    const hasAnime = animeItems.length > 0;
    const hasUsers = userItems.length > 0;

    if (!hasAnime && !hasUsers) {
      return `<div class="search-sugg-empty">No results for "${query}"</div>`;
    }

    let html = '';

    if (hasAnime) {
      html += `<div class="search-sugg-section-label">Anime</div>`;
      html += animeItems.map(a => {
        const meta = [a.type, a.year].filter(Boolean).join(' · ');
        return `<a class="search-sugg-item" href="/pages/anime.php?id=${a.mal_id}">
          <img class="search-sugg-img" src="${a.image}" alt="" loading="lazy">
          <div class="search-sugg-info">
            <div class="search-sugg-title">${a.title}</div>
            ${meta ? `<div class="search-sugg-meta">${meta}</div>` : ''}
          </div>
          ${a.score ? `<div class="search-sugg-score">★ ${a.score}</div>` : ''}
        </a>`;
      }).join('');
    }

    if (hasUsers) {
      html += `<div class="search-sugg-section-label">Users</div>`;
      html += userItems.map(u => {
        const roleBadge = u.role === 'admin' ? `<span class="search-sugg-role search-sugg-role--admin">Admin</span>` : '';
        return `<a class="search-sugg-item search-sugg-item--user" href="/u/${encodeURIComponent(u.username)}">
          ${buildUserAvatar(u)}
          <div class="search-sugg-info">
            <div class="search-sugg-title">${u.username}</div>
            ${roleBadge}
          </div>
        </a>`;
      }).join('');
    }

    return html;
  }

  function attachSuggestions(input, dropdownEl) {
    let activeIdx = -1;
    let currentAnime = [];
    let currentUsers = [];
    // keep backward compat alias
    let currentItems = [];

    function show(html) {
      if (input._positionDropdown) input._positionDropdown();
      dropdownEl.innerHTML = html;
      dropdownEl.style.display = 'block';
    }
    function hide() {
      dropdownEl.innerHTML = '';
      dropdownEl.style.display = 'none';
      activeIdx = -1;
    }

    input.addEventListener('input', () => {
      const q = input.value.trim();
      activeIdx = -1;
      if (!q || q.length < 1) { hide(); return; }
      clearTimeout(_debounceTimer);
      show('<div class="search-sugg-loading">Searching…</div>');
      _debounceTimer = setTimeout(async () => {
        const [animeItems, userItems] = await Promise.all([
          fetchSuggestions(q),
          fetchUserSuggestions(q),
        ]);
        currentAnime = animeItems;
        currentUsers = userItems;
        currentItems = animeItems; // backward compat
        show(buildDropdown(animeItems, userItems, q));
      }, 280);
    });

    input.addEventListener('keydown', e => {
      const links = dropdownEl.querySelectorAll('.search-sugg-item');
      if (!links.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, links.length - 1);
        links.forEach((l, i) => l.classList.toggle('active', i === activeIdx));
        links[activeIdx]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, -1);
        links.forEach((l, i) => l.classList.toggle('active', i === activeIdx));
        if (activeIdx >= 0) links[activeIdx]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault();
        window.location.href = links[activeIdx].href;
      } else if (e.key === 'Escape') {
        hide();
      }
    });

    // Close when clicking outside
    document.addEventListener('click', e => {
      if (!input.contains(e.target) && !dropdownEl.contains(e.target)) hide();
    });

    // Keep open on dropdown click (navigation handled by <a> href)
    dropdownEl.addEventListener('mousedown', e => e.preventDefault());

    input.addEventListener('focus', () => {
      if (input.value.trim().length >= 1 && (currentAnime.length || currentUsers.length)) {
        show(buildDropdown(currentAnime, currentUsers, input.value.trim()));
      }
    });
  }

  function attachDropdownToForm(input, formEl) {
    if (!input || !formEl) return null;
    // Make the form the positioning parent
    formEl.style.position = 'relative';
    const dropdown = document.createElement('div');
    dropdown.className = 'search-suggestions';
    dropdown.style.display = 'none';
    // Append AFTER the form so it isn't clipped by any form overflow
    formEl.parentNode.insertBefore(dropdown, formEl.nextSibling);
    // Position it to align with the form
    function positionDropdown() {
      const fRect = formEl.getBoundingClientRect();
      const pRect = formEl.parentNode.getBoundingClientRect();
      dropdown.style.position = 'absolute';
      dropdown.style.left = (fRect.left - pRect.left) + 'px';
      dropdown.style.top = (fRect.bottom - pRect.top + 6) + 'px';
      dropdown.style.width = fRect.width + 'px';
    }
    // Make parent relative if it isn't already
    const parent = formEl.parentNode;
    if (getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }
    input._positionDropdown = positionDropdown;
    return dropdown;
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Navbar search
    const navForm = document.getElementById('nav-search-form');
    const navInput = navForm && navForm.querySelector('input');
    if (navInput && navForm) {
      const dd = attachDropdownToForm(navInput, navForm);
      attachSuggestions(navInput, dd);
    }

    // Mobile menu search
    const mobileForm = document.getElementById('mobile-search-form');
    const mobileInput = mobileForm && mobileForm.querySelector('input');
    if (mobileInput && mobileForm) {
      const dd = attachDropdownToForm(mobileInput, mobileForm);
      attachSuggestions(mobileInput, dd);
    }

    // Mobile search popup
    const popupForm = document.getElementById('search-popup-form');
    const popupInput = document.getElementById('search-popup-input');
    if (popupInput && popupForm) {
      const dd = attachDropdownToForm(popupInput, popupForm);
      attachSuggestions(popupInput, dd);
    }
  });
})();
