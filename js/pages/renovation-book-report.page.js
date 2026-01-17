// js/pages/renovation-book-report.page.js
import { formatPrice } from '../utils/format.js';
import { listAll } from '../services/propertiesService.js';
import { getRenovationBookByPropertyId } from '../services/renovationBookService.js';
import { listSpecsByProperty } from '../services/propertySpecsService.js';
import { listContractorsForProperty } from '../services/propertyContractorsService.js';
import { $ } from '../ui/dom.js';

// ---------------- helper ----------------
async function fetchPropertyById(id) {
  const { data, error } = await listAll();
  if (error) throw error;
  if (!data) return null;
  return data.find((p) => String(p.id) === String(id)) || null;
}

function field(label, value) {
  const htmlValue = value && String(value).trim() ? value : '—';
  return `
    <div class="rbr-field">
      <div class="rb-report-field-label">${label}</div>
      <div class="rb-report-field-value">${htmlValue}</div>
    </div>
  `;
}

function fieldFull(label, value) {
  const htmlValue = value && String(value).trim() ? value : '—';
  return `
    <div class="rbr-field rbr-field-full" style="grid-column:1/-1;">
      <div class="rb-report-field-label">${label}</div>
      <div class="rb-report-field-value">${htmlValue}</div>
    </div>
  `;
}

