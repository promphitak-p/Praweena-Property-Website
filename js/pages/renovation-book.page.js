// js/pages/renovation-book.page.js
//------------------------------------------------------------
// สมุดรีโนเวท Praweena Property
// - ใช้เฉพาะหลังบ้าน (ต้องล็อกอินก่อน)
// - ดู/เพิ่ม/แก้ไข: สเปกรีโนเวท + ทีมช่าง
//------------------------------------------------------------
import { setupMobileNav } from '../ui/mobileNav.js';
import { protectPage } from '../auth/guard.js';
import { signOutIfAny } from '../auth/auth.js';
import { setupNav } from '../utils/config.js';
import { supabase } from '../utils/supabaseClient.js';
import { toast } from '../ui/toast.js';
import { getFormData } from '../ui/forms.js';
import { $, clear } from '../ui/dom.js';
import { listSpecsByProperty, upsertSpec, deleteSpec } from '../services/propertySpecsService.js';
import {
  listContractorsForProperty,
  upsertPropertyContractor,
  deletePropertyContractor
} from '../services/propertyContractorsService.js';
import { upsertContractor } from '../services/contractorsService.js';
import { formatPrice } from '../utils/format.js';

// ===================== Helpers =====================
function getPropertyIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('property_id') || params.get('id');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function setLoadingText(el, text) {
  if (!el) return;
  el.innerHTML = `<p style="color:#6b7280;">${text}</p>`;
}

// ===================== โหลดข้อมูลบ้าน =====================
async function loadPropertyHeader(propertyId) {
  const pageTitleEl = $('#rb-page-title');
  const subtitleEl  = $('#rb-property-subtitle');
  const summaryCard = $('#rb-property-summary');
  const coverBox    = $('#rb-cover-box');
  const metaEl      = $('#rb-property-meta');
  const extraEl     = $('#rb-property-extra');
  const viewDetail  = $('#rb-view-detail');

  subtitleEl.textContent = 'กำลังโหลดข้อมูลบ้าน...';

  const { data, error } = await supabase
    .from('properties')
    .select('id,title,address,district,province,slug,cover_url,price,beds,baths,size_text')
    .eq('id', propertyId)
    .maybeSingle();

  if (error || !data) {
    subtitleEl.textContent = 'ไม่พบบ้านหลังนี้ในระบบ';
    summaryCard.style.display = 'none';
    return null;
  }

  // อัปเดตหัวข้อ
  pageTitleEl.textContent = `สมุดรีโนเวท : ${data.title || 'ไม่ระบุชื่อบ้าน'}`;
  subtitleEl.textContent = [data.address, data.district, data.province]
    .filter(Boolean)
    .join(' • ');

  // สรุปสเปกสั้น ๆ
  const metaBits = [];
  if (data.size_text) metaBits.push(`ขนาด ${data.size_text}`);
  if (data.beds) metaBits.push(`${data.beds} ห้องนอน`);
  if (data.baths) metaBits.push(`${data.baths} ห้องน้ำ`);
  if (data.price) metaBits.push(`ราคา ${formatPrice(data.price)}`);
  metaEl.textContent = metaBits.join(' | ');

  extraEl.textContent = ''; // เผื่อไว้ใช้เพิ่มภายหลัง

  // รูป cover
  clear(coverBox);
  const img = document.createElement('img');
  img.src = data.cover_url || '/assets/img/placeholder.jpg';
  img.alt = data.title || 'cover';
  img.style.width = '100%';
  img.style.height = '100%';
  img.style.objectFit = 'cover';
  coverBox.appendChild(img);

  // ปุ่มดูหน้าลูกค้า
  if (data.slug) {
    viewDetail.style.display = 'inline-flex';
    viewDetail.href = `/property-detail.html?slug=${encodeURIComponent(
      data.slug
    )}`;
  } else {
    viewDetail.style.display = 'none';
  }

  summaryCard.style.display = 'block';
  return data;
}

// ===================== สเปกรีโนเวท =====================
async function loadSpecs(propertyId) {
  const container = $('#rb-specs-list');
  if (!container) return;

  setLoadingText(container, 'กำลังโหลดข้อมูลสเปกรีโนเวท...');

  try {
    const specs = await listSpecsByProperty(propertyId);

    if (!specs || !specs.length) {
      container.innerHTML =
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
        <th>หมายเหตุ</th>
        <th style="width:110px;text-align:right;"></th>
      </tr>
    `;
    table.appendChild(thead);

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

      tr.innerHTML = `
        <td>${s.zone || ''}</td>
        <td>${s.item_type || ''}</td>
        <td>${material || '-'}</td>
        <td>${s.note || ''}</td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn btn-xs btn-secondary spec-edit-btn" data-id="${s.id}">แก้ไข</button>
          <button class="btn btn-xs btn-danger spec-del-btn" data-id="${s.id}">ลบ</button>
        </td>
      `;

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    clear(container);
    container.appendChild(table);

    // ผูกปุ่มลบ
    container.querySelectorAll('.spec-del-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!id) return;
        if (!confirm('ต้องการลบสเปกนี้หรือไม่?')) return;
        await deleteSpec(id);
        toast('ลบสเปกเรียบร้อย', 2000, 'success');
        await loadSpecs(propertyId);
      });
    });

    // ผูกปุ่มแก้ไข → ดึงข้อมูลขึ้นฟอร์ม
    container.querySelectorAll('.spec-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (!id) return;
        const spec = specs.find((s) => String(s.id) === String(id));
        if (!spec) return;
        fillSpecForm(spec);
      });
    });
  } catch (err) {
    console.error(err);
    container.innerHTML =
      '<p style="color:#b91c1c;">โหลดข้อมูลสเปกไม่สำเร็จ</p>';
  }
}

function fillSpecForm(spec) {
  const form = $('#rb-spec-form');
  if (!form) return;

  form.elements.id.value = spec.id || '';
  form.elements.zone.value = spec.zone || '';
  form.elements.item_type.value = spec.item_type || '';
  form.elements.brand.value = spec.brand || '';
  form.elements.model_or_series.value = spec.model_or_series || '';
  form.elements.color_code.value = spec.color_code || '';
  form.elements.supplier.value = spec.supplier || '';
  form.elements.note.value = spec.note || '';

  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetSpecForm() {
  const form = $('#rb-spec-form');
  if (!form) return;
  form.reset();
  if (form.elements.id) form.elements.id.value = '';
}

// ===================== ทีมช่าง =====================
async function loadContractors(propertyId) {
  const container = $('#rb-contractors-list');
  if (!container) return;

  setLoadingText(container, 'กำลังโหลดข้อมูลทีมช่าง...');

  try {
    const links = await listContractorsForProperty(propertyId);

    if (!links || !links.length) {
      container.innerHTML =
        '<p style="color:#9ca3af;">ยังไม่ได้บันทึกทีมช่างสำหรับบ้านหลังนี้</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'table-compact';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>ชื่อช่าง / ทีม</th>
        <th>สายงาน</th>
        <th>เบอร์ติดต่อ</th>
        <th>ขอบเขตงาน</th>
        <th>รับประกัน (เดือน)</th>
        <th style="width:110px;text-align:right;"></th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    links.forEach((link) => {
      const c = link.contractor || {};
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.name || 'ทีมช่าง'}</td>
        <td>${c.trade || ''}</td>
        <td>${c.phone || ''}</td>
        <td>${link.scope || ''}</td>
        <td>${link.warranty_months ?? ''}</td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn btn-xs btn-secondary contractor-edit-btn" data-id="${link.id}">แก้ไข</button>
          <button class="btn btn-xs btn-danger contractor-del-btn" data-id="${link.id}">ลบ</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    clear(container);
    container.appendChild(table);

    // ผูกปุ่มลบ
    container.querySelectorAll('.contractor-del-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!id) return;
        if (!confirm('ต้องการลบทีมช่างนี้จากบ้านหลังนี้หรือไม่?')) return;
        await deletePropertyContractor(id);
        toast('ลบทีมช่างเรียบร้อย', 2000, 'success');
        await loadContractors(propertyId);
      });
    });

    // ผูกปุ่มแก้ไข → ดึงข้อมูลขึ้นฟอร์ม
    container.querySelectorAll('.contractor-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const link = links.find((l) => String(l.id) === String(id));
        if (!link) return;
        fillContractorForm(link);
      });
    });
  } catch (err) {
    console.error(err);
    container.innerHTML =
      '<p style="color:#b91c1c;">โหลดข้อมูลทีมช่างไม่สำเร็จ</p>';
  }
}

function fillContractorForm(link) {
  const form = $('#rb-contractor-form');
  if (!form) return;

  const c = link.contractor || {};

  form.elements.link_id.value = link.id || '';
  form.elements.contractor_name.value = c.name || '';
  form.elements.contractor_trade.value = c.trade || '';
  form.elements.contractor_phone.value = c.phone || '';
  form.elements.scope.value = link.scope || '';
  form.elements.warranty_months.value =
    link.warranty_months != null ? link.warranty_months : '';

  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetContractorForm() {
  const form = $('#rb-contractor-form');
  if (!form) return;
  form.reset();
  if (form.elements.link_id) form.elements.link_id.value = '';
}

// ===================== main =====================
document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();
  setupNav();
  setupMobileNav();
  await signOutIfAny();

    // === ปุ่มพิมพ์ / บันทึก PDF ===
  const printBtn = $('#rb-print-btn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      // ใช้ระบบ Print ของเบราว์เซอร์ -> เลือก "Save as PDF" ได้
      window.print();
    });
  }

  const propertyId = getPropertyIdFromUrl();
  const alertBox = $('#rb-alert');

  if (!propertyId) {
    alertBox.style.display = 'block';
    // ไม่ต้องโหลดอะไรต่อ
    return;
  }

  const prop = await loadPropertyHeader(propertyId);
  if (!prop) {
    alertBox.style.display = 'block';
    return;
  }

  // โหลดข้อมูลหลัก
  await loadSpecs(propertyId);
  await loadContractors(propertyId);

  // ฟอร์มสเปก
  const specForm = $('#rb-spec-form');
  const specResetBtn = $('#rb-spec-reset-btn');
  if (specForm) {
    specForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = getFormData(specForm);
      const btn = specForm.querySelector('button[type=submit]');
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'กำลังบันทึก...';

      try {
        await upsertSpec({
          id: payload.id || undefined,
          property_id: propertyId,
          zone: payload.zone,
          item_type: payload.item_type,
          brand: payload.brand,
          model_or_series: payload.model_or_series,
          color_code: payload.color_code,
          supplier: payload.supplier,
          note: payload.note,
        });
        toast('บันทึกสเปกเรียบร้อย', 2000, 'success');
        resetSpecForm();
        await loadSpecs(propertyId);
      } catch (err) {
        console.error(err);
        toast('บันทึกสเปกไม่สำเร็จ', 2500, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = old;
      }
    });

    specResetBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      resetSpecForm();
    });
  }

  // ฟอร์มทีมช่าง
  const contractorForm = $('#rb-contractor-form');
  const contractorResetBtn = $('#rb-contractor-reset-btn');
  if (contractorForm) {
    contractorForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = getFormData(contractorForm);
      const btn = contractorForm.querySelector('button[type=submit]');
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'กำลังบันทึก...';

      try {
        // 1) อัปเดต/สร้างช่าง
        const contractor = await upsertContractor({
          name: payload.contractor_name,
          phone: payload.contractor_phone,
          trade: payload.contractor_trade,
        });

        // 2) ผูกกับบ้าน
        await upsertPropertyContractor({
          id: payload.link_id || undefined,
          property_id: propertyId,
          contractor_id: contractor.id,
          scope: payload.scope || '',
          warranty_months: payload.warranty_months
            ? Number(payload.warranty_months)
            : null,
        });

        toast('บันทึกทีมช่างเรียบร้อย', 2000, 'success');
        resetContractorForm();
        await loadContractors(propertyId);
      } catch (err) {
        console.error(err);
        toast('บันทึกทีมช่างไม่สำเร็จ', 2500, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = old;
      }
    });

    contractorResetBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      resetContractorForm();
    });
  }
});
