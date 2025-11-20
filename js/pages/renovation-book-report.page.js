// js/pages/renovation-book-report.page.js
import { formatPrice } from '../utils/format.js';
import { listAll } from '../services/propertiesService.js';
import { getRenovationBookByPropertyId } from '../services/renovationBookService.js';
import { listSpecsByProperty } from '../services/propertySpecsService.js';
import { listContractorsForProperty } from '../services/propertyContractorsService.js';
import { $ } from '../ui/dom.js';

// helper
const getEl = (id) => document.getElementById(id) || null;

async function fetchPropertyById(id) {
  const { data, error } = await listAll();
  if (error) throw error;
  if (!data) return null;
  return data.find((p) => String(p.id) === String(id)) || null;
}

function field(label, value) {
  const htmlValue = value && String(value).trim() ? value : '—';
  return `
    <div>
      <div class="rb-report-field-label">${label}</div>
      <div class="rb-report-field-value">${htmlValue}</div>
    </div>
  `;
}

function fieldFull(label, value) {
  const htmlValue = value && String(value).trim() ? value : '—';
  return `
    <div style="grid-column:1/-1;">
      <div class="rb-report-field-label">${label}</div>
      <div class="rb-report-field-value">${htmlValue}</div>
    </div>
  `;
}

async function renderHeader(property, book) {
  const box = $('#rb-report-header');
  if (!box) return;

  if (!property) {
    box.innerHTML = '<p class="rb-empty">ไม่พบบ้านหลังนี้ในระบบ</p>';
    return;
  }

  const statusText = property.published ? 'เผยแพร่แล้ว' : 'ยังไม่เผยแพร่';
  const statusBadge = `<span class="rb-report-badge">${statusText}</span>`;

  box.innerHTML = `
    <div class="rb-report-header-title">
      ${property.title || '-'} ${statusBadge}
    </div>
    <div class="rb-report-header-meta">
      ${property.address || ''} ${property.district || ''} ${property.province || ''}<br>
      ขนาด: ${property.size_text || '-'} • ${property.beds ?? '-'} นอน • ${property.baths ?? '-'} น้ำ • ที่จอดรถ ${property.parking ?? '-'}<br>
      ราคา ${formatPrice(Number(property.price) || 0)}
      ${
        book?.house_code
          ? `<br>โค้ดบ้าน / ชื่อในระบบ: ${book.house_code}`
          : ''
      }
    </div>
  `;
}

function renderSection1(book) {
  const box = $('#rb-report-section-1-body');
  if (!box) return;
  if (!book) {
    box.innerHTML = '<p class="rb-empty">ยังไม่มีข้อมูลสมุดรีโนเวทสำหรับบ้านหลังนี้</p>';
    return;
  }

  box.innerHTML = `
    ${field('โค้ดบ้าน / ชื่อเล่นบ้าน', book.house_code)}
    ${field('ที่ตั้ง', book.house_location)}
    ${field('ประเภทบ้าน', book.house_type)}
    ${field('จำนวนชั้น', book.house_storeys)}
    ${field('ขนาดที่ดิน (ตร.วา)', book.land_size)}
    ${field('พื้นที่ใช้สอย (ตร.ม.)', book.usable_area)}
    ${field('ทิศที่หันหน้า', book.house_facing)}
    ${field('อายุอาคาร (ปี)', book.house_age)}
    ${field('แหล่งที่มาของบ้าน', book.acquisition_type)}
    ${field('เป้าหมายโปรเจกต์', book.project_goal)}
    ${fieldFull('กลุ่มลูกค้าเป้าหมาย', book.target_buyer)}
    ${fieldFull('คอนเซ็ปต์รีโนเวท / สไตล์', book.design_concept)}
  `;
}

function renderSection2(book) {
  const box = $('#rb-report-section-2-body');
  if (!box) return;
  if (!book) {
    box.innerHTML = '<p class="rb-empty">ไม่มีข้อมูล</p>';
    return;
  }

  box.innerHTML = `
    ${fieldFull('โครงสร้าง / พื้น / หลังคา', book.structural_issues)}
    ${fieldFull('ระบบท่อน้ำทิ้ง / สุขาภิบาล', book.plumbing_issues)}
    ${fieldFull('ระบบน้ำดี', book.water_supply_issues)}
    ${fieldFull('ระบบไฟฟ้า', book.electrical_issues)}
    ${fieldFull('ความเสี่ยงอื่น ๆ', book.other_risks)}
  `;
}

function renderSection3(book) {
  const box = $('#rb-report-section-3-body');
  if (!box) return;
  if (!book) {
    box.innerHTML = '<p class="rb-empty">ไม่มีข้อมูล</p>';
    return;
  }

  box.innerHTML = `
    ${field('การจัดการปูนเก่า / พื้นเดิม', book.remove_old_screed)}
    ${field('ความหนาปูนเก่า (ซม.)', book.old_screed_thickness)}
    ${fieldFull('สเปกปูนปรับระดับ / พื้นใหม่', book.new_screed_spec)}
    ${fieldFull('แผนงานพื้น', book.flooring_plan)}
  `;
}

