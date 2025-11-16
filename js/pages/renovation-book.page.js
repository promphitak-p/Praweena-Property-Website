//------------------------------------------------------------
// หน้า "สมุดรีโนเวท" (หลังบ้าน)
// - โหมด 1: แสดงรายการบ้านทั้งหมด
// - โหมด 2: แสดงสมุดรีโนเวทของบ้าน 1 หลัง (สเปก + ทีมช่าง)
//------------------------------------------------------------
import { setupMobileNav } from '../ui/mobileNav.js';
import { protectPage } from '../auth/guard.js';
import { signOutIfAny } from '../auth/auth.js';
import { setupNav } from '../utils/config.js';
import { formatPrice } from '../utils/format.js';
import { listAll } from '../services/propertiesService.js';
import { listSpecsByProperty, upsertSpec, deleteSpec } from '../services/propertySpecsService.js';
import { listContractorsForProperty, upsertPropertyContractor, deletePropertyContractor } from '../services/propertyContractorsService.js';
import { upsertContractor } from '../services/contractorsService.js';
import { $, clear } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

let currentProperty = null;
let currentPropertyId = null;

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

      const openBtn = card.querySelector('.rb-open-book-btn');
      openBtn.addEventListener('click', () => {
        const url = new URL(window.location.href);
        url.searchParams.set('property_id', p.id);
        window.location.href = url.toString();
      });

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
  // ใช้วิธีง่าย: listAll แล้วหาเอา
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
      const mat = [
        s.brand,
        s.model_or_series,
        s.color_code && `(${s.color_code})`,
      ].filter(Boolean).join(' / ');

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

function setupAddSpecButton() {
  const btn = $('#rb-add-spec');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!currentPropertyId) {
      alert('กรุณาเลือกบ้านจากรายการก่อน');
      return;
    }

    const zone = prompt('โซน (เช่น ห้องนั่งเล่น, ห้องครัว, ห้องน้ำบน):');
    if (!zone) return;

    const itemType = prompt('ประเภท (เช่น สี, กระเบื้อง, สุขภัณฑ์, ไฟ):') || '';
    const brand = prompt('ยี่ห้อ (เช่น TOA, Beger, COTTO):') || '';
    const model = prompt('รุ่น / ซีรีส์ (ถ้ามี):') || '';
    const color = prompt('เบอร์สี / โค้ด (ถ้ามี):') || '';
    const supplier = prompt('ซื้อจากร้านไหน (ถ้ามี):') || '';
    const note = prompt('หมายเหตุ (เช่น ผสม A:B 50:50 ฯลฯ):') || '';

    await upsertSpec({
      property_id: currentPropertyId,
      zone,
      item_type: itemType,
      brand,
      model_or_series: model,
      color_code: color,
      supplier,
      note,
    });

    await loadSpecsForProperty(currentPropertyId);
  });
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

function setupAddContractorButton() {
  const btn = $('#rb-add-contractor');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!currentPropertyId) {
      alert('กรุณาเลือกบ้านจากรายการก่อน');
      return;
    }

    const name = prompt('ชื่อช่าง:');
    if (!name) return;

    const trade = prompt('สายงาน (เช่น ปูกระเบื้อง, ทาสี, ระบบน้ำ):') || '';
    const phone = prompt('เบอร์ติดต่อช่าง (ถ้ามี):') || '';
    const scope = prompt('ขอบเขตงานในบ้านหลังนี้ (เช่น ปูกระเบื้องชั้นล่าง):') || '';
    const warrantyStr = prompt('ระยะเวลารับประกันงาน (เดือน, ถ้าไม่มีกด Enter ข้าม):') || '';
    const warranty = warrantyStr ? Number(warrantyStr) : null;

    const contractor = await upsertContractor({
      name,
      phone,
      trade,
    });

    await upsertPropertyContractor({
      property_id: currentPropertyId,
      contractor_id: contractor.id,
      scope,
      warranty_months: warranty,
    });

    await loadContractorsForProperty(currentPropertyId);
  });
}

// -------------------- Print / PDF --------------------
function setupPrintButton() {
  const btn = $('#rb-print-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    window.print();
  });
}

// -------------------- init --------------------
document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();      // ให้เฉพาะ admin / user ที่ล็อกอินเห็น
  setupNav();
  setupMobileNav();
  await signOutIfAny();

  const params = new URLSearchParams(window.location.search);
  const propertyIdParam = params.get('property_id');

  const backBtn = $('#rb-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      // กลับไปโหมดรายการบ้าน
      const url = new URL(window.location.href);
      url.searchParams.delete('property_id');
      window.location.href = url.toString();
    });
  }

  setupAddSpecButton();
  setupAddContractorButton();
  setupPrintButton();

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
      specsBox.innerHTML = '<p style="color:#6b7280;">กำลังโหลดข้อมูลสเปกรีโนเวท...</p>';
    }
    if (contractorsBox) {
      contractorsBox.innerHTML = '<p style="color:#6b7280;">กำลังโหลดข้อมูลทีมช่าง...</p>';
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
