// js/pages/property-detail.page.js
import { setupMobileNav } from '../ui/mobileNav.js'; // <-- 1. Import เข้ามา
import { getBySlug } from '../services/propertiesService.js';
import { createLead } from '../services/leadsService.js';
import { getFormData } from '../ui/forms.js';
import { el, $, $$, clear } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { formatPrice } from '../utils/format.js';
import { setupNav } from '../utils/config.js';
import { signOutIfAny } from '../auth/auth.js';

const container = $('#property-detail-container');

// js/pages/property-detail.page.js

// --- Upgraded Lightbox with Smooth Scrolling (Final Version) ---
function setupLightbox(imageUrls) {
  // 1. สร้าง elements ของ Lightbox แค่ครั้งเดียว
  let overlay = $('#lightbox-overlay');
  if (!overlay) {
    overlay = el('div', { id: 'lightbox-overlay', className: 'lightbox-overlay' });
    overlay.innerHTML = `
      <span class="lightbox-close">&times;</span>
      <button class="lightbox-nav lightbox-prev">&lsaquo;</button>
      <div class="lightbox-gallery"></div>
      <button class="lightbox-nav lightbox-next">&rsaquo;</button>
    `;
    document.body.append(overlay);
  }

  const gallery = $('.lightbox-gallery');
  const prevBtn = $('.lightbox-prev');
  const nextBtn = $('.lightbox-next');

  // 2. สร้างรูปภาพทั้งหมดใส่ใน Lightbox Gallery
  gallery.innerHTML = ''; // เคลียร์ของเก่าทิ้งก่อน
  imageUrls.forEach(url => {
    const img = el('img', {
      className: 'lightbox-image',
      attributes: { src: url, loading: 'lazy' }
    });
    gallery.append(img);
  });

  // 3. ฟังก์ชันสำหรับเปิด/ปิด
  function openLightbox(index) {
    overlay.classList.add('show');
    // เลื่อนไปยังรูปภาพที่ถูกคลิกทันทีโดยไม่มีแอนิเมชัน
    gallery.scrollTo({
      left: gallery.offsetWidth * index,
      behavior: 'instant'
    });
  }
  function closeLightbox() {
    overlay.classList.remove('show');
  }

  // 4. เพิ่ม Event Listeners ให้ปุ่มต่างๆ
  prevBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    gallery.scrollBy({ left: -gallery.offsetWidth, behavior: 'smooth' });
  });
  nextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    gallery.scrollBy({ left: gallery.offsetWidth, behavior: 'smooth' });
  });
  $('.lightbox-close').addEventListener('click', closeLightbox);
  overlay.addEventListener('click', (e) => {
    // ปิดเมื่อคลิกที่พื้นหลังสีดำเท่านั้น
    if (e.target === overlay) closeLightbox();
  });

  return openLightbox;
}

/**
 * แสดงผลข้อมูลอสังหาฯ บนหน้าเว็บ
 */
