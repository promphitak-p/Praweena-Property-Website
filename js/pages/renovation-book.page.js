//------------------------------------------------------------
// หน้า "สมุดรีโนเวท" (หลังบ้าน)
// - โหมด 1: แสดงรายการบ้านทั้งหมด
// - โหมด 2: แสดงสมุดรีโนเวทของบ้าน 1 หลัง (สเปก + ทีมช่าง)
// - เพิ่ม / ลบ สเปก + ทีมช่าง ผ่าน Modal ฟอร์มสวย ๆ
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

// -------------------- helper DOM --------------------
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

// -------------------- รายการบ้าน --------------------
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

      // ปุ่ม "เปิดสมุดรีโนเวท"
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

// -------------------- ปุ่มเปิดหน้ารายงาน (overlay + iframe) --------------------
function setupReportButton() {
  const btn = $('#rb-open-report-btn');
  if (!btn) return;

  btn.addEventListener('click', (e) => {
    e.preventDefault();

    if (!currentPropertyId) {
      alert('กรุณาเลือกบ้านจากรายการก่อน');
      return;
    }

    const url = `/renovation-book-report.html?property_id=${encodeURIComponent(
      currentPropertyId
    )}`;

    const iframe = $('#report-iframe');
    const overlay = $('#report-overlay');

    if (iframe) iframe.src = url;
    if (overlay) overlay.classList.add('open');
  });

  // ปุ่มปิด overlay
  const overlayClose = $('#report-overlay-close');
  const overlay = $('#report-overlay');

  overlayClose?.addEventListener('click', () => {
    if (!overlay) return;
    overlay.classList.remove('open');
    const iframe = $('#report-iframe');
    if (iframe) iframe.src = ''; // clear
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

// -------------------- init --------------------
document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();
  setupNav();
  setupMobileNav();
  await signOutIfAny();

  setupRbModal();
  setupAddButtons();
  setupPrintButton();
  setupReportButton();   // ✅ อันนี้สำคัญ

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

  if (propertyIdParam) {
    // โหมดดูสมุดรีโนเวทของบ้าน 1 หลัง
    currentPropertyId = propertyIdParam;
    showDetailMode();

    const headerBox = $('#rb-detail-header');
    const specsBox = $('#rb-specs');
    const contractorsBox = $('#rb-contractors');

    if (headerBox) {
      headerBox.innerHTML = '<p style="color:#6b7280;">กำลังโหลดข้อมูลบ้าน...</p>';
    }
    if (specsBox) {
      specsBox.innerHTML =
        '<p style="color:#6b7280;">กำลังโหลดข้อมูลสเปกรีโนเวท...</p>';
    }
    if (contractorsBox) {
      contractorsBox.innerHTML =
        '<p style="color:#6b7280;">กำลังโหลดข้อมูลทีมช่าง...</p>';
    }

    try {
      const prop = await fetchPropertyById(propertyIdParam);
      if (!prop) {
        toast('ไม่พบบ้านหลังนี้', 3000, 'error');
        showListMode();
        await loadPropertyList();
        return;
      }

      currentProperty = prop;
      renderDetailHeader(prop);
      await loadSpecsForProperty(currentPropertyId);
      await loadContractorsForProperty(currentPropertyId);
    } catch (err) {
      console.error(err);
      toast('โหลดข้อมูลบ้านไม่สำเร็จ', 3000, 'error');
      showListMode();
      await loadPropertyList();
    }
  } else {
    // โหมดรายการบ้าน
    showListMode();
    await loadPropertyList();
  }
});
