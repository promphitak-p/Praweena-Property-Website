// js/pages/renovation-book-report.page.js
//------------------------------------------------------------
// หน้า "รายงานสมุดรีโนเวท" สำหรับพิมพ์ / Export PDF
// - รับ property_id จาก query string
// - ดึงข้อมูลบ้าน + สเปกรีโนเวท + ทีมช่าง
// - จัดรูปแบบให้อ่านง่ายสำหรับลูกค้า / สั่ง Print to PDF
//------------------------------------------------------------

import { protectPage } from '../auth/guard.js';
import { signOutIfAny } from '../auth/auth.js';
import { setupMobileNav } from '../ui/mobileNav.js';
import { setupNav } from '../utils/config.js';
import { formatPrice } from '../utils/format.js';
import { listAll } from '../services/propertiesService.js';
import {
  listSpecsByProperty
} from '../services/propertySpecsService.js';
import {
  listContractorsForProperty
} from '../services/propertyContractorsService.js';
import { toast } from '../ui/toast.js';
import { $, clear } from '../ui/dom.js';

const root = $('#report-root');

function groupSpecsByZone(specs) {
  const map = new Map();
  specs.forEach((s) => {
    const zone = (s.zone || 'ไม่ระบุโซน').trim();
    if (!map.has(zone)) map.set(zone, []);
    map.get(zone).push(s);
  });
  return map;
}

async function fetchPropertyById(id) {
  const { data, error } = await listAll();
  if (error) throw error;
  if (!data) return null;
  return data.find((p) => String(p.id) === String(id)) || null;
}

