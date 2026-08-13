/* ============================================================
   星の光の宿 BIEI — CMS Shared Logic  v14
   データ読み込み優先順:
     1. Supabase (全デバイス共通・即時反映)
     2. localStorage (オフライン時フォールバック)
   ============================================================ */
/* ============================================================
   Supabase 設定
   ============================================================ */
var SUPABASE_URL    = 'https://mgauttkyplwoykgooyqj.supabase.co';
var SUPABASE_ANON   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nYXV0dGt5cGx3b3lrZ29veXFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNzI1MTMsImV4cCI6MjA5OTg0ODUxM30.GtetXXe0CmtoY6oyV81JrTqJOgv3DEGuNUHzODxxaOA';

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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000); // 4秒タイムアウト
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/biei_cms?select=key,value`,
      { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` }, signal: controller.signal }
    );
    clearTimeout(timer);
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
   画像アップロード（さくらPHP）
   ------------------------------------------------------------
   【egress恒久対策】画像はSupabase Storageではなく、さくら上の
   api/upload.php に保存し公開URL(https://.../images/cms/xxx)を得る。
   これによりサイト表示時の画像配信がさくら（転送量無料）になり、
   Supabaseのegressクォータ超過（画像がサンプルに戻る不具合）を根絶する。
   ※ 保存されるのは画像URL文字列のみで、DBのimg_キーはそのまま利用。
   ============================================================ */
var IMG_UPLOAD_ENDPOINT = '/api/upload.php';
// 管理画面と共有する秘密トークン（api/upload-config.php と一致させること）
var IMG_UPLOAD_TOKEN = '219702ce3ba5d37cd2676aae942acf87e06ce3dc636865be';

async function sbUploadImage(dataUrl, name) {
  const res = await fetch(IMG_UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Upload-Token': IMG_UPLOAD_TOKEN
    },
    body: JSON.stringify({ dataUrl, name })
  });
  let json = null;
  try { json = await res.json(); } catch (_) {}
  if (!res.ok || !json || !json.success || !json.url) {
    throw new Error('image upload ' + res.status + (json && json.error ? ' ' + json.error : ''));
  }
  return json.url;
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

  /* ── メンテナンスモードチェック（管理者ダッシュボードのトグルで制御） ── */
  const maintenanceOn = hasSb
    ? (sb.maintenance === true)
    : (localStorage.getItem('biei_maintenance') === 'true');
  if (maintenanceOn && !isAdmin()) {
    showMaintenancePage();
    return;
  }

  // --- テキスト・画像フィールド (data-editable / data-bg-field) ---
  // cms_contentと個別キー img_{fieldkey} をマージ（大容量画像の分割保存対応）
  //
  // 【重要・バグ再発防止】
  // 画像は「個別キー img_{field}（最新・正）」と「cms_content 内の同フィールド（旧・base64が残存）」の
  // 2箇所に存在しうる。必ず cms_content を土台にしてから img_ で上書きする2パス方式とし、
  // img_ を常に優先させること。順序を入れ替えると古い画像が復活する（既知の不具合）。
  const cmsContent = hasSb ? Object.assign({}, sb.cms_content || {}) : cmsLoad();
  if (hasSb) {
    // パス1.5: 交通案内は専用キー `transport` に保存されるため必ずマージする。
    // 【バグ再発防止】これが無いと、管理画面の「交通案内管理」で保存しても
    // 公開ページ(access.html)がHTMLの初期値のままになる（反映されない）。
    // ダッシュボードの initAllPanels と同じ順序（cms_content → transport → img_）に揃える。
    // 同様に、専用キーに保存される見出し系オブジェクトはここでマージする。
    // 追加する場合は必ずこの配列に入れること（img_ より前・cms_content より後）。
    ['transport', 'kitchen_nearby'].forEach(k => {
      if (sb[k] && typeof sb[k] === 'object' && !Array.isArray(sb[k])) {
        Object.assign(cmsContent, sb[k]);
      }
    });
    // パス2: 個別画像キーで必ず上書き（img_ が常に勝つ＝最新画像）
    Object.keys(sb).forEach(k => {
      if (k.startsWith('img_') && sb[k]) {
        cmsContent[k.slice(4)] = sb[k]; // "img_room1_bedroom" → "room1_bedroom"
      }
    });
  }

  // 画像src差し替え + cms-ready付与ヘルパー
  // ─────────────────────────────────────────────
  // 【ちらつき(旧画像が一瞬見える)防止・再発禁止】
  // 旧実装は img.src = 新URL を直接代入し、onload / complete / 300msタイマーの
  // いずれかで即 visibility:visible にしていた。
  // ブラウザは「新画像がデコードされるまで古い画像(HTMLの初期src)を描画し続ける」ため、
  // 可視化した瞬間に古い画像が必ず一瞬見えていた。
  // → ヒーローと同じく「裏で先読み(preload)＋decode完了 → src差し替え → 可視化」
  //    の順に統一する。順序を変えると古い画像が復活する（既知の不具合）。
  // ※ 差し替え待ちの間は data-cms-pending を立て、_forceShowAllCmsImages に
  //    先に可視化されないようにする。
  // ─────────────────────────────────────────────
  function _setImgSrc(img, src) {
    let done = false;
    const markReady = () => {
      if (done) return;
      done = true;
      delete img.dataset.cmsPending;
      img.classList.add('cms-ready');
      img.style.visibility = 'visible'; // CSSキャッシュに依存せず確実に表示
    };
    // 既に同じ画像なら差し替え不要
    if (img.src === src || img.currentSrc === src) { markReady(); return; }

    img.dataset.cmsPending = '1';
    img.removeAttribute('loading'); // lazy によるロード遅延を回避

    const swap = () => {
      if (done) return;
      img.onload  = markReady;
      img.onerror = markReady;
      img.src = src; // ここではキャッシュ済みのため旧画像が見える隙が無い
      if (img.complete && img.naturalWidth > 0) markReady();
    };

    const pre = new Image();
    pre.onload = () => {
      if (pre.decode) pre.decode().then(swap).catch(swap);
      else swap();
    };
    pre.onerror = () => { markReady(); }; // 失敗時は初期画像のまま表示
    pre.src = src;

    // 保険: 3秒で先読みが終わらない場合は差し替えだけ行い、表示はonloadに委ねる。
    // それでも読めない場合は最終フォールバック(5秒)が強制表示する。
    setTimeout(() => { if (!done) swap(); }, 3000);
  }

  // data-editable 画像: CMSデータで差し替え→ロード完了後に .cms-ready でフェードイン
  document.querySelectorAll('[data-editable]').forEach(el => {
    const f = el.dataset.field;
    if (!f) return;
    if (el.tagName === 'IMG') {
      if (cmsContent[f]) {
        _setImgSrc(el, cmsContent[f]);
      } else {
        el.classList.add('cms-ready');
        el.style.visibility = 'visible';
      }
    } else if (el.dataset.editableType === 'html') {
      if (cmsContent[f]) el.innerHTML = cmsContent[f];
    } else if (f === 'hero_title' || f === 'hero_subtitle' || f === 'hero_subtitle_sp') {
      if (cmsContent[f]) el.innerHTML = cmsContent[f];
    } else {
      if (cmsContent[f]) el.textContent = cmsContent[f];
    }
  });

  // data-bg-field 画像: 差し替え→フェードイン（ヒーロースライドは visibility 制御のため除外）
  // ─────────────────────────────────────────────
  // 【ちらつき(FOUC)防止】
  // 旧実装はヒーローに el.src = 新URL を直接代入していた。
  // 画像の差し替えは「新しい画像がデコードされるまで“古い画像”を表示し続ける」
  // ブラウザ仕様のため、HTMLの初期画像が一瞬見えてから新画像に切り替わっていた。
  // → 先に裏で新画像を読み込み(preload)、完了してから src を差し替えることで
  //    初期画像が表示される瞬間そのものを無くす。
  // ─────────────────────────────────────────────
  const heroPreloads = [];
  document.querySelectorAll('[data-bg-field]').forEach(el => {
    const f = el.dataset.bgField;
    if (el.tagName !== 'IMG') return;
    const isHeroSlide = el.closest('.hero-slide') !== null;
    if (cmsContent[f]) {
      if (isHeroSlide) {
        heroPreloads.push(new Promise(resolve => {
          const pre = new Image();
          pre.onload  = () => { el.src = cmsContent[f]; resolve(); };
          pre.onerror = () => { resolve(); }; // 失敗時は初期画像のまま
          pre.src = cmsContent[f];
        }));
      } else {
        _setImgSrc(el, cmsContent[f]);
      }
    } else {
      if (!isHeroSlide) { el.classList.add('cms-ready'); el.style.visibility = 'visible'; }
    }
  });

  // 先読み完了を待ってから表示（最大3秒でタイムアウトし、待ち続けない）
  if (heroPreloads.length) {
    await Promise.race([
      Promise.all(heroPreloads),
      new Promise(r => setTimeout(r, 3000))
    ]);
  }

  // ヒーロースライダーを表示（全スライド画像のsrc設定完了後）
  _showHeroSlider(cmsContent);

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

  const kitchenSpots = hasSb && Array.isArray(sb.kitchen_spots) && sb.kitchen_spots.length
    ? sb.kitchen_spots
    : _getLocalOrDefault('biei_kitchen_spots', _defaultKitchenSpots());
  renderKitchenSpotsIfPresent(kitchenSpots);

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

