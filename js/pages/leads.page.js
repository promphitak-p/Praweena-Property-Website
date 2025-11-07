// js/pages/leads.page.js
// --------------------------------------------------
// รายชื่อผู้สนใจ (Leads)
// - guard หน้า + ตรวจสิทธิ์แอดมิน
// - ดึง leads โดยพยายาม join กับ properties (ผ่าน services)
// - Toggle "ดูล่าสุดก่อน" (DESC/ASC)
// - Inline status update (+ แจ้ง LINE ตอนเปลี่ยนสถานะ)
// - ลิงก์ไปหน้าทรัพย์เมื่อมี slug
// --------------------------------------------------
import { setupMobileNav } from '../ui/mobileNav.js';
import { protectPage } from '../auth/guard.js';
import { signOutIfAny } from '../auth/auth.js';
import { requireAdminPage } from '../auth/adminGuard.js';
import { listLeads, updateLead } from '../services/leadsService.js';
import { setupNav } from '../utils/config.js';
import { el, $, clear } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { notifyLeadStatusChange } from '../services/notifyService.js';

// ----- DOM targets -----
const tableBody = $('#leads-table tbody');
const pageContainer = document.querySelector('main.container');

// ----- Config -----
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost'];
let newestFirst = true; // toggle ลำดับ

// ป้องกันยิง notify ซ้ำเมื่อเปลี่ยนเร็ว ๆ
const notifyingSet = new Set();

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

function buildStatusSelect(lead, onChange) {
  const sel = el('select', { className: 'form-control' });
  LEAD_STATUSES.forEach(s => {
    const opt = el('option', { textContent: s, attributes: { value: s } });
    if (s === (lead.status || 'new')) opt.selected = true;
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
    const phoneLink = el('a', { attributes: { href: `tel:${lead.phone}` }, textContent: lead.phone });
    const copyBtn = el('button', { className: 'btn-copy-phone', textContent: 'คัดลอก' });
    copyBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await navigator.clipboard.writeText(lead.phone);
        toast('คัดลอกเบอร์เรียบร้อย ✅', 1500, 'success');
      } catch {
        toast('คัดลอกไม่สำเร็จ ❌', 2000, 'error');
      }
    });
    tdPhone.append(phoneLink, ' ', copyBtn);
  } else {
    tdPhone.textContent = '-';
  }

  const tdProp = el('td');
  const p = propertyCellInfo(lead);
  if (p.slug) {
    const url = `/property-detail.html?slug=${encodeURIComponent(p.slug)}`;
    tdProp.append(el('a', { attributes: { href: url, target: '_blank', rel: 'noopener noreferrer' }, textContent: p.title }));
  } else {
    tdProp.textContent = p.title;
  }

  const tdNote = el('td', { textContent: lead.note || '-' });

  const tdStatus = el('td');
  const select = buildStatusSelect(lead, async (newStatus, elSel) => {
    const prev = lead.status || 'new';
    if (newStatus === prev) return;

    // optimistic UI
    elSel.disabled = true;
    lead.status = newStatus;

    const { error } = await updateLead(lead.id, { status: newStatus });
    elSel.disabled = false;

    if (error) {
      lead.status = prev;
      elSel.value = prev;
      toast(`อัปเดตสถานะไม่สำเร็จ: ${error.message}`, 3500, 'error');
      return;
    }

    toast('อัปเดตสถานะสำเร็จ', 1800, 'success');

    // 🔔 แจ้งเตือนเปลี่ยนสถานะ (กันยิงซ้ำด้วย Set)
    const key = `lead-${lead.id}-${prev}->${newStatus}`;
    if (notifyingSet.has(key)) return;
    notifyingSet.add(key);
    try {
      await notifyLeadStatusChange({
        lead_id: lead.id,
        name: lead.name,
        phone: lead.phone,
        old_status: prev,
        new_status: newStatus,
        property_title: p.title,
        property_slug: p.slug
      });
    } finally {
      // ปลดธงหลังดีเลย์เล็กน้อย กันดับเบิลคลิก
      setTimeout(() => notifyingSet.delete(key), 1500);
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
  let { data, error } = await listLeads();
  if (error) {
    clear(tableBody);
    console.error(error);
    toast('เกิดข้อผิดพลาดขณะดึงข้อมูล: ' + error.message, 4000, 'error');
    return;
  }
  const rows = Array.isArray(data) ? data : [];
  rows.sort((a, b) => {
    const da = new Date(a.created_at).getTime();
    const db = new Date(b.created_at).getTime();
    return newestFirst ? db - da : da - db;
  });

  if (!rows.length) return renderEmpty();

  clear(tableBody);
  rows.forEach(renderRow);
}

// ----- Main -----
document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();
  const ok = await requireAdminPage({ redirect: '/index.html', showBadge: true });
  if (!ok) return;

  setupNav();
  signOutIfAny();
  setupMobileNav();

  ensureControls();
  await loadAndRender();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadAndRender();
  });
});
