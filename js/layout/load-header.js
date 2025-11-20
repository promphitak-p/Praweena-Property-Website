// /js/layout/load-header.js
import { setupMobileNav } from '../ui/mobileNav.js';
import { signOutIfAny } from '../auth/auth.js';
import { setupNav } from '../utils/config.js';

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

    // เรียก setup ต่าง ๆ หลังจาก header อยู่ใน DOM แล้ว
    setupNav();
    setupMobileNav();
    await signOutIfAny();
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
