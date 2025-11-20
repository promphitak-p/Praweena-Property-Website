// js/pages/index.page.js
import { setupMobileNav } from '../ui/mobileNav.js'; // <-- 1. Import เข้ามา
import { listPublic } from '../services/propertiesService.js';
import { el, $, clear } from '../ui/dom.js';
import { formatPrice } from '../utils/format.js';
import { setupNav } from '../utils/config.js';
import { signOutIfAny } from '../auth/auth.js';

/**
 * สร้างการ์ดแสดงข้อมูลอสังหาฯ (Property Card)
 * @param {object} property - ข้อมูลอสังหาฯ
 * @returns {HTMLElement} - Element ของการ์ด
 */
function renderPropertyCard(property) {
  const cardLink = el('a', {
    className: 'property-card',
    attributes: { href: `/property-detail.html?slug=${property.slug}` }
  });

  const image = el('img', {
    className: 'property-card__image',
    attributes: {
      src: property.cover_url || '/assets/img/placeholder.jpg',
      alt: property.title,
      loading: 'lazy' // Lazy loading for performance
    }
  });

  const body = el('div', { className: 'property-card__body' });
  const title = el('h3', { className: 'property-card__title', textContent: property.title });
  const address = el('p', { className: 'property-card__address', textContent: `${property.district}, ${property.province}` });
  const price = el('div', { className: 'property-card__price', textContent: formatPrice(property.price) });

// *** เพิ่มโค้ดส่วนนี้เข้าไป ***
  // ถ้าสถานะเป็น 'sold' ให้สร้างป้ายแล้วแปะทับ
  if (property.status === 'sold') {
    const soldBadge = el('div', { className: 'sold-badge', textContent: 'ขายแล้ว' });
    cardLink.append(soldBadge);

    // (ทางเลือก) ทำให้การ์ดดูจางลงเล็กน้อย
    cardLink.style.opacity = '0.7';
  }

  body.append(title, address, price);
  cardLink.append(image, body);

  return cardLink;
}

/**
 * โหลดและแสดงรายการอสังหาฯ
 */
async function loadProperties() {
  const grid = $('#property-grid');
  
  // NEW: อ้างอิงถึง ID ฟอร์มใหม่
  const heroForm = $('#hero-filter-form'); // ฟอร์มค้นหาหลัก
  const advancedForm = $('#filter-form-advanced'); // ฟอร์มกรองละเอียด

  clear(grid);
  // --- แสดง Skeleton ก่อนโหลด ---
  for (let i = 0; i < 6; i++) {
    grid.append(renderSkeletonCard());
  }
  // ----------------------------

  // NEW: ดึงค่าจากฟอร์มที่ถูกต้อง โดยใช้ Optional Chaining (?.) เพื่อป้องกัน TypeError
  const filters = {
    // Keyword (q) ดึงมาจากฟอร์มหลัก (heroForm)
    q: heroForm?.elements.q.value || null,
    // District ดึงมาจากฟอร์มกรองละเอียด (advancedForm)
    district: advancedForm?.elements.district.value || null,
  };

  const { data, error } = await listPublic(filters);

  clear(grid);
  if (error) {
    console.error('Failed to load properties:', error);
    grid.append(el('p', { textContent: 'เกิดข้อผิดพลาดในการโหลดข้อมูล' }));
    return;
  }

  if (data.length === 0) {
    grid.append(el('p', { textContent: 'ไม่พบรายการที่ตรงกับเงื่อนไข' }));
    return;
  }

  data.forEach(property => {
    const card = renderPropertyCard(property);
    grid.append(card);
  });
}

// --- Main execution ---
document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  signOutIfAny();
  setupMobileNav(); // <-- 2. เรียกใช้งาน
  loadProperties(); // โหลดครั้งแรกเมื่อหน้าเว็บพร้อม

// 1. NEW: เพิ่ม event listener ให้ฟอร์ม Advanced Filter (เมื่อมีการเปลี่ยนค่าใน Select Box)
  const advancedFormElement = $('#filter-form-advanced');
  if (advancedFormElement) { // ตรวจสอบว่ามีองค์ประกอบอยู่จริง
    advancedFormElement.addEventListener('input', (e) => {
      loadProperties(); // โหลดข้อมูลใหม่ทันทีที่มีการกรอง
    });
  }

  // 2. NEW: เพิ่ม event listener ให้ฟอร์ม Hero (เมื่อกดปุ่ม "ค้นหา")
  const heroFormElement = $('#hero-filter-form');
  if (heroFormElement) { // ตรวจสอบว่ามีองค์ประกอบอยู่จริง
    heroFormElement.addEventListener('submit', (e) => {
      e.preventDefault(); // **สำคัญ:** ป้องกันการโหลดหน้าใหม่เมื่อกด Submit
      loadProperties(); // โหลดข้อมูลใหม่
    });
  }
});

function renderSkeletonCard() {
  const card = el('div', { className: 'property-card' });
  const image = el('div', { className: 'skeleton', style: 'height: 200px;' });
  const body = el('div', { className: 'property-card__body' });
  const title = el('div', { className: 'skeleton', style: 'height: 24px; width: 80%; margin-bottom: 0.5rem;' });
  const address = el('div', { className: 'skeleton', style: 'height: 16px; width: 60%; margin-bottom: 1rem;' });
  const price = el('div', { className: 'skeleton', style: 'height: 28px; width: 50%; margin-top: auto;' });
  body.append(title, address, price);
  card.append(image, body);
  return card;
}