function renderReport(property, specs, contractors) {
  if (!root) return;
  clear(root);

  const generatedAt = new Date().toLocaleString('th-TH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const detailUrl = property.slug
    ? `/property-detail.html?slug=${encodeURIComponent(property.slug)}`
    : '';

  const headerEl = document.createElement('div');
  headerEl.className = 'report-header';
  headerEl.innerHTML = `
    <div class="report-title-block">
      <h1>สมุดรีโนเวทบ้าน</h1>
      <p><strong>${property.title || '-'}</strong></p>
      <p>
        ${property.address || ''} ${property.district || ''} ${property.province || ''}
      </p>
      <p style="margin-top:.25rem;font-size:.85rem;color:#6b7280;">
        ขนาด: ${property.size_text || '-'} • ${property.beds ?? '-'} นอน • ${property.baths ?? '-'} น้ำ • ที่จอดรถ ${property.parking ?? '-'}
      </p>
    </div>
    <div class="report-meta">
      <div>ราคา: <strong>${formatPrice(Number(property.price) || 0)}</strong></div>
      ${
        detailUrl
          ? `<div style="margin-top:.25rem;">
               หน้าเว็บลูกค้า:
               <span style="color:#2563eb;">${detailUrl}</span>
             </div>`
          : ''
      }
      <div style="margin-top:.5rem;">จัดพิมพ์เมื่อ: ${generatedAt}</div>
      <div>โดย: Praweena Property</div>
    </div>
  `;

  // ---------- ส่วนสเปกรีโนเวท ----------
  const specsSection = document.createElement('section');
  specsSection.className = 'report-section';
  const byZone = groupSpecsByZone(specs || []);

  let specsHTML = '';
  if (!specs || !specs.length) {
    specsHTML = `
      <p style="color:#9ca3af;">ยังไม่มีข้อมูลสเปกรีโนเวทสำหรับบ้านหลังนี้</p>
    `;
  } else {
    byZone.forEach((items, zone) => {
      specsHTML += `
        <h3 class="zone-label">${zone}</h3>
        <table class="table-report" style="margin-bottom:1rem;">
          <thead>
            <tr>
              <th style="width:18%;">ประเภทงาน</th>
              <th style="width:37%;">วัสดุ / ยี่ห้อ / รุ่น / เบอร์สี</th>
              <th style="width:20%;">ร้าน / ผู้ขาย</th>
              <th>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((s) => {
                const mat = [
                  s.brand,
                  s.model_or_series,
                  s.color_code && `(${s.color_code})`
                ]
                  .filter(Boolean)
                  .join(' / ');

                return `
                  <tr>
                    <td>${s.item_type || ''}</td>
                    <td>${mat ? `<span class="brand-text">${mat}</span>` : '-'}</td>
                    <td>${s.supplier || ''}</td>
                    <td>${s.note || ''}</td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      `;
    });
  }

  specsSection.innerHTML = `
    <h2>สเปกรีโนเวท (วัสดุ / สี / สุขภัณฑ์ ฯลฯ)</h2>
    ${specsHTML}
    <p class="report-note">
      * ข้อมูลชุดนี้จัดทำเพื่อบันทึกสเปกงานรีโนเวทของบ้านหลังนี้
      หากลูกค้าต้องการปรับเปลี่ยนในอนาคต สามารถอ้างอิงชื่อรุ่น / เบอร์สี / ร้านที่ซื้อได้จากหน้านี้
    </p>
  `;

  // ---------- ส่วนทีมช่าง ----------
  const contractorsSection = document.createElement('section');
  contractorsSection.className = 'report-section';

  let contractorsHTML = '';
  if (!contractors || !contractors.length) {
    contractorsHTML = `
      <p style="color:#9ca3af;">ยังไม่มีการบันทึกทีมช่างสำหรับบ้านหลังนี้</p>
    `;
  } else {
    contractorsHTML = `
      <table class="table-report">
        <thead>
          <tr>
            <th style="width:22%;">ชื่อช่าง / ทีมงาน</th>
            <th style="width:18%;">สายงาน</th>
            <th style="width:18%;">เบอร์ติดต่อ</th>
            <th style="width:30%;">ขอบเขตงานในบ้านหลังนี้</th>
            <th>รับประกัน (เดือน)</th>
          </tr>
        </thead>
        <tbody>
          ${contractors
            .map((link) => {
              const c = link.contractor || {};
              return `
                <tr>
                  <td>${c.name || ''}</td>
                  <td>${c.trade || ''}</td>
                  <td>${c.phone || ''}</td>
                  <td>${link.scope || ''}</td>
                  <td>${link.warranty_months ?? ''}</td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
      <p class="report-note">
        * ข้อมูลทีมช่างช่วยให้ทราบว่าในอนาคตหากมีการซ่อมแซม/ต่อเติม
        สามารถติดต่อช่างเดิมที่คุ้นเคยกับหน้างานหลังนี้ได้ทันที
      </p>
    `;
  }

  contractorsSection.innerHTML = `
    <h2>ทีมช่างที่ทำงานในบ้านหลังนี้</h2>
    ${contractorsHTML}
  `;

  const footer = document.createElement('div');
  footer.className = 'report-footer';
  footer.innerHTML = `
    เอกสารนี้จัดทำโดย Praweena Property
    (สำหรับใช้ภายใน / มอบให้ลูกค้าเพื่อการดูแลบ้านในระยะยาว)
  `;

  root.appendChild(headerEl);
  root.appendChild(specsSection);
  root.appendChild(contractorsSection);
  root.appendChild(footer);
}

async function loadReport() {
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const propertyId = params.get('property_id');

  if (!propertyId) {
    root.innerHTML = `<p style="color:#b91c1c;">ไม่พบ property_id ในลิงก์ กรุณาเปิดจากหน้า “สมุดรีโนเวท”</p>`;
    return;
  }

  try {
    clear(root);
    root.innerHTML = `<p style="color:#6b7280;">กำลังโหลดข้อมูลสมุดรีโนเวท...</p>`;

    const [prop, specs, contractors] = await Promise.all([
      fetchPropertyById(propertyId),
      listSpecsByProperty(propertyId),
      listContractorsForProperty(propertyId)
    ]);

    if (!prop) {
      root.innerHTML = `<p style="color:#b91c1c;">ไม่พบบ้านหลังนี้ในระบบ</p>`;
      return;
    }

    document.title = `รายงานสมุดรีโนเวท: ${prop.title || ''} - Praweena Property`;

    renderReport(prop, specs || [], contractors || []);
  } catch (err) {
    console.error(err);
    root.innerHTML = `<p style="color:#b91c1c;">โหลดข้อมูลไม่สำเร็จ: ${err.message || err}</p>`;
  }
}

// -------------------- main --------------------
document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();  // กันคนไม่ล็อกอิน
  setupNav();
  setupMobileNav();
  await signOutIfAny();

  await loadReport();

  const printBtn = $('#report-print-btn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print(); // จากตรงนี้ค่อย Save as PDF เอา
    });
  }

  const backBtn = $('#report-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const params = new URLSearchParams(window.location.search);
      const propertyId = params.get('property_id');
      if (propertyId) {
        window.location.href = `/renovation-book.html?property_id=${encodeURIComponent(propertyId)}`;
      } else {
        window.location.href = '/renovation-book.html';
      }
    });
  }
});