function escapeHtml(text = '') {
  return String(text).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

function parseLinkList(value) {
  return String(value || '')
    .split(/[\r\n,]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function linkFieldFull(label, value) {
  const links = parseLinkList(value);
  const htmlValue = links.length
    ? `<ul style="margin:0; padding-left:1.2rem;">
        ${links.map((raw) => {
          const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
          const safeHref = escapeHtml(href);
          const safeText = escapeHtml(raw);
          return `<li><a href="${safeHref}" target="_blank" rel="noopener">${safeText}</a></li>`;
        }).join('')}
      </ul>`
    : '—';

  return `
    <div class="rbr-field rbr-field-full" style="grid-column:1/-1;">
      <div class="rb-report-field-label">${label}</div>
      <div class="rb-report-field-value">${htmlValue}</div>
    </div>
  `;
}

// ---------------- mappings ----------------
const TH_MAP = {
  // House Type
  'townhouse': 'ทาวน์เฮ้าส์',
  'single_house': 'บ้านเดี่ยว',
  'twin_house': 'บ้านแฝด',
  'condo': 'คอนโด',
  'commercial': 'อาคารพาณิชย์',
  'land': 'ที่ดิน',
  // Facing
  'north': 'ทิศเหนือ',
  'south': 'ทิศใต้',
  'east': 'ทิศตะวันออก',
  'west': 'ทิศตะวันตก',
  'northeast': 'ทิศตะวันออกเฉียงเหนือ',
  'northwest': 'ทิศตะวันตกเฉียงเหนือ',
  'southeast': 'ทิศตะวันออกเฉียงใต้',
  'southwest': 'ทิศตะวันตกเฉียงใต้',
  // Acquisition
  'npa_bank': 'ทรัพย์ธนาคาร (NPA)',
  'direct_owner': 'เจ้าของขายเอง',
  'agent': 'นายหน้า',
  'auction': 'ประมูลกรมบังคับคดี',
  // Goal
  'flip_sell': 'รีโนเวทเพื่อขาย',
  'rent': 'ปล่อยเช่า',
  'live_in': 'อยู่อาศัยเอง',
  // Concept
  'modern': 'โมเดิร์น',
  'minimal': 'มินิมอล',
  'loft': 'ลอฟท์',
  'luxury': 'ลักซ์ชัวรี่',
  'nordic': 'นอร์ดิก',
  'tropical': 'ทรอปิคอล',
  // Screed / Floor
  'remove_partial': 'รื้อถอนบางส่วน',
  'remove_all': 'รื้อถอนทั้งหมด',
  'keep_existing': 'เก็บของเดิมไว้',
  'tile': 'ปูกระเบื้อง',
  'spc': 'SPC',
  'laminate': 'ลามิเนต',
  'engineering_wood': 'ไม้เอ็นจิเนียร์',
  'polished_cement': 'ปูนขัดมัน'
};

function t(val) {
  if (!val) return '';
  return TH_MAP[val] || val;
}

function calcRatingTotal(quality, timeliness, commitment, cleanliness, systemFit, fallbackTotal) {
  if (Number.isFinite(Number(fallbackTotal))) {
    return Math.round(Number(fallbackTotal) * 10) / 10;
  }
  const vals = [quality, timeliness, commitment, cleanliness, systemFit]
    .map(v => Number(v))
    .filter(v => Number.isFinite(v));
  if (!vals.length) return null;
  const avg = vals.reduce((sum, v) => sum + v, 0) / vals.length;
  return Math.round(avg * 10) / 10;
}

// ---------------- header ----------------
async function renderHeader(property, book) {
  const box = $('#rb-report-header');
  if (!box) return;

  if (!property) {
    box.innerHTML = '<p class="rbr-note">ไม่พบบ้านหลังนี้ในระบบ</p>';
    return;
  }

  // Removed Status Badge as requested

  box.innerHTML = `
    <header class="rbr-header">
      <div class="rbr-header-left">
        <div class="rbr-title-main">
          สมุดรีโนเวท: ${property.title || '-'}
        </div>
        <div class="rbr-title-sub">
          ${property.address || ''} ${property.district || ''} ${property.province || ''}
        </div>
        <div class="rbr-meta">
          ขนาด: ${property.size_text || '-'} • ${property.beds ?? '-'} นอน • ${property.baths ?? '-'} น้ำ • ที่จอดรถ ${property.parking ?? '-'}<br>
          ราคา ${formatPrice(Number(property.price) || 0)}
          ${book?.house_code
      ? `<br>โค้ดบ้าน / ชื่อในระบบ: ${book.house_code}`
      : ''
    }
        </div>
      </div>
      <div class="rbr-header-right">
        <div class="rbr-logo-block">
          <img src="/assets/img/logo.png" alt="Praweena Property" class="rbr-logo-img">
          <div class="rbr-logo-text">Praweena Property</div>
        </div>
      </div>
    </header>
  `;
}

// ---------------- sections ----------------
function renderSection1(book) {
  const box = $('#rb-report-section-1-body');
  if (!box) return;
  if (!book) {
    box.innerHTML = '<p class="rbr-note">ยังไม่มีข้อมูลสมุดรีโนเวทสำหรับบ้านหลังนี้</p>';
    return;
  }

  box.innerHTML = `
    ${field('โค้ดบ้าน / ชื่อเล่นบ้าน', book.house_code)}
    ${field('ที่ตั้ง', book.house_location)}
    ${field('ประเภทบ้าน', t(book.house_type))}
    ${field('จำนวนชั้น', book.house_storeys)}
    ${field('ขนาดที่ดิน (ตร.วา)', book.land_size)}
    ${field('พื้นที่ใช้สอย (ตร.ม.)', book.usable_area)}
    ${field('ทิศที่หันหน้า', t(book.house_facing))}
    ${field('อายุอาคาร (ปี)', book.house_age)}
    ${field('แหล่งที่มาของบ้าน', t(book.acquisition_type))}
    ${field('เป้าหมายโปรเจกต์', t(book.project_goal))}
    ${fieldFull('กลุ่มลูกค้าเป้าหมาย', book.target_buyer)}
    ${fieldFull('คอนเซ็ปต์รีโนเวท / สไตล์', t(book.design_concept))}
  `;
}

function renderSection2(book) {
  const box = $('#rb-report-section-2-body');
  if (!box) return;
  if (!book) {
    box.innerHTML = '<p class="rbr-note">ไม่มีข้อมูล</p>';
    return;
  }

  box.innerHTML = `
    ${fieldFull('โครงสร้าง / พื้น / หลังคา', book.structural_issues)}
    ${fieldFull('ระบบท่อน้ำทิ้ง / สุขาภิบาล', book.plumbing_issues)}
    ${fieldFull('ระบบน้ำดี', book.water_supply_issues)}
    ${fieldFull('ระบบไฟฟ้า', book.electrical_issues)}
    ${fieldFull('ความเสี่ยงอื่น ๆ', book.other_risks)}
    ${linkFieldFull('ลิงก์แบบแปลน / รูปตัวอย่าง', book.plan_reference_links)}
    ${linkFieldFull('ลิงก์รูปก่อนปรับปรุง', book.before_photos_links)}
  `;
}

function renderSection3(book) {
  const box = $('#rb-report-section-3-body');
  if (!box) return;
  if (!book) {
    box.innerHTML = '<p class="rbr-note">ไม่มีข้อมูล</p>';
    return;
  }

  box.innerHTML = `
    ${field('การจัดการปูนเก่า / พื้นเดิม', t(book.remove_old_screed))}
    ${field('ความหนาปูนเก่า (ซม.)', book.old_screed_thickness)}
    ${fieldFull('สเปกปูนปรับระดับ / พื้นใหม่', book.new_screed_spec)}
    ${fieldFull('แผนงานพื้น', t(book.flooring_plan))}
  `;
}

function renderSection4(book) {
  const box = $('#rb-report-section-4-body');
  if (!box) return;
  if (!book) {
    box.innerHTML = '<p class="rbr-note">ไม่มีข้อมูล</p>';
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
    box.innerHTML = '<p class="rbr-note">ไม่มีข้อมูล</p>';
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
    box.innerHTML = '<p class="rbr-note">ไม่มีข้อมูล</p>';
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
    box.innerHTML = '<p class="rbr-note">ไม่มีข้อมูล</p>';
    return;
  }

  box.innerHTML = fieldFull(
    'สรุปภาพรวม / สิ่งที่ต้องโฟกัสเป็นพิเศษ',
    book.summary_notes
  );
}

// ---------------- specs table ----------------
async function renderSpecs(propertyId) {
  const box = $('#rb-report-specs');
  if (!box) return;

  try {
    const specs = await listSpecsByProperty(propertyId);
    if (!specs.length) {
      box.innerHTML = '<p class="rbr-note">ยังไม่มีการบันทึกสเปกรีโนเวท</p>';
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
      <table class="rbr-table">
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
    `;
  } catch (err) {
    console.error(err);
    box.innerHTML = '<p class="rbr-note">โหลดข้อมูลสเปกไม่สำเร็จ</p>';
  }
}

// ---------------- contractors table ----------------
async function renderContractors(propertyId) {
  const box = $('#rb-report-contractors');
  if (!box) return;

  try {
    const links = await listContractorsForProperty(propertyId);
    if (!links.length) {
      box.innerHTML = '<p class="rbr-note">ยังไม่มีข้อมูลทีมช่าง</p>';
      return;
    }

    const rows = links
      .map((link) => {
        const c = link.contractor || {};
        const ratingTotal = calcRatingTotal(
          link.rating_quality,
          link.rating_timeliness,
          link.rating_commitment,
          link.rating_cleanliness,
          link.rating_system_fit,
          link.rating_total
        );
        return `
          <tr>
            <td>${c.name || ''}</td>
            <td>${c.trade || ''}</td>
            <td>${c.phone || ''}</td>
            <td>${link.scope || ''}</td>
            <td>${link.warranty_months ?? ''}</td>
            <td>${link.rating_quality ?? '-'}</td>
            <td>${link.rating_timeliness ?? '-'}</td>
            <td>${link.rating_commitment ?? '-'}</td>
            <td>${link.rating_cleanliness ?? '-'}</td>
            <td>${link.rating_system_fit ?? '-'}</td>
            <td>${Number.isFinite(ratingTotal) ? ratingTotal : '-'}</td>
          </tr>
        `;
      })
      .join('');

    box.innerHTML = `
      <table class="rbr-table">
        <thead>
          <tr>
            <th>ชื่อช่าง</th>
            <th>สายงาน</th>
            <th>เบอร์ติดต่อ</th>
            <th>ขอบเขตงาน</th>
            <th>รับประกัน (เดือน)</th>
            <th>ผลงาน</th>
            <th>ตรงต่อเวลา</th>
            <th>รักษาคำพูด</th>
            <th>ความสะอาดหน้างาน</th>
            <th>ความเข้ากันได้กับระบบ</th>
            <th>คะแนนรวม</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  } catch (err) {
    console.error(err);
    box.innerHTML = '<p class="rbr-note">โหลดข้อมูลทีมช่างไม่สำเร็จ</p>';
  }
}

// ---------------- init ----------------
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[RBR] DOMContentLoaded fired');

  const params = new URLSearchParams(window.location.search);
  const propertyId = params.get('property_id');
  console.log('[RBR] Property ID:', propertyId);

  const headerBox = $('#rb-report-header');
  if (!propertyId) {
    console.error('[RBR] No property_id in URL');
    if (headerBox) {
      headerBox.innerHTML = '<p class="rbr-note">ไม่มี property_id ใน URL</p>';
    }
    return;
  }

  // ปุ่มพิมพ์
  const printBtn = $('#rbr-print-btn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }

  // เวลาสร้างรายงาน
  const generatedAtEl = $('#rb-report-generated-at');
  if (generatedAtEl) {
    const now = new Date();
    generatedAtEl.textContent =
      'สร้างรายงานเมื่อ: ' + now.toLocaleString('th-TH');
  }

  try {
    console.log('[RBR] Fetching data...');
    const [property, book] = await Promise.all([
      fetchPropertyById(propertyId),
      getRenovationBookByPropertyId(propertyId)
    ]);

    console.log('[RBR] Property:', property);
    console.log('[RBR] Book:', book);

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


    console.log('[RBR] All content rendered successfully');
  } catch (err) {
    console.error('[RBR] Error:', err);
    if (headerBox) {
      headerBox.innerHTML =
        '<p class="rbr-note">เกิดข้อผิดพลาดในการโหลดข้อมูล: ' + err.message + '</p>';
    }
  }
});
