// js/pages/leads.page.js
// --------------------------------------------------
// รายชื่อผู้สนใจ (Leads)
// - guard หน้า + ตรวจสิทธิ์แอดมิน
// - ดึง leads โดยพยายาม join กับ properties (ผ่าน services)
// - Toggle "ดูล่าสุดก่อน" (DESC/ASC)
// - Inline status update (+ แจ้ง LINE ตอนเปลี่ยนสถานะ)
// - ลิงก์ไปหน้าทรัพย์เมื่อมี slug
// - NEW: Suggested Merge System
// --------------------------------------------------
import { setupMobileNav } from '../ui/mobileNav.js';
import { protectPage } from '../auth/guard.js';
import { signOutIfAny } from '../auth/auth.js';
import { requireAdminPage } from '../auth/adminGuard.js';
import { listLeads, updateLead, findDuplicates, mergeLeads } from '../services/leadsService.js';
import { setupNav } from '../utils/config.js';
import { el, $, clear } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { notifyLeadStatusChange } from '../services/notifyService.js';

// ----- DOM targets -----
const tableBody = $('#leads-table tbody');
const pageContainer = document.querySelector('main.container');

// ----- Config -----
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost'];
let allLeads = []; // Store fetched leads here
let currentFilter = { text: '', status: '', newestFirst: true };

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

// ----- Modal Logic -----
const modal = $('#lead-modal');
const modalCloseBtn = $('#lead-modal-close');

// Merge Modal
const mergeModal = $('#merge-modal');
const mergeModalClose = $('#merge-modal-close');
const mergeListContainer = $('#merge-list-container');
const btnCheckDup = $('#btn-check-dup');

function closeLeadModal() {
  if (modal) modal.classList.remove('open');
}

function openLeadModal(lead) {
  if (!modal) return;

  // Populate Fields
  $('#lead-modal-name').textContent = lead.name || 'ไม่ระบุชื่อ';
  $('#lead-modal-date').textContent = `วันที่ติดต่อ: ${fmtDate(lead.created_at)}`;

  // Status Badge
  const statusEl = $('#lead-modal-status');
  statusEl.textContent = lead.status || 'new';
  statusEl.dataset.status = lead.status || 'new';

  // Phone
  const phoneLink = $('#lead-modal-phone-link');
  if (lead.phone) {
    phoneLink.textContent = lead.phone;
    phoneLink.href = `tel:${lead.phone}`;
  } else {
    phoneLink.textContent = '-';
    phoneLink.removeAttribute('href');
  }

  // Copy Phone Button Binding
  const copyBtn = $('#lead-modal-copy-phone');
  copyBtn.onclick = async (e) => {
    e.stopPropagation();
    if (lead.phone) {
      try {
        await navigator.clipboard.writeText(lead.phone);
        toast('คัดลอกเบอร์โทรแล้ว', 1000, 'success');
      } catch { }
    }
  };

  // Property
  const propEl = $('#lead-modal-property');
  const p = propertyCellInfo(lead);
  clear(propEl);
  if (p.slug) {
    propEl.append(el('a', {
      attributes: { href: `/property-detail.html?slug=${p.slug}`, target: '_blank' },
      textContent: p.title
    }));
  } else {
    propEl.textContent = p.title;
  }

  // Message
  const msgEl = $('#lead-modal-message');
  msgEl.textContent = lead.note || '-';

  // Call Button
  const callBtn = $('#lead-modal-call-btn');
  if (lead.phone) {
    callBtn.href = `tel:${lead.phone}`;
    callBtn.classList.remove('disabled');
  } else {
    callBtn.removeAttribute('href');
    callBtn.classList.add('disabled');
  }

  modal.classList.add('open');
}

// ----- Render Helpers -----
function renderRow(lead) {
  const tr = el('tr', { attributes: { 'data-id': lead.id } });

  // Make row clickable
  tr.addEventListener('click', (e) => {
    // Ignore clicks on interactive elements inside the row
    if (e.target.closest('a, button, select')) return;
    openLeadModal(lead);
  });

  tr.style.cursor = 'pointer'; // Indicate clickability

  const tdDate = el('td', { textContent: fmtDate(lead.created_at) });
  const tdName = el('td', { textContent: lead.name || '-' });

  // Phone
  const tdPhone = el('td');
  if (lead.phone) {
    const phoneLink = el('a', { attributes: { href: `tel:${lead.phone}` }, textContent: lead.phone });
    const copyBtn = el('button', { className: 'btn-copy-phone', textContent: 'Copy', style: 'margin-left:5px;font-size:0.8rem;' });
    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation(); // Prevent modal opening
      try {
        await navigator.clipboard.writeText(lead.phone);
        toast('คัดลอกแล้ว', 1000, 'success');
      } catch { }
    });
    tdPhone.append(phoneLink, copyBtn);
  } else {
    tdPhone.textContent = '-';
  }

  // Property
  const tdProp = el('td');
  const p = propertyCellInfo(lead);
  if (p.slug) {
    tdProp.append(el('a', { attributes: { href: `/property-detail.html?slug=${p.slug}`, target: '_blank' }, textContent: p.title }));
  } else {
    tdProp.textContent = p.title;
  }

  const tdNote = el('td', { textContent: lead.note || '-' });

  // Status
  const tdStatus = el('td');
  const select = buildStatusSelect(lead, async (newStatus, elSel) => {
    const prev = lead.status || 'new';
    if (newStatus === prev) return;

    // Optimistic Update
    lead.status = newStatus;
    const { error } = await updateLead(lead.id, { status: newStatus });
    if (error) {
      lead.status = prev;
      elSel.value = prev;
      toast(`Error: ${error.message}`, 3000, 'error');
      return;
    }
    toast('สถานะอัปเดตเรียบร้อย', 1500, 'success');

    // Notify
    if (!notifyingSet.has(lead.id)) {
      notifyingSet.add(lead.id);
      notifyLeadStatusChange({ ...lead, old_status: prev, new_status: newStatus }).finally(() => setTimeout(() => notifyingSet.delete(lead.id), 2000));
    }
  });
  select.addEventListener('click', e => e.stopPropagation()); // Prevent modal opening
  tdStatus.append(select);

  tr.append(tdDate, tdName, tdPhone, tdProp, tdNote, tdStatus);
  tableBody.append(tr);
}

