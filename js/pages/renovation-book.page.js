//------------------------------------------------------------
// หน้า "สมุดรีโนเวท" (หลังบ้าน)
// - เลือกบ้านจาก dropdown
// - บันทึกฟอร์มสมุดรีโนเวทลง Supabase
// - จัดการสเปก + ทีมช่าง (เหมือนเดิม)
// - เปิดรายงานสวย ๆ ผ่าน renovation-book-report.html
//------------------------------------------------------------
import { setupMobileNav } from '../ui/mobileNav.js';
import { protectPage } from '../auth/guard.js';
import { signOutIfAny } from '../auth/auth.js';
import { setupNav } from '../utils/config.js';
import { formatPrice } from '../utils/format.js';
import { listAll } from '../services/propertiesService.js';
import { listSpecsByProperty, upsertSpec, deleteSpec } from '../services/propertySpecsService.js';
import {
  listContractorsForProperty,
  upsertPropertyContractor,
  deletePropertyContractor
} from '../services/propertyContractorsService.js';
import { upsertContractor } from '../services/contractorsService.js';
import { getRenovationBookByPropertyId, upsertRenovationBookForProperty } from '../services/renovationBookService.js';
import { $, clear } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

let currentProperty = null;
let currentPropertyId = null;

// --- modal state ---
let rbModal = null;
let rbModalForm = null;
let rbModalTitle = null;
let rbSpecFields = null;
let rbContractorFields = null;
let rbModalMode = null; // 'spec' | 'contractor'

// -------------------- helper --------------------
const getEl = (id) => document.getElementById(id) || null;

function getInputValue(id) {
  const el = getEl(id);
  return el ? el.value.trim() : '';
}

function getNumberValue(id) {
  const raw = getInputValue(id);
  if (!raw) return null;
  const n = Number(raw);
  if (Number.isNaN(n)) return null;
  return n;
}

// -------------------- หน้าจอ list/detail (เผื่อยังใช้อยู่) --------------------
function showListMode() {
  const listSec = $('#rb-list-section');
  const detailSec = $('#rb-detail-section');
  if (listSec) listSec.style.display = 'block';
  if (detailSec) detailSec.style.display = 'none';
}

function showDetailMode() {
  const listSec = $('#rb-list-section');
  const detailSec = $('#rb-detail-section');
  if (listSec) listSec.style.display = 'none';
  if (detailSec) detailSec.style.display = 'block';
}

// -------------------- Modal helpers --------------------
function openRbModal(mode) {
  if (!rbModal || !rbModalForm || !rbSpecFields || !rbContractorFields || !rbModalTitle) return;
  rbModalMode = mode;
  rbModalForm.reset();

  if (mode === 'spec') {
    rbModalTitle.textContent = 'เพิ่มสเปกรีโนเวท';
    rbSpecFields.style.display = 'block';
    rbContractorFields.style.display = 'none';
  } else if (mode === 'contractor') {
    rbModalTitle.textContent = 'เพิ่มทีมช่าง';
    rbSpecFields.style.display = 'none';
    rbContractorFields.style.display = 'block';
  }

  rbModal.classList.add('open');
}

function closeRbModal() {
  if (!rbModal) return;
  rbModal.classList.remove('open');
  rbModalMode = null;
}

