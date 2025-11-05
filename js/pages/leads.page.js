// js/pages/leads.page.js
// --------------------------------------------------
// รายชื่อผู้สนใจ (Leads)
// - guard หน้า + ตรวจสิทธิ์แอดมิน
// - ดึง leads + จัดเรียง (toggle ใหม่สุดก่อน)
// - ปุ่มโทร + ปุ่มคัดลอกเบอร์
// - อัปเดตสถานะแบบ inline (new / contacted / qualified / won / lost)
// - ลิงก์ไปหน้าทรัพย์จาก slug ถ้ามี
// --------------------------------------------------

import { setupMobileNav } from '../ui/mobileNav.js';
import { protectPage } from '../auth/guard.js';
import { signOutIfAny } from '../auth/auth.js';
import { requireAdminPage } from '../auth/adminGuard.js';
import { listLeads, updateLead } from '../services/leadsService.js';
import { setupNav } from '../utils/config.js';
import { el, $, clear } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

// ----- DOM targets -----
const tableBody = $('#leads-table tbody');
const pageContainer = document.querySelector('main.container');

// ----- Config -----
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost'];
let newestFirst = true; // toggle ลำดับ

// ----- Utils -----
function fmtDate(dt) {
  try {
    const d = new Date(dt);
    const th = d.toLocaleDateString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const t = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    return `${th} ${t}`;
  } catch {
    return dt ?? '';
  }
}
function propertyCellInfo(row) {
  if (row?.properties && (row.properties.title || row.properties.slug)) {
    return { title: row.properties.title || row.properties.slug, slug: row.properties.slug || row.property_slug || '' };
  }
  if (row?.property_slug) return { title: row.property_slug, slug: row.property_slug };
  return { title: '-', slug: '' };
}
function buildStatusSelect(current, onChange) {
  const sel = el('select', { className: 'form-control' });
  LEAD_STATUSES.forEach(s => {
    const opt = el('option', { textContent: s, attributes: { value: s } });
    if (s === (current || 'new')) opt.selected = true;
    sel.append(opt);
  });
  if (typeof onChange === 'function') {
    sel.addEventListener('change', (e) => onChange(e.target.value, sel));
  }
  return sel;
}

// ----- Render -----
function renderRow(lead) {
  const tr = el('tr', { attributes: { 'data-id': lead.id } });

  const tdDate = el('td', { textContent: fmtDate(lead.created_at) });
  const tdName = el('td', { textContent: lead.name || '-' });

  // โทร + คัดลอกเบอร์
  const tdPhone = el('td');
  if (lead.phone) {
    const phoneLink = el('a', {
      attributes: { href: `tel:${lead.phone}` },
      textContent: lead.phone
    });
    const copyBtn = el('button', {
      className: 'btn-copy-phone',
      textContent: 'คัดลอก',
      style: 'margin-left:.5rem;padding:.25rem .5rem;border:1px solid #e5e7eb;background:#f9fafb;border-radius:6px;cursor:pointer;font-size:.8rem;'
    });
    copyBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await navigator.clipboard.writeText(lead.phone);
        toast('คัดลอกเบอร์เรียบร้อย ✅', 1500, 'success');
      } catch {
        toast('คัดลอกไม่สำเร็จ ❌', 2000, 'error');
      }
    });
    tdPhone.append(phoneLink, copyBtn);
  } else {
    tdPhone.textContent = '-';
  }

  // ลิงก์ไปหน้าทรัพย์
  const tdProp = el('td');
  const p = propertyCellInfo(lead);
  if (p.slug) {
    const url = `/property-detail.html?slug=${encodeURIComponent(p.slug)}`;
    tdProp.append(el('a', { attributes: { href: url, target: '_blank', rel: 'noopener noreferrer' }, textContent: p.title }));
  } else {
    tdProp.textContent = p.title;
  }

  const tdNote = el('td', { textContent: lead.note || '-' });

  // สถานะ (inline update)
  const tdStatus = el('td');
  const select = buildStatusSelect(lead.status || 'new', async (newStatus, elSel) => {
    const prev = lead.status || 'new';
    lead.status = newStatus;
    const { error } = await updateLead(lead.id, { status: newStatus });
    if (error) {
      // กรณีตารางยังไม่มีคอลัมน์ status ให้ย้อนกลับและแจ้งเตือนชัดเจน
      lead.status = prev;
      elSel.value = prev;
      const msg = (error?.message || 'อัปเดตสถานะไม่สำเร็จ');
      toast(msg.includes('column') && msg.includes('status')
        ? 'ยังไม่มีคอลัมน์ status ในตาราง leads กรุณาเพิ่มก่อน'
        : `อัปเดตสถานะไม่สำเร็จ: ${msg}`, 4000, 'error');
    } else {
      toast('อัปเดตสถานะสำเร็จ', 1800, 'success');
    }
  });
  tdStatus.append(select);

  tr.append(tdDate, tdName, tdPhone, tdProp, tdNote, tdStatus);
  tableBody.append(tr);
}

