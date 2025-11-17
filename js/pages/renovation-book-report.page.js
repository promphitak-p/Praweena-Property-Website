// --------------------------------------------------
// หน้ารายงาน "สมุดรีโนเวทบ้าน" (สำหรับ Print / PDF)
// - ใช้ดูอย่างเดียว ไม่มีปุ่มลบ/แก้ไข
// - ดึงข้อมูลบ้าน + สเปกรีโนเวท + ทีมช่าง ตาม property_id
// --------------------------------------------------
import { setupMobileNav } from '../ui/mobileNav.js';
import { protectPage } from '../auth/guard.js';
import { signOutIfAny } from '../auth/auth.js';
import { setupNav } from '../utils/config.js';
import { formatPrice } from '../utils/format.js';
import { listAll } from '../services/propertiesService.js';
import { listSpecsByProperty } from '../services/propertySpecsService.js';
import { listContractorsForProperty } from '../services/propertyContractorsService.js';
import { $, clear } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

async function fetchPropertyById(id) {
  const { data, error } = await listAll();
  if (error) throw error;
  if (!data) return null;
  return data.find((p) => String(p.id) === String(id)) || null;
}

function renderSkeleton() {
  const root = $('#rb-report-root');
  if (!root) return;
  root.innerHTML = `<div style="color:#6b7280;">กำลังโหลดสมุดรีโนเวท...</div>`;
}

// ----------------- ส่วนหัวรายงาน -----------------
function renderHeaderShell() {
  const root = $('#rb-report-root');
  if (!root) return;

  clear(root);

  const wrapper = document.createElement('div');

  wrapper.innerHTML = `
    <div class="report-header-top">
      <div class="report-brand">
        <div class="report-brand-logo">
          <img src="/assets/img/logo-square.png" alt="Praweena Property" onerror="this.style.display='none';">
        </div>
        <div>
          <div class="report-brand-text-small">Praweena Property</div>
          <h1 class="report-title-main">สมุดรีโนเวทบ้าน</h1>
        </div>
      </div>

      <div class="report-actions">
        <button id="rb-report-back-btn" class="btn btn-outline">
          ← กลับสมุดรีโนเวท
        </button>
        <button id="rb-report-print-btn" class="btn btn-primary">
          🖨️ พิมพ์ / Export PDF
        </button>
      </div>
    </div>

    <section class="report-section" id="rb-report-property"></section>

    <section class="report-section">
      <h2 class="report-section-title">สเปกรีโนเวท (วัสดุ / สี / สุขภัณฑ์ ฯลฯ)</h2>
      <p class="report-section-sub">
        สรุปรายการวัสดุหลักที่ใช้ในการรีโนเวทบ้านหลังนี้ เพื่อใช้สำหรับอ้างอิงในอนาคต
      </p>
      <div id="rb-report-specs"></div>
    </section>

    <section class="report-section">
      <h2 class="report-section-title">ทีมช่างที่ทำงานในบ้านหลังนี้</h2>
      <p class="report-section-sub">
        รายชื่อทีมงานหลักของบ้านหลังนี้ เพื่อให้ติดต่อได้ง่ายหากต้องการดูผลงานหรือมีการรับประกันงาน
      </p>
      <div id="rb-report-contractors"></div>
    </section>

    <div class="report-footer">
      เอกสารสร้างโดย Praweena Property (สำหรับใช้ภายใน / แนบให้ลูกค้าเพื่อการอ้างอิงในอนาคต)
    </div>
  `;

  root.appendChild(wrapper);
}