function setupRbModal() {
  rbModal = $('#rb-modal');
  rbModalForm = $('#rb-modal-form');
  rbModalTitle = $('#rb-modal-title');
  rbSpecFields = $('#rb-modal-spec-fields');
  rbContractorFields = $('#rb-modal-contractor-fields');

  if (!rbModal || !rbModalForm) return;

  const closeBtn = $('#rb-modal-close');
  const cancelBtn = $('#rb-modal-cancel');

  closeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeRbModal();
  });

  cancelBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeRbModal();
  });

  window.addEventListener('click', (e) => {
    if (e.target === rbModal) {
      closeRbModal();
    }
  });

  rbModalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!rbModalMode) return;
    if (!currentPropertyId) {
      toast('กรุณาเลือกบ้านจากรายการก่อน', 2500, 'error');
      return;
    }

    const submitBtn = rbModalForm.querySelector('button[type=submit]');
    const oldLabel = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'กำลังบันทึก...';
    }

    try {
      if (rbModalMode === 'spec') {
        const fd = new FormData(rbModalForm);
        const zone = (fd.get('zone') || '').toString().trim();
        if (!zone) {
          toast('กรุณากรอกโซนก่อน', 2500, 'error');
          return;
        }

        const payload = {
          property_id: currentPropertyId,
          zone,
          item_type: (fd.get('item_type') || '').toString().trim(),
          brand: (fd.get('brand') || '').toString().trim(),
          model_or_series: (fd.get('model_or_series') || '').toString().trim(),
          color_code: (fd.get('color_code') || '').toString().trim(),
          supplier: (fd.get('supplier') || '').toString().trim(),
          note: (fd.get('note') || '').toString().trim()
        };

        await upsertSpec(payload);
        toast('บันทึกสเปกเรียบร้อย', 2000, 'success');
        await loadSpecsForProperty(currentPropertyId);
      } else if (rbModalMode === 'contractor') {
        const fd = new FormData(rbModalForm);
        const name = (fd.get('contractor_name') || '').toString().trim();
        if (!name) {
          toast('กรุณากรอกชื่อช่างก่อน', 2500, 'error');
          return;
        }

        const contractor = await upsertContractor({
          name,
          trade: (fd.get('contractor_trade') || '').toString().trim(),
          phone: (fd.get('contractor_phone') || '').toString().trim()
        });

        let warranty = null;
        const wRaw = (fd.get('warranty_months') || '').toString().trim();
        if (wRaw) {
          const n = Number(wRaw);
          if (!Number.isNaN(n)) warranty = n;
        }

        await upsertPropertyContractor({
          property_id: currentPropertyId,
          contractor_id: contractor.id,
          scope: (fd.get('scope') || '').toString().trim(),
          warranty_months: warranty
        });

        toast('บันทึกทีมช่างเรียบร้อย', 2000, 'success');
        await loadContractorsForProperty(currentPropertyId);
      }

      closeRbModal();
    } catch (err) {
      console.error(err);
      toast('บันทึกไม่สำเร็จ: ' + (err.message || err), 3000, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = oldLabel;
      }
    }
  });
}

// -------------------- รายการบ้าน (ใช้เติม dropdown หรือ list mode) --------------------
async function loadPropertyList() {
  const list = $('#rb-property-list');
  if (!list) return;

  clear(list);
  list.innerHTML = `
    <div style="grid-column:1/-1;color:#6b7280;">กำลังโหลดรายการบ้าน...</div>
  `;

  try {
    const { data, error } = await listAll();
    if (error) throw error;

    clear(list);

    if (!data || !data.length) {
      list.innerHTML = `
        <div style="grid-column:1/-1;color:#9ca3af;">
          ยังไม่มีประกาศบ้านในระบบ
        </div>
      `;
      return;
    }

    data.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'rb-property-card';

      const statusText = p.published ? 'เผยแพร่แล้ว' : 'ยังไม่เผยแพร่';
      const statusColor = p.published ? '#16a34a' : '#6b7280';

      const detailUrl = p.slug
        ? `/property-detail.html?slug=${encodeURIComponent(p.slug)}`
        : '#';

      card.innerHTML = `
        <div class="rb-property-card-header">
          <div>
            <h3 style="margin:0;font-size:1.05rem;">${p.title || '-'}</h3>
            <p style="margin:.15rem 0 0 0;color:#4b5563;">
              ${p.address || ''} ${p.district || ''} ${p.province || ''}
            </p>
          </div>
          <div style="text-align:right;min-width:110px;">
            <div style="font-weight:600;color:#b45309;">${formatPrice(Number(p.price) || 0)}</div>
            <div style="font-size:.8rem;color:${statusColor};">${statusText}</div>
          </div>
        </div>
        <p style="margin:.35rem 0 0 0;font-size:.85rem;color:#6b7280;">
          ขนาด: ${p.size_text || '-'} • ${p.beds ?? '-'} นอน • ${p.baths ?? '-'} น้ำ • ที่จอดรถ ${p.parking ?? '-'}
        </p>

        <div class="rb-property-card-footer">
          <button class="btn btn-sm btn-primary rb-open-book-btn">เปิดสมุดรีโนเวท</button>
          ${
            detailUrl !== '#'
              ? `<a class="btn btn-sm btn-outline" href="${detailUrl}" target="_blank">ดูหน้าเว็บลูกค้า</a>`
              : ''
          }
        </div>
      `;

      // ปุ่ม "เปิดสมุดรีโนเวท" (ใช้แบบ list mode เดิม)
      const openBtn = card.querySelector('.rb-open-book-btn');
      if (openBtn) {
        openBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const url = new URL(window.location.href);
          url.searchParams.set('property_id', p.id);
          window.location.href = url.toString();
        });
      }

      list.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    clear(list);
    list.innerHTML = `
      <div style="grid-column:1/-1;color:#b91c1c;">
        โหลดรายการบ้านไม่สำเร็จ: ${err.message || err}
      </div>
    `;
  }
}