function renderSkeleton() {
  clear(tableBody);
  const tr = el('tr');
  tr.append(el('td', { attributes: { colspan: 6 }, innerHTML: `<div class="skeleton" style="height:48px;"></div>` }));
  tableBody.append(tr);
}

function renderEmpty() {
  clear(tableBody);
  const tr = el('tr');
  tr.append(el('td', { attributes: { colspan: 6 }, style: 'text-align:center;padding:1.5rem;', textContent: 'ยังไม่มีข้อมูล' }));
  tableBody.append(tr);
}

// ----- Filter Logic -----
function filterAndSort() {
  let rows = [...allLeads];

  // 1. Text Filter (Name, Phone, Note)
  if (currentFilter.text) {
    const q = currentFilter.text.toLowerCase();
    rows = rows.filter(r => {
      const txt = (r.name || '') + (r.phone || '') + (r.note || '') + (r.properties?.title || '');
      return txt.toLowerCase().includes(q);
    });
  }

  // 2. Status Filter
  if (currentFilter.status) {
    rows = rows.filter(r => (r.status || 'new') === currentFilter.status);
  }

  // 3. Sort
  rows.sort((a, b) => {
    const da = new Date(a.created_at).getTime();
    const db = new Date(b.created_at).getTime();
    return currentFilter.newestFirst ? db - da : da - db;
  });

  return rows;
}

function renderFiltered() {
  const rows = filterAndSort();
  clear(tableBody);

  if (!rows.length) {
    if (allLeads.length > 0) {
      // มีข้อมูลแต่กรองแล้วไม่เจอ
      const tr = el('tr');
      tr.append(el('td', {
        attributes: { colspan: 6 },
        style: 'text-align:center;color:#6b7280;padding:2rem;',
        textContent: 'ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหา'
      }));
      tableBody.append(tr);
    } else {
      // ไม่มีข้อมูลเลย
      renderEmpty();
    }
    return;
  }

  rows.forEach(renderRow);
}

// ----- Controls -----
function setupControls() {
  const searchInput = $('#search-input');
  const statusFilter = $('#status-filter');
  const sortCheck = $('#sort-newest');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentFilter.text = e.target.value;
      renderFiltered();
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', (e) => {
      currentFilter.status = e.target.value;
      renderFiltered();
    });
  }

  if (sortCheck) {
    sortCheck.addEventListener('change', (e) => {
      currentFilter.newestFirst = e.target.checked;
      renderFiltered();
    });
  }
}

// ----- Data loading -----
async function loadData() {
  renderSkeleton();
  let { data, error } = await listLeads();
  if (error) {
    clear(tableBody);
    console.error(error);
    toast('เกิดข้อผิดพลาดขณะดึงข้อมูล: ' + error.message, 4000, 'error');
    return;
  }
  allLeads = Array.isArray(data) ? data : [];
  renderFiltered();
}

// ----- Merge Logic -----
async function setupMergeFeature() {
  if (!btnCheckDup) return;

  btnCheckDup.addEventListener('click', async () => {
    try {
      btnCheckDup.disabled = true;
      btnCheckDup.textContent = '...';
      const groups = await findDuplicates();
      btnCheckDup.disabled = false;
      btnCheckDup.textContent = '🔍 ตรวจสอบซ้ำ';
      renderMergeList(groups);
      mergeModal.classList.add('open');
    } catch (err) {
      console.error(err);
      toast('ตรวจสอบล้มเหลว: ' + err.message, 3000, 'error');
      btnCheckDup.disabled = false;
      btnCheckDup.textContent = '🔍 ตรวจสอบซ้ำ';
    }
  });

  if (mergeModalClose) {
    mergeModalClose.addEventListener('click', () => mergeModal.classList.remove('open'));
  }
}

