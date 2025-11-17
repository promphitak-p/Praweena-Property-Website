// js/pages/renovation-book-report.page.js
// --------------------------------------------------
// หน้า "รายงานสมุดรีโนเวท" (ใช้แสดงใน iframe + พิมพ์/Export PDF)
// - ดึง property_id จาก query string
// - โหลดข้อมูลบ้าน, สเปกรีโนเวท, ทีมช่าง
// - เรนเดอร์ใส่ element: #rbr-meta, #rbr-summary-main,
//   #rbr-summary-extra, #rbr-specs, #rbr-contractors
// --------------------------------------------------
import { formatPrice } from '../utils/format.js';
import { listAll } from '../services/propertiesService.js';
import { listSpecsByProperty } from '../services/propertySpecsService.js';
import { listContractorsForProperty } from '../services/propertyContractorsService.js';
import { $, clear } from '../ui/dom.js';

// -------- helper: หา property ตาม id จาก listAll --------
async function fetchPropertyById(id) {
  const { data, error } = await listAll();
  if (error) throw error;
  if (!data) return null;
  return data.find((p) => String(p.id) === String(id)) || null;
}

// -------- helper: format วันที่/เวลา --------
function formatDateTimeTH(d) {
  try {
    const dt = d instanceof Date ? d : new Date(d);
    const date = dt.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const time = dt.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${date} • ${time} น.`;
  } catch {
    return '';
  }
}

// -------- 1) META ด้านขวาหัวกระดาษ --------
function renderMeta(property) {
  const box = $('#rbr-meta');
  if (!box) return;

  const nowText = formatDateTimeTH(new Date());
  const code = property.slug || `ID: ${property.id}`;

  box.innerHTML = `
    <div>${nowText}</div>
    <div>รหัสทรัพย์: <strong>${code}</strong></div>
  `;
}

// -------- 2) SUMMARY กล่องซ้าย/ขวา ด้านบน --------
function renderSummary(property) {
  const main = $('#rbr-summary-main');
  const extra = $('#rbr-summary-extra');
  if (!main || !extra) return;

  // กล่องซ้าย: ข้อมูลบ้านหลัก
  main.innerHTML = `
    <h3 class="rbr-summary-title">ข้อมูลบ้าน</h3>
    <ul class="rbr-summary-list">
      <li><span class="rbr-summary-label">ชื่อบ้าน:</span> ${property.title || '-'}</li>
      <li><span class="rbr-summary-label">ที่อยู่:</span> ${[
        property.address,
        property.district,
        property.province,
      ].filter(Boolean).join(' ') || '-'}</li>
      <li><span class="rbr-summary-label">ขนาด:</span> ${property.size_text || '-'}</li>
      <li>
        <span class="rbr-summary-label">ฟังก์ชัน:</span>
        ${property.beds ?? '-'} นอน • ${property.baths ?? '-'} น้ำ • ที่จอดรถ ${property.parking ?? '-'}
      </li>
    </ul>
  `;

  // กล่องขวา: ราคา + สรุปสั้น ๆ
  extra.innerHTML = `
    <h3 class="rbr-summary-title">ข้อมูลราคา</h3>
    <ul class="rbr-summary-list">
      <li>
        <span class="rbr-summary-label">ราคาขาย:</span>
        <span class="rbr-price">${formatPrice(Number(property.price) || 0)}</span>
      </li>
      <li><span class="rbr-summary-label">จังหวัด:</span> ${property.province || '-'}</li>
      <li><span class="rbr-summary-label">รหัสทรัพย์:</span> ${property.slug || property.id}</li>
    </ul>
    <p class="rbr-note">
      *ข้อมูลนี้ใช้สำหรับอ้างอิงวัสดุและทีมช่างที่ใช้ในการรีโนเวทบ้านหลังนี้
    </p>
  `;
}

// -------- 3) ตารางสเปกรีโนเวท --------
async function renderSpecs(propertyId) {
  const box = $('#rbr-specs');
  if (!box) return;

  box.innerHTML = `<p class="rbr-note">กำลังโหลดข้อมูลสเปกรีโนเวท...</p>`;

  try {
    const specs = await listSpecsByProperty(propertyId);

    if (!specs || !specs.length) {
      box.innerHTML = `<p class="rbr-note">ยังไม่ได้บันทึกสเปกรีโนเวทสำหรับบ้านหลังนี้</p>`;
      return;
    }

    // จัดเรียงให้ดูเป็นระเบียบ: zone > item_type
    specs.sort((a, b) => {
      const za = (a.zone || '').localeCompare(b.zone || '', 'th');
      if (za !== 0) return za;
      return (a.item_type || '').localeCompare(b.item_type || '', 'th');
    });

    const table = document.createElement('table');
    table.className = 'rbr-table';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th style="width:18%;">โซน</th>
        <th style="width:16%;">ประเภท</th>
        <th>ยี่ห้อ / รุ่น / เบอร์สี</th>
        <th style="width:18%;">ร้าน / ผู้ขาย</th>
        <th style="width:18%;">หมายเหตุ</th>
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
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    clear(box);
    box.appendChild(table);
  } catch (err) {
    console.error(err);
    box.innerHTML = `
      <p class="rbr-note" style="color:#b91c1c;">
        โหลดข้อมูลสเปกไม่สำเร็จ: ${err.message || err}
      </p>
    `;
  }
}

// -------- 4) ตารางทีมช่าง --------
async function renderContractors(propertyId) {
  const box = $('#rbr-contractors');
  if (!box) return;

  box.innerHTML = `<p class="rbr-note">กำลังโหลดข้อมูลทีมช่าง...</p>`;

  try {
    const links = await listContractorsForProperty(propertyId);

    if (!links || !links.length) {
      box.innerHTML = `<p class="rbr-note">ยังไม่ได้บันทึกทีมช่างสำหรับบ้านหลังนี้</p>`;
      return;
    }

    const table = document.createElement('table');
    table.className = 'rbr-table';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th style="width:22%;">ชื่อช่าง</th>
        <th style="width:16%;">สายงาน</th>
        <th style="width:18%;">เบอร์ติดต่อ</th>
        <th>ขอบเขตงาน</th>
        <th style="width:14%;">รับประกัน (เดือน)</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    links.forEach((link) => {
      const c = link.contractor || {};
      const warranty = link.warranty_months ?? '';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.name || ''}</td>
        <td>${c.trade || ''}</td>
        <td>${c.phone || ''}</td>
        <td>${link.scope || ''}</td>
        <td>${warranty}</td>
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    clear(box);
    box.appendChild(table);
  } catch (err) {
    console.error(err);
    box.innerHTML = `
      <p class="rbr-note" style="color:#b91c1c;">
        โหลดข้อมูลทีมช่างไม่สำเร็จ: ${err.message || err}
      </p>
    `;
  }
}

function setupPrintButton() {
  const btn = document.querySelector('#rbr-print-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    window.print();        // สั่ง Print จากใน iframe นี้เลย
  });
}

// -------- main init --------
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const propertyId = params.get('property_id');

  const metaBox = $('#rbr-meta');
  const summaryMain = $('#rbr-summary-main');
  const summaryExtra = $('#rbr-summary-extra');
  const specsBox = $('#rbr-specs');
  const contractorsBox = $('#rbr-contractors');

  if (!propertyId) {
    if (metaBox) metaBox.textContent = 'ไม่พบรหัสบ้าน (property_id)';
    if (summaryMain) summaryMain.innerHTML = '<p class="rbr-note">ไม่พบข้อมูลบ้าน</p>';
    return;
  }

  // placeholder ขณะโหลด
  if (summaryMain) {
    summaryMain.innerHTML = '<p class="rbr-note">กำลังโหลดข้อมูลบ้าน...</p>';
  }
  if (summaryExtra) {
    summaryExtra.innerHTML = '<p class="rbr-note">กำลังโหลดข้อมูลราคา...</p>';
  }
  if (specsBox) {
    specsBox.innerHTML = '<p class="rbr-note">กำลังโหลดข้อมูลสเปกรีโนเวท...</p>';
  }
  if (contractorsBox) {
    contractorsBox.innerHTML = '<p class="rbr-note">กำลังโหลดข้อมูลทีมช่าง...</p>';
  }

  try {
    const property = await fetchPropertyById(propertyId);
    if (!property) {
      if (summaryMain) summaryMain.innerHTML = '<p class="rbr-note">ไม่พบบ้านหลังนี้ในระบบ</p>';
      return;
    }

    // render ส่วนหัวและสรุป
    renderMeta(property);
    renderSummary(property);

    // render ตารางสเปก + ทีมช่าง
    await renderSpecs(property.id);
    await renderContractors(property.id);
  } catch (err) {
    console.error(err);
    if (summaryMain) {
      summaryMain.innerHTML = `
        <p class="rbr-note" style="color:#b91c1c;">
          โหลดข้อมูลไม่สำเร็จ: ${err.message || err}
        </p>
      `;
    }
  }
    setupPrintButton();     // 👈 เพิ่มบรรทัดนี้

});