// -------------------- ดึงข้อมูลบ้าน --------------------
async function fetchPropertyById(id) {
  const { data, error } = await listAll();
  if (error) throw error;
  if (!data) return null;
  return data.find((p) => String(p.id) === String(id)) || null;
}

// -------------------- ส่วนหัวสมุดรีโนเวท --------------------
function renderDetailHeader(property) {
  const box = $('#rb-detail-header');
  if (!box) return;

  const detailUrl = property.slug
    ? `/property-detail.html?slug=${encodeURIComponent(property.slug)}`
    : '#';

  box.innerHTML = `
    <h2 style="margin:0 0 .5rem 0;font-size:1.2rem;">
      สมุดรีโนเวท: ${property.title || '-'}
    </h2>
    <p style="margin:0 0 .25rem 0;color:#4b5563;">
      ${property.address || ''} ${property.district || ''} ${property.province || ''}
    </p>
    <p style="margin:0 0 .5rem 0;color:#6b7280;font-size:.9rem;">
      ขนาด: ${property.size_text || '-'} • ${property.beds ?? '-'} นอน • ${property.baths ?? '-'} น้ำ • ที่จอดรถ ${property.parking ?? '-'}
    </p>
    <p style="margin:0;color:#b45309;font-weight:600;">
      ราคา ${formatPrice(Number(property.price) || 0)}
    </p>
    ${
      detailUrl !== '#'
        ? `<p style="margin:.5rem 0 0 0;font-size:.9rem;">
             🔗 <a href="${detailUrl}" target="_blank" style="color:#2563eb;">เปิดดูหน้าลูกค้า</a>
           </p>`
        : ''
    }
  `;
}