function renderPropertyDetails(property) {
  // --- อัปเดต Title และ Meta Tags ---
  const pageTitle = `${property.title} - Praweena Property`;
  const description = `ขาย${property.title} ราคา ${formatPrice(property.price)} ตั้งอยู่ที่ ${property.address}, ${property.district}, ${property.province} สนใจติดต่อ Praweena Property`;
  document.title = pageTitle;
  $('#meta-description').setAttribute('content', description);
  $('#meta-keywords').setAttribute('content', `${property.title}, บ้าน${property.district}, อสังหาฯ ${property.province}`);
  $('#meta-og-title').setAttribute('content', pageTitle);
  $('#meta-og-description').setAttribute('content', description);
  $('#meta-og-image').setAttribute('content', property.cover_url || '/assets/img/placeholder.jpg');

  clear(container);

  // --- 1. สร้างโครงสร้างหลัก ---
  const grid = el('div', { className: 'grid grid-cols-3', style: 'gap: 2rem;' });
  const leftCol = el('div', { className: 'col-span-2' });
  const rightCol = el('div', { className: 'col-span-1' });

  // --- 2. สร้าง Gallery ---
  const galleryWrapper = el('div', { className: 'gallery-wrapper' });
  const galleryContainer = el('div', { className: 'image-gallery' });
  const dotsContainer = el('div', { className: 'gallery-dots' }); // Container สำหรับ Dots
  
  const allImages = [property.cover_url, ...(property.gallery || [])].filter(Boolean);
  if (allImages.length === 0) { allImages.push('/assets/img/placeholder.jpg'); }

  const openLightbox = setupLightbox(allImages);

// สร้างรูปภาพและ Dots
  allImages.forEach((imageUrl, index) => {
    const img = el('img', {
      className: 'gallery-image',
      attributes: { src: imageUrl, alt: 'Property image', loading: 'lazy' }
    });
    img.addEventListener('click', () => openLightbox(index));
    galleryContainer.append(img);

    // สร้าง Dot สำหรับแต่ละรูป
    const dot = el('span', { className: 'dot', attributes: { 'data-index': index } });
    dot.addEventListener('click', () => {
      // เมื่อคลิกที่ Dot ให้เลื่อน Gallery ไปยังรูปนั้นๆ
      galleryContainer.scrollTo({
        left: galleryContainer.offsetWidth * index,
        behavior: 'smooth'
      });
    });
    dotsContainer.append(dot);
  });
  
  // --- ตรรกะสำหรับอัปเดต Active Dot เมื่อผู้ใช้ปัด ---
  const dots = dotsContainer.querySelectorAll('.dot');
  if (dots.length > 0) {
      dots[0].classList.add('active'); // ให้ Dot แรก Active ไว้ก่อน
  }

  galleryContainer.addEventListener('scroll', () => {
    // คำนวณว่ารูปไหนกำลังแสดงอยู่ตรงกลาง
    const scrollIndex = Math.round(galleryContainer.scrollLeft / galleryContainer.offsetWidth);
    // อัปเดตคลาส active
    dots.forEach((dot, index) => {
      dot.classList.toggle('active', index === scrollIndex);
    });
  });

  if (allImages.length > 1) {
    const prevButton = el('button', { className: 'gallery-nav prev', textContent: '‹' });
    const nextButton = el('button', { className: 'gallery-nav next', textContent: '›' });
    prevButton.addEventListener('click', () => { galleryContainer.scrollBy({ left: -galleryContainer.offsetWidth, behavior: 'smooth' }); });
    nextButton.addEventListener('click', () => { galleryContainer.scrollBy({ left: galleryContainer.offsetWidth, behavior: 'smooth' }); });
    galleryWrapper.append(prevButton, nextButton);
  }
  galleryWrapper.prepend(galleryContainer);

  // --- 3. สร้างส่วนรายละเอียดประกาศ ---
  const title = el('h1', { textContent: property.title, style: 'margin-top: 1.5rem;' });
  const price = el('h2', { textContent: formatPrice(property.price), style: 'color: var(--brand); margin-bottom: 1rem;' });
  const address = el('p', { textContent: `ที่อยู่: ${property.address || 'N/A'}, ${property.district}, ${property.province}` });
  const details = el('p', { textContent: `ขนาด: ${property.size_text || 'N/A'} | ${property.beds} ห้องนอน | ${property.baths} ห้องน้ำ | ${property.parking} ที่จอดรถ` });
  
  leftCol.append(galleryWrapper, title, price, address, details);

  // --- 4. สร้างแผนที่ ---
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

  // --- 5. สร้างฟอร์ม ---
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
  
  // Skeleton UI
  const skeleton = `
    <div class="grid grid-cols-3" style="gap: 2rem;">
      <div class="col-span-2">
        <div class="skeleton" style="height: 450px; border-radius: 16px;"></div>
        <div class="skeleton" style="height: 36px; width: 70%; margin-top: 1.5rem;"></div>
        <div class="skeleton" style="height: 32px; width: 40%; margin-top: 1rem;"></div>
        <div class="skeleton" style="height: 20px; width: 90%; margin-top: 1rem;"></div>
        <div class="skeleton" style="height: 20px; width: 80%; margin-top: 0.5rem;"></div>
      </div>
      <div class="col-span-1">
        <div class="skeleton" style="height: 350px; border-radius: 16px;"></div>
      </div>
    </div>
  `;
  container.innerHTML = skeleton;

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
  setupMobileNav(); // <-- 2. เรียกใช้งาน
  loadProperty();
});