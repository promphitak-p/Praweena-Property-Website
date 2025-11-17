// js/pages/renovation-book-detail.page.js
//--------------------------------------------------
// สมุดรีโนเวทบ้าน (ต่อหลัง)
// - admin only (protectPage + requireAdminPage)
// - โหลดข้อมูลบ้าน + specs + contractors
// - ฟอร์มเพิ่ม/แก้ไขสเปกแบบ modal (ไม่ใช้ prompt)
// - ฟิลเตอร์ / ค้นหา สเปก
// - ฟอร์มเพิ่ม/แก้ไขทีมช่างแบบ modal
// - Export PDF / ปุ่มพิมพ์ สมุดรีโนเวท
//--------------------------------------------------

import { setupMobileNav } from '../ui/mobileNav.js';
import { protectPage } from '../auth/guard.js';
import { requireAdminPage } from '../auth/adminGuard.js';
import { signOutIfAny } from '../auth/auth.js';
import { setupNav } from '../utils/config.js';
import { supabase } from '../utils/supabaseClient.js';
import { el, $, clear } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

import {
  listSpecsByProperty,
  upsertSpec,
  deleteSpec,
} from '../services/propertySpecsService.js';

import {
  listContractorsForProperty,
  upsertPropertyContractor,
  deletePropertyContractor,
} from '../services/propertyContractorsService.js';

import { upsertContractor } from '../services/contractorsService.js';

// ----------------- State -----------------
let currentProperty = null;
let currentSpecs = [];
let currentContractorLinks = [];

// modal refs
let specModal, specForm;
let contractorModal, contractorForm;

// ----------------- Helpers -----------------
function getPropertyIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('property_id');
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function fmtPrice(n) {
  const val = Number(n) || 0;
  return val.toLocaleString('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  });
}

function fmtSize(p) {
  if (!p) return '-';
  return p.size_text || '-';
}

function ensureModalRefs() {
  if (!specModal) specModal = $('#spec-modal');
  if (!specForm) specForm = $('#spec-form');
  if (!contractorModal) contractorModal = $('#contractor-modal');
  if (!contractorForm) contractorForm = $('#contractor-form');
}

function openModal(modal) {
  if (!modal) return;
  modal.classList.add('open');
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.remove('open');
}

// ----------------- Load property -----------------
async function loadProperty(propertyId) {
  const metaBox = $('#renovation-meta');
  if (metaBox) {
    metaBox.innerHTML =
      '<p style="color:#6b7280;">กำลังโหลดข้อมูลบ้าน...</p>';
  }

  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('id', propertyId)
    .single();

  if (error || !data) {
    if (metaBox) {
      metaBox.innerHTML =
        '<p style="color:#b91c1c;">ไม่พบข้อมูลบ้านหลังนี้</p>';
    }
    throw error || new Error('property not found');
  }

  currentProperty = data;

  if (metaBox) {
    clear(metaBox);

    const title = el('h2', {
      textContent: `สมุดรีโนเวท: ${data.title || '-'}`,
      style: 'margin-bottom:.25rem;',
    });

    const addr = el('p', {
      style: 'color:#4b5563;margin-bottom:.25rem;',
      textContent: `${data.address || ''} ${
        data.district || ''
      } ${data.province || ''}`.trim() || '-',
    });

    const metaLine = el('p', {
      style: 'color:#6b7280;font-size:.9rem;',
      textContent: `ขนาด: ${fmtSize(
        data
      )} | ราคา: ${fmtPrice(data.price)}`,
    });

    metaBox.append(title, addr, metaLine);
  }
}

// ----------------- Specs: Filter helpers -----------------
function getSpecsFilters() {
  const textInput = $('#spec-filter-text');
  const zoneSel = $('#spec-filter-zone');
  const typeSel = $('#spec-filter-type');

  return {
    text: (textInput?.value || '').trim().toLowerCase(),
    zone: zoneSel?.value || '',
    type: typeSel?.value || '',
  };
}

function applySpecsFilters() {
  const { text, zone, type } = getSpecsFilters();

  return currentSpecs.filter((s) => {
    if (zone && s.zone !== zone) return false;
    if (type && s.item_type !== type) return false;

    if (!text) return true;

    const blob = [
      s.zone,
      s.item_type,
      s.brand,
      s.model_or_series,
      s.color_code,
      s.supplier,
      s.note,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return blob.includes(text);
  });
}

// ----------------- Specs: Render -----------------
function renderSpecs(specs) {
  const container = $('#specs-list');
  if (!container) return;

  clear(container);

  // สร้าง filter bar
  const filterBar = document.createElement('div');
  filterBar.style.cssText =
    'display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-bottom:.75rem;';

  const textInput = document.createElement('input');
  textInput.id = 'spec-filter-text';
  textInput.className = 'form-control';
  textInput.placeholder = 'ค้นหาจากโซน / วัสดุ / ยี่ห้อ / หมายเหตุ';

  const zoneSel = document.createElement('select');
  zoneSel.id = 'spec-filter-zone';
  zoneSel.className = 'form-control';
  const zoneDefault = document.createElement('option');
  zoneDefault.value = '';
  zoneDefault.textContent = 'ทุกโซน';
  zoneSel.append(zoneDefault);

  const zones = Array.from(
    new Set(specs.map((s) => s.zone).filter(Boolean))
  );
  zones.forEach((z) => {
    const opt = document.createElement('option');
    opt.value = z;
    opt.textContent = z;
    zoneSel.append(opt);
  });

  const typeSel = document.createElement('select');
  typeSel.id = 'spec-filter-type';
  typeSel.className = 'form-control';
  const typeDefault = document.createElement('option');
  typeDefault.value = '';
  typeDefault.textContent = 'ทุกประเภท';
  typeSel.append(typeDefault);

  const types = Array.from(
    new Set(specs.map((s) => s.item_type).filter(Boolean))
  );
  types.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    typeSel.append(opt);
  });

  [textInput, zoneSel, typeSel].forEach((elInput) => {
    elInput.style.maxWidth = '220px';
    elInput.addEventListener('input', () => {
      const filtered = applySpecsFilters();
      renderSpecsTable(filtered);
    });
    elInput.addEventListener('change', () => {
      const filtered = applySpecsFilters();
      renderSpecsTable(filtered);
    });
  });

  filterBar.append(textInput, zoneSel, typeSel);
  container.append(filterBar);

  // สร้าง table wrapper
  const tableWrap = document.createElement('div');
  tableWrap.id = 'specs-table-wrap';
  container.append(tableWrap);

  renderSpecsTable(specs);
}