/* キッチンページ「近くのグルメ＆ショッピング」カード
   ※ 未設定時はHTMLの初期3件をそのまま残す（空表示にしない） */
function renderKitchenSpotsIfPresent(items) {
  const wrap = document.getElementById('kitchenSpotsWrap');
  if (!wrap) return;
  if (!Array.isArray(items) || !items.length) return;
  wrap.innerHTML = items.map(it => `
    <div style="background:var(--color-bg-warm);padding:32px 28px;">
      <p style="font-family:var(--font-en);font-size:11px;letter-spacing:.25em;color:var(--color-accent);margin-bottom:14px;">${it.label || ''}</p>
      <h4 style="font-family:var(--font-jp);font-size:16px;font-weight:400;letter-spacing:.1em;margin-bottom:12px;">${it.name || ''}</h4>
      <p style="font-size:13px;color:var(--color-text-mid);line-height:2;">${it.desc || ''}</p>
    </div>`).join('');
}

function _defaultKitchenSpots() {
  return [
    { label: 'SHOPPING',    name: '美瑛選果',              desc: '美瑛産の野菜・果物・加工品が揃う人気スポット。新鮮な食材を調達して自炊をお楽しみください。（車で約5分）' },
    { label: 'CAFE',        name: '美瑛のカフェ＆レストラン', desc: '美瑛の食材を使ったカフェやレストランが点在。地元の味を気軽に楽しめます。スタッフがおすすめをご案内します。' },
    { label: 'SUPERMARKET', name: '近隣スーパー',           desc: '日用品や食材の買い出しに便利なスーパーマーケットが近隣にあります。長期滞在の方にも安心の環境です。' }
  ];
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
   ヒーロースライダー 表示制御
   全スライド画像のsrc置換完了後に visibility: visible
   ============================================================ */
function _showHeroSlider(cmsContent) {
  const slider = document.querySelector('.hero-slider');
  if (!slider) return;

  const slideImgs = Array.from(slider.querySelectorAll('.hero-slide img[data-bg-field]'));
  if (!slideImgs.length) {
    slider.classList.add('cms-hero-ready');
    return;
  }

  // CMS画像が設定されているスライドのみ待機対象
  const waitTargets = slideImgs.filter(img => {
    const f = img.dataset.bgField;
    return cmsContent && cmsContent[f];
  });

  if (!waitTargets.length) {
    // CMSデータなし → デフォルト画像をそのまま表示
    slider.classList.add('cms-hero-ready');
    return;
  }

  let loaded = 0;
  const total = waitTargets.length;
  const reveal = () => { slider.classList.add('cms-hero-ready'); };

  waitTargets.forEach(img => {
    if (img.complete && img.naturalWidth > 0) {
      loaded++;
      if (loaded >= total) reveal();
    } else {
      img.addEventListener('load', () => { loaded++; if (loaded >= total) reveal(); }, { once: true });
      img.addEventListener('error', () => { loaded++; if (loaded >= total) reveal(); }, { once: true });
    }
  });
}

// フォールバック: Supabaseが完全タイムアウトした場合のみ5秒後に強制表示
// ※ 800ms等の短いタイマーはSupabase完了前に古い画像を表示させるため廃止
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => _forceShowAllCmsImages(true), 5000); // 最終保険：ヒーローも表示
});

