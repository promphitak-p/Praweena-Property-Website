// js/auth/adminGuard.js
import { supabase } from '../utils/supabaseClient.js';
import { el, $, clear } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

export async function checkIsAdmin() {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) throw error;
  return !!data;
}

export async function renderRoleBadge(target = null) {
  const isAdmin = await checkIsAdmin();
  let badge = $('#role-indicator');
  if (!badge) {
    const host = target || document.querySelector('main') || document.body;
    const h1 = host.querySelector('h1');
    badge = el('div', { id: 'role-indicator' });
    if (h1) h1.insertAdjacentElement('afterend', badge);
    else host.prepend(badge);
  }
  badge.textContent = isAdmin
    ? 'คุณคือแอดมิน ✅  (จัดการข้อมูลได้ทุกอย่าง)'
    : 'คุณคือผู้ใช้งานทั่วไป 🔒  (โหมดอ่านอย่างเดียว)';
  badge.style.cssText = `
    display:inline-block;margin:.25rem 0 1rem 0;padding:.35rem .6rem;border-radius:999px;
    font-size:.9rem;line-height:1;background:${isAdmin ? '#dcfce7' : '#e5e7eb'};
    color:${isAdmin ? '#14532d' : '#374151'};border:1px solid ${isAdmin ? '#86efac' : '#d1d5db'};
  `;
  return isAdmin;
}

/** ใช้กับหน้าที่ “ต้องเป็นแอดมินเท่านั้น” */
export async function requireAdminPage(opts = {}) {
  const { redirect = '/index.html', showBadge = true, blockInPlace = false } = opts;
  const isAdmin = await checkIsAdmin();
  if (showBadge) await renderRoleBadge();

  if (!isAdmin) {
    if (blockInPlace) {
      const main = document.querySelector('main') || document.body;
      clear(main);
      const msg = el('div', { style: 'padding:2rem;text-align:center;color:#b91c1c;' });
      msg.innerHTML = `<h2>ต้องเป็นแอดมินเท่านั้น</h2><p>คุณไม่มีสิทธิ์เข้าหน้านี้</p>`;
      main.append(msg);
    } else {
      toast('หน้านี้สำหรับแอดมินเท่านั้น', 2500, 'error');
      window.location.href = redirect;
    }
    return false;
  }
  return true;
}
