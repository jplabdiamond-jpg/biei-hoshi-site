/* ============================================================
   星の光の宿 BIEI — CMS Shared Logic  v7
   データ読み込み優先順:
     1. Supabase (全デバイス共通・即時反映)
     2. localStorage (オフライン時フォールバック)
   ============================================================ */
/* ============================================================
   Supabase 設定
   ============================================================ */
var SUPABASE_URL    = 'https://yevhirgmfjdvnargaitj.supabase.co';
var SUPABASE_ANON   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlldmhpcmdtZmpkdm5hcmdhaXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MDg2NjUsImV4cCI6MjA5MzI4NDY2NX0.rksdAP956Y8I3E0y5n0PpvWddoB4-x6hLjqdr6dDIM4';

var CMS_KEY           = 'biei_cms_content';
var ADMIN_SESSION_KEY = 'biei_admin_session';
var SETTINGS_KEY      = 'biei_settings';

/* ============================================================
   Supabase API ユーティリティ
   ============================================================ */
async function sbGet(key) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/biei_cms?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows.length ? rows[0].value : null;
  } catch { return null; }
}

async function sbGetAll() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/biei_cms?select=key,value`,
      { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` } }
    );
    if (!res.ok) return {};
    const rows = await res.json();
    const out = {};
    rows.forEach(r => { out[r.key] = r.value; });
    return out;
  } catch { return {}; }
}

async function sbSet(key, value) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/biei_cms`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': `Bearer ${SUPABASE_ANON}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({ key, value })
      }
    );
    return res.ok || res.status === 201;
  } catch { return false; }
}

/* ============================================================
   localStorage フォールバック
   ============================================================ */
function cmsLoad() {
  try { return JSON.parse(localStorage.getItem(CMS_KEY) || '{}'); } catch { return {}; }
}
function cmsSave(data) {
  try {
    localStorage.setItem(CMS_KEY, JSON.stringify(data));
    localStorage.setItem('biei_last_save', new Date().toISOString());
  } catch(e) { console.error('CMS save:', e); }
}
function settingsLoad() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; }
}

/* ============================================================
   ページへの反映（非同期）
   ============================================================ */
async function cmsApply() {
  const sb = await sbGetAll();
  const hasSb = Object.keys(sb).length > 0;

  // --- テキスト・画像フィールド (data-editable / data-bg-field) ---
  const cmsContent = hasSb ? (sb.cms_content || {}) : cmsLoad();
  document.querySelectorAll('[data-editable]').forEach(el => {
    const f = el.dataset.field;
    if (!f || !cmsContent[f]) return;
    if (el.tagName === 'IMG') el.src = cmsContent[f];
    else if (el.dataset.editableType === 'html') el.innerHTML = cmsContent[f];
    // hero_title/hero_subtitle系はHTMLタグを含む可能性があるためinnerHTMLで適用
    else if (f === 'hero_title' || f === 'hero_subtitle' || f === 'hero_subtitle_sp') el.innerHTML = cmsContent[f];
    else el.textContent = cmsContent[f];
  });
  document.querySelectorAll('[data-bg-field]').forEach(el => {
    const f = el.dataset.bgField;
    if (!f || !cmsContent[f]) return;
    if (el.tagName === 'IMG') el.src = cmsContent[f];
  });

  // --- サイト設定 ---
  const settings = hasSb ? (sb.settings || {}) : settingsLoad();
  applySettings(settings);

  // --- 動的コンテンツ（JSONが空なら localStorageのデフォルトへフォールバック）---
  const newsItems = hasSb && Array.isArray(sb.news) && sb.news.length
    ? sb.news
    : _getLocalOrDefault('biei_news_list', _defaultNews());
  window._cmsNewsItems = newsItems;
  renderNewsIfPresent(newsItems);

  const faqItems = hasSb && Array.isArray(sb.faq) && sb.faq.length
    ? sb.faq
    : _getLocalOrDefault('biei_faq_items', _defaultFaq());
  window._cmsFaqItems = faqItems;
  renderFaqIfPresent(faqItems);

  const reserveNotes = hasSb && Array.isArray(sb.reserve_notes) && sb.reserve_notes.length
    ? sb.reserve_notes
    : _getLocalOrDefault('biei_reserve_notes', _defaultReserveNotes());
  renderReserveNotesIfPresent(reserveNotes);

  const bookingBtns = hasSb && Array.isArray(sb.booking_btns) && sb.booking_btns.length
    ? sb.booking_btns
    : _getLocalOrDefault('biei_booking_buttons', _defaultBookingBtns());
  renderBookingBtnsIfPresent(bookingBtns);

  const policy = hasSb && Array.isArray(sb.policy) && sb.policy.length
    ? sb.policy
    : _getLocalOrDefault('biei_policy_sections', _defaultPolicy());
  renderPolicyIfPresent(policy);

  const nearby = hasSb && Array.isArray(sb.nearby) && sb.nearby.length
    ? sb.nearby
    : _getLocalOrDefault('biei_nearby_facilities', _defaultNearby());
  renderNearbyIfPresent(nearby);

  const amenity = hasSb && Array.isArray(sb.amenity) && sb.amenity.length
    ? sb.amenity
    : _getLocalOrDefault('biei_amenity_sections', _defaultAmenity());
  renderAmenityIfPresent(amenity);
}

