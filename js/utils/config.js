// js/utils/config.js
import { getSession } from '../lib/supabaseClient.js';
import { $, $$ } from '../ui/dom.js';

/**
 * ตั้งค่า Navigation Bar:
 * 1. ทำให้ลิงก์ของหน้าปัจจุบัน active
 * 2. แสดง/ซ่อน ปุ่ม Sign Out ตามสถานะการล็อกอิน
 */
export async function setupNav() {
  const session = await getSession();
  const signOutBtn = $('#sign-out-btn');
  const navLinks = $$('.nav-links a');

  // Toggle Sign Out button
  if (session) {
    if (signOutBtn) signOutBtn.style.display = 'inline-block';
  } else {
    if (signOutBtn) signOutBtn.style.display = 'none';
  }
}

// js/utils/config.js
export function autoActiveNav() {
  const path = location.pathname.replace(/\/+$/, '');
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = (a.getAttribute('href') || '').replace(/\/+$/, '');
    if (!href) return;

    const hrefNoHtml = href.replace('.html','');
    const pathNoHtml = path.replace('.html','');

    if (pathNoHtml.endsWith(hrefNoHtml)) {
      a.classList.add('active');
      a.setAttribute('aria-current','page');
    }
  });
}
