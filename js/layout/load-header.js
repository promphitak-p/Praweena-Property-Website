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
