/* ============================================================
   星の光の宿 BIEI — CMS Shared Logic
   全画像に「編集」ボタンを表示する方式
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

const SETTINGS_KEY = 'biei_settings';

function settingsLoad() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; }
}

/* ---------- 適用（ページ読み込み時）---------- */
function cmsApply() {
  const data = cmsLoad();

  /* 通常テキスト・画像 */
  document.querySelectorAll('[data-editable]').forEach(el => {
    const field = el.dataset.field;
    if (!field || !data[field]) return;
    if (el.tagName === 'IMG') el.src = data[field];
    else if (el.dataset.editableType === 'html') el.innerHTML = data[field];
    else el.textContent = data[field];
  });

  /* 背景・全幅画像 */
  document.querySelectorAll('[data-bg-field]').forEach(el => {
    const field = el.dataset.bgField;
    if (!field || !data[field]) return;
    if (el.tagName === 'IMG') el.src = data[field];
  });

  /* サイト設定（住所・TEL・メール等）の反映 */
  applySettings();
}

function applySettings() {
  const s = settingsLoad();
  if (!Object.keys(s).length) return;

  /* data-setting="address/tel/email" 要素 */
  document.querySelectorAll('[data-setting]').forEach(el => {
    const key = el.dataset.setting;
    if (!s[key]) return;
    if (key === 'address') {
      /* 住所: 〒 + 改行を保持しつつ上書き */
      el.innerHTML = s[key].replace(/\n/g, '<br>');
    } else if (key === 'tel') {
      /* 電話: 後半の受付時間テキストは保持 */
      el.innerHTML = s[key] + '<br>（受付時間：9:00〜20:00）';
    } else {
      el.textContent = s[key];
    }
  });

  /* フッターの <address data-setting-address> 要素 */
  document.querySelectorAll('[data-setting-address]').forEach(el => {
    const addr = s.address || '';
    const tel  = s.tel   || '';
    const mail = s.email || '';
    const lines = [];
    if (addr) lines.push(addr.replace(/\n/g, '<br>'));
    if (tel || mail) lines.push('');
    if (tel)  lines.push('TEL: ' + tel);
    if (mail) lines.push('Mail: ' + mail);
    if (lines.length) el.innerHTML = lines.join('<br>');
  });

  /* Googleマップ: 住所が設定されていれば iframe src を更新（APIキー不要） */
  if (s.address) {
    const mapFrame = document.getElementById('access-map-iframe');
    if (mapFrame) {
      const encoded = encodeURIComponent(s.address);
      mapFrame.src = 'https://maps.google.com/maps?q=' + encoded + '&output=embed&hl=ja';
    }
  }
}

/* ---------- 管理者判定 ---------- */
function isAdmin() { return sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true'; }

/* ---------- 画像編集ボタンの注入・削除 ---------- */
function injectEditButtons() {
  /* 既存ボタンをクリア */
  document.querySelectorAll('.cms-img-edit-btn').forEach(b => b.remove());

  /* 通常画像 (data-editable IMG) */
  document.querySelectorAll('[data-editable]').forEach(el => {
    if (el.tagName !== 'IMG') return;
    attachEditButton(el, 'normal');
  });

  /* 背景・全幅画像 (data-bg-field IMG) */
  document.querySelectorAll('[data-bg-field]').forEach(el => {
    if (el.tagName !== 'IMG') return;
    attachEditButton(el, 'bg');
  });
}

function removeEditButtons() {
  document.querySelectorAll('.cms-img-edit-btn').forEach(b => b.remove());
}

function attachEditButton(img, type) {
  /* ボタン生成 */
  const btn = document.createElement('button');
  btn.className = 'cms-img-edit-btn';
  btn.innerHTML = '✎ 編集';
  btn.type = 'button';

  /* ボタンをbody直下に追加し、fixed座標で配置 */
  btn.style.position = 'fixed';
  document.body.appendChild(btn);

  /* viewport基準(fixed)で座標計算 */
  function positionBtn() {
    const rect = img.getBoundingClientRect();
    btn.style.top  = (rect.top  + 8) + 'px';
    btn.style.left = (rect.left + 8) + 'px';
  }
  positionBtn();
  window.addEventListener('scroll', positionBtn);
  window.addEventListener('resize', positionBtn);

  /* クリックでファイルピッカー */
  btn.addEventListener('click', e => {
    e.stopPropagation();
    openFilePicker(file => {
      readAsDataURL(file, result => {
        img.src = result;
        const data = cmsLoad();
        if (type === 'bg') {
          data[img.dataset.bgField] = result;
        } else {
          data[img.dataset.field] = result;
        }
        cmsSave(data);
        showToast('画像を更新しました ✓');
      });
    });
  });
}

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

    if (editMode) {
      /* テキスト編集モード ON */
      document.querySelectorAll('[data-editable]').forEach(el => {
        if (el.tagName !== 'IMG') {
          el.classList.add('edit-mode');
          el.contentEditable = 'true';
        }
      });
      /* 画像編集ボタン表示 */
      injectEditButtons();
    } else {
      /* テキスト編集モード OFF */
      document.querySelectorAll('[data-editable]').forEach(el => {
        if (el.tagName !== 'IMG') {
          el.classList.remove('edit-mode');
          el.contentEditable = 'false';
        }
      });
      /* 画像編集ボタン削除 */
      removeEditButtons();
    }

    editBtn.textContent = editMode ? 'EDITING...' : 'EDIT PAGE';
    if (saveBtn) saveBtn.style.display = editMode ? 'inline-block' : 'none';
  });

  /* ---- SAVE ボタン ---- */
  saveBtn?.addEventListener('click', () => {
    const data = cmsLoad();

    document.querySelectorAll('[data-editable]').forEach(el => {
      const f = el.dataset.field;
      if (!f) return;
      if (el.tagName === 'IMG') data[f] = el.src;
      else if (el.dataset.editableType === 'html') data[f] = el.innerHTML;
      else data[f] = el.textContent;
    });

    document.querySelectorAll('[data-bg-field]').forEach(el => {
      const f = el.dataset.bgField;
      if (!f || el.tagName !== 'IMG') return;
      data[f] = el.src;
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

document.addEventListener('DOMContentLoaded', () => {
  cmsApply();
  initAdminBar();

  /* ダッシュボードから編集ページに遷移した場合、自動でEDIT MODEを起動 */
  const EDIT_TRIGGER_KEY = 'biei_admin_edit_trigger';
  if (isAdmin() && sessionStorage.getItem(EDIT_TRIGGER_KEY) === 'true') {
    sessionStorage.removeItem(EDIT_TRIGGER_KEY);
    setTimeout(() => {
      const editBtn = document.querySelector('[data-action="edit"]');
      if (editBtn) editBtn.click();
    }, 500);
  }
});
