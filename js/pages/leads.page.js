// js/pages/leads.page.js
// --------------------------------------------------
// รายชื่อผู้สนใจ (Leads)
// - guard หน้า + ตรวจสิทธิ์แอดมิน
// - ดึง leads โดยพยายาม join กับ properties (ผ่าน services)
//   และรองรับกรณี properties ไม่มี/join ไม่ได้ (services ควร fallback)
// - Toggle "ดูล่าสุดก่อน" (DESC/ASC)
// - Inline status update
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
  // ถ้า services join มาด้วยจะมี row.properties
  if (row?.properties && (row.properties.title || row.properties.slug)) {
    return { title: row.properties.title || row.properties.slug, slug: row.properties.slug || row.property_slug || '' };
  }
  // ถ้าไม่มีความสัมพันธ์ ให้ใช้ property_slug ตรง ๆ
  if (row?.property_slug) return { title: row.property_slug, slug: row.property_slug };
  return { title: '-', slug: '' };
}

function buildStatusSelect(current, onChange) {
  const sel = el('select', { className: 'form-control' });
  LEAD_STATUSES.forEach(s => {
    const opt = el('option', { textContent: s, attributes: { value: s } });
    if (s === current) opt.selected = true;
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
  const tdPhone = el('td');
  if (lead.phone) tdPhone.append(el('a', { attributes: { href: `tel:${lead.phone}` }, textContent: lead.phone }));
  else tdPhone.textContent = '-';

  const tdProp = el('td');
  const p = propertyCellInfo(lead);
  if (p.slug) {
    const url = `/property-detail.html?slug=${encodeURIComponent(p.slug)}`;
    tdProp.append(el('a', { attributes: { href: url, target: '_blank', rel: 'noopener' }, textContent: p.title }));
  } else {
    tdProp.textContent = p.title;
  }

  const tdNote = el('td', { textContent: lead.note || '-' });

  const tdStatus = el('td');
  const select = buildStatusSelect(lead.status || 'new', async (newStatus, elSel) => {
    // optimistic UI
    const prev = lead.status || 'new';
    lead.status = newStatus;
    const { error } = await updateLead(lead.id, { status: newStatus });
    if (error) {
      lead.status = prev;
      elSel.value = prev;
      toast(`อัปเดตสถานะไม่สำเร็จ: ${error.message}`, 3500, 'error');
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
  // listLeads() ใน services ควรจัดเรียง DESC อยู่แล้ว; ถ้าต้องสลับให้จัดใน client
  let { data, error } = await listLeads();
  if (error) {
    clear(tableBody);
    console.error(error);
    toast('เกิดข้อผิดพลาดขณะดึงข้อมูล: ' + error.message, 4000, 'error');
    return;
  }
  const rows = Array.isArray(data) ? data : [];
  // สลับลำดับฝั่ง client ตาม newestFirst
  rows.sort((a, b) => {
    const da = new Date(a.created_at).getTime();
    const db = new Date(b.created_at).getTime();
    return newestFirst ? db - da : da - db;
    // DESC เมื่อ newestFirst = true
  });

  if (!rows.length) return renderEmpty();

  clear(tableBody);
  rows.forEach(renderRow);
}

// ----- Main -----
document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();           // ต้องล็อกอิน
  const ok = await requireAdminPage({ redirect: '/index.html', showBadge: true });
  if (!ok) return;               // ไม่ใช่แอดมิน → รีไดเรกต์แล้วหยุด

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