function renderSpecsTable(specs) {
  const tableWrap = $('#specs-table-wrap');
  if (!tableWrap) return;

  clear(tableWrap);

  if (!specs.length) {
    tableWrap.innerHTML =
      '<p style="color:#9ca3af;">ยังไม่ได้บันทึกสเปกรีโนเวทสำหรับบ้านหลังนี้</p>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'table-compact';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>โซน</th>
      <th>ประเภท</th>
      <th>วัสดุ / ยี่ห้อ / รุ่น</th>
      <th>เลขสี / ร้าน</th>
      <th>หมายเหตุ</th>
      <th style="width:80px;"></th>
    </tr>
  `;
  table.append(thead);

  const tbody = document.createElement('tbody');

  specs.forEach((s) => {
    const tr = document.createElement('tr');

    const material = [
      s.brand,
      s.model_or_series,
      s.color_code && `(${s.color_code})`,
    ]
      .filter(Boolean)
      .join(' / ');

    const supplier = s.supplier || '';

    tr.innerHTML = `
      <td>${s.zone || ''}</td>
      <td>${s.item_type || ''}</td>
      <td>${material || '-'}</td>
      <td>${supplier}</td>
      <td>${s.note || ''}</td>
      <td style="text-align:right;">
        <button class="btn btn-xs btn-secondary btn-edit-spec" data-id="${s.id}">แก้ไข</button>
        <button class="btn btn-xs btn-danger btn-delete-spec" data-id="${s.id}">ลบ</button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  tableWrap.appendChild(table);

  // bind edit/delete
  tableWrap.querySelectorAll('.btn-edit-spec').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const spec = currentSpecs.find((s) => s.id === id);
      openSpecForm(spec || null);
    });
  });

  tableWrap.querySelectorAll('.btn-delete-spec').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      if (!id) return;
      if (!confirm('ต้องการลบสเปกนี้หรือไม่?')) return;
      try {
        await deleteSpec(id);
        toast('ลบสเปกเรียบร้อย', 1600, 'success');
        await reloadSpecs();
      } catch (err) {
        console.error(err);
        toast('ลบสเปกไม่สำเร็จ', 2000, 'error');
      }
    });
  });
}

