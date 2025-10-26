// js/pages/property-detail.page.js
import { setupMobileNav } from '../ui/mobileNav.js';
import { getBySlug } from '../services/propertiesService.js';
import { createLead } from '../services/leadsService.js';
import { getFormData } from '../ui/forms.js';
import { el, $, $$, clear } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { formatPrice } from '../utils/format.js';
import { setupNav } from '../utils/config.js';
import { signOutIfAny } from '../auth/auth.js';

const container = $('#property-detail-container');

// --- Lightbox ---
function setupLightbox(imageUrls) {
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

  gallery.innerHTML = '';
  imageUrls.forEach(url => {
    const img = el('img', { className: 'lightbox-image', attributes: { src: url, loading: 'lazy' } });
    gallery.append(img);
  });

function openLightbox(index) {
  overlay.classList.add('show');
  gallery.scrollTo({ left: gallery.offsetWidth * index, behavior: 'auto' }); // <- เดิม 'instant'
}

  function closeLightbox() { overlay.classList.remove('show'); }

  prevBtn.addEventListener('click', (e) => { e.stopPropagation(); gallery.scrollBy({ left: -gallery.offsetWidth, behavior: 'smooth' }); });
  nextBtn.addEventListener('click', (e) => { e.stopPropagation(); gallery.scrollBy({ left: gallery.offsetWidth, behavior: 'smooth' }); });
  $('.lightbox-close').addEventListener('click', closeLightbox);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLightbox(); });

  return openLightbox;
}

// --- YouTube helpers ---
function parseYouTubeId(input) {
  const raw = (input || '').trim();
  if (!raw) return '';
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const u = new URL(raw);
    const v = u.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    const m1 = u.pathname.match(/^\/([a-zA-Z0-9_-]{11})$/);
    if (m1) return m1[1];
    const m2 = u.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (m2) return m2[1];
  } catch {}
  return '';
}

function normalizeYoutubeIds(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
      return val.split(',').map(s => s.trim()).filter(Boolean);
    } catch {
      return val.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return [];
}