/* ============================================================
   メンテナンスモード表示
   ============================================================ */
function showMaintenancePage() {
  // <body>を完全にメンテナンス画面で上書き
  document.body.style.cssText = 'margin:0;padding:0;background:#0a0a08;overflow:hidden;';
  document.body.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;1,300&family=Noto+Serif+JP:wght@300;400&display=swap');
      .maint-wrap {
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        background: #0a0a08;
        padding: 40px 24px;
      }
      .maint-logo {
        max-width: 200px;
        width: 80%;
        margin-bottom: 40px;
        opacity: 0.92;
        animation: fadeInDown 1.2s ease both;
      }
      .maint-stars {
        font-family: 'Cormorant Garamond', serif;
        font-size: 20px;
        letter-spacing: 0.4em;
        color: rgba(196,168,130,0.35);
        margin-bottom: 32px;
        animation: fadeIn 2s ease both;
        animation-delay: 0.3s;
      }
      .maint-title {
        font-family: 'Cormorant Garamond', serif;
        font-size: clamp(24px, 5vw, 38px);
        letter-spacing: 0.25em;
        color: #d4bc9a;
        font-style: italic;
        margin-bottom: 20px;
        animation: fadeIn 1.5s ease both;
        animation-delay: 0.5s;
      }
      .maint-line {
        width: 40px;
        height: 1px;
        background: rgba(196,168,130,0.3);
        margin: 0 auto 28px;
        animation: fadeIn 1.5s ease both;
        animation-delay: 0.7s;
      }
      .maint-msg {
        font-family: 'Noto Serif JP', serif;
        font-size: clamp(13px, 2.5vw, 15px);
        color: #8a8070;
        letter-spacing: 0.1em;
        line-height: 2.4;
        animation: fadeIn 1.5s ease both;
        animation-delay: 0.9s;
      }
      .maint-en {
        font-family: 'Cormorant Garamond', serif;
        font-size: 13px;
        letter-spacing: 0.2em;
        color: rgba(196,168,130,0.4);
        margin-top: 24px;
        animation: fadeIn 1.5s ease both;
        animation-delay: 1.1s;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(12px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes fadeInDown {
        from { opacity: 0; transform: translateY(-20px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    </style>
    <div class="maint-wrap">
      <img class="maint-logo" src="${_resolveLogoPath()}" alt="星の光の宿 BIEI">
      <div class="maint-stars">✦ &nbsp; ✦ &nbsp; ✦</div>
      <div class="maint-title">Coming Soon</div>
      <div class="maint-line"></div>
      <div class="maint-msg">
        サイト公開まで今しばらくお待ちください。<br>
        ご不便をおかけいたします。
      </div>
      <div class="maint-en">We'll be back soon — Hoshi no Hikari no Yado BIEI</div>
    </div>
  `;
}

function _resolveLogoPath() {
  // ページのパス深度に応じてロゴパスを解決
  const path = window.location.pathname;
  if (path.includes('/admin/')) return '../images/hhy_BIEI_logo_03.png';
  return 'images/hhy_BIEI_logo_03.png';
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
        img.src = result; // 即時プレビュー
        const field = (type === 'bg') ? img.dataset.bgField : img.dataset.field;
        let stored = result;
        try { stored = await sbUploadImage(result, field); img.src = stored; }
        catch (upErr) { console.warn('[cms] storage upload失敗→base64フォールバック', upErr); }
        // ─────────────────────────────────────────────
        // 【重要・データ消失防止】
        // 旧実装は cmsLoad()(=localStorageのみ) を土台に cms_content を
        // 丸ごと上書きしていた。localStorageが空の端末（別PC／キャッシュ削除／
        // Safari のストレージ自動削除）で実行すると、他ページの保存済み内容ごと
        // Supabaseを空で上書きし「初期画像・初期テキストに戻る」事故が起きる。
        // 画像は個別キー img_{field} が正（単一ソース）なので、そこだけ更新する。
        // ─────────────────────────────────────────────
        const okImg = await sbSet('img_' + field, stored);
        const local = cmsLoad(); local[field] = stored; cmsSave(local); // ローカルは表示キャッシュ用
        showToast(okImg
          ? '画像を更新しました ✓'
          : '⚠ 画像の保存に失敗しました（サーバー未反映）\n通信を確認して再度お試しください');
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
    // ─────────────────────────────────────────────
    // 【重要・データ消失防止】
    // 旧実装は cmsLoad()(=localStorageのみ) を土台に cms_content を丸ごと
    // 置換していたため、localStorageが空の端末で1ページ保存すると
    // 「他ページの保存済みテキストが全部消えて初期値に戻る」事故が起きた。
    // → 必ずSupabaseの最新値を土台にしてマージする。
    // またSupabase不通時は全置換が危険なため保存を中止する（黙って壊さない）。
    // 画像は個別キー img_{field} が正なのでここでは触らない（二重ソース防止）。
    // ─────────────────────────────────────────────
    const all = await sbGetAll();
    if (!Object.keys(all).length) {
      showToast('⚠ サーバーに接続できないため保存を中止しました\n通信を確認して再度お試しください');
      return;
    }
    const base = (all.cms_content && typeof all.cms_content === 'object' && !Array.isArray(all.cms_content))
      ? all.cms_content : {};
    const data = Object.assign({}, base);

    // テキストのみ収集（IMGは対象外）
    document.querySelectorAll('[data-editable]').forEach(el => {
      const f = el.dataset.field;
      if (!f || el.tagName === 'IMG') return;
      data[f] = (el.dataset.editableType === 'html') ? el.innerHTML : el.textContent;
    });

    cmsSave(data);
    const ok = await sbSet('cms_content', data);

    // ─────────────────────────────────────────────
    // 【二重ソース防止】cmsApply は cms_content の後に専用キー
    // (transport / kitchen_nearby) をマージして上書きする。
    // そのため、ページ上のEDIT PAGEで編集したフィールドが専用キー管理下の場合、
    // cms_content だけ更新しても古い専用キーの値に戻ってしまう。
    // → 該当フィールドは専用キー側にも同じ値を書き戻して整合させる。
    // 新しい専用キーを追加したら必ずこのマップにも追加すること。
    // ─────────────────────────────────────────────
    const SPECIAL_KEY_MAP = {
      transport:       f => f.indexOf('access_') === 0,
      kitchen_nearby:  f => f.indexOf('kitchen_nearby') === 0
    };
    for (const sk of Object.keys(SPECIAL_KEY_MAP)) {
      const cur = (all[sk] && typeof all[sk] === 'object' && !Array.isArray(all[sk])) ? all[sk] : {};
      const next = Object.assign({}, cur);
      let changed = false;
      Object.keys(data).forEach(f => {
        if (SPECIAL_KEY_MAP[sk](f) && next[f] !== data[f]) { next[f] = data[f]; changed = true; }
      });
      if (changed) await sbSet(sk, next);
    }

    showToast(ok
      ? 'テキストを保存しました ✓ 全デバイスに反映されました'
      : '⚠ 保存に失敗しました（サーバー未反映）\n通信を確認して再度お試しください');
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
// すべてのCMS画像を強制表示（cmsApply完了後・フォールバック共用）
// includeHero=true のときのみヒーローも強制表示する。
// 【ちらつき防止】cmsApply直後に無条件でヒーローを表示すると、
// 先読み・ロード待ちを打ち消して初期画像が一瞬見えるため、
// 通常経路では false、最終フォールバック(5秒)でのみ true を渡す。
function _forceShowAllCmsImages(includeHero) {
  document.querySelectorAll('img[data-bg-field], img[data-editable]').forEach(el => {
    if (el.closest('.hero-slide')) return;
    // 【ちらつき防止】CMS画像の差し替え待ち(data-cms-pending)は先に可視化しない。
    // 可視化すると新画像のデコード完了まで古い画像(HTML初期src)が描画される。
    // includeHero=true は最終フォールバック(5秒)なので pending も強制解除する。
    if (!includeHero && el.dataset.cmsPending === '1') return;
    delete el.dataset.cmsPending;
    el.classList.add('cms-ready');
    el.style.visibility = 'visible';
  });
  if (includeHero) {
    const slider = document.querySelector('.hero-slider');
    if (slider) slider.classList.add('cms-hero-ready');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await cmsApply();
  } catch(e) {
    console.error('[cms] cmsApply error:', e);
  } finally {
    // cmsApply完了後（成功・失敗問わず）ヒーロー以外の画像を表示。
    // ヒーローは _showHeroSlider が読み込み完了後に表示する（ちらつき防止）。
    _forceShowAllCmsImages(false);
  }
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