// ----------------- Specs: Load -----------------
async function reloadSpecs() {
  const container = $('#specs-list');
  if (container) {
    container.innerHTML =
      '<p style="color:#6b7280;">กำลังโหลดข้อมูลสเปกรีโนเวท...</p>';
  }

  try {
    const specs = await listSpecsByProperty(currentProperty.id);
    currentSpecs = Array.isArray(specs) ? specs : [];
    renderSpecs(currentSpecs);
  } catch (err) {
    console.error(err);
    if (container) {
      container.innerHTML =
        '<p style="color:#b91c1c;">โหลดข้อมูลสเปกไม่สำเร็จ</p>';
    }
  }
}

// ----------------- Specs: Form -----------------
function openSpecForm(spec = null) {
  ensureModalRefs();
  if (!specForm || !specModal) return;

  specForm.reset();
  specForm.elements.spec_id.value = spec?.id || '';
  specForm.elements.zone.value = spec?.zone || '';
  specForm.elements.item_type.value = spec?.item_type || '';
  specForm.elements.brand.value = spec?.brand || '';
  specForm.elements.model_or_series.value = spec?.model_or_series || '';
  specForm.elements.color_code.value = spec?.color_code || '';
  specForm.elements.supplier.value = spec?.supplier || '';
  specForm.elements.note.value = spec?.note || '';

  openModal(specModal);
}

async function handleSpecSubmit(e) {
  e.preventDefault();
  ensureModalRefs();
  if (!specForm) return;

  const btn = specForm.querySelector('button[type=submit]');
  const old = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
  }

  try {
    const payload = {
      id: specForm.elements.spec_id.value || undefined,
      property_id: currentProperty.id,
      zone: specForm.elements.zone.value.trim(),
      item_type: specForm.elements.item_type.value.trim(),
      brand: specForm.elements.brand.value.trim(),
      model_or_series: specForm.elements.model_or_series.value.trim(),
      color_code: specForm.elements.color_code.value.trim(),
      supplier: specForm.elements.supplier.value.trim(),
      note: specForm.elements.note.value.trim(),
    };

    if (!payload.zone) {
      toast('กรุณาระบุโซน', 2000, 'error');
      return;
    }

    await upsertSpec(payload);
    toast('บันทึกสเปกเรียบร้อย', 1800, 'success');
    closeModal(specModal);
    await reloadSpecs();
  } catch (err) {
    console.error(err);
    toast('บันทึกสเปกไม่สำเร็จ', 2200, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = old;
    }
  }
}

// ----------------- Contractors -----------------
async function reloadContractors() {
  const container = $('#contractors-list');
  if (!container) return;

  container.innerHTML =
    '<p style="color:#6b7280;">กำลังโหลดข้อมูลทีมช่าง...</p>';

  try {
    const links = await listContractorsForProperty(currentProperty.id);
    currentContractorLinks = Array.isArray(links) ? links : [];

    clear(container);

    if (!currentContractorLinks.length) {
      container.innerHTML =
        '<p style="color:#9ca3af;">ยังไม่ได้บันทึกทีมช่างสำหรับบ้านหลังนี้</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'table-compact';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>ทีมงาน</th>
        <th>สายงาน</th>
        <th>เบอร์</th>
        <th>ขอบเขตงาน</th>
        <th>รับประกัน (เดือน)</th>
        <th style="width:80px;"></th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    currentContractorLinks.forEach((link) => {
      const c = link.contractor || {};
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.name || ''}</td>
        <td>${c.trade || ''}</td>
        <td>${c.phone || ''}</td>
        <td>${link.scope || ''}</td>
        <td>${link.warranty_months ?? ''}</td>
        <td style="text-align:right;">
          <button class="btn btn-xs btn-secondary btn-edit-ctr" data-id="${link.id}">แก้ไข</button>
          <button class="btn btn-xs btn-danger btn-delete-ctr" data-id="${link.id}">ลบ</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);

    container.querySelectorAll('.btn-edit-ctr').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        const link = currentContractorLinks.find((l) => l.id === id);
        openContractorForm(link || null);
      });
    });

    container.querySelectorAll('.btn-delete-ctr').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.id);
        if (!id) return;
        if (!confirm('ต้องการลบทีมช่างนี้ออกจากสมุดรีโนเวทหรือไม่?')) return;
        try {
          await deletePropertyContractor(id);
          toast('ลบทีมช่างเรียบร้อย', 1600, 'success');
          await reloadContractors();
        } catch (err) {
          console.error(err);
          toast('ลบทีมช่างไม่สำเร็จ', 2000, 'error');
        }
      });
    });
  } catch (err) {
    console.error(err);
    container.innerHTML =
      '<p style="color:#b91c1c;">โหลดข้อมูลทีมช่างไม่สำเร็จ</p>';
  }
}