function _getLocalOrDefault(key, def) {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : def;
  } catch { return def; }
}

/* ============================================================
   設定の反映
   ============================================================ */
function applySettings(s) {
  if (!s || !Object.keys(s).length) return;

  document.querySelectorAll('[data-setting]').forEach(el => {
    const key = el.dataset.setting;
    if (!s[key]) return;
    if (key === 'address') {
      el.innerHTML = s[key].replace(/\n/g, '<br>');
    } else if (key === 'tel') {
      el.innerHTML = s[key] + '<br>（受付時間：9:00〜20:00）';
    } else if (key === 'checkinout') {
      el.innerHTML = s[key].replace(/\n/g, '<br>');
    } else {
      el.textContent = s[key];
    }
  });

  document.querySelectorAll('[data-setting-address]').forEach(el => {
    const addr = s.address || '';
    const tel  = s.tel   || '';
    const lines = [];
    if (addr) lines.push(addr.replace(/\n/g, '<br>'));
    if (tel)  lines.push('');
    if (tel)  lines.push('TEL: ' + tel);
    if (lines.length) el.innerHTML = lines.join('<br>');
  });

  if (s.address) {
    const mapFrame = document.getElementById('access-map-iframe');
    if (mapFrame) {
      mapFrame.src = 'https://maps.google.com/maps?q=' + encodeURIComponent(s.address) + '&output=embed&hl=ja';
    }
  }
}

/* ============================================================
   各セクションのレンダラー
   ============================================================ */
function renderNewsIfPresent(items) {
  const topWrap = document.getElementById('newsListTop');
  if (topWrap) {
    topWrap.innerHTML = items.slice(0, 4).map(item => `
      <div class="news-item">
        <span class="news-date">${item.date}</span>
        <span class="news-cat">${item.cat}</span>
        <span class="news-title">${item.title}</span>
      </div>`).join('');
  }
  const allWrap = document.getElementById('newsListAll');
  if (allWrap) {
    if (!items.length) {
      allWrap.innerHTML = '<p style="font-size:14px;color:var(--color-text-light);text-align:center;padding:40px 0;">お知らせはまだありません。</p>';
      return;
    }
    allWrap.innerHTML = items.map(item => `
      <div class="news-item">
        <span class="news-date">${item.date}</span>
        <span class="news-cat">${item.cat}</span>
        <span class="news-title">${item.title}</span>
      </div>`).join('');
  }
}

function renderFaqIfPresent(items) {
  const container = document.getElementById('faqList');
  if (!container) return;
  if (!items.length) {
    container.innerHTML = '<p style="color:var(--color-text-mid);font-size:14px;">現在、Q&Aは登録されていません。</p>';
    return;
  }
  container.innerHTML = items.map((item, i) => `
    <div class="faq-item">
      <button class="faq-q" data-idx="${i}">${item.q}</button>
      <div class="faq-a"><div class="faq-a-inner">${item.a}</div></div>
    </div>`).join('');
  container.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const ans = btn.nextElementSibling;
      const isOpen = btn.classList.toggle('open');
      ans.style.maxHeight = isOpen ? ans.scrollHeight + 'px' : '0';
    });
  });
}