function renderSection4(book) {
  const box = $('#rb-report-section-4-body');
  if (!box) return;
  if (!book) {
    box.innerHTML = '<p class="rb-empty">ไม่มีข้อมูล</p>';
    return;
  }

  box.innerHTML = `
    ${field('แผนงานท่อน้ำทิ้ง', book.drainage_plan)}
    ${field('ขนาดท่อเมนหลัก', book.pipe_size_main)}
    ${fieldFull('รายละเอียดวางท่อ / บ่อพัก / การระบายน้ำ', book.drainage_notes)}
    ${field('แผนงานระบบน้ำดี', book.water_supply_plan)}
    ${field('ถังเก็บน้ำ / ปั๊มน้ำ', book.water_tank_pump)}
    ${fieldFull('หมายเหตุระบบน้ำ', book.water_notes)}
  `;
}

function renderSection5(book) {
  const box = $('#rb-report-section-5-body');
  if (!box) return;
  if (!book) {
    box.innerHTML = '<p class="rb-empty">ไม่มีข้อมูล</p>';
    return;
  }

  box.innerHTML = `
    ${field('แผนระบบไฟ', book.electric_plan)}
    ${field('ตู้ไฟ / เมนเบรกเกอร์', book.main_breaker_spec)}
    ${fieldFull('แผนไฟส่องสว่าง & ปลั๊ก', book.lighting_plan)}
  `;
}

function renderSection6(book) {
  const box = $('#rb-report-section-6-body');
  if (!box) return;
  if (!book) {
    box.innerHTML = '<p class="rb-empty">ไม่มีข้อมูล</p>';
    return;
  }

  box.innerHTML = `
    ${fieldFull('แผนรีโนเวทห้องน้ำ', book.bathroom_plan)}
    ${fieldFull('แผนครัว', book.kitchen_plan)}
  `;
}

function renderSection7(book) {
  const box = $('#rb-report-section-7-body');
  if (!box) return;
  if (!book) {
    box.innerHTML = '<p class="rb-empty">ไม่มีข้อมูล</p>';
    return;
  }

  box.innerHTML = fieldFull('สรุปภาพรวม / สิ่งที่ต้องโฟกัสเป็นพิเศษ', book.summary_notes);
}

async function renderSpecs(propertyId) {
  const box = $('#rb-report-specs');
  if (!box) return;

  try {
    const specs = await listSpecsByProperty(propertyId);
    if (!specs.length) {
      box.innerHTML = '<p class="rb-empty">ยังไม่มีการบันทึกสเปกรีโนเวท</p>';
      return;
    }

    const rows = specs
      .map((s) => {
        const mat = [s.brand, s.model_or_series, s.color_code && `(${s.color_code})`]
          .filter(Boolean)
          .join(' / ');
        return `
          <tr>
            <td>${s.zone || ''}</td>
            <td>${s.item_type || ''}</td>
            <td>${mat || '-'}</td>
            <td>${s.supplier || ''}</td>
            <td>${s.note || ''}</td>
          </tr>
        `;
      })
      .join('');

    box.innerHTML = `
      <div class="rb-table-wrapper">
        <table class="rb-table">
          <thead>
            <tr>
              <th>โซน</th>
              <th>ประเภท</th>
              <th>ยี่ห้อ / รุ่น / เบอร์สี</th>
              <th>ร้าน / ผู้ขาย</th>
              <th>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } catch (err) {
    console.error(err);
    box.innerHTML = '<p class="rb-empty">โหลดข้อมูลสเปกไม่สำเร็จ</p>';
  }
}

async function renderContractors(propertyId) {
  const box = $('#rb-report-contractors');
  if (!box) return;

  try {
    const links = await listContractorsForProperty(propertyId);
    if (!links.length) {
      box.innerHTML = '<p class="rb-empty">ยังไม่มีข้อมูลทีมช่าง</p>';
      return;
    }

    const rows = links
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
      .join('');

    box.innerHTML = `
      <div class="rb-table-wrapper">
        <table class="rb-table">
          <thead>
            <tr>
              <th>ชื่อช่าง</th>
              <th>สายงาน</th>
              <th>เบอร์ติดต่อ</th>
              <th>ขอบเขตงาน</th>
              <th>รับประกัน (เดือน)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } catch (err) {
    console.error(err);
    box.innerHTML = '<p class="rb-empty">โหลดข้อมูลทีมช่างไม่สำเร็จ</p>';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const propertyId = params.get('property_id');

  const headerBox = $('#rb-report-header');
  if (!propertyId) {
    if (headerBox) {
      headerBox.innerHTML = '<p class="rb-empty">ไม่มี property_id ใน URL</p>';
    }
    return;
  }

  try {
    const [property, book] = await Promise.all([
      fetchPropertyById(propertyId),
      getRenovationBookByPropertyId(propertyId)
    ]);

    await renderHeader(property, book);
    renderSection1(book);
    renderSection2(book);
    renderSection3(book);
    renderSection4(book);
    renderSection5(book);
    renderSection6(book);
    renderSection7(book);
    await renderSpecs(propertyId);
    await renderContractors(propertyId);
  } catch (err) {
    console.error(err);
    if (headerBox) {
      headerBox.innerHTML = '<p class="rb-empty">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>';
    }
  }
});
