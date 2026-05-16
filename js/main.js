/* ============================================================
   星の光の宿 BIEI — Main JavaScript
   ============================================================ */

'use strict';

/* ---- Header scroll ---- */
const header = document.getElementById('site-header');
if (header) {
  // トップページ（index.html または /）かどうか判定
  const isTopPage = location.pathname === '/' ||
                    location.pathname.endsWith('index.html') ||
                    location.pathname === '';

  if (isTopPage) {
    // トップページのみ：スクロール量に応じて scrolled を切り替え
    const onScroll = () => {
      header.classList.toggle('scrolled', window.scrollY > 60);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  } else {
    // サブページ：常に scrolled を維持（スクロールで外れない）
    header.classList.add('scrolled');
  }
}

/* ---- Hamburger / Mobile Nav ---- */
const hamburger = document.querySelector('.hamburger');
const mobileNav = document.querySelector('.mobile-nav');
const mobileOverlay = document.querySelector('.mobile-overlay');

function closeMobileNav() {
  hamburger?.classList.remove('open');
  mobileNav?.classList.remove('open');
  mobileOverlay?.classList.remove('open');
  document.body.style.overflow = '';
}

hamburger?.addEventListener('click', () => {
  const isOpen = hamburger.classList.toggle('open');
  mobileNav?.classList.toggle('open', isOpen);
  mobileOverlay?.classList.toggle('open', isOpen);
  document.body.style.overflow = isOpen ? 'hidden' : '';
});
mobileOverlay?.addEventListener('click', closeMobileNav);
document.querySelectorAll('.mobile-nav-link').forEach(l => l.addEventListener('click', closeMobileNav));

/* ---- Hero Slider ---- */
const heroSlides = document.querySelectorAll('.hero-slide');
if (heroSlides.length > 1) {
  let current = 0;
  const next = () => {
    heroSlides[current].classList.remove('active');
    current = (current + 1) % heroSlides.length;
    heroSlides[current].classList.add('active');
  };
  setInterval(next, 6000);
}

/* ---- Intersection Observer — Scroll Animations ---- */
const animEls = document.querySelectorAll('.fade-in, .fade-in-left, .fade-in-right');
if (animEls.length) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  animEls.forEach(el => io.observe(el));
}

/* ---- Smooth anchor scroll ---- */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    const offset = 80;
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  });
});

/* ============================================================
   CMS — Content Management (localStorage-based)
   ============================================================ */

const CMS_KEY = 'biei_cms_content';
const ADMIN_SESSION_KEY = 'biei_admin_session';

/** Load saved content from localStorage */
function cmsLoad() {
  try {
    return JSON.parse(localStorage.getItem(CMS_KEY) || '{}');
  } catch { return {}; }
}

/** Save content to localStorage */
function cmsSave(data) {
  try {
    localStorage.setItem(CMS_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('CMS save error:', e);
  }
}

/** Apply saved content to page */
function cmsApply() {
  const data = cmsLoad();
  document.querySelectorAll('[data-editable]').forEach(el => {
    const field = el.dataset.field;
    if (!field || !data[field]) return;
    const saved = data[field];
    if (el.tagName === 'IMG') {
      el.src = saved;
    } else if (el.dataset.editableType === 'html') {
      el.innerHTML = saved;
    } else {
      el.textContent = saved;
    }
  });
}

/** Check admin session */
function isAdminLoggedIn() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true';
}

/** Init admin edit bar */
function initAdminBar() {
  if (!isAdminLoggedIn()) return;
  const bar = document.querySelector('.admin-edit-bar');
  if (!bar) return;
  bar.classList.add('active');

  const editBtn = bar.querySelector('[data-action="edit"]');
  const saveBtn = bar.querySelector('[data-action="save"]');
  const exitBtn = bar.querySelector('[data-action="exit"]');
  const mediaBtn = bar.querySelector('[data-action="media"]');

  let editMode = false;

  editBtn?.addEventListener('click', () => {
    editMode = !editMode;
    document.querySelectorAll('[data-editable]').forEach(el => {
      if (el.tagName === 'IMG') {
        // Image editing: click to upload
        el.classList.toggle('edit-mode', editMode);
        el.style.cursor = editMode ? 'pointer' : '';
        if (editMode) {
          el.addEventListener('click', handleImgClick, { once: false });
        } else {
          el.removeEventListener('click', handleImgClick);
        }
      } else {
        el.classList.toggle('edit-mode', editMode);
        el.contentEditable = editMode ? 'true' : 'false';
      }
    });
    editBtn.textContent = editMode ? 'EDITING...' : 'EDIT PAGE';
    saveBtn.style.display = editMode ? 'inline-block' : 'none';
  });

  saveBtn?.addEventListener('click', () => {
    const data = cmsLoad();
    document.querySelectorAll('[data-editable]').forEach(el => {
      const field = el.dataset.field;
      if (!field) return;
      if (el.tagName === 'IMG') {
        data[field] = el.src;
      } else if (el.dataset.editableType === 'html') {
        data[field] = el.innerHTML;
      } else {
        data[field] = el.textContent;
      }
    });
    cmsSave(data);
    showToast('コンテンツを保存しました');
  });

  exitBtn?.addEventListener('click', () => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    location.reload();
  });

  mediaBtn?.addEventListener('click', () => {
    window.location.href = 'admin/media.html';
  });

  if (saveBtn) saveBtn.style.display = 'none';
}

function handleImgClick(e) {
  const img = e.currentTarget;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      img.src = ev.target.result;
      const data = cmsLoad();
      data[img.dataset.field] = ev.target.result;
      cmsSave(data);
      showToast('画像を更新しました');
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function showToast(msg) {
  let toast = document.querySelector('.cms-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'cms-toast';
    toast.style.cssText = `
      position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(20px);
      background:#1a1a1a;color:#fff;padding:12px 28px;font-family:var(--font-jp);
      font-size:13px;letter-spacing:.08em;z-index:9999;opacity:0;
      transition:all .4s cubic-bezier(.25,.46,.45,.94);pointer-events:none;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
  }, 2800);
}

/* ---- Init on DOM ready ---- */
document.addEventListener('DOMContentLoaded', () => {
  cmsApply();
  initAdminBar();

  /* ダッシュボードから編集モードで開いた場合、自動でEDIT MODEを起動 */
  const EDIT_TRIGGER_KEY = 'biei_admin_edit_trigger';
  if (isAdminLoggedIn() && sessionStorage.getItem(EDIT_TRIGGER_KEY) === 'true') {
    sessionStorage.removeItem(EDIT_TRIGGER_KEY);
    setTimeout(() => {
      const editBtn = document.querySelector('[data-action="edit"]');
      if (editBtn) editBtn.click();
    }, 600);
  }
});