function renderReserveNotesIfPresent(notes) {
  const ul = document.getElementById('reserveNotesList');
  if (!ul) return;
  ul.innerHTML = notes.map(n => `<li>${n}</li>`).join('');
}

function renderBookingBtnsIfPresent(btns) {
  const container = document.getElementById('bookingButtons');
  if (!container) return;
  if (!btns.length) {
    container.innerHTML = '<p class="booking-empty">予約サイトは準備中です。お電話またはお問い合わせフォームよりご連絡ください。</p>';
    return;
  }
  container.innerHTML = btns.map(b => `
    <a href="${b.url}" target="_blank" rel="noopener noreferrer" class="btn-booking">
      ${b.name}<span class="btn-arrow">→</span>
    </a>`).join('');
}

function renderPolicyIfPresent(sections) {
  const el = document.getElementById('policyContent');
  if (!el) return;
  el.innerHTML = sections.map(s => `
    <div class="policy-section">
      <h3>${s.title}</h3>
      <ul>${s.body.split('\n').filter(l => l.trim()).map(l => `<li>${l}</li>`).join('')}</ul>
    </div>`).join('');
}

function renderNearbyIfPresent(items) {
  const wrap = document.getElementById('nearbyFacilitiesWrap');
  if (!wrap) return;
  if (!items.length) { wrap.innerHTML = '<p style="font-size:14px;color:var(--color-text-light);">近隣施設の情報はまだ登録されていません。</p>'; return; }
  wrap.innerHTML = items.map(item => `
    <div style="background:var(--color-white);overflow:hidden;">
      ${item.img ? `<div style="aspect-ratio:16/9;overflow:hidden;"><img src="${item.img}" alt="${item.name}" style="width:100%;height:100%;object-fit:cover;"></div>` : ''}
      <div style="padding:20px 24px;">
        <p style="font-family:var(--font-en);font-size:10px;letter-spacing:.2em;color:var(--color-accent);margin-bottom:8px;">${item.dist || ''}</p>
        <h4 style="font-family:var(--font-jp);font-size:16px;font-weight:400;letter-spacing:.1em;margin-bottom:10px;">${item.name}</h4>
        <p style="font-size:13px;color:var(--color-text-mid);line-height:2;">${item.desc}</p>
      </div>
    </div>`).join('');
}

function renderAmenityIfPresent(sections) {
  const items = document.querySelectorAll('#amenityGrid .amenity-item');
  if (!items.length) return;
  sections.forEach((s, i) => {
    if (!items[i]) return;
    const titleEl = items[i].querySelector('.amenity-icon');
    const listEl  = items[i].querySelector('.amenity-list');
    if (titleEl) titleEl.textContent = s.title;
    if (listEl)  listEl.innerHTML = s.items.split('\n').filter(l => l.trim()).map(l => `<li>${l}</li>`).join('');
  });
}

/* ============================================================
   デフォルト値
   ============================================================ */