// -------------------- สเปกรีโนเวท --------------------
async function loadSpecsForProperty(propertyId) {
  const container = $('#rb-specs');
  if (!container) return;

  container.innerHTML = `
    <p style="color:#6b7280;">กำลังโหลดข้อมูลสเปกรีโนเวท...</p>
  `;

  try {
    const specs = await listSpecsByProperty(propertyId);

    if (!specs.length) {
      container.innerHTML = `
        <p style="color:#9ca3af;">ยังไม่ได้บันทึกสเปกรีโนเวทสำหรับบ้านหลังนี้</p>
      `;
      return;
    }

    const table = document.createElement('table');
    table.className = 'table-compact';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>โซน</th>
        <th>ประเภท</th>
        <th>ยี่ห้อ / รุ่น / เบอร์สี</th>
        <th>ร้าน / ผู้ขาย</th>
        <th>หมายเหตุ</th>
        <th></th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    specs.forEach((s) => {
      const mat = [s.brand, s.model_or_series, s.color_code && `(${s.color_code})`]
        .filter(Boolean)
        .join(' / ');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${s.zone || ''}</td>
        <td>${s.item_type || ''}</td>
        <td>${mat || '-'}</td>
        <td>${s.supplier || ''}</td>
        <td>${s.note || ''}</td>
        <td style="text-align:right;">
          <button data-id="${s.id}" class="btn btn-xs btn-danger rb-spec-delete-btn">ลบ</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);

    container.querySelectorAll('.rb-spec-delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!id) return;
        if (!confirm('ต้องการลบสเปกนี้หรือไม่?')) return;
        await deleteSpec(id);
        await loadSpecsForProperty(currentPropertyId);
      });
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <p style="color:#b91c1c;">โหลดข้อมูลสเปกไม่สำเร็จ: ${err.message || err}</p>
    `;
  }
}

// -------------------- ทีมช่าง --------------------
async function loadContractorsForProperty(propertyId) {
  const container = $('#rb-contractors');
  if (!container) return;

  container.innerHTML = `
    <p style="color:#6b7280;">กำลังโหลดข้อมูลทีมช่าง...</p>
  `;

  try {
    const links = await listContractorsForProperty(propertyId);

    if (!links.length) {
      container.innerHTML = `
        <p style="color:#9ca3af;">ยังไม่ได้บันทึกทีมช่างสำหรับบ้านหลังนี้</p>
      `;
      return;
    }

    const table = document.createElement('table');
    table.className = 'table-compact';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>ชื่อช่าง</th>
        <th>สายงาน</th>
        <th>เบอร์ติดต่อ</th>
        <th>ขอบเขตงาน</th>
        <th>รับประกัน (เดือน)</th>
        <th></th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    links.forEach((link) => {
      const c = link.contractor || {};
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.name || ''}</td>
        <td>${c.trade || ''}</td>
        <td>${c.phone || ''}</td>
        <td>${link.scope || ''}</td>
        <td>${link.warranty_months ?? ''}</td>
        <td style="text-align:right;">
          <button data-id="${link.id}" class="btn btn-xs btn-danger rb-contractor-delete-btn">ลบ</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);

    container.querySelectorAll('.rb-contractor-delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!id) return;
        if (!confirm('ต้องการลบทีมช่างนี้ออกจากบ้านหลังนี้หรือไม่?')) return;
        await deletePropertyContractor(id);
        await loadContractorsForProperty(currentPropertyId);
      });
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <p style="color:#b91c1c;">โหลดข้อมูลทีมช่างไม่สำเร็จ: ${err.message || err}</p>
    `;
  }
}

// -------------------- ปุ่ม Add (เรียก modal) --------------------
function setupAddButtons() {
  const specBtn = $('#rb-add-spec');
  const contractorBtn = $('#rb-add-contractor');

  specBtn?.addEventListener('click', () => {
    if (!currentPropertyId) {
      alert('กรุณาเลือกบ้านจากรายการก่อน');
      return;
    }
    openRbModal('spec');
  });

  contractorBtn?.addEventListener('click', () => {
    if (!currentPropertyId) {
      alert('กรุณาเลือกบ้านจากรายการก่อน');
      return;
    }
    openRbModal('contractor');
  });
}

// -------------------- Overlay รายงาน + ปุ่ม Print --------------------
function setupReportOverlay() {
  const overlay = $('#report-overlay');
  const iframe = $('#report-iframe');
  const overlayClose = $('#report-overlay-close');
  const triggerBtn = $('#rb-print-btn'); // ปุ่ม "พิมพ์ / Export PDF" ใต้สมุดรีโนเวท

  if (!overlay || !iframe || !triggerBtn) {
    return;
  }

  // เปิด overlay + โหลดหน้า report
  triggerBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!currentPropertyId) {
      alert('กรุณาเลือกบ้านจากรายการก่อน');
      return;
    }

    const url = `/renovation-book-report.html?property_id=${encodeURIComponent(
      currentPropertyId
    )}`;
    iframe.src = url;
    overlay.classList.add('open');
    document.body.classList.add('rb-report-open');
  });

  // ปิด overlay ด้วยปุ่มกากบาท
  overlayClose?.addEventListener('click', () => {
    overlay.classList.remove('open');
    iframe.src = '';
    document.body.classList.remove('rb-report-open');
  });

  // คลิกพื้นหลังด้านนอก เพื่อปิด overlay
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('open');
      iframe.src = '';
      document.body.classList.remove('rb-report-open');
    }
  });
}

