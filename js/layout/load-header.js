// /js/layout/load-header.js
import { setupMobileNav } from '../ui/mobileNav.js';
import { signOutIfAny } from '../auth/auth.js';
import { setupNav } from '../utils/config.js';

function markActiveNav() {
  const currentPage = document.body?.dataset?.page;
  if (!currentPage) return;

  const links = document.querySelectorAll('.nav-links a[data-nav]');
  links.forEach((a) => {
    const navKey = a.dataset.nav;
    if (navKey === currentPage) {
      a.classList.add('active');
      a.setAttribute('aria-current', 'page');
    } else {
      a.classList.remove('active');
      a.removeAttribute('aria-current');
    }
  });

  // focus-visible style hook
  links.forEach((a) => {
    a.addEventListener('focus', () => a.classList.add('focus-visible'));
    a.addEventListener('blur', () => a.classList.remove('focus-visible'));
  });
}

// โหลด header จาก /partials/header.html แล้ว inject เข้า #app-header
export async function loadHeader() {
  const container = document.getElementById('app-header');
  if (!container) return;

  try {
    const res = await fetch('/partials/header.html', {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });

    if (!res.ok) {
      throw new Error(`โหลด header ไม่สำเร็จ (${res.status})`);
    }

    const html = await res.text();
    container.innerHTML = html;

    // Inject rl-nav styles (once)
    if (!document.getElementById('rl-nav-style')) {
      const style = document.createElement('style');
      style.id = 'rl-nav-style';
      style.textContent = `
        .rl-nav {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          z-index: 50;
          padding: 1.1rem 0;
          transition: background 0.25s ease, box-shadow 0.25s ease, padding 0.25s ease;
          background: transparent;
        }
        .rl-nav.is-scrolled {
          background: rgba(255,255,255,0.9);
          backdrop-filter: blur(12px);
          box-shadow: 0 10px 35px rgba(0,0,0,0.06);
          padding: 0.85rem 0;
        }
        .rl-container { max-width: 1200px; margin: 0 auto; padding: 0 1.5rem; }
        .rl-nav .nav { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
        .rl-nav .logo { display: inline-flex; align-items: center; gap: 0.6rem; font-weight: 800; color: #2b2a28; text-decoration: none; letter-spacing: 0.02em; }
        .rl-nav .logo-img { height: 38px; width: auto; display: block; }
        @media (max-width: 900px) {
          .rl-container { padding: 0 1.1rem; }
        }
      `;
      document.head.appendChild(style);
    }

    // setup global nav / mobile / sign-out
    setupNav();
    setupMobileNav();
    await signOutIfAny();

    // ⭐ ใส่ active ให้เมนูตาม data-page
    markActiveNav();

    // หน้า home เอาเมนูออก เหลือแค่โลโก้
    if (document.body?.dataset?.page === 'home') {
      const links = container.querySelector('.nav-links');
      const mobileToggle = container.querySelector('.mobile-nav-toggle');
      links?.remove();
      mobileToggle?.remove();
    }

    // Scroll style on all pages (match landing behavior)
    const navEl = container.querySelector('.header');
    if (navEl) {
      const onScroll = () => navEl.classList.toggle('is-scrolled', window.scrollY > 20);
      onScroll();
      window.addEventListener('scroll', onScroll);
    }

    // ถ้าเป็นโหมดฝังใน iframe (เช่น embed=1) ซ่อนปุ่มออกจากระบบ
    const params = new URLSearchParams(window.location.search);
    if (params.get('embed') === '1') {
      const signOut = container.querySelector('#sign-out-btn');
      signOut?.remove();
    }
  } catch (err) {
    console.error('โหลด header ล้มเหลว:', err);
    container.innerHTML = `
      <div style="padding:0.75rem 1rem;background:#fee2e2;color:#b91c1c;font-size:0.875rem;">
        โหลดเมนูหลักไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง
      </div>
    `;
  }
}

// auto-run
document.addEventListener('DOMContentLoaded', () => {
  loadHeader();
});
