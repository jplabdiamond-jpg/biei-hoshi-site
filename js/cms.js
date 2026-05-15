/* ============================================================
   星の光の宿 BIEI — CMS Shared Logic
   Included on all pages
   ============================================================ */
'use strict';

const CMS_KEY = 'biei_cms_content';
const ADMIN_SESSION_KEY = 'biei_admin_session';

function cmsLoad() {
  try { return JSON.parse(localStorage.getItem(CMS_KEY) || '{}'); } catch { return {}; }
}
function cmsSave(data) {
  try {
    localStorage.setItem(CMS_KEY, JSON.stringify(data));
    localStorage.setItem('biei_last_save', new Date().toISOString());
  } catch(e) { console.error('CMS save:', e); }
}
function cmsApply() {
  const data = cmsLoad();
  document.querySelectorAll('[data-editable]').forEach(el => {
    const field = el.dataset.field;
    if (!field || !data[field]) return;
    if (el.tagName === 'IMG') el.src = data[field];
    else if (el.dataset.editableType === 'html') el.innerHTML = data[field];
    else el.textContent = data[field];
  });
}
function isAdmin() { return sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true'; }

function initAdminBar() {
  if (!isAdmin()) return;
  const bar = document.querySelector('.admin-edit-bar');
  if (!bar) return;
  bar.classList.add('active');
  let editMode = false;
  const editBtn  = bar.querySelector('[data-action="edit"]');
  const saveBtn  = bar.querySelector('[data-action="save"]');
  const exitBtn  = bar.querySelector('[data-action="exit"]');
  const mediaBtn = bar.querySelector('[data-action="media"]');

  editBtn?.addEventListener('click', () => {
    editMode = !editMode;
    document.querySelectorAll('[data-editable]').forEach(el => {
      if (el.tagName === 'IMG') {
        el.classList.toggle('edit-mode', editMode);
        el.style.cursor = editMode ? 'pointer' : '';
        if (editMode) el.addEventListener('click', imgClickHandler);
        else el.removeEventListener('click', imgClickHandler);
      } else {
        el.classList.toggle('edit-mode', editMode);
        el.contentEditable = editMode ? 'true' : 'false';
      }
    });
    editBtn.textContent = editMode ? 'EDITING...' : 'EDIT PAGE';
    if (saveBtn) saveBtn.style.display = editMode ? 'inline-block' : 'none';
  });

  saveBtn?.addEventListener('click', () => {
    const data = cmsLoad();
    document.querySelectorAll('[data-editable]').forEach(el => {
      const f = el.dataset.field;
      if (!f) return;
      if (el.tagName === 'IMG') data[f] = el.src;
      else if (el.dataset.editableType === 'html') data[f] = el.innerHTML;
      else data[f] = el.textContent;
    });
    cmsSave(data);
    showToast('コンテンツを保存しました ✓');
  });

  exitBtn?.addEventListener('click', () => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    location.reload();
  });

  mediaBtn?.addEventListener('click', () => { window.location.href = 'admin/dashboard.html'; });
  if (saveBtn) saveBtn.style.display = 'none';
}

function imgClickHandler(e) {
  const img = e.currentTarget;
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = () => {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      img.src = ev.target.result;
      const data = cmsLoad();
      data[img.dataset.field] = ev.target.result;
      cmsSave(data);
      showToast('画像を更新しました ✓');
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function showToast(msg) {
  let t = document.querySelector('.cms-toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'cms-toast';
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(20px);background:#1a1a1a;color:#fff;padding:12px 28px;font-size:13px;letter-spacing:.08em;z-index:9999;opacity:0;transition:all .4s cubic-bezier(.25,.46,.45,.94);pointer-events:none;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  requestAnimationFrame(() => { t.style.opacity='1'; t.style.transform='translateX(-50%) translateY(0)'; });
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(-50%) translateY(20px)'; }, 3000);
}

document.addEventListener('DOMContentLoaded', () => { cmsApply(); initAdminBar(); });
