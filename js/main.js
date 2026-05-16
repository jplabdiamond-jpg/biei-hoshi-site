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

/* ---- Init on DOM ready ---- */
document.addEventListener('DOMContentLoaded', () => {
  /* CMS処理はすべて cms.js に委譲 */
});