function renderSkeleton() {
  clear(tableBody);
  const tr = el('tr');
  tr.append(el('td', {
    attributes: { colspan: 6 },
    innerHTML: `<div class="skeleton" style="height:48px;border-radius:10px;"></div>`
  }));
  tableBody.append(tr);
}
function renderEmpty() {
  clear(tableBody);
  const tr = el('tr');
  tr.append(el('td', {
    attributes: { colspan: 6 },
    style: 'text-align:center;color:#6b7280;padding:1rem;',
    textContent: 'ยังไม่มีผู้สนใจติดต่อเข้ามา'
  }));
  tableBody.append(tr);
}

// ----- Controls (toggle newest first) -----
function ensureControls() {
  let ctr = $('#leads-controls');
  if (!ctr) {
    ctr = el('div', { attributes: { id: 'leads-controls' }, style: 'margin-bottom:.75rem;display:flex;align-items:center;gap:.5rem;' });
    const label = el('label', { style: 'display:inline-flex;align-items:center;gap:.4rem;user-select:none;' });
    const cb = el('input', { attributes: { type: 'checkbox' } });
    cb.checked = true;
    cb.addEventListener('change', async () => {
      newestFirst = cb.checked;
      await loadAndRender();
    });
    label.append(cb, el('span', { textContent: 'ดูล่าสุดก่อน (สลับลำดับ)' }));
    ctr.append(label);
    pageContainer?.insertBefore(ctr, pageContainer.querySelector('.table-wrapper'));
  }
}

// ----- Data loading -----
async function loadAndRender() {
  renderSkeleton();

  // ⬇️ แก้ scope ให้ชัดเจน ป้องกัน "data is not defined"
  const result = await listLeads();
  const data = result?.data || [];
  const error = result?.error;

  if (error) {
    clear(tableBody);
    console.error('[LEADS] load error:', error);
    toast('เกิดข้อผิดพลาดขณะดึงข้อมูล: ' + error.message, 4000, 'error');
    return;
  }

  const rows = Array.isArray(data) ? data.slice() : [];
  rows.sort((a, b) => {
    const da = new Date(a.created_at).getTime();
    const db = new Date(b.created_at).getTime();
    return newestFirst ? db - da : da - db; // DESC เมื่อ newestFirst = true
  });

  if (!rows.length) return renderEmpty();

  clear(tableBody);
  // console.log('[LEADS]', rows); // เปิดใช้เวลา debug ได้
  rows.forEach(renderRow);
}

// ----- Main -----
document.addEventListener('DOMContentLoaded', async () => {
  await protectPage(); // ต้องล็อกอิน

  const ok = await requireAdminPage({ redirect: '/index.html', showBadge: true });
  if (!ok) return; // ไม่ใช่แอดมิน → รีไดเรกต์แล้วหยุด

  setupNav();
  signOutIfAny();
  setupMobileNav();

  ensureControls();
  await loadAndRender();

  // กลับแท็บมาแล้วรีเฟรชสั้น ๆ
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadAndRender();
  });
});