function openContractorForm(link = null) {
  ensureModalRefs();
  if (!contractorForm || !contractorModal) return;

  contractorForm.reset();
  contractorForm.elements.property_contractor_id.value = link?.id || '';

  const c = link?.contractor || {};
  contractorForm.elements.contractor_name.value = c.name || '';
  contractorForm.elements.contractor_trade.value = c.trade || '';
  contractorForm.elements.contractor_phone.value = c.phone || '';
  contractorForm.elements.scope.value = link?.scope || '';
  contractorForm.elements.warranty_months.value =
    link?.warranty_months ?? '';

  openModal(contractorModal);
}

async function handleContractorSubmit(e) {
  e.preventDefault();
  ensureModalRefs();
  if (!contractorForm) return;

  const btn = contractorForm.querySelector('button[type=submit]');
  const old = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
  }

  try {
    const contractorPayload = {
      id: undefined,
      name: contractorForm.elements.contractor_name.value.trim(),
      trade: contractorForm.elements.contractor_trade.value.trim(),
      phone: contractorForm.elements.contractor_phone.value.trim(),
    };

    if (!contractorPayload.name) {
      toast('กรุณาระบุชื่อช่าง', 2000, 'error');
      return;
    }

    const contractor = await upsertContractor(contractorPayload);

    const linkPayload = {
      id:
        contractorForm.elements.property_contractor_id.value ||
        undefined,
      property_id: currentProperty.id,
      contractor_id: contractor.id,
      scope: contractorForm.elements.scope.value.trim(),
      warranty_months: contractorForm.elements.warranty_months.value
        ? Number(contractorForm.elements.warranty_months.value)
        : null,
    };

    await upsertPropertyContractor(linkPayload);
    toast('บันทึกทีมช่างเรียบร้อย', 1800, 'success');
    closeModal(contractorModal);
    await reloadContractors();
  } catch (err) {
    console.error(err);
    toast('บันทึกทีมช่างไม่สำเร็จ', 2200, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = old;
    }
  }
}

