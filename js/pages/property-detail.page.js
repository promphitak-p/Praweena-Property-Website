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
import { supabase } from '../utils/supabaseClient.js';

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

// ---------- helpers ----------
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
function collectYoutubeValues(p) {
  const candidates = [
    p.youtube_video_ids, p.youtube_urls, p.youtube_url, p.youtube, p.videos
  ].filter(Boolean);

  const flat = [];
  for (const v of candidates) {
    if (Array.isArray(v)) flat.push(...v);
    else if (typeof v === 'string') {
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) flat.push(...parsed);
        else flat.push(v);
      } catch {
        flat.push(...v.split(',').map(s => s.trim()).filter(Boolean));
      }
    }
  }
  return Array.from(new Set(flat.map(s => s.trim()).filter(Boolean)));
}
function renderYouTubeGallery(videoIds = []) {
  const wrap = el('section', { style: 'margin-top:1.5rem;' });
  const heading = el('h3', { textContent: 'วิดีโอแนะนำ', style: 'margin-bottom:.75rem;' });
  const list = el('div', { id: 'youtube-gallery' });

  videoIds.forEach((id) => {
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

// ไอคอนตามประเภท (อ่านจาก p.type)
function iconOf(t='') {
  const m = String(t).toLowerCase();
  if (m.includes('school') || m.includes('university') || m.includes('college') || m.includes('kindergarten')) return '🏫';
  if (m.includes('hospital') || m.includes('clinic') || m.includes('pharmacy')) return '🏥';
  if (m.includes('bank') || m.includes('atm')) return '🏧';
  if (m.includes('police')) return '👮';
  if (m.includes('post_office')) return '📮';
  if (m.includes('fuel')) return '⛽';
  if (m.includes('cafe')) return '☕';
  if (m.includes('restaurant')) return '🍽️';
  if (m.includes('supermarket') || m.includes('convenience') || m.includes('mall') || m.includes('department')) return '🛒';
  if (m.includes('bus') || m.includes('taxi')) return '🚌';
  if (m.includes('library')) return '📚';
  if (m.includes('museum') || m.includes('zoo') || m.includes('aquarium') || m.includes('attraction')) return '🎡';
  return '📍';
}
// สีหมุดตามประเภท
function colorOf(t='') {
  const m = String(t).toLowerCase();
  if (m.includes('cafe')) return { stroke:'#a16207', fill:'#facc15' };        // เหลืองน้ำตาล
  if (m.includes('restaurant')) return { stroke:'#b91c1c', fill:'#f87171' };  // แดง
  if (m.includes('convenience') || m.includes('supermarket') || m.includes('mall')) return { stroke:'#065f46', fill:'#34d399' }; // เขียว
  if (m.includes('school') || m.includes('university') || m.includes('library') || m.includes('kindergarten')) return { stroke:'#1d4ed8', fill:'#93c5fd' }; // น้ำเงิน
  if (m.includes('hospital') || m.includes('clinic') || m.includes('pharmacy')) return { stroke:'#7e22ce', fill:'#c4b5fd' }; // ม่วง
  if (m.includes('bank') || m.includes('atm')) return { stroke:'#92400e', fill:'#fbbf24' }; // ทอง
  if (m.includes('bus') || m.includes('taxi') || m.includes('fuel') || m.includes('post_office')) return { stroke:'#0369a1', fill:'#67e8f9' }; // ฟ้า
  if (m.includes('police')) return { stroke:'#111827', fill:'#9ca3af' }; // เทาเข้ม
  if (m.includes('museum') || m.includes('zoo') || m.includes('aquarium') || m.includes('attraction')) return { stroke:'#047857', fill:'#86efac' }; // เขียวอ่อน
  return { stroke:'#16a34a', fill:'#4ade80' }; // ดีฟอลต์
}


// ---------- /helpers ----------


/** แสดงผลข้อมูลอสังหาฯ */
async function renderPropertyDetails(property) {
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
  // --- Nearby section (สร้าง DOM ให้ loadNearby เจอแน่ ๆ) ---
const nearbySec = el('section', { id:'nearby-section', className:'card', style:'margin-top:16px; display:none;' });
nearbySec.innerHTML = `
  <h2 class="card-title">สถานที่ใกล้เคียง</h2>
  <div id="poi-map" class="mini-map" style="height:220px;border-radius:12px;overflow:hidden;background:#f3f4f6;"></div>
  <ul id="poi-list" class="poi-list" style="margin:8px 0 0 0; padding:0; list-style:none;"></ul>
`;
leftCol.append(nearbySec);

  // ---------- YouTube ----------
  const ytIds = collectYoutubeValues(property).map(parseYouTubeId).filter(Boolean);
  const ytSection = renderYouTubeGallery(ytIds);
  if (ytSection) leftCol.append(ytSection);

// ---------- Map with Nearby ----------
const latRaw = property.lat ?? property.latitude ?? property.latitute ?? property.geo_lat ?? property.location_lat;
const lngRaw = property.lng ?? property.longitude ?? property.long ?? property.geo_lng ?? property.location_lng;
const lat = Number.parseFloat(latRaw);
const lng = Number.parseFloat(lngRaw);

const mapWrap = el('section', { style: 'margin-top:1.5rem;' });
const mapTitle = el('h3', { textContent: 'ตำแหน่งแผนที่', style: 'margin-bottom:.75rem;' });
leftCol.append(mapWrap);
mapWrap.append(mapTitle);

if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
  const box = el('div', {
    style: `
      background:#f9fafb;border:1px solid #e5e7eb;color:#374151;
      padding:1rem 1.25rem;border-radius:12px;text-align:center;line-height:1.6;
    `,
    innerHTML: `
      <strong>ไม่พบพิกัดแผนที่</strong><br>
      กรุณาเพิ่ม latitude/longitude ในแดชบอร์ด เพื่อแสดงตำแหน่งบนแผนที่
    `
  });
  mapWrap.append(box);
} else {
  const mapId = 'map-' + (property.id || 'detail');
  const mapEl = el('div', { attributes: { id: mapId }, style: 'height:400px;width:100%;border-radius:12px;overflow:hidden;background:#f3f4f6;' });
  mapWrap.append(mapEl);

  const listEl = el('ul', { id: 'poi-list', style: 'margin-top:1rem; list-style:none; padding:0; line-height:1.7;' });
  mapWrap.append(listEl);

  // ดึงข้อมูล POI
  const { data: pois, error } = await supabase
    .from('property_poi')
    .select('name,type,distance_km,lat,lng')
    .eq('property_id', property.id)
    .order('distance_km', { ascending: true })
    .limit(50);

  setTimeout(() => {
    try {
      if (typeof L === 'undefined') throw new Error('Leaflet not loaded');

      const map = L.map(mapId, {
        center: [lat, lng],
        zoom: 15,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

      // หมุดบ้านหลัก
      const homeMarker = L.marker([lat, lng], { title: property.title })
        .bindPopup(`<b>${property.title}</b><br><a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank">เปิดใน Google Maps</a>`)
        .addTo(map)
        .openPopup();

      const poiMarkers = [];
      const bounds = [[lat, lng]];

      if (pois && pois.length) {
        pois.forEach((p, index) => {
          if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
		  
const baseStyle = colorOf(p.type);
const marker = L.circleMarker([p.lat, p.lng], {
  radius: 6,
  color: baseStyle.stroke,
  fillColor: baseStyle.fill,
  fillOpacity: .9,
  weight: 2
}).bindPopup(
  `<strong>${p.name}</strong><br>${p.type || 'poi'}<br>${(p.distance_km ?? 0).toFixed(2)} กม.`
);
// เก็บสไตล์ไว้ใช้ตอนรีเซ็ตไฮไลต์
marker.__baseStyle = baseStyle;

		  
          marker.addTo(map);
          poiMarkers.push(marker);
          bounds.push([p.lat, p.lng]);
        });
      }

      if (bounds.length > 1) map.fitBounds(bounds, { padding: [16, 16], maxZoom: 16 });

      // สร้างรายการด้านล่าง
      if (pois && pois.length) {
listEl.innerHTML = pois.map((p, i) => {
  const km = (typeof p.distance_km === 'number') ? p.distance_km.toFixed(2) : '-';
  const icon = iconOf(p.type);
  return `
    <li data-index="${i}" style="cursor:pointer;padding:8px 0;border-bottom:1px solid #eee;display:flex;gap:.5rem;align-items:baseline;">
      <span style="font-size:1.1rem;">${icon}</span>
      <span><strong>${p.name}</strong> — ${km} กม. <span style="color:#6b7280;">(${p.type || 'poi'})</span></span>
    </li>
  `;
}).join('');

// ✨ คลิกที่รายการ → โฟกัสหมุด + เปิด popup + เปลี่ยนสีหมุดให้เด่น
listEl.querySelectorAll('li').forEach((li, i) => {
  li.addEventListener('click', () => {
    const marker = poiMarkers[i];
    if (!marker) return;

    // โฟกัส + เปิด popup
    map.setView(marker.getLatLng(), 16, { animate: true });
    marker.openPopup();

    // รีเซ็ตสีหมุดทั้งหมดกลับเป็นสีตามประเภทเดิม
    poiMarkers.forEach(m => {
      const s = m.__baseStyle || { stroke:'#16a34a', fill:'#4ade80' };
      m.setStyle({ color: s.stroke, fillColor: s.fill });
    });

    // ไฮไลต์หมุดที่เลือก (แดง)
    marker.setStyle({ color: '#ef4444', fillColor: '#f87171' });
  });
});
		
      } else {
        listEl.innerHTML = `<li style="color:#6b7280;">ไม่พบสถานที่ใกล้เคียงในระยะ 2 กม.</li>`;
      }

    } catch (err) {
      console.warn('Leaflet fallback', err);
      const iframeUrl = `https://www.google.com/maps?q=${lat},${lng}&output=embed&z=15`;
      mapEl.innerHTML = `<iframe src="${iframeUrl}" style="width:100%;height:100%;border:0;border-radius:12px;" loading="lazy"></iframe>`;
    }
  }, 0);
}

  // ---------- Share ----------
  const shareContainer = el('div', { className: 'share-buttons' });
  shareContainer.innerHTML = `<p>แชร์ประกาศนี้:</p>`;
  const currentPageUrl = window.location.href;
  const shareText = `น่าสนใจ! ${property.title} ราคา ${formatPrice(property.price)}`;

  const messengerShareUrl = `fb-messenger://share?link=${encodeURIComponent(currentPageUrl)}`;
  const lineMessage = `${shareText}\n${currentPageUrl}`;
  const lineShareUrl = `https://line.me/R/share?text=${encodeURIComponent(lineMessage)}`;
  const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentPageUrl)}`;
  const twitterShareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(currentPageUrl)}&text=${encodeURIComponent(shareText)}`;

  const facebookIcon = `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Facebook</title><path d="M22.675 0H1.325C.593 0 0 .593 0 1.325v21.351C0 23.407.593 24 1.325 24H12.82v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116c.732 0 1.325-.593 1.325-1.325V1.325C24 .593 23.407 0 22.675 0z"/></svg>`;
  const messengerIcon = `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Facebook Messenger</title><path d="M12 0C5.373 0 0 5.14 0 11.432c0 3.43.987 6.558 2.634 8.94.06.09.11.19.14.29l-1.07 4.267c-.12.48.33.93.81.81l4.267-1.07c.1.03.2.08.29.14a12.02 12 0 008.94 2.634C18.86 24 24 18.627 24 12S18.627 0 12 0zm1.14 15.192l-2.4-2.4-5.28 2.4c-.48 .24-.96-.48-.6-.84l3.12-3.12-3.12-3.12c-.36-.36 .12-.96 .6-.84l5.28 2.4 2.4-2.4c.36-.36 .96 .12 .84 .6l-2.4 5.28 2.4 2.4c.36 .36-.12 .96-.84 .6z"/></svg>`;
  const lineIcon = `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>LINE</title><path d="M19.13 6.13c-2.8-2.5-6.7-3.2-10.4-1.8-3.3 1.2-5.7 4.3-6 7.8-.3 4.1 2.2 7.7 5.9 8.9 4.3 1.4 8.6-.3 11.3-3.8 2.9-4 2.5-9.3-1.8-11.1zM9.33 16.93h-1.6c-.4 0-.7-.3-.7-.7v-5.9c0-.4.3-.7.7-.7h1.6c.4 0 .7.3 .7 .7v5.9c0 .4-.3 .7-.7 .7zm3.1-3.6c-.4 0-.7-.3-.7-.7v-2.1c0-.4 .3-.7 .7-.7h1.6c.4 0 .7 .3 .7 .7v2.1c0 .4-.3 .7-.7 .7h-1.6zm4.9 3.6h-1.6c-.4 0-.7-.3-.7-.7v-5.9c0-.4 .3-.7 .7-.7h1.6c.4 0 .7 .3 .7 .7v5.9c0 .4-.3 .7-.7 .7z"/></svg>`;
  const xIcon = `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>X</title><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 7.184L18.901 1.153Zm-1.653 19.499h2.606L6.856 2.554H4.046l13.2 18.1z"/></svg>`;

  const messengerBtn = el('a', {
    className: 'share-btn messenger',
    attributes: { href: messengerShareUrl, target: '_blank', rel: 'noopener', 'aria-label': 'Share on Messenger' }
  });
  messengerBtn.innerHTML = messengerIcon;

  const lineBtn = el('a', {
    className: 'share-btn line',
    attributes: { href: lineShareUrl, target: '_blank', rel: 'noopener', 'aria-label': 'Share on LINE' }
  });
  lineBtn.innerHTML = lineIcon;

  const facebookBtn = el('a', {
    className: 'share-btn facebook',
    attributes: { href: facebookShareUrl, target: '_blank', rel: 'noopener', 'aria-label': 'Share on Facebook' }
  });
  facebookBtn.innerHTML = facebookIcon;

  const twitterBtn = el('a', {
    className: 'share-btn twitter',
    attributes: { href: twitterShareUrl, target: '_blank', rel: 'noopener', 'aria-label': 'Share on Twitter/X' }
  });
  twitterBtn.innerHTML = xIcon;

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
  rightCol.append(shareContainer, messengerBtn, lineBtn, facebookBtn, twitterBtn, formCard);
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

await renderPropertyDetails(data);
// ✅ โหลดและแสดงสถานที่ใกล้เคียง (มินิ-แมพ + รายการ)
loadNearby(data).catch(console.error);

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

// === ฟังก์ชันใหม่ ===
async function loadNearby(property) {
  const sec = document.getElementById('nearby-section');
  const listEl = document.getElementById('poi-list');
  const mapEl = document.getElementById('poi-map');
  if (!sec || !listEl || !mapEl) return;

  const { data: pois, error } = await supabase
    .from('property_poi')
    .select('name,type,distance_km,lat,lng')
    .eq('property_id', property.id)
    .order('distance_km', { ascending: true })
    .limit(100);

  if (error || !pois || !pois.length) {
    sec.style.display = 'none';
    return;
  }

  // ✅ กรองเฉพาะ 4 กลุ่มหลัก
  const allowed = pois.filter(p => {
    const t = (p.type || '').toLowerCase();
    return (
      t.includes('hospital') || t.includes('clinic') || // โรงพยาบาล
      t.includes('school') || t.includes('university') || t.includes('college') || t.includes('kindergarten') || // โรงเรียน
      t.includes('supermarket') || t.includes('convenience') || t.includes('mall') || t.includes('department') || // ห้าง
      t.includes('government') || t.includes('police') || t.includes('post_office') // ราชการ
    );
  });

  if (!allowed.length) {
    sec.style.display = 'none';
    return;
  }

  sec.style.display = ''; // แสดง section

  // 🔹 ฟังก์ชันเลือกไอคอนตามประเภท
  function iconOf(t = '') {
    const m = String(t).toLowerCase();
    if (m.includes('hospital') || m.includes('clinic')) return '🏥';
    if (m.includes('school') || m.includes('university') || m.includes('college') || m.includes('kindergarten')) return '🏫';
    if (m.includes('supermarket') || m.includes('convenience') || m.includes('mall') || m.includes('department')) return '🛒';
    if (m.includes('government') || m.includes('police') || m.includes('post_office')) return '🏛️';
    return '📍';
  }

  // 🔹 สร้างแผนที่
  const map = L.map('poi-map', { zoomControl: true, attributionControl: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  const group = L.layerGroup().addTo(map);
  const bounds = [];

  // 🔹 หมุดบ้าน
  const lat0 = Number.parseFloat(
    property.lat ?? property.latitude ?? property.latitute ?? property.geo_lat ?? property.location_lat
  );
  const lng0 = Number.parseFloat(
    property.lng ?? property.longitude ?? property.long ?? property.geo_lng ?? property.location_lng
  );

  if (Number.isFinite(lat0) && Number.isFinite(lng0)) {
    const home = L.circleMarker([lat0, lng0], {
      radius: 7, weight: 2, color: '#2563eb', fillColor: '#60a5fa', fillOpacity: .95
    }).bindTooltip('🏠 ตำแหน่งบ้าน', { direction: 'top' });
    home.addTo(group);
    bounds.push([lat0, lng0]);
  }

  // 🔹 หมุดสถานที่ใกล้เคียง
  allowed.forEach(p => {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
    const icon = iconOf(p.type);
    const marker = L.circleMarker([p.lat, p.lng], {
      radius: 5, weight: 1.5, color: '#16a34a', fillColor: '#86efac', fillOpacity: .95
    }).bindTooltip(`${icon} ${p.name} (${p.type})`, { direction: 'top' });
    marker.addTo(group);
    bounds.push([p.lat, p.lng]);
  });

  // 🔹 ปรับมุมมอง
  if (bounds.length >= 2) map.fitBounds(bounds, { padding: [16, 16], maxZoom: 16 });
  else if (bounds.length === 1) map.setView(bounds[0], 15);
  else map.setView([13.736, 100.523], 12);

  // 🔹 รายการล่างแผนที่ (มีไอคอนด้วย)
  listEl.innerHTML = allowed.slice(0, 20).map(p => {
    const km = typeof p.distance_km === 'number' ? p.distance_km.toFixed(2) : '-';
    const gmaps = (p.lat && p.lng)
      ? `<a href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" style="color:#2563eb;">ดูแผนที่</a>` : '';
    const icon = iconOf(p.type);
    return `
      <li style="margin-bottom:.5rem; display:flex; align-items:center; gap:.5rem;">
        <span style="font-size:1.2rem;">${icon}</span>
        <span><strong>${p.name}</strong> — ${km} กม.
        <span style="color:#6b7280;">(${p.type})</span> ${gmaps}</span>
      </li>`;
  }).join('');
}