function _defaultNews() {
  return [
    { date:'2026.05.01', cat:'お知らせ', title:'2026年夏季のご予約受付を開始いたしました。' },
    { date:'2026.04.15', cat:'イベント', title:'【春の特別プラン】イルミネーション×星空観察プランのご案内。' },
    { date:'2026.03.20', cat:'メディア', title:'旅行誌「旅と暮らし」2026年4月号にて紹介いただきました。' },
    { date:'2026.02.10', cat:'お知らせ', title:'冬の星空観察プランに新しい特典が加わりました。' }
  ];
}
function _defaultFaq() {
  return [
    { q: 'チェックイン・チェックアウトの時間を教えてください。', a: 'チェックインは15:00〜18:00、チェックアウトは〜11:00となっております。' },
    { q: '何名から宿泊できますか？', a: '最小2名様からご利用いただけます。最大6名様まで対応しております。' },
    { q: 'ペットの同伴は可能ですか？', a: '誠に恐れ入りますが、現在はペットの同伴はご遠慮いただいております。' },
    { q: '駐車場はありますか？', a: 'はい、敷地内に無料駐車場（4台分）をご用意しております。' },
    { q: 'Wi-Fiは使えますか？', a: 'はい、高速Wi-Fiを完備しております。' },
    { q: 'キャンセルポリシーを教えてください。', a: '14日前：30%、7日前：50%、3日前〜：100%のキャンセル料を申し受けます。' }
  ];
}
function _defaultReserveNotes() {
  return [
    '最小宿泊人数：2名様〜（1棟貸し）',
    'チェックイン：15:00〜18:00 / チェックアウト：〜11:00',
    'お子様連れのご滞在は事前にご相談ください',
    'ペットの同伴はご遠慮いただいております',
    'キャンセルポリシー：3日前100%、7日前50%、14日前30%',
    'ご予約は1ヶ月前より承っております'
  ];
}
function _defaultBookingBtns() {
  return [
    { name: 'じゃらんnet', url: 'https://www.jalan.net/' },
    { name: '楽天トラベル', url: 'https://travel.rakuten.co.jp/' }
  ];
}
function _defaultPolicy() {
  return [
    { title: '1. チェックイン・チェックアウト', body: 'チェックイン：15:00〜18:00\nチェックアウト：〜11:00\n時間変更をご希望の場合は事前にご相談ください。' },
    { title: '2. お支払い', body: '現金、クレジットカード（VISA/MC/JCB/AMEX）、電子マネーに対応しています。\n宿泊料金はチェックアウト時にお支払いください。' },
    { title: '3. キャンセルポリシー', body: 'ご宿泊14日前：宿泊料金の30%\nご宿泊7日前：宿泊料金の50%\nご宿泊3日前〜当日：宿泊料金の100%\n無断キャンセルの場合：宿泊料金の100%' },
    { title: '4. 禁止事項', body: '施設内での喫煙（屋外の指定場所のみ可）\nペットの同伴\n他のゲストへの迷惑行為\n施設・備品の破損・汚損' },
    { title: '5. その他', body: '天災・自然災害等の不可抗力によりご宿泊いただけない場合は、キャンセル料はいただきません。' }
  ];
}
function _defaultNearby() {
  return [
    { img: '', name: '青い池', desc: '白髭の滝から流れ込んだコバルトブルーの神秘的な池。美瑛を代表する観光スポット。', dist: '車で約15分' },
    { img: '', name: 'ファーム富田', desc: '北海道を代表するラベンダー畑。夏には紫の絨毯が広がります。', dist: '車で約20分' },
    { img: '', name: '旭川市旭山動物園', desc: '日本最北の動物園。行動展示で有名。', dist: '車で約50分' }
  ];
}
function _defaultAmenity() {
  return [
    { title: 'BATH & TOILET', items: 'バスタブ（深浴槽）\nシャワーブース\n洗面化粧台\n温水洗浄便座\nドライヤー\nバスタオル・フェイスタオル\nボディーソープ・シャンプー等' },
    { title: 'KITCHEN', items: 'IHクッキングヒーター（2口）\n電子レンジ・オーブントースター\n冷蔵庫（大型）・製氷機\n食器洗い乾燥機\n食器・カトラリー一式\n調理器具・鍋類\nドルチェグスト（スタバ対応）' },
    { title: 'LIVING', items: '4K大型テレビ\nBluetoothスピーカー\n高速WiFi（有線LAN対応）\nエアコン・床暖房\nソファ・ダイニングセット\n書籍・雑誌ライブラリ\n加湿器・空気清浄機' },
    { title: 'BEDROOM', items: '高級マットレス・羽毛布団\n枕（高さ選択可）\nベッドサイドランプ\nウォークインクローゼット\n全身鏡\nパジャマ・スリッパ\n電気毛布（冬季）' },
    { title: 'WELCOME GIFT', items: '美瑛サイダー（各部屋1本）\n美瑛のお菓子（1箱）\nドルチェグスト カプセル\n天体望遠鏡\nランタン・ローソク\n除雪道具（冬季）' },
    { title: 'SERVICE', items: 'チェックイン 15:00〜18:00\nチェックアウト〜11:00\n駐車場（無料・2台分）\nゴミ分別サービス\nアーリーチェックイン相談可\n荷物預かりサービス' }
  ];
}

/* ============================================================
   管理者判定
   ============================================================ */
function isAdmin() { return sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true'; }

/* ============================================================
   画像編集ボタン
   ============================================================ */
function injectEditButtons() {
  document.querySelectorAll('.cms-img-edit-btn').forEach(b => b.remove());
  document.querySelectorAll('[data-editable]').forEach(el => {
    if (el.tagName === 'IMG') attachEditButton(el, 'normal');
  });
  document.querySelectorAll('[data-bg-field]').forEach(el => {
    if (el.tagName === 'IMG') attachEditButton(el, 'bg');
  });
}
function removeEditButtons() {
  document.querySelectorAll('.cms-img-edit-btn').forEach(b => b.remove());
}
function attachEditButton(img, type) {
  const btn = document.createElement('button');
  btn.className = 'cms-img-edit-btn';
  btn.innerHTML = '✎ 編集';
  btn.type = 'button';
  btn.style.position = 'fixed';
  document.body.appendChild(btn);
  function positionBtn() {
    const rect = img.getBoundingClientRect();
    btn.style.top  = (rect.top  + 8) + 'px';
    btn.style.left = (rect.left + 8) + 'px';
  }
  positionBtn();
  window.addEventListener('scroll', positionBtn);
  window.addEventListener('resize', positionBtn);
  btn.addEventListener('click', e => {
    e.stopPropagation();
    openFilePicker(file => {
      readAsDataURL(file, async result => {
        img.src = result;
        const data = cmsLoad();
        if (type === 'bg') data[img.dataset.bgField] = result;
        else data[img.dataset.field] = result;
        cmsSave(data);
        await sbSet('cms_content', data);
        showToast('画像を更新しました ✓');
      });
    });
  });
}

/* ============================================================
   管理バー初期化
   ============================================================ */
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
    if (editMode) {
      document.querySelectorAll('[data-editable]').forEach(el => {
        if (el.tagName !== 'IMG') { el.classList.add('edit-mode'); el.contentEditable = 'true'; }
      });
      injectEditButtons();
    } else {
      document.querySelectorAll('[data-editable]').forEach(el => {
        if (el.tagName !== 'IMG') { el.classList.remove('edit-mode'); el.contentEditable = 'false'; }
      });
      removeEditButtons();
    }
    editBtn.textContent = editMode ? 'EDITING...' : 'EDIT PAGE';
    if (saveBtn) saveBtn.style.display = editMode ? 'inline-block' : 'none';
  });

  saveBtn?.addEventListener('click', async () => {
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
    const ok = await sbSet('cms_content', data);
    showToast(ok ? 'テキストを保存しました ✓ 全デバイスに反映されました' : '保存しました（オフライン：次回オンライン時に同期）');
  });

  exitBtn?.addEventListener('click', () => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    location.reload();
  });

  mediaBtn?.addEventListener('click', () => {
    const path = location.pathname.includes('/admin/') ? 'dashboard.html' : 'admin/dashboard.html';
    window.location.href = path;
  });

  if (saveBtn) saveBtn.style.display = 'none';
}

/* ============================================================
   ユーティリティ
   ============================================================ */
function openFilePicker(callback) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
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
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(20px);background:#1a1a1a;color:#c4a882;padding:12px 28px;font-size:13px;letter-spacing:.08em;z-index:9999;opacity:0;transition:all .4s cubic-bezier(.25,.46,.45,.94);pointer-events:none;border:1px solid rgba(196,168,130,0.3);white-space:pre-line;text-align:center;max-width:90vw;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  requestAnimationFrame(() => { t.style.opacity='1'; t.style.transform='translateX(-50%) translateY(0)'; });
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(-50%) translateY(20px)'; }, 4000);
}

/* ============================================================
   DOMContentLoaded
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  await cmsApply();
  initAdminBar();

  const EDIT_TRIGGER_KEY = 'biei_admin_edit_trigger';
  if (isAdmin() && sessionStorage.getItem(EDIT_TRIGGER_KEY) === 'true') {
    sessionStorage.removeItem(EDIT_TRIGGER_KEY);
    setTimeout(() => {
      const editBtn = document.querySelector('[data-action="edit"]');
      if (editBtn) editBtn.click();
    }, 500);
  }
});

/* ============================================================
   外部公開: ダッシュボードから呼び出す Supabase 保存関数
   ============================================================ */
window.bieiCMS = { sbSet, sbGet, sbGetAll, showToast };
