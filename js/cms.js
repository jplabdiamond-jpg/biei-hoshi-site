/* ============================================================
   星の光の宿 BIEI — CMS Shared Logic
   通常画像 (data-editable + data-field) および
   背景・全幅画像 (data-bg-field) の両方に対応
   ============================================================ */
'use strict';

const CMS_KEY           = 'biei_cms_content';
const ADMIN_SESSION_KEY = 'biei_admin_session';

/* ---------- ストレージ ---------- */
function cmsLoad() {
  try { return JSON.parse(localStorage.getItem(CMS_KEY) || '{}'); } catch { return {}; }
}
function cmsSave(data) {
  try {
    localStorage.setItem(CMS_KEY, JSON.stringify(data));
    localStorage.setItem('biei_last_save', new Date().toISOString());
  } catch(e) { console.error('CMS save:', e); }
}

/* ---------- 適用（ページ読み込み時）----------
   ① [data-editable][data-field]   → テキスト / 通常img の src
   ② [data-bg-field]               → img の src のみ上書き（style継続）
---------------------------------------------------------------- */
function cmsApply() {
  const data = cmsLoad();

  /* ① 通常テキスト・画像 */
  document.querySelectorAll('[data-editable]').forEach(el => {
    const field = el.dataset.field;
    if (!field || !data[field]) return;
    if (el.tagName === 'IMG') el.src = data[field];
    else if (el.dataset.editableType === 'html') el.innerHTML = data[field];
    else el.textContent = data[field];
  });

  /* ② 背景・全幅画像（banner-full / page-hero 等） */
  document.querySelectorAll('[data-bg-field]').forEach(el => {
    const field = el.dataset.bgField;
    if (!field || !data[field]) return;
    if (el.tagName === 'IMG') {
      /* srcだけ更新。style(object-fit/position等)は保持 */
      el.src = data[field];
    }
  });
}

/* ---------- 管理者判定 ---------- */
function isAdmin() { return sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true'; }

/* ---------- 管理バー初期化 ---------- */
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

  /* ---- EDIT ボタン ---- */
  editBtn?.addEventListener('click', () => {
    editMode = !editMode;

    /* 通常テキスト・画像 */
    document.querySelectorAll('[data-editable]').forEach(el => {
      if (el.tagName === 'IMG') {
        el.classList.toggle('edit-mode', editMode);
        el.style.cursor = editMode ? 'pointer' : '';
        if (editMode) el.addEventListener('click', imgClickHandler);
        else          el.removeEventListener('click', imgClickHandler);
      } else {
        el.classList.toggle('edit-mode', editMode);
        el.contentEditable = editMode ? 'true' : 'false';
      }
    });

    /* 背景・全幅画像 */
    document.querySelectorAll('[data-bg-field]').forEach(el => {
      if (el.tagName === 'IMG') {
        el.classList.toggle('edit-mode-bg', editMode);
        el.style.cursor = editMode ? 'pointer' : '';
        if (editMode) el.addEventListener('click', bgImgClickHandler);
        else          el.removeEventListener('click', bgImgClickHandler);
      }
    });

    editBtn.textContent = editMode ? 'EDITING...' : 'EDIT PAGE';
    if (saveBtn) saveBtn.style.display = editMode ? 'inline-block' : 'none';
  });

  /* ---- SAVE ボタン ---- */
  saveBtn?.addEventListener('click', () => {
    const data = cmsLoad();

    /* 通常テキスト・画像 */
    document.querySelectorAll('[data-editable]').forEach(el => {
      const f = el.dataset.field;
      if (!f) return;
      if (el.tagName === 'IMG') data[f] = el.src;
      else if (el.dataset.editableType === 'html') data[f] = el.innerHTML;
      else data[f] = el.textContent;
    });

    /* 背景・全幅画像 */
    document.querySelectorAll('[data-bg-field]').forEach(el => {
      const f = el.dataset.bgField;
      if (!f) return;
      if (el.tagName === 'IMG') data[f] = el.src;
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

/* ---------- 通常画像クリックハンドラ ---------- */
function imgClickHandler(e) {
  e.stopPropagation();
  const img = e.currentTarget;
  openFilePicker(file => {
    readAsDataURL(file, result => {
      img.src = result;
      const data = cmsLoad();
      data[img.dataset.field] = result;
      cmsSave(data);
      showToast('画像を更新しました ✓');
    });
  });
}

/* ---------- 背景・全幅画像クリックハンドラ ----------
   src のみ差し替え。style / class はそのまま保持。
-------------------------------------------------------- */
function bgImgClickHandler(e) {
  e.stopPropagation();
  const img = e.currentTarget;

  /* クリック時にオーバーレイUIを表示 */
  showBgEditOverlay(img);
}

function showBgEditOverlay(img) {
  /* 既存オーバーレイを削除 */
  document.querySelector('.cms-bg-overlay')?.remove();

  const rect = img.getBoundingClientRect();
  const overlay = document.createElement('div');
  overlay.className = 'cms-bg-overlay';
  overlay.style.cssText = [
    'position:fixed',
    `top:${rect.top + window.scrollY}px`,
    `left:${rect.left}px`,
    `width:${rect.width}px`,
    `height:${rect.height}px`,
    'background:rgba(0,0,0,0.55)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'z-index:8000',
    'cursor:pointer',
    'transition:opacity .3s',
  ].join(';');

  const label = document.createElement('div');
  label.style.cssText = 'color:#c4a882;font-family:"Cormorant Garamond",serif;font-size:14px;letter-spacing:.2em;text-align:center;pointer-events:none;';
  label.innerHTML = '📷<br>クリックして画像を変更';
  overlay.appendChild(label);

  /* 親要素に position:relative が必要 */
  const parent = img.parentElement;
  const origPos = getComputedStyle(parent).position;
  if (origPos === 'static') parent.style.position = 'relative';

  /* スクロール位置基準に変える */
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.zIndex = '8000';
  parent.appendChild(overlay);

  overlay.addEventListener('click', () => {
    openFilePicker(file => {
      readAsDataURL(file, result => {
        /* srcだけ更新。style継続 */
        img.src = result;
        const data = cmsLoad();
        data[img.dataset.bgField] = result;
        cmsSave(data);
        overlay.remove();
        showToast('背景画像を更新しました ✓');
      });
    });
  });

  /* オーバーレイ外クリックで閉じる */
  setTimeout(() => {
    document.addEventListener('click', function closeOverlay(ev) {
      if (!overlay.contains(ev.target) && ev.target !== img) {
        overlay.remove();
        document.removeEventListener('click', closeOverlay);
      }
    });
  }, 100);
}

/* ---------- ユーティリティ ---------- */
function openFilePicker(callback) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => { if (input.files[0]) callback(input.files[0]); };
  input.click();
}

function readAsDataURL(file, callback) {
  const reader = new FileReader();
  reader.onload = ev => callback(ev.target.result);
  reader.readAsDataURL(file);
}

function showToast(msg) {
  let t = document.querySelector('.cms-toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'cms-toast';
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(20px);background:#1a1a1a;color:#c4a882;padding:12px 28px;font-size:13px;letter-spacing:.08em;z-index:9999;opacity:0;transition:all .4s cubic-bezier(.25,.46,.45,.94);pointer-events:none;border:1px solid rgba(196,168,130,0.3);';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  requestAnimationFrame(() => { t.style.opacity='1'; t.style.transform='translateX(-50%) translateY(0)'; });
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(-50%) translateY(20px)'; }, 3000);
}

document.addEventListener('DOMContentLoaded', () => { cmsApply(); initAdminBar(); });
