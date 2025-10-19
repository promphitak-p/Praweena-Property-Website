// js/pages/property-detail.page.js
import { getBySlug } from '../services/propertiesService.js';
import { createLead } from '../services/leadsService.js';
import { getFormData } from '../ui/forms.js';
import { el, $, clear } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { formatPrice } from '../utils/format.js';
import { setupNav } from '../utils/config.js';
import { signOutIfAny } from '../auth/auth.js';

const container = $('#property-detail-container');

/**
 * แสดงผลข้อมูลอสังหาฯ บนหน้าเว็บ (เวอร์ชันสมบูรณ์พร้อมปุ่มลูกศร)
 * @param {object} property - ข้อมูลอสังหาฯ
 */
function renderPropertyDetails(property) {
  document.title = `${property.title} - Praweena Property`;
  clear(container);

  // --- 1. สร้างโครงสร้างหลัก (Grid Layout) ---
  const grid = el('div', { className: 'grid grid-cols-3', style: 'gap: 2rem;' });
  const leftCol = el('div', { className: 'col-span-2' });
  const rightCol = el('div', { className: 'col-span-1' });

  // --- 2. สร้าง Gallery ที่สมบูรณ์ ---
  const galleryWrapper = el('div', { className: 'gallery-wrapper' });
  const galleryContainer = el('div', { className: 'image-gallery' });

  // รวมรูปทั้งหมด (รูปปก + รูปในแกลเลอรี) และกรองค่าที่ไม่มีออก
  const allImages = [property.cover_url, ...(property.gallery || [])].filter(Boolean);

  if (allImages.length === 0) {
    allImages.push('/assets/img/placeholder.jpg'); // แสดง placeholder ถ้าไม่มีรูปเลย
  }

  allImages.forEach(imageUrl => {
    const img = el('img', {
      className: 'gallery-image',
      attributes: { src: imageUrl, alt: 'Property image', loading: 'lazy' }
    });
    galleryContainer.append(img);
  });

  // สร้างปุ่มลูกศร (จะแสดงก็ต่อเมื่อมีรูปมากกว่า 1 รูป)
  if (allImages.length > 1) {
    const prevButton = el('button', { className: 'gallery-nav prev', textContent: '‹' });
    const nextButton = el('button', { className: 'gallery-nav next', textContent: '›' });

    prevButton.addEventListener('click', () => {
      galleryContainer.scrollBy({ left: -galleryContainer.offsetWidth, behavior: 'smooth' });
    });
    nextButton.addEventListener('click', () => {
      galleryContainer.scrollBy({ left: galleryContainer.offsetWidth, behavior: 'smooth' });
    });
    
    galleryWrapper.append(prevButton, nextButton);
  }

  galleryWrapper.prepend(galleryContainer);

  // --- 3. สร้างส่วนรายละเอียดประกาศ ---
  const title = el('h1', { textContent: property.title, style: 'margin-top: 1.5rem;' });
  const price = el('h2', { textContent: formatPrice(property.price), style: 'color: var(--brand); margin-bottom: 1rem;' });
  const address = el('p', { textContent: `ที่อยู่: ${property.address || 'N/A'}, ${property.district}, ${property.province}` });
  const details = el('p', { textContent: `ขนาด: ${property.size_text || 'N/A'} | ${property.beds} ห้องนอน | ${property.baths} ห้องน้ำ | ${property.parking} ที่จอดรถ` });

  // นำ Gallery และรายละเอียดทั้งหมดใส่ในคอลัมน์ซ้าย
  leftCol.append(galleryWrapper, title, price, address, details);

  // --- 4. สร้างแผนที่ (ถ้ามีพิกัด) และใส่ในคอลัมน์ซ้าย ---
  if (property.latitude && property.longitude) {
    const mapEl = el('div', { attributes: { id: 'map', style: 'height: 400px; margin-top: 1.5rem; border-radius: var(--radius); z-index: 1;' } });
    leftCol.append(mapEl);
    setTimeout(() => {
      const lat = parseFloat(property.latitude);
      const lon = parseFloat(property.longitude);
      if (isNaN(lat) || isNaN(lon)) return;
      const map = L.map('map').setView([lat, lon], 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
      const popupContent = `<b>${property.title}</b><br><a href="${googleMapsUrl}" target="_blank">เปิดใน Google Maps เพื่อนำทาง</a>`;
      L.marker([lat, lon]).addTo(map).bindPopup(popupContent).openPopup();
    }, 100);
  }

  // --- 5. สร้างฟอร์มในคอลัมน์ขวา ---
  const formCard = el('div', { style: 'background: var(--surface); padding: 2rem; border-radius: var(--radius); box-shadow: var(--shadow-md);' });
  const formHeader = el('h3', { textContent: 'สนใจนัดชม / สอบถามข้อมูล' });
  const form = el('form', { attributes: { id: 'lead-form' } });
  form.innerHTML = `
    <input type="hidden" name="property_id" value="${property.id}">
    <div class="form-group"><label for="name">ชื่อ</label><input type="text" id="name" name="name" class="form-control" required></div>
    <div class="form-group"><label for="phone">เบอร์โทรศัพท์</label><input type="tel" id="phone" name="phone" class="form-control" required pattern="^0\\d{8,9}$"></div>
    <div class="form-group"><label for="note">ข้อความเพิ่มเติม</label><textarea id="note" name="note" class="form-control" rows="3"></textarea></div>
    <button type="submit" class="btn" style="width: 100%;">ส่งข้อมูล</button>
  `;
  form.addEventListener('submit', handleLeadSubmit);
  formCard.append(formHeader, form);
  rightCol.append(formCard);

  // --- 6. ประกอบร่างทั้งหมด ---
  grid.append(leftCol, rightCol);
  container.append(grid);
}

/**
 * โหลดข้อมูลอสังหาฯ ตาม slug จาก URL
 */
async function loadProperty() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');

  if (!slug) {
    clear(container);
    container.append(el('p', { textContent: 'ไม่พบรหัสอ้างอิงของประกาศ' }));
    return;
  }

  const { data, error } = await getBySlug(slug);

  if (error || !data) {
    console.error('Failed to load property:', error);
    clear(container);
    container.append(el('p', { textContent: 'ไม่พบข้อมูลประกาศนี้' }));
    return;
  }

  renderPropertyDetails(data);
}

/**
 * จัดการการส่งฟอร์ม Lead
 */
async function handleLeadSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังส่ง...';

  const payload = getFormData(form);

  const { error } = await createLead(payload);

  if (error) {
    console.error('Failed to create lead:', error);
    toast('เกิดข้อผิดพลาด: ' + error.message, 4000, 'error');
  } else {
    toast('ส่งข้อมูลสำเร็จ! เจ้าหน้าที่จะติดต่อกลับโดยเร็วที่สุด', 4000, 'success');
    form.reset();
  }

  submitBtn.disabled = false;
  submitBtn.textContent = 'ส่งข้อมูล';
}

// --- Main execution ---
document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  signOutIfAny();
  loadProperty();
});