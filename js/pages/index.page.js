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
  const filterForm = $('#filter-form');
  
clear(grid);
  // --- แสดง Skeleton ก่อนโหลด ---
  for (let i = 0; i < 6; i++) {
    grid.append(renderSkeletonCard());
  }
  // ----------------------------

  // ดึงค่าจากฟอร์ม filter
  const filters = {
    q: filterForm.elements.q.value || null,
    district: filterForm.elements.district.value || null,
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

  // เพิ่ม event listener ให้ฟอร์ม filter
  // เมื่อมีการพิมพ์หรือเลือกค่าใหม่ ให้โหลดข้อมูลใหม่
  $('#filter-form').addEventListener('input', (e) => {
    loadProperties();
  });
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