// ----------------- แสดงข้อมูลบ้าน -----------------
function renderPropertySummary(property) {
  const box = $('#rb-report-property');
  if (!box) return;

  const detailUrl = property.slug
    ? `/property-detail.html?slug=${encodeURIComponent(property.slug)}`
    : '';

  box.innerHTML = `
    <div class="report-property-summary">
      <div class="report-property-summary-title">
        ${property.title || '-'}
      </div>

      <div class="report-summary-grid">
        <div>
          <div class="report-label">ที่อยู่</div>
          <div>
            ${[
              property.address,
              property.subdistrict,
              property.district,
              property.province,
            ].filter(Boolean).join(' ')}
          </div>

          ${
            detailUrl
              ? `<div class="report-pill" style="margin-top:.35rem;">
                   🔗 หน้าเว็บลูกค้า: ${detailUrl}
                 </div>`
              : ''
          }
        </div>

        <div>
          <div class="report-label">ข้อมูลหลักของบ้าน</div>
          <div class="report-value-strong">
            ขนาด: ${property.size_text || '-'}
          </div>
          <div>
            ${property.beds ?? '-'} ห้องนอน •
            ${property.baths ?? '-'} ห้องน้ำ •
            ที่จอดรถ ${property.parking ?? '-'}
          </div>
          <div style="margin-top:.35rem;">
            <span class="report-label">ราคาขาย</span><br>
            <span class="report-value-strong">
              ${formatPrice(Number(property.price) || 0)}
            </span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ----------------- สเปกรีโนเวท -----------------
async function renderSpecs(propertyId) {
  const container = $('#rb-report-specs');
  if (!container) return;

  container.innerHTML = `<p style="color:#6b7280;">กำลังโหลดข้อมูลสเปกรีโนเวท...</p>`;

  try {
    const specs = await listSpecsByProperty(propertyId);

    if (!specs.length) {
      container.innerHTML = `<p style="color:#9ca3af;">ยังไม่ได้บันทึกสเปกรีโนเวทสำหรับบ้านหลังนี้</p>`;
      return;
    }

    // เรียงตามโซนก่อน
    specs.sort((a, b) => (a.zone || '').localeCompare(b.zone || '', 'th'));

    const wrap = document.createElement('div');
    wrap.className = 'report-table-wrapper';

    const table = document.createElement('table');
    table.className = 'report-table';

    table.innerHTML = `
      <thead>
        <tr>
          <th style="width:16%;">โซน</th>
          <th style="width:14%;">ประเภทงาน</th>
          <th>วัสดุ / ยี่ห้อ / รุ่น / เบอร์สี</th>
          <th style="width:18%;">ร้าน / ผู้ขาย</th>
          <th style="width:18%;">หมายเหตุ</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');

    specs.forEach((s) => {
      const matParts = [s.brand, s.model_or_series, s.color_code && `เบอร์สี ${s.color_code}`]
        .filter(Boolean);
      const mat = matParts.length ? matParts.join(' / ') : '-';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${s.zone || ''}</td>
        <td>${s.item_type || ''}</td>
        <td>${mat}</td>
        <td>${s.supplier || ''}</td>
        <td>${s.note || ''}</td>
      `;
      tbody.appendChild(tr);
    });

    wrap.appendChild(table);

    container.innerHTML = '';
    container.appendChild(wrap);

    const note = document.createElement('p');
    note.className = 'report-footnote';
    note.textContent =
      '* ข้อมูลชุดนี้จัดเก็บเพื่อใช้เทียบเคียงงานรีโนเวทของบ้านหลังอื่น ๆ และใช้ตอบคำถามลูกค้าในอนาคต เช่น ยี่ห้อ / รุ่น / ร้านที่ซื้อวัสดุ';
    container.appendChild(note);
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p style="color:#b91c1c;">โหลดข้อมูลสเปกไม่สำเร็จ: ${err.message || err}</p>`;
  }
}

// ----------------- ทีมช่าง -----------------
async function renderContractors(propertyId) {
  const container = $('#rb-report-contractors');
  if (!container) return;

  container.innerHTML = `<p style="color:#6b7280;">กำลังโหลดข้อมูลทีมช่าง...</p>`;

  try {
    const links = await listContractorsForProperty(propertyId);

    if (!links.length) {
      container.innerHTML = `<p style="color:#9ca3af;">ยังไม่ได้บันทึกทีมช่างสำหรับบ้านหลังนี้</p>`;
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'report-table-wrapper';

    const table = document.createElement('table');
    table.className = 'report-table';

    table.innerHTML = `
      <thead>
        <tr>
          <th style="width:20%;">ชื่อช่าง / ทีมงาน</th>
          <th style="width:15%;">สายงาน</th>
          <th style="width:15%;">เบอร์ติดต่อ</th>
          <th>ขอบเขตงานในบ้านหลังนี้</th>
          <th style="width:13%;">รับประกัน (เดือน)</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');

    links.forEach((link) => {
      const c = link.contractor || {};
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.name || ''}</td>
        <td>${c.trade || ''}</td>
        <td>${c.phone || ''}</td>
        <td>${link.scope || ''}</td>
        <td>${link.warranty_months ?? ''}</td>
      `;
      tbody.appendChild(tr);
    });

    wrap.appendChild(table);

    container.innerHTML = '';
    container.appendChild(wrap);

    const note = document.createElement('p');
    note.className = 'report-footnote';
    note.textContent =
      '* ข้อมูลทีมช่างเก็บเพื่อให้ง่ายต่อการติดต่อในกรณีมีงานเพิ่มเติม งานเคลม หรือใช้เป็น Reference สำหรับบ้านหลังถัดไป';
    container.appendChild(note);
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p style="color:#b91c1c;">โหลดข้อมูลทีมช่างไม่สำเร็จ: ${err.message || err}</p>`;
  }
}

// ----------------- ปุ่มต่าง ๆ -----------------
function bindHeaderButtons(propertyId) {
  const backBtn = $('#rb-report-back-btn');
  const printBtn = $('#rb-report-print-btn');

  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const url = `/renovation-book.html?property_id=${encodeURIComponent(propertyId)}`;
      window.location.href = url;
    });
  }

  if (printBtn) {
    printBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.print();
    });
  }
}

// ----------------- main -----------------
document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();
  setupNav();
  setupMobileNav();
  await signOutIfAny();

  const params = new URLSearchParams(window.location.search);
  const propertyId = params.get('property_id');

  if (!propertyId) {
    const root = $('#rb-report-root');
    if (root) {
      root.innerHTML = `<div style="color:#b91c1c;">ไม่พบรหัสบ้าน (property_id)</div>`;
    }
    return;
  }

  renderSkeleton();

  try {
    const prop = await fetchPropertyById(propertyId);
    if (!prop) {
      const root = $('#rb-report-root');
      if (root) {
        root.innerHTML = `<div style="color:#b91c1c;">ไม่พบบ้านหลังนี้ในระบบ</div>`;
      }
      return;
    }

    renderHeaderShell();
    renderPropertySummary(prop);
    bindHeaderButtons(propertyId);
    await renderSpecs(propertyId);
    await renderContractors(propertyId);
  } catch (err) {
    console.error(err);
    toast('โหลดข้อมูลสมุดรีโนเวทไม่สำเร็จ', 3000, 'error');
  }
});