function renderMergeList(groups) {
  clear(mergeListContainer);

  if (!groups || groups.length === 0) {
    mergeListContainer.innerHTML = `<div style="text-align:center; padding:2rem; color:#6b7280;">ไม่พบรายชื่อซ้ำ ✅</div>`;
    return;
  }

  groups.forEach(group => {
    const card = el('div', { className: 'card', style: 'margin-bottom:1rem; padding:1rem; border:1px solid #e5e7eb;' });
    const title = el('h4', { textContent: `กลุ่มซ้ำ (${group.length} รายการ)`, style: 'margin-bottom:0.5rem; color:#d97706;' });

    const table = el('table', { style: 'width:100%; font-size:0.9rem; border-collapse: collapse;' });

    // Helper to update visuals (green bg + label)
    function updateSelectionVisuals() {
      const allTr = table.querySelectorAll('tr');
      allTr.forEach(row => {
        const rad = row.querySelector('input[type="radio"]');
        if (!rad) return;

        const tds = row.querySelectorAll('td');
        if (tds.length < 2) return;

        const infoDiv = tds[1].querySelector('div');
        if (!infoDiv) return;

        // Remove existing badge if any
        const existingBadge = infoDiv.querySelector('.master-badge');
        if (existingBadge) existingBadge.remove();

        if (rad.checked) {
          row.style.backgroundColor = '#f0fdf4';
          // Add Badge
          const badge = el('span', {
            className: 'master-badge',
            textContent: ' ✅ รายชื่อหลัก',
            style: 'color:#16a34a; font-size:0.85rem; margin-left:0.5rem;'
          });
          infoDiv.append(badge);
        } else {
          row.style.backgroundColor = 'transparent';
        }
      });
    }


    group.forEach(lead => {
      const tr = el('tr', { style: 'border-bottom:1px solid #f3f4f6; cursor:pointer;' });

      // Radio for selecting master
      const tdRadio = el('td', { style: 'width:40px; text-align:center; vertical-align:middle;' });
      const radio = el('input', {
        type: 'radio',
        name: `master_${group[0].id}`,
        value: lead.id,
        style: 'cursor:pointer; transform: scale(1.2);'
      });

      // Default to the first one (most recent usually)
      if (lead === group[0]) radio.checked = true;
      tdRadio.append(radio);

      const tdInfo = el('td', { style: 'padding: 8px;' });
      tdInfo.innerHTML = `
        <div style="font-weight:600; font-size:1rem;">${lead.name || '-'}</div>
        <div class="text-muted" style="font-size:0.85rem;">
          ${fmtDate(lead.created_at)} | <span class="badge badge-${lead.status || 'new'}">${lead.status || 'new'}</span>
        </div>
      `;

      // Click row to select
      tr.addEventListener('click', () => {
        radio.checked = true;
        updateSelectionVisuals();
      });

      radio.addEventListener('change', updateSelectionVisuals);

      tr.append(tdRadio, tdInfo);
      table.append(tr);
    });

    // Initial call after loop
    updateSelectionVisuals();

    const actionDiv = el('div', { style: 'margin-top:1rem; text-align:right;' });
    const mergeBtn = el('button', { className: 'btn btn-primary btn-sm', textContent: 'รวมข้อมูล (Merge)' });

    mergeBtn.addEventListener('click', async () => {
      // Use scoped selector inside card (Generic)
      const selectedId = card.querySelector('input[type="radio"]:checked')?.value;

      if (!selectedId) return toast('กรุณาเลือกรายชื่อหลัก');

      if (!confirm('ยืนยันการรวม? (ข้อมูลซ้ำจะถูกลบถาวร)')) return;

      try {
        mergeBtn.disabled = true;
        mergeBtn.textContent = 'Merging...';

        const duplicateIds = group.map(l => l.id).filter(id => String(id) !== String(selectedId));
        await mergeLeads(selectedId, duplicateIds);

        toast('รวมข้อมูลเรียบร้อย ✅');
        card.remove(); // Remove from UI
        await loadData(); // Reload main table

        if (mergeListContainer.children.length === 0) {
          mergeListContainer.innerHTML = `<div style="text-align:center; padding:2rem; color:#6b7280;">ไม่พบรายชื่อซ้ำ ✅</div>`;
        }

      } catch (err) {
        console.error(err);
        toast('Merge Failed: ' + err.message, 3000, 'error');
        mergeBtn.disabled = false;
        mergeBtn.textContent = 'รวมข้อมูล (Merge)';
      }
    });

    actionDiv.append(mergeBtn);
    card.append(title, table, actionDiv);
    mergeListContainer.append(card);
  });
}

// ----- Main -----
document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();
  const ok = await requireAdminPage({ redirect: '/index.html', showBadge: true });
  if (!ok) return;

  setupNav();
  signOutIfAny();
  setupMobileNav();

  setupControls(); // Bind events
  await setupMergeFeature(); // NEW
  await loadData(); // Fetch and render

  // Modal Close Events
  if (modalCloseBtn) modalCloseBtn.onclick = closeLeadModal;
  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) closeLeadModal();
    };
    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) {
        closeLeadModal();
      }
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadData();
  });
});