function renderYouTubeGallery(videoIds = []) {
  const wrap = el('section', { style: 'margin-top:1.5rem;' });
  const heading = el('h3', { textContent: 'วิดีโอแนะนำ', style: 'margin-bottom:.75rem;' });
  const list = el('div', { id: 'youtube-gallery' });

  videoIds
    .map(parseYouTubeId)
    .filter(Boolean)
    .forEach((id) => {
      // โหลดแบบ thumbnail ก่อน คลิกแล้วค่อยสลับเป็น iframe (เบากว่า)
      const thumbUrl = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
      const card = el('div', { style: 'position:relative;margin-bottom:1rem;border-radius:12px;overflow:hidden;cursor:pointer;' });
      const img = el('img', { attributes: { src: thumbUrl, alt: `YouTube: ${id}`, loading: 'lazy' }, style: 'width:100%;display:block;' });
      const play = el('div', { style: 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.25);' });
      play.innerHTML = `<svg width="72" height="72" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>`;
      card.append(img, play);

      card.addEventListener('click', () => {
        const iframe = el('iframe', {
          attributes: {
            src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`,
            width: '100%',
            height: '400',
            frameborder: '0',
            allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
            allowfullscreen: true,
            title: `YouTube video ${id}`
          },
          style: 'width:100%;height:400px;border:0;border-radius:12px;'
        });
        card.replaceWith(iframe);
      }, { once: true });

      list.append(card);
    });

  if (!list.children.length) return null;
  wrap.append(heading, list);
  return wrap;
}

/** แสดงผลข้อมูลอสังหาฯ */
function renderPropertyDetails(property) {
  // Meta
  const pageTitle = `${property.title} - Praweena Property`;
  const description = `ขาย${property.title} ราคา ${formatPrice(property.price)} ตั้งอยู่ที่ ${property.address}, ${property.district}, ${property.province} สนใจติดต่อ Praweena Property`;
  document.title = pageTitle;
  $('#meta-description')?.setAttribute('content', description);
  $('#meta-keywords')?.setAttribute('content', `${property.title}, บ้าน${property.district}, อสังหาฯ ${property.province}`);
  $('#meta-og-title')?.setAttribute('content', pageTitle);
  $('#meta-og-description')?.setAttribute('content', description);
  $('#meta-og-image')?.setAttribute('content', property.cover_url || '/assets/img/placeholder.jpg');

  clear(container);

  // Layout
  const grid = el('div', { className: 'grid grid-cols-3', style: 'gap: 2rem;' });
  const leftCol = el('div', { className: 'col-span-2' });
  const rightCol = el('div', { className: 'col-span-1' });

  // Gallery
  const galleryWrapper = el('div', { className: 'gallery-wrapper' });
  const galleryContainer = el('div', { className: 'image-gallery' });
  const thumbnailContainer = el('div', { className: 'thumbnail-container' });

  const allImages = [property.cover_url, ...(property.gallery || [])].filter(Boolean);
  if (allImages.length === 0) allImages.push('/assets/img/placeholder.jpg');

  const openLightbox = setupLightbox(allImages);
  const thumbnailElements = [];

  allImages.forEach((imageUrl, index) => {
    const img = el('img', { className: 'gallery-image', attributes: { src: imageUrl, alt: 'Property image', loading: 'lazy' } });
    img.addEventListener('click', () => openLightbox(index));
    galleryContainer.append(img);

    const thumb = el('img', { className: 'thumbnail-image', attributes: { src: imageUrl, alt: `Thumbnail ${index + 1}` } });
    thumb.addEventListener('click', () => {
      galleryContainer.scrollTo({ left: galleryContainer.offsetWidth * index, behavior: 'smooth' });
    });
    thumbnailContainer.append(thumb);
    thumbnailElements.push(thumb);
  });

  if (thumbnailElements.length > 0) thumbnailElements[0].classList.add('active');
  galleryContainer.addEventListener('scroll', () => {
    const scrollIndex = Math.round(galleryContainer.scrollLeft / galleryContainer.offsetWidth);
    thumbnailElements.forEach((thumb, idx) => thumb.classList.toggle('active', idx === scrollIndex));
  });

  if (allImages.length > 1) {
    const prevButton = el('button', { className: 'gallery-nav prev', textContent: '‹' });
    const nextButton = el('button', { className: 'gallery-nav next', textContent: '›' });
    prevButton.addEventListener('click', () => galleryContainer.scrollBy({ left: -galleryContainer.offsetWidth, behavior: 'smooth' }));
    nextButton.addEventListener('click', () => galleryContainer.scrollBy({ left: galleryContainer.offsetWidth, behavior: 'smooth' }));
    galleryWrapper.append(prevButton, nextButton);
  }
  galleryWrapper.prepend(galleryContainer);

  // Details
  const title = el('h1', { textContent: property.title, style: 'margin-top: 1.5rem;' });
  const price = el('h2', { textContent: formatPrice(property.price), style: 'color: var(--brand); margin-bottom: 1rem;' });
  const address = el('p', { textContent: `ที่อยู่: ${property.address || 'N/A'}, ${property.district}, ${property.province}` });
  const details = el('p', { textContent: `ขนาด: ${property.size_text || 'N/A'} | ${property.beds} ห้องนอน | ${property.baths} ห้องน้ำ | ${property.parking} ที่จอดรถ` });

  leftCol.append(galleryWrapper, thumbnailContainer, title, price, address, details);

  // YouTube Section (ใช้ youtube_video_ids แบบอาร์เรย์)
 const ytSection = renderYouTubeGallery(normalizeYoutubeIds(property.youtube_video_ids));
  if (ytSection) leftCol.append(ytSection);

// Map
// ===== Map Section (safe, non-interactive, with notice) =====
const lat = parseFloat(property.lat ?? property.latitude);
const lng = parseFloat(property.lng ?? property.longitude);

const mapWrap = el('div', { style: 'margin-top:1.5rem;' });
leftCol.append(mapWrap);

function showNoCoordsNotice() {
  const box = el('div', {
    style: `
      background:#f9fafb;
      border:1px solid #e5e7eb;
      color:#374151;
      padding:1rem 1.25rem;
      border-radius:12px;
      text-align:center;
      line-height:1.6;
    `
  });
  box.innerHTML = `
    <strong>ไม่พบพิกัดแผนที่</strong><br>
    กรุณาเพิ่มค่าพิกัดละติจูด (latitude) และลองจิจูด (longitude)
    ในหน้าแดชบอร์ด เพื่อแสดงตำแหน่งบนแผนที่
  `;
  mapWrap.append(box);
}

if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
  console.warn('⚠️ ไม่มีพิกัดใน property (อาจเป็นเพราะ RLS):', property);
  showNoCoordsNotice();
} else {
  const mapId = 'map-' + (property.id || 'detail');
  const mapEl = el('div', {
    attributes: { id: mapId },
    style: 'height:400px;width:100%;border-radius:12px;overflow:hidden;background:#f3f4f6;'
  });
  mapWrap.append(mapEl);

  setTimeout(() => {
    try {
      if (typeof L === 'undefined') throw new Error('Leaflet is not loaded');

      const map = L.map(mapId, {
        center: [lat, lng],
        zoom: 15,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        boxZoom: false,
        keyboard: false,
        zoomControl: false
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

      // ✅ FIX: ใช้ https และลบ $ เกิน
      const gmapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

      L.marker([lat, lng])
        .addTo(map)
        .bindPopup(
          `<b>${(property.title || 'สถานที่')}</b><br>
           <a href="${gmapsUrl}" target="_blank" rel="noopener">
             เปิดใน Google Maps เพื่อนำทาง
           </a>`
        )
        .openPopup();

      setTimeout(() => map.invalidateSize(), 300);

    } catch (err) {
      console.error('Leaflet error → fallback to iframe:', err);

      // ✅ FIX: ใช้ https และลบ $ เกิน
      const iframeUrl = `https://www.google.com/maps?q=${lat},${lng}&output=embed&z=15`;

      mapEl.innerHTML = `
        <iframe
          src="${iframeUrl}"
          style="width:100%;height:100%;border:0;border-radius:12px;"
          loading="lazy"
          title="Google Map"
          referrerpolicy="no-referrer-when-downgrade"
        ></iframe>`;
    }
  }, 0);
}

// Share Section
const shareContainer = el('div', { className: 'share-buttons' });
shareContainer.innerHTML = `<p>แชร์ประกาศนี้:</p>`;

// ✅ ประกาศตัวแปรไว้ตรงนี้ ก่อนสร้างปุ่มทั้งหมด
const currentPageUrl = window.location.href;
const shareText = `น่าสนใจ! ${property.title} ราคา ${formatPrice(property.price)}`;

const messengerShareUrl = `fb-messenger://share?link=${encodeURIComponent(currentPageUrl)}`;
const lineMessage = `${shareText}\n${currentPageUrl}`;
const lineShareUrl = `https://line.me/R/share?text=${encodeURIComponent(lineMessage)}`;
const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentPageUrl)}`;
const twitterShareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(currentPageUrl)}&text=${encodeURIComponent(shareText)}`;

// ✅ สร้างปุ่มแบบ object literal ถูกต้อง (ไม่มี = ใน object, ไม่มีเครื่องหมายเกิน)
const messengerBtn = el('a', {
  className: 'share-btn messenger',
  attributes: {
    href: messengerShareUrl,
    target: '_blank',
    rel: 'noopener',
    'aria-label': 'Share on Messenger'
  }
});

const lineBtn = el('a', {
  className: 'share-btn line',
  attributes: {
    href: lineShareUrl,
    target: '_blank',
    rel: 'noopener',
    'aria-label': 'Share on LINE'
  }
});

const facebookBtn = el('a', {
  className: 'share-btn facebook',
  attributes: {
    href: facebookShareUrl,
    target: '_blank',
    rel: 'noopener',
    'aria-label': 'Share on Facebook'
  }
});

const twitterBtn = el('a', {
  className: 'share-btn twitter',
  attributes: {
    href: twitterShareUrl,
    target: '_blank',
    rel: 'noopener',
    'aria-label': 'Share on Twitter/X'
  }
});


  // Lead form
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
      <div class="form-group"><label for="phone">เบอร์โทรศัพท์</label><input type="tel" id="phone" name="phone" class="form-control" required pattern="^0\\d{8,9}$" inputmode="tel" autocomplete="tel-national"></div>
      <div class="form-group"><label for="note">ข้อความเพิ่มเติม</label><textarea id="note" name="note" class="form-control" rows="3"></textarea></div>
      <button type="submit" class="btn" style="width: 100%;">ส่งข้อมูล</button>
    `;
    form.addEventListener('submit', handleLeadSubmit);
  }

  // Assemble
  grid.append(leftCol, rightCol);
  rightCol.append(shareContainer, formCard);
  formCard.prepend(formHeader);
  formCard.append(form);
  container.append(grid);
}

/** โหลดข้อมูลตาม slug */
async function loadProperty() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');

  if (!slug) {
    clear(container);
    container.append(el('p', { textContent: 'ไม่พบรหัสอ้างอิงของประกาศ' }));
    return;
  }

  // skeleton
  container.innerHTML = `
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

  const { data, error } = await getBySlug(slug);

  if (error || !data) {
    console.error('Failed to load property:', error);
    clear(container);
    container.append(el('p', { textContent: 'ไม่พบข้อมูลประกาศนี้' }));
    return;
  }

  renderPropertyDetails(data);
}

/** ส่ง lead */
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

// --- Main ---
document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  signOutIfAny();
  setupMobileNav();
  loadProperty();
});
