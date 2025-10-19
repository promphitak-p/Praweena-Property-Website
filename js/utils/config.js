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

  // Active link styling
  const currentPage = window.location.pathname;
  navLinks.forEach(link => {
    if (link.getAttribute('href') === `.${currentPage}`) {
      link.classList.add('active');
    }
  });

  // Toggle Sign Out button
  if (session) {
    if (signOutBtn) signOutBtn.style.display = 'inline-block';
  } else {
    if (signOutBtn) signOutBtn.style.display = 'none';
  }
}