// -------------------- ฟอร์มสมุดรีโนเวท: map <-> payload --------------------
function collectRenovationFormData() {
  if (!currentPropertyId) return null;

  return {
    property_id: currentPropertyId,

    // CARD 1
    house_code: getInputValue('house_code') || null,
    house_location: getInputValue('house_location') || null,
    house_type: getInputValue('house_type') || null,
    house_storeys: getNumberValue('house_storeys'),
    land_size: getNumberValue('land_size'),
    usable_area: getNumberValue('usable_area'),
    house_facing: getInputValue('house_facing') || null,
    house_age: getNumberValue('house_age'),
    acquisition_type: getInputValue('acquisition_type') || null,
    project_goal: getInputValue('project_goal') || null,
    target_buyer: getInputValue('target_buyer') || null,
    design_concept: getInputValue('design_concept') || null,

    // CARD 2
    structural_issues: getInputValue('structural_issues') || null,
    plumbing_issues: getInputValue('plumbing_issues') || null,
    water_supply_issues: getInputValue('water_supply_issues') || null,
    electrical_issues: getInputValue('electrical_issues') || null,
    other_risks: getInputValue('other_risks') || null,

    // CARD 3
    remove_old_screed: getInputValue('remove_old_screed') || null,
    old_screed_thickness: getNumberValue('old_screed_thickness'),
    new_screed_spec: getInputValue('new_screed_spec') || null,
    flooring_plan: getInputValue('flooring_plan') || null,

    // CARD 4
    drainage_plan: getInputValue('drainage_plan') || null,
    pipe_size_main: getInputValue('pipe_size_main') || null,
    drainage_notes: getInputValue('drainage_notes') || null,
    water_supply_plan: getInputValue('water_supply_plan') || null,
    water_tank_pump: getInputValue('water_tank_pump') || null,
    water_notes: getInputValue('water_notes') || null,

    // CARD 5
    electric_plan: getInputValue('electric_plan') || null,
    main_breaker_spec: getInputValue('main_breaker_spec') || null,
    lighting_plan: getInputValue('lighting_plan') || null,

    // CARD 6
    bathroom_plan: getInputValue('bathroom_plan') || null,
    kitchen_plan: getInputValue('kitchen_plan') || null,

    // CARD 7
    summary_notes: getInputValue('summary_notes') || null
  };
}

function fillRenovationForm(data) {
  // ถ้ายังไม่มี record → เคลียร์ฟอร์ม
  const setVal = (id, value) => {
    const el = getEl(id);
    if (!el) return;
    el.value = value ?? '';
  };

  if (!data) {
    [
      'house_code', 'house_location', 'house_type', 'house_storeys',
      'land_size', 'usable_area', 'house_facing', 'house_age',
      'acquisition_type', 'project_goal', 'target_buyer', 'design_concept',
      'structural_issues', 'plumbing_issues', 'water_supply_issues', 'electrical_issues', 'other_risks',
      'remove_old_screed', 'old_screed_thickness', 'new_screed_spec', 'flooring_plan',
      'drainage_plan', 'pipe_size_main', 'drainage_notes', 'water_supply_plan', 'water_tank_pump', 'water_notes',
      'electric_plan', 'main_breaker_spec', 'lighting_plan',
      'bathroom_plan', 'kitchen_plan',
      'summary_notes'
    ].forEach((id) => setVal(id, ''));
    return;
  }

  setVal('house_code', data.house_code);
  setVal('house_location', data.house_location);
  setVal('house_type', data.house_type);
  setVal('house_storeys', data.house_storeys);
  setVal('land_size', data.land_size);
  setVal('usable_area', data.usable_area);
  setVal('house_facing', data.house_facing);
  setVal('house_age', data.house_age);
  setVal('acquisition_type', data.acquisition_type);
  setVal('project_goal', data.project_goal);
  setVal('target_buyer', data.target_buyer);
  setVal('design_concept', data.design_concept);

  setVal('structural_issues', data.structural_issues);
  setVal('plumbing_issues', data.plumbing_issues);
  setVal('water_supply_issues', data.water_supply_issues);
  setVal('electrical_issues', data.electrical_issues);
  setVal('other_risks', data.other_risks);

  setVal('remove_old_screed', data.remove_old_screed);
  setVal('old_screed_thickness', data.old_screed_thickness);
  setVal('new_screed_spec', data.new_screed_spec);
  setVal('flooring_plan', data.flooring_plan);

  setVal('drainage_plan', data.drainage_plan);
  setVal('pipe_size_main', data.pipe_size_main);
  setVal('drainage_notes', data.drainage_notes);
  setVal('water_supply_plan', data.water_supply_plan);
  setVal('water_tank_pump', data.water_tank_pump);
  setVal('water_notes', data.water_notes);

  setVal('electric_plan', data.electric_plan);
  setVal('main_breaker_spec', data.main_breaker_spec);
  setVal('lighting_plan', data.lighting_plan);

  setVal('bathroom_plan', data.bathroom_plan);
  setVal('kitchen_plan', data.kitchen_plan);

  setVal('summary_notes', data.summary_notes);
}

// โหลดสมุดรีโนเวทของบ้านหนึ่งหลังแล้วเติมฟอร์ม
async function loadRenovationBookForProperty(propertyId) {
  try {
    const data = await getRenovationBookByPropertyId(propertyId);
    fillRenovationForm(data);
  } catch (err) {
    console.error(err);
    toast('โหลดสมุดรีโนเวทไม่สำเร็จ', 3000, 'error');
  }
}

// -------------------- ผูก dropdown เลือกบ้าน --------------------
async function setupPropertySelect(initialPropertyIdFromUrl) {
  const select = getEl('property-select');
  if (!select) return;

  select.innerHTML = '<option value="">— เลือกบ้าน —</option>';

  try {
    const { data, error } = await listAll();
    if (error) throw error;

    if (!data || !data.length) {
      select.innerHTML = '<option value="">(ยังไม่มีบ้านในระบบ)</option>';
      return;
    }

    data.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.title || `ID ${p.id}`;
      select.appendChild(opt);
    });

    // ถ้า URL มี property_id → เซ็ตค่าตามนั้น
    if (initialPropertyIdFromUrl) {
      select.value = initialPropertyIdFromUrl;
      if (select.value !== initialPropertyIdFromUrl) {
        // ถ้าไม่มี option ตรง id นี้ก็ไม่ต้องทำอะไร
      } else {
        await onPropertySelected(initialPropertyIdFromUrl);
      }
    }

    // เปลี่ยนบ้านจาก dropdown
    select.addEventListener('change', async () => {
      const val = select.value || '';
      if (!val) {
        currentPropertyId = null;
        currentProperty = null;
        fillRenovationForm(null);
        return;
      }
      await onPropertySelected(val);
    });
  } catch (err) {
    console.error(err);
    toast('โหลดรายการบ้านสำหรับ dropdown ไม่สำเร็จ', 3000, 'error');
  }
}

async function onPropertySelected(propertyId) {
  currentPropertyId = propertyId;

  // ดึงข้อมูลบ้านมาแสดงหัวเรื่อง
  try {
    const prop = await fetchPropertyById(propertyId);
    if (!prop) {
      toast('ไม่พบบ้านหลังนี้', 3000, 'error');
      return;
    }
    currentProperty = prop;
    renderDetailHeader(prop);
  } catch (err) {
    console.error(err);
    toast('โหลดข้อมูลบ้านไม่สำเร็จ', 3000, 'error');
  }

  // โหลดสมุดรีโนเวท + สเปก + ทีมช่าง
  await loadRenovationBookForProperty(propertyId);
  await loadSpecsForProperty(propertyId);
  await loadContractorsForProperty(propertyId);
}

// -------------------- ปุ่มบันทึกสมุดรีโนเวท --------------------
function setupSaveButton() {
  const btn = getEl('save-renovation-book');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!currentPropertyId) {
      toast('กรุณาเลือกบ้านก่อนบันทึกสมุดรีโนเวท', 3000, 'error');
      return;
    }

    const payload = collectRenovationFormData();
    if (!payload) return;

    const oldLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';

    try {
      await upsertRenovationBookForProperty(payload);
      toast('บันทึกสมุดรีโนเวทเรียบร้อย', 2500, 'success');
    } catch (err) {
      console.error(err);
      toast('บันทึกสมุดรีโนเวทไม่สำเร็จ: ' + (err.message || err), 3000, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = oldLabel;
    }
  });
}