// ----------------- Export PDF / Print -----------------
function setupExportButton() {
  const btn = $('#btn-export-pdf');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const hasJsPDF = window.jspdf || window.jsPDF;
    if (!hasJsPDF) {
      // ถ้าไม่มี jsPDF ติดมากับหน้า ใช้สั่งพิมพ์แทน
      window.print();
      return;
    }

    const jsPDF = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    let y = 40;

    const title = `สมุดรีโนเวทบ้าน: ${currentProperty?.title || ''}`;
    doc.setFontSize(14);
    doc.text(title, 40, y);
    y += 20;

    doc.setFontSize(10);
    const addrText = `${currentProperty?.address || ''} ${
      currentProperty?.district || ''
    } ${currentProperty?.province || ''}`.trim();
    doc.text(addrText || '-', 40, y);
    y += 20;

    doc.text(
      `ขนาด: ${fmtSize(currentProperty)} | ราคา: ${fmtPrice(
        currentProperty?.price
      )}`,
      40,
      y
    );
    y += 30;

    // Specs
    doc.setFontSize(12);
    doc.text('สเปกรีโนเวท', 40, y);
    y += 16;
    doc.setFontSize(9);

    if (!currentSpecs.length) {
      doc.text('- ยังไม่มีข้อมูลสเปกรีโนเวท -', 48, y);
      y += 18;
    } else {
      currentSpecs.forEach((s) => {
        const material = [
          s.item_type,
          s.brand,
          s.model_or_series,
          s.color_code && `(${s.color_code})`,
        ]
          .filter(Boolean)
          .join(' / ');

        const line1 = `${s.zone || ''} : ${material || '-'}`;
        const line2 = [
          s.supplier && `ร้าน: ${s.supplier}`,
          s.note && `หมายเหตุ: ${s.note}`,
        ]
          .filter(Boolean)
          .join(' | ');

        doc.text(`• ${line1}`, 48, y);
        y += 14;
        if (line2) {
          doc.text(`   ${line2}`, 48, y);
          y += 14;
        }
        y += 4;

        if (y > 760) {
          doc.addPage();
          y = 40;
        }
      });
    }

    // Contractors summary
    y += 10;
    doc.setFontSize(12);
    doc.text('ทีมงานช่าง', 40, y);
    y += 16;
    doc.setFontSize(9);

    if (!currentContractorLinks.length) {
      doc.text('- ยังไม่มีข้อมูลทีมช่าง -', 48, y);
    } else {
      currentContractorLinks.forEach((link) => {
        const c = link.contractor || {};
        const line = `${c.name || ''} (${
          c.trade || ''
        }) : ${link.scope || ''}`;
        const extra =
          (c.phone && `เบอร์: ${c.phone}`) ||
          (link.warranty_months &&
            `รับประกัน ${link.warranty_months} เดือน`) ||
          '';

        doc.text(`• ${line}`, 48, y);
        y += 14;
        if (extra) {
          doc.text(`   ${extra}`, 48, y);
          y += 14;
        }
        y += 4;

        if (y > 760) {
          doc.addPage();
          y = 40;
        }
      });
    }

    doc.save(
      `สมุดรีโนเวท-${currentProperty?.id || 'property'}.pdf`
    );
  });
}

// ----------------- Init -----------------
function setupButtons() {
  const backBtn = $('#btn-back-to-renovation-list');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = '/renovation-book.html';
    });
  }

  const addSpecBtn = $('#btn-add-spec');
  if (addSpecBtn) {
    addSpecBtn.addEventListener('click', () => openSpecForm(null));
  }

  const addCtrBtn = $('#btn-add-contractor');
  if (addCtrBtn) {
    addCtrBtn.addEventListener('click', () =>
      openContractorForm(null)
    );
  }

  ensureModalRefs();

  if (specModal) {
    specModal
      .querySelectorAll('.modal-close, .modal-cancel')
      .forEach((btn) =>
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          closeModal(specModal);
        })
      );
  }
  if (contractorModal) {
    contractorModal
      .querySelectorAll('.modal-close, .modal-cancel')
      .forEach((btn) =>
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          closeModal(contractorModal);
        })
      );
  }

  if (specForm) {
    specForm.addEventListener('submit', handleSpecSubmit);
  }
  if (contractorForm) {
    contractorForm.addEventListener(
      'submit',
      handleContractorSubmit
    );
  }
}

// main
document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();
  const ok = await requireAdminPage({
    redirect: '/index.html',
    showBadge: true,
  });
  if (!ok) return;

  setupNav();
  signOutIfAny();
  setupMobileNav();

  const propertyId = getPropertyIdFromQuery();
  const main = $('#renovation-book-container');

  if (!propertyId) {
    if (main) {
      main.innerHTML =
        '<p style="color:#b91c1c;">ไม่พบ property_id ใน URL</p>';
    }
    return;
  }

  try {
    await loadProperty(propertyId);
    await reloadSpecs();
    await reloadContractors();
    setupButtons();
    setupExportButton();
  } catch (err) {
    console.error(err);
    if (main) {
      main.innerHTML =
        '<p style="color:#b91c1c;">เกิดข้อผิดพลาดในการโหลดสมุดรีโนเวท</p>';
    }
  }
});
