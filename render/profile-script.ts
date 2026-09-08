export const PROFILE_SCRIPT = `let cropShape  = 'circle';
let imgNatW    = 0, imgNatH = 0;
let imgDispW   = 0, imgDispH = 0;
let zoomLevel  = 1;
let cropMediaType = 'image';
let gifCropTempId = '';
let cropX = 0,  cropY = 0;
let cropW = 0,  cropH = 0;
let dragging   = false;
let resizing   = false;
let dragStartX = 0, dragStartY = 0;
let resizeCorner = '';
let resizeStartX = 0, resizeStartY = 0;
let resizeStartCrop = {};
const minCropSize = 70;

async function handleAvatarFile(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const status = document.getElementById('avatar-status');
  status.textContent = 'Loading...';

  if (file.type === 'image/gif') {
    await openGifCropper(file, status);
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('crop-img');
    img.onload = () => {
      imgNatW = img.naturalWidth;
      imgNatH = img.naturalHeight;
      cropMediaType = 'image';
      gifCropTempId = '';
      openCropper();
      status.textContent = '';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function openGifCropper(file, status) {
  const fd = new FormData();
  fd.append('avatar', file);
  status.textContent = 'Preparing GIF...';

  try {
    const res = await fetch((window.__siteUrl || '') + '/api/upload_avatar.php', {method:'POST', body:fd});
    const data = await res.json();
    if (data.success && data.mode === 'crop') {
      const img = document.getElementById('crop-img');
      img.onload = () => {
        imgNatW = data.width || img.naturalWidth;
        imgNatH = data.height || img.naturalHeight;
        cropMediaType = 'gif';
        gifCropTempId = data.temp_id || '';
        openCropper();
        status.textContent = '';
      };
      img.src = data.image_url || data.image_data;
    } else {
      status.textContent = '';
      showToast(data.message || 'Upload failed', 'error');
    }
  } catch (e) {
    status.textContent = '';
    showToast('Upload failed', 'error');
  }
}

function openCropper() {
  document.getElementById('cropper-modal').classList.add('open');
  document.getElementById('zoom-slider').value = 1;
  zoomLevel = 1;
  requestAnimationFrame(() => {
    fitCropperToImage();
    initCropBox();
  });
}

function closeCropper() {
  document.getElementById('cropper-modal').classList.remove('open');
}

function fitCropperToImage() {
  const modal = document.querySelector('.avatar-cropper-modal');
  const stage = document.getElementById('crop-stage');
  const img = document.getElementById('crop-img');
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const chromeW = viewportW <= 620 ? 34 : 44;
  const chromeH = viewportW <= 620 ? 330 : 245;
  const availableW = Math.max(220, viewportW - chromeW);
  const availableH = Math.max(180, viewportH - chromeH);
  const maxMediaW = Math.min(imgNatW, availableW, 960);
  const maxMediaH = Math.min(imgNatH, availableH, Math.round(viewportH * 0.62), 620);
  const fit = Math.min(maxMediaW / imgNatW, maxMediaH / imgNatH, 1);
  let displayW = imgNatW * fit;
  let displayH = imgNatH * fit;
  const minSide = Math.min(displayW, displayH);
  if (minSide < 180) {
    const grow = Math.min(180 / minSide, maxMediaW / displayW, maxMediaH / displayH);
    displayW *= grow;
    displayH *= grow;
  }
  displayW = Math.round(displayW);
  displayH = Math.round(displayH);
  const modalW = Math.min(viewportW - 16, Math.max(displayW + 28, viewportW <= 620 ? 320 : 540));

  modal.style.width = modalW + 'px';
  stage.style.width = displayW + 'px';
  stage.style.height = displayH + 'px';
  stage.style.maxHeight = Math.max(180, availableH) + 'px';
  img.style.width = displayW + 'px';
  img.style.height = displayH + 'px';
  img.style.maxWidth = 'none';
  img.style.maxHeight = 'none';
  img.style.objectFit = 'contain';
  img.style.transform = 'scale(1)';
}

function initCropBox() {
  const img   = document.getElementById('crop-img');
  imgDispW    = img.offsetWidth;
  imgDispH    = img.offsetHeight;

  const limits = getCropLimits();
  const size = Math.max(getMinCropSize(limits), Math.round(Math.min(limits.w, limits.h) * 0.72));
  cropW = size; cropH = size;
  cropX = Math.round(limits.x + (limits.w - size) / 2);
  cropY = Math.round(limits.y + (limits.h - size) / 2);
  applyCropBox();
  updatePreview();
}

function getImageRect(clipped = false) {
  const stage = document.getElementById('crop-stage');
  const img = document.getElementById('crop-img');
  const baseLeft = img.offsetLeft;
  const baseTop = img.offsetTop;
  const scaledW = imgDispW * zoomLevel;
  const scaledH = imgDispH * zoomLevel;
  const rect = {
    x: baseLeft - (scaledW - imgDispW) / 2,
    y: baseTop - (scaledH - imgDispH) / 2,
    w: scaledW,
    h: scaledH
  };

  if (!clipped) return rect;

  const x1 = Math.max(0, rect.x);
  const y1 = Math.max(0, rect.y);
  const x2 = Math.min(stage.offsetWidth, rect.x + rect.w);
  const y2 = Math.min(stage.offsetHeight, rect.y + rect.h);
  return {x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1)};
}

function getCropLimits() { return getImageRect(true); }

function getMinCropSize(limits = getCropLimits()) {
  return Math.max(1, Math.min(minCropSize, limits.w, limits.h));
}

function clampCropToImage(size = cropW, x = cropX, y = cropY) {
  const limits = getCropLimits();
  const maxSize = Math.max(1, Math.min(limits.w, limits.h));
  const nextSize = Math.max(getMinCropSize(limits), Math.min(size, maxSize));
  return {
    size: nextSize,
    x: Math.max(limits.x, Math.min(x, limits.x + limits.w - nextSize)),
    y: Math.max(limits.y, Math.min(y, limits.y + limits.h - nextSize))
  };
}

function getCropSourceRect() {
  const imageRect = getImageRect();
  const scaleX = imgNatW / imageRect.w;
  const scaleY = imgNatH / imageRect.h;
  return {
    x: Math.max(0, Math.round((cropX - imageRect.x) * scaleX)),
    y: Math.max(0, Math.round((cropY - imageRect.y) * scaleY)),
    w: Math.max(1, Math.round(cropW * scaleX)),
    h: Math.max(1, Math.round(cropH * scaleY))
  };
}

function applyCropBox() {
  const box = document.getElementById('crop-box');
  box.style.left   = cropX + 'px';
  box.style.top    = cropY + 'px';
  box.style.width  = cropW + 'px';
  box.style.height = cropH + 'px';
  box.style.borderRadius = cropShape === 'circle' ? '50%' : '4px';
}

function applyZoom(val) {
  zoomLevel = parseFloat(val);
  const img = document.getElementById('crop-img');
  img.style.transform = \`scale(\${zoomLevel})\`;
  img.style.transformOrigin = 'center center';
  const next = clampCropToImage();
  cropX = next.x; cropY = next.y; cropW = next.size; cropH = next.size;
  applyCropBox();
  updatePreview();
}

function setShape(s) {
  cropShape = s;
  document.getElementById('shape-circle').style.borderColor = s === 'circle' ? 'var(--accent)' : 'var(--border)';
  document.getElementById('shape-square').style.borderColor = s === 'square' ? 'var(--accent)' : 'var(--border)';
  applyCropBox();
  updatePreview();
}

function updatePreview() {
  ['crop-preview','crop-preview-sq'].forEach((id, i) => {
    const canvas = document.getElementById(id);
    const ctx    = canvas.getContext('2d');
    const img    = document.getElementById('crop-img');
    const source = getCropSourceRect();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    if (i === 0) {
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2, 0, Math.PI * 2);
      ctx.clip();
    }
    ctx.drawImage(img, source.x, source.y, source.w, source.h, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  });
}

const cropBox = document.getElementById('crop-box');
const cropperModal = document.getElementById('cropper-modal');

if (cropperModal) {
  cropperModal.addEventListener('click', e => {
    if (e.target === cropperModal) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
}

cropBox.addEventListener('mousedown', e => {
  if (e.target.classList.contains('crop-handle')) return;
  dragging   = true;
  dragStartX = e.clientX - cropX;
  dragStartY = e.clientY - cropY;
  e.preventDefault();
});

document.addEventListener('mousemove', e => {
  if (dragging) {
    const next = clampCropToImage(cropW, e.clientX - dragStartX, e.clientY - dragStartY);
    cropX = next.x;
    cropY = next.y;
    applyCropBox(); updatePreview();
  }
  if (resizing) {
    resizeCrop(e.clientX, e.clientY);
  }
});

document.addEventListener('mouseup', () => { dragging = false; resizing = false; });

document.querySelectorAll('.crop-handle').forEach(handle => {
  handle.addEventListener('mousedown', e => {
    resizing     = true;
    resizeCorner = e.target.dataset.corner;
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    resizeStartCrop = {x:cropX, y:cropY, w:cropW, h:cropH};
    e.stopPropagation();
    e.preventDefault();
  });
});

function resizeCrop(clientX, clientY) {
  const limits = getCropLimits();
  const dx = clientX - resizeStartX;
  const dy = clientY - resizeStartY;
  const {x, y, w, h} = resizeStartCrop;
  const maxSize = Math.min(limits.w, limits.h);
  let delta = 0;

  if (resizeCorner === 'se') delta = Math.max(dx, dy);
  if (resizeCorner === 'sw') delta = Math.max(-dx, dy);
  if (resizeCorner === 'ne') delta = Math.max(dx, -dy);
  if (resizeCorner === 'nw') delta = Math.max(-dx, -dy);

  let size = Math.max(getMinCropSize(limits), Math.min(maxSize, w + delta));
  let nx = x;
  let ny = y;
  if (resizeCorner.includes('w')) nx = x + w - size;
  if (resizeCorner.includes('n')) ny = y + h - size;

  if (nx < limits.x) { size += nx - limits.x; nx = limits.x; }
  if (ny < limits.y) { size += ny - limits.y; ny = limits.y; }
  if (nx + size > limits.x + limits.w) size = limits.x + limits.w - nx;
  if (ny + size > limits.y + limits.h) size = limits.y + limits.h - ny;
  const next = clampCropToImage(size, nx, ny);

  cropX = next.x; cropY = next.y; cropW = next.size; cropH = next.size;
  applyCropBox();
  updatePreview();
}

cropBox.addEventListener('touchstart', e => {
  const t = e.touches[0];
  if (e.target.classList.contains('crop-handle')) {
    resizing = true;
    resizeCorner = e.target.dataset.corner;
    resizeStartX = t.clientX;
    resizeStartY = t.clientY;
    resizeStartCrop = {x:cropX, y:cropY, w:cropW, h:cropH};
    e.preventDefault();
    return;
  }
  dragging = true; dragStartX = t.clientX - cropX; dragStartY = t.clientY - cropY;
  e.preventDefault();
}, {passive:false});

document.addEventListener('touchmove', e => {
  if (!dragging && !resizing) return;
  const t = e.touches[0];
  if (dragging) {
    const next = clampCropToImage(cropW, t.clientX - dragStartX, t.clientY - dragStartY);
    cropX = next.x;
    cropY = next.y;
    applyCropBox(); updatePreview();
  }
  if (resizing) {
    resizeCrop(t.clientX, t.clientY);
  }
  e.preventDefault();
}, {passive:false});

document.addEventListener('touchend', () => { dragging=false; resizing=false; });

async function saveCrop() {
  const btn = document.getElementById('save-crop-btn');
  btn.disabled = true; btn.textContent = 'Saving...';

  const img    = document.getElementById('crop-img');
  const source = getCropSourceRect();
  const fd = new FormData();

  if (cropMediaType === 'gif') {
    fd.append('gif_crop_temp_id', gifCropTempId);
    fd.append('crop_x', source.x);
    fd.append('crop_y', source.y);
    fd.append('crop_w', source.w);
    fd.append('crop_h', source.h);
  } else {
    const canvas = document.createElement('canvas');
    const size   = 300;
    canvas.width = size; canvas.height = size;
    const ctx    = canvas.getContext('2d');
    ctx.drawImage(img, source.x, source.y, source.w, source.h, 0, 0, size, size);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    fd.append('cropped_data', dataUrl);
  }

  try {
    const res  = await fetch((window.__siteUrl || '') + '/api/upload_avatar.php', {method:'POST', body:fd});
    const data = await res.json();
    if (data.success) {
      updateAvatarImages(data.avatar_url);
      showToast('Avatar saved!', 'success');
      closeCropper();
      document.getElementById('avatar-status').textContent = '';
    } else {
      showToast(data.message, 'error');
    }
  } catch(e) {
    showToast('Upload failed', 'error');
  }

  btn.disabled = false; btn.textContent = 'Apply';
}

async function deleteAvatar() {
  if (!confirm('Remove your current avatar? You will show your initial instead.')) return;
  const btn = document.getElementById('delete-avatar-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Removing…'; }

  try {
    const fd = new FormData();
    fd.append('action', 'delete_avatar');
    const res  = await fetch((window.__siteUrl || '') + '/api/upload_avatar.php', {method:'POST', body:fd});
    const data = await res.json();
    if (data.success) {
      // Swap avatar image back to initials
      document.querySelectorAll('#sidebar-avatar-img').forEach(img => {
        img.src = ''; img.style.display = 'none';
      });
      document.querySelectorAll('#sidebar-avatar-initials').forEach(el => el.style.display = '');
      document.querySelectorAll('.nav-avatar img').forEach(img => img.style.display = 'none');
      if (btn) btn.style.display = 'none';
      showToast('Avatar removed.', 'success');
    } else {
      showToast(data.message || 'Failed to remove avatar.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = '🗑️ Remove Avatar'; }
    }
  } catch (e) {
    showToast('Request failed.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = '🗑️ Remove Avatar'; }
  }
}

function updateAvatarImages(avatarUrl) {
  const newSrc = avatarUrl + '?t=' + Date.now();
  document.querySelectorAll('#sidebar-avatar-img').forEach(img => {
    img.src = newSrc; img.style.display = 'block';
  });
  document.querySelectorAll('#sidebar-avatar-initials').forEach(el => el.style.display='none');
  document.querySelectorAll('.nav-avatar img').forEach(img => {
    img.src = newSrc; img.style.display='block';
  });
}

// ── Edit username popup ─────────────────────────────────
function openUsernameModal() {
  const input = document.getElementById('username-input');
  const current = document.getElementById('profile-username-display').textContent.trim();
  input.value = current;
  const msg = document.getElementById('username-check-msg');
  msg.textContent = '';
  openModal('edit-username-modal');
  setTimeout(() => { input.focus(); input.select(); }, 50);
}

let usernameCheckTimer = null;
async function checkUsernameAvailability(value) {
  const msg = document.getElementById('username-check-msg');
  clearTimeout(usernameCheckTimer);
  const v = value.trim();
  if (!v) { msg.textContent = ''; return; }
  if (v.length < 3 || v.length > 30) { msg.textContent = 'Must be 3–30 characters.'; msg.style.color = 'var(--accent)'; return; }
  if (!/^[a-zA-Z0-9_]+$/.test(v)) { msg.textContent = 'Only letters, numbers, and underscores.'; msg.style.color = 'var(--accent)'; return; }
  msg.textContent = 'Checking…';
  msg.style.color = 'var(--text-muted)';
  usernameCheckTimer = setTimeout(async () => {
    try {
      const res  = await fetch((window.__siteUrl || '') + '/api/check_username.php?username=' + encodeURIComponent(v));
      const data = await res.json();
      if (data.available) { msg.textContent = '✓ Available'; msg.style.color = 'var(--teal)'; }
      else { msg.textContent = data.message || 'Not available'; msg.style.color = 'var(--accent)'; }
    } catch (e) { msg.textContent = ''; }
  }, 350);
}

async function saveUsername() {
  const input = document.getElementById('username-input');
  const v = input.value.trim();
  const btn = document.getElementById('save-username-btn');
  btn.disabled = true;
  try {
    const fd = new FormData();
    fd.append('username', v);
    const res  = await fetch((window.__siteUrl || '') + '/api/update_username.php', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) {
      showToast('Username updated!', 'success');
      closeModal('edit-username-modal');
      setTimeout(() => window.location.reload(), 500);
    } else {
      const msg = document.getElementById('username-check-msg');
      msg.textContent = data.message || 'Could not update username.';
      msg.style.color = 'var(--accent)';
      showToast(data.message || 'Could not update username.', 'error');
    }
  } catch (e) { showToast('Request failed.', 'error'); }
  btn.disabled = false;
}

// ── Add/edit email popup (no OTP — saves immediately) ───
function openEmailModal() {
  const input = document.getElementById('email-input');
  const displayLink = document.querySelector('#profile-email-display a');
  input.value = displayLink ? '' : document.getElementById('profile-email-display').textContent.trim();
  document.getElementById('email-check-msg').textContent = '';
  openModal('edit-email-modal');
  setTimeout(() => input.focus(), 50);
}

async function saveEmail() {
  const input = document.getElementById('email-input');
  const v = input.value.trim();
  const msg = document.getElementById('email-check-msg');
  if (!v || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v)) {
    msg.textContent = 'Enter a valid email address.';
    msg.style.color = 'var(--accent)';
    return;
  }
  const btn = document.getElementById('save-email-btn');
  btn.disabled = true;
  try {
    const fd = new FormData();
    fd.append('email', v);
    const res  = await fetch((window.__siteUrl || '') + '/api/update_email.php', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) {
      showToast('Email saved!', 'success');
      closeModal('edit-email-modal');
      setTimeout(() => window.location.reload(), 500);
    } else {
      msg.textContent = data.message || 'Could not save email.';
      msg.style.color = 'var(--accent)';
    }
  } catch (e) {
    msg.textContent = 'Request failed.';
    msg.style.color = 'var(--accent)';
  }
  btn.disabled = false;
}

// ── Banner upload/remove (edit page — mirrors the public profile's
//    handleBannerFile, but targets this page's #profile-banner-el) ─────
async function handleProfileBannerFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('banner-status');
  const bannerEl = document.getElementById('profile-banner-el');
  if (statusEl) statusEl.textContent = 'Uploading…';
  const fd = new FormData();
  fd.append('banner', file);
  try {
    const res = await fetch((window.__siteUrl || '') + '/api/upload_banner.php', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      setTimeout(() => window.location.reload(), 500);
    } else {
      if (statusEl) statusEl.textContent = '';
      showToast(data.message, 'error');
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = '';
    showToast('Upload failed', 'error');
  }
  input.value = '';
}

async function removeBanner() {
  if (!confirm('Remove your current banner?')) return;
  try {
    const fd = new FormData();
    fd.append('action', 'delete_banner');
    const res = await fetch((window.__siteUrl || '') + '/api/upload_banner.php', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) {
      showToast('Banner removed.', 'success');
      setTimeout(() => window.location.reload(), 500);
    } else {
      showToast(data.message || 'Failed to remove banner.', 'error');
    }
  } catch (e) {
    showToast('Request failed.', 'error');
  }
}

// ── Delete account ──────────────────────────────────────
function openDeleteAccountModal() {
  const input = document.getElementById('delete-account-password');
  if (input) input.value = '';
  const msg = document.getElementById('delete-account-msg');
  if (msg) msg.textContent = '';
  openModal('delete-account-modal');
  setTimeout(() => input && input.focus(), 50);
}

async function confirmDeleteAccount(hasPassword, siteUrl) {
  const input = document.getElementById('delete-account-password');
  const msg = document.getElementById('delete-account-msg');
  const v = (input.value || '').trim();
  if (!hasPassword && v.toUpperCase() !== 'DELETE') {
    msg.textContent = 'Type DELETE to confirm.';
    return;
  }
  if (hasPassword && !v) {
    msg.textContent = 'Enter your password.';
    return;
  }
  const btn = document.getElementById('confirm-delete-account-btn');
  btn.disabled = true;
  try {
    const fd = new FormData();
    if (hasPassword) fd.append('password', v);
    const res = await fetch((window.__siteUrl || '') + '/api/delete_account.php', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) {
      showToast('Account deleted.', 'success');
      setTimeout(() => window.location.href = siteUrl + '/', 700);
    } else {
      msg.textContent = data.message || 'Could not delete account.';
      btn.disabled = false;
    }
  } catch (e) {
    msg.textContent = 'Request failed.';
    btn.disabled = false;
  }
}
`;