// -------------------- init --------------------
document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();
  setupNav();
  setupMobileNav();
  await signOutIfAny();

  setupRbModal();
  setupAddButtons();
  setupReportOverlay();
  setupSaveButton();

  const params = new URLSearchParams(window.location.search);
  const propertyIdParam = params.get('property_id');

  const backBtn = $('#rb-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const url = new URL(window.location.href);
      url.searchParams.delete('property_id');
      window.location.href = url.toString();
    });
  }

  // dropdown เลือกบ้าน
  await setupPropertySelect(propertyIdParam || null);

  // ถ้ากุ้งยังใช้ list mode แยก section อยู่ ก็โหลด list ให้ด้วย
  if (!propertyIdParam) {
    showListMode();
    await loadPropertyList();
  } else {
    showDetailMode();
  }

  // Sticky header + Scroll to top
  const header = document.querySelector('.page-renovation-book .page-header');
  const scrollBtn = document.getElementById('scroll-to-top');

  const onScroll = () => {
    if (header) {
      if (window.scrollY > 10) header.classList.add('is-scrolled');
      else header.classList.remove('is-scrolled');
    }

    if (scrollBtn) {
      if (window.scrollY > 300) scrollBtn.classList.add('show');
      else scrollBtn.classList.remove('show');
    }
  };

  window.addEventListener('scroll', onScroll);
  onScroll();

  if (scrollBtn) {
    scrollBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }
});

import { upsertRenovationBookForProperty } from '../services/renovationBookService.js';

// Helper
function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : null;
}

function num(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const n = Number(el.value);
  return Number.isFinite(n) ? n : null;
}

document.addEventListener("DOMContentLoaded", () => {
  const saveBtn = document.getElementById("save-renovation-book");

  if (!saveBtn) return;

  saveBtn.addEventListener("click", async () => {
    if (!currentPropertyId) {
      toast("กรุณาเลือกบ้านก่อนบันทึก", 2500, "error");
      return;
    }

    const payload = {
      property_id: currentPropertyId,

      // 1) ข้อมูลบ้าน
      house_code: val('house_code'),
      house_location: val('house_location'),
      house_type: val('house_type'),
      house_storeys: num('house_storeys'),
      land_size: num('land_size'),
      usable_area: num('usable_area'),
      house_facing: val('house_facing'),
      house_age: num('house_age'),
      acquisition_type: val('acquisition_type'),
      project_goal: val('project_goal'),
      target_buyer: val('target_buyer'),
      design_concept: val('design_concept'),

      // 2) ปัญหา
      structural_issues: val('structural_issues'),
      plumbing_issues: val('plumbing_issues'),
      water_supply_issues: val('water_supply_issues'),
      electrical_issues: val('electrical_issues'),
      other_risks: val('other_risks'),

      // 3) โครงสร้าง
      remove_old_screed: val('remove_old_screed'),
      old_screed_thickness: num('old_screed_thickness'),
      new_screed_spec: val('new_screed_spec'),
      flooring_plan: val('flooring_plan'),

      // 4) ระบบน้ำ
      drainage_plan: val('drainage_plan'),
      pipe_size_main: val('pipe_size_main'),
      drainage_notes: val('drainage_notes'),
      water_supply_plan: val('water_supply_plan'),
      water_tank_pump: val('water_tank_pump'),
      water_notes: val('water_notes'),

      // 5) ไฟฟ้า
      electric_plan: val('electric_plan'),
      main_breaker_spec: val('main_breaker_spec'),
      lighting_plan: val('lighting_plan'),

      // 6) ห้องน้ำ + ครัว
      bathroom_plan: val('bathroom_plan'),
      kitchen_plan: val('kitchen_plan'),

      // 7) สรุป
      summary_notes: val('summary_notes'),
    };

    try {
      await upsertRenovationBookForProperty(payload);
      toast("บันทึกข้อมูลเรียบร้อย 💛", 2000, "success");
    } catch (err) {
      console.error(err);
      toast("บันทึกไม่สำเร็จ", 2000, "error");
    }
  });
});
