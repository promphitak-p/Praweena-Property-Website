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
	// --- เตรียมโค้ด SVG Icons ---
	const facebookIcon = `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Facebook</title><path d="M22.675 0H1.325C.593 0 0 .593 0 1.325v21.351C0 23.407.593 24 1.325 24H12.82v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116c.732 0 1.325-.593 1.325-1.325V1.325C24 .593 23.407 0 22.675 0z"/></svg>`;
  const lineIcon = `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>LINE</title><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 1.5c5.799 0 10.5 4.701 10.5 10.5S17.799 22.5 12 22.5 1.5 17.799 1.5 12 6.201 1.5 12 1.5zm-3.324 5.32c-.177 0-.324.148-.324.326v7.356c0 .178.147.324.324.324h.874V9.894c0-.18-.147-.324-.326-.324h-.548zm3.87 0c-.178 0-.324.148-.324.326v4.32h-.924V9.894c0-.18-.147-.324-.324-.324H9.98c-.18 0-.324.148-.324.326v7.356c0 .178.146.324.325.324h.874v.874c0 .178.147.324.324.324H15.1c.18 0 .324-.146.324-.324V9.894c0-.18-.147-.324-.324-.324h-2.55zm.874 1.748V13.5h.548c.18 0 .324-.146.324-.324V9.894c0-.18-.147-.324-.324-.324h-1.422c-.178 0-.324.148-.324.326v3.144h.874zM6.98 9.57c-.178 0-.324.148-.324.326v4.346c0 .178.146.324.324.324h.874c.18 0 .324-.146.324-.324V9.894c0-.18-.147-.324-.324-.324H6.98zM17.02 9.57c-.18 0-.324.148-.324.326v7.356c0 .178.147.324.325.324h.874c.18 0 .324-.146.324-.324V9.894c0-.18-.147-.324-.324-.324h-.875z"/></svg>`;
  const xIcon = `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>X</title><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 7.184L18.901 1.153Zm-1.653 19.499h2.606L6.856 2.554H4.046l13.2 18.1z"/></svg>`;
  // --------------------------------

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
  
// --- 5. สร้างปุ่ม Social Share โดยใช้ SVG Icons ---
  const shareContainer = el('div', { className: 'share-buttons' });
  shareContainer.innerHTML = `<p>แชร์ประกาศนี้:</p>`;

  const currentPageUrl = window.location.href;
  const shareText = `น่าสนใจ! ${property.title} ราคา ${formatPrice(property.price)}`;

  // Facebook
  const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentPageUrl)}`;
  const facebookBtn = el('a', {
    className: 'share-btn facebook',
    attributes: { href: facebookShareUrl, target: '_blank', 'aria-label': 'Share on Facebook' }
  });
  facebookBtn.innerHTML = facebookIcon; // <-- ใช้ SVG icon

// LINE Share Button (Upgraded for Mobile App)
// รูปแบบคือ: ข้อความ + ขึ้นบรรทัดใหม่ + URL
const lineMessage = `${shareText}\n${currentPageUrl}`;
const lineShareUrl = `https://line.me/R/share?text=${encodeURIComponent(lineMessage)}`;
const lineBtn = el('a', {
    className: 'share-btn line',
    attributes: { href: lineShareUrl, target: '_blank', 'aria-label': 'Share on LINE' }
});
lineBtn.innerHTML = lineIcon;

  // Twitter (X)
  const twitterShareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(currentPageUrl)}&text=${encodeURIComponent(shareText)}`;
  const twitterBtn = el('a', {
    className: 'share-btn twitter',
    attributes: { href: twitterShareUrl, target: '_blank', 'aria-label': 'Share on Twitter' }
  });
  twitterBtn.innerHTML = xIcon; // <-- ใช้ SVG icon

  shareContainer.append(facebookBtn, lineBtn, twitterBtn);
  leftCol.append(shareContainer); // นำไปต่อท้ายคอลัมน์ซ้าย

// --- 6. สร้างฟอร์ม ---
  const formCard = el('div', { style: 'background: var(--surface); padding: 2rem; border-radius: var(--radius); box-shadow: var(--shadow-md);' });
  const formHeader = el('h3');
  const form = el('form', { attributes: { id: 'lead-form' } });

  if (property.status === 'sold') {
    formHeader.textContent = 'ประกาศนี้ขายแล้ว';
    form.innerHTML = `<p style="color: var(--text-light); text-align: center; padding: 2rem 0;">ขอขอบคุณที่ให้ความสนใจ</p>`;
  } else {
    formHeader.textContent = 'สนใจนัดชม / สอบถามข้อมูล';
    form.innerHTML = `
      <input type="hidden" name="property_id" value="${property.id}">
      <div class="form-group"><label for="name">ชื่อ</label><input type="text" id="name" name="name" class="form-control" required></div>
      <div class="form-group"><label for="phone">เบอร์โทรศัพท์</label><input type="tel" id="phone" name="phone" class="form-control" required pattern="^0\\d{8,9}$"></div>
      <div class="form-group"><label for="note">ข้อความเพิ่มเติม</label><textarea id="note" name="note" class="form-control" rows="3"></textarea></div>
      <button type="submit" class="btn" style="width: 100%;">ส่งข้อมูล</button>
    `;
    form.addEventListener('submit', handleLeadSubmit);
  } // *** นี่คือ `}` ที่เพิ่มเข้ามา ***

  // --- 7. ประกอบร่างทั้งหมด ---
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