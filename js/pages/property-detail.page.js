// js/pages/property-detail.page.js

import { setupMobileNav } from '../ui/mobileNav.js';
import { getBySlug } from '../services/propertiesService.js';
import { createLead } from '../services/leadsService.js';
import { getFormData } from '../ui/forms.js';
import { el, $, clear } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { formatPrice } from '../utils/format.js';
import { setupNav } from '../utils/config.js';
import { signOutIfAny } from '../auth/auth.js';
import { supabase } from '../utils/supabaseClient.js';

let detailMap = null;
let detailHouseMarker = null;

const container = $('#property-detail-container');

// ใช้คำนวณความสูงแผนที่แบบ responsive
function getResponsiveMapHeight() {
  // ถ้าจอกว้าง >= 1024 ใช้ 400 ตามเดิม
  if (window.innerWidth >= 1024) return 400;
  // mobile / tablet → เอาตามความกว้างจอ
  const h = Math.floor(window.innerWidth * 0.55); // 55% ของความกว้างจอ
  return Math.max(h, 260); // แต่ไม่ต่ำกว่า 260
}

// --- Lightbox (เหมือนเดิม) ---
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
    gallery.scrollTo({ left: gallery.offsetWidth * index, behavior: 'auto' });
  }
  function closeLightbox() { overlay.classList.remove('show'); }

  prevBtn.addEventListener('click', (e) => { e.stopPropagation(); gallery.scrollBy({ left: -gallery.offsetWidth, behavior: 'smooth' }); });
  nextBtn.addEventListener('click', (e) => { e.stopPropagation(); gallery.scrollBy({ left: gallery.offsetWidth, behavior: 'smooth' }); });
  $('.lightbox-close').addEventListener('click', closeLightbox);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLightbox(); });

  return openLightbox;
}

// helper youtube + icon เหมือนเดิม
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
function iconOf(t='') {
  const m = String(t).toLowerCase();
  if (m.includes('school') || m.includes('university') || m.includes('college') || m.includes('kindergarten')) return '🏫';
  if (m.includes('hospital') || m.includes('clinic') || m.includes('pharmacy')) return '🏥';
  if (m.includes('supermarket') || m.includes('convenience') || m.includes('mall') || m.includes('department')) return '🛒';
  if (m.includes('government') || m.includes('police') || m.includes('post_office')) return '🏛️';
  if (m.includes('restaurant')) return '🍽️';
  if (m.includes('cafe')) return '☕';
  return '📍';
}
function colorOf(t='') {
  const m = String(t).toLowerCase();
  if (m.includes('school')) return { stroke:'#1d4ed8', fill:'#93c5fd' };
  if (m.includes('hospital') || m.includes('clinic')) return { stroke:'#7e22ce', fill:'#c4b5fd' };
  if (m.includes('supermarket') || m.includes('convenience')) return { stroke:'#065f46', fill:'#34d399' };
  if (m.includes('government') || m.includes('police')) return { stroke:'#111827', fill:'#9ca3af' };
  return { stroke:'#16a34a', fill:'#4ade80' };
}

// ==== หน้ารายละเอียด ====
async function renderPropertyDetails(property) {
  const pageTitle = `${property.title} - Praweena Property`;
  const description = `ขาย${property.title} ราคา ${formatPrice(property.price)} ตั้งอยู่ที่ ${property.address}, ${property.district}, ${property.province}`;
  document.title = pageTitle;
  $('#meta-description')?.setAttribute('content', description);
  $('#meta-keywords')?.setAttribute('content', `${property.title}, บ้าน${property.district}, อสังหาฯ ${property.province}`);
  $('#meta-og-title')?.setAttribute('content', pageTitle);
  $('#meta-og-description')?.setAttribute('content', description);
  $('#meta-og-image')?.setAttribute('content', property.cover_url || '/assets/img/placeholder.jpg');

  clear(container);

  // layout
  const grid = el('div', {
    className: 'grid grid-cols-3',
    style: 'gap:2rem;align-items:flex-start;'
  });

  // ⭐ mobile: ให้เป็นคอลัมน์เดียว
  if (window.innerWidth < 1024) {
    grid.style.display = 'block';
  }

  const leftCol = el('div', { className: 'col-span-2' });
  const rightCol = el('div', { className: 'col-span-1' });

  // gallery
  const galleryWrapper = el('div', { className: 'gallery-wrapper' });
  const galleryContainer = el('div', { className: 'image-gallery' });
  const thumbnailContainer = el('div', { className: 'thumbnail-container' });

  const allImages = [property.cover_url, ...(property.gallery || [])].filter(Boolean);
  if (allImages.length === 0) allImages.push('/assets/img/placeholder.jpg');

  const openLightbox = setupLightbox(allImages);
  const thumbnailElements = [];

  allImages.forEach((imageUrl, index) => {
    const img = el('img', {
      className: 'gallery-image',
      attributes: { src: imageUrl, alt: 'Property image', loading: 'lazy' }
    });
    img.addEventListener('click', () => openLightbox(index));
    galleryContainer.append(img);

    const thumb = el('img', {
      className: 'thumbnail-image',
      attributes: { src: imageUrl, alt: `Thumbnail ${index + 1}` }
    });
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

  const title = el('h1', { textContent: property.title, style: 'margin-top:1.5rem;' });
  const price = el('h2', { textContent: formatPrice(property.price), style: 'color:var(--brand);margin-bottom:1rem;' });
  const address = el('p', { textContent: `ที่อยู่: ${property.address || 'N/A'}, ${property.district}, ${property.province}` });
  const details = el('p', { textContent: `ขนาด: ${property.size_text || 'N/A'} | ${property.beds} ห้องนอน | ${property.baths} ห้องน้ำ | ${property.parking} ที่จอดรถ` });

  leftCol.append(galleryWrapper, thumbnailContainer, title, price, address, details);

  // youtube
  const ytIds = collectYoutubeValues(property).map(parseYouTubeId).filter(Boolean);
  const ytSection = renderYouTubeGallery(ytIds);
  if (ytSection) leftCol.append(ytSection);

  // ========== MAP ==========
  const latRaw = property.lat ?? property.latitude ?? property.geo_lat;
  const lngRaw = property.lng ?? property.longitude ?? property.geo_lng;
  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  const mapWrap = el('section', { style: 'margin-top:1.5rem;' });
  const mapTitle = el('h3', { textContent: 'ตำแหน่งแผนที่และสถานที่ใกล้เคียง', style: 'margin-bottom:.75rem;' });
  leftCol.append(mapWrap);
  mapWrap.append(mapTitle);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    mapWrap.append(
      el('div', {
        style: 'background:#f9fafb;border:1px solid #e5e7eb;padding:1rem;border-radius:12px;text-align:center;',
        innerHTML: '<strong>ไม่พบพิกัดแผนที่</strong><br>กรุณาเพิ่ม latitude/longitude ในแดชบอร์ด'
      })
    );
  } else {
    const mapId = 'map-' + (property.id || 'detail');
    const mapEl = el('div', {
      attributes: { id: mapId },
      // ⭐ สูงแบบ responsive
      style: `width:100%;height:${getResponsiveMapHeight()}px;border-radius:12px;overflow:hidden;background:#f3f4f6;`
    });
    mapWrap.append(mapEl);

    const listEl = el('div', { id: 'poi-list-main', style: 'margin-top:1rem;' });
    mapWrap.append(listEl);

    // โหลด poi
    const { data: pois } = await supabase
      .from('property_poi')
      .select('name,type,distance_km,lat,lng')
      .eq('property_id', property.id)
      .order('distance_km', { ascending: true })
      .limit(100);

    setTimeout(() => {
      try {
        if (typeof L === 'undefined') throw new Error('Leaflet not loaded');

        detailMap = L.map(mapId, {
          center: [lat, lng],
          zoom: 15,
          zoomControl: true,
          attributionControl: false,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors'
        }).addTo(detailMap);

        // PIN บ้านแบบมีโลโก้
        const houseIcon = L.divIcon({
          className: '',
          html: `
            <div style="
              position:relative;
              width:50px;
              height:70px;
              background:#fbbf24;
              border-radius:25px 25px 35px 35px;
              display:flex;
              flex-direction:column;
              align-items:center;
              justify-content:center;
              box-shadow:0 6px 18px rgba(0,0,0,.25);
              border:2px solid #d97706;
            ">
              <div style="font-weight:700;font-size:16px;line-height:1;color:#fff;">M</div>
              <div style="font-size:8px;letter-spacing:.5px;color:#fff;margin-top:2px;">PRAWEENA</div>
              <div style="
                position:absolute;
                bottom:-10px;
                width:0;
                height:0;
                border-left:10px solid transparent;
                border-right:10px solid transparent;
                border-top:14px solid #fbbf24;
              "></div>
            </div>
          `,
          iconSize: [50, 70],
          iconAnchor: [25, 68],
          popupAnchor: [0, -70]
        });

        detailHouseMarker = L.marker([lat, lng], { icon: houseIcon })
          .bindPopup(`<b>${property.title}</b><br><a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank">เปิดใน Google Maps</a>`)
          .addTo(detailMap);

        const bounds = [[lat, lng]];
        const poiMarkers = [];
        const allowed = pois || [];

        if (allowed.length) {
          allowed.forEach((p, i) => {
            const plat = Number(p.lat);
            const plng = Number(p.lng);
            if (!Number.isFinite(plat) || !Number.isFinite(plng)) return;
            const style = colorOf(p.type);
            const marker = L.circleMarker([plat, plng], {
              radius: 6,
              color: style.stroke,
              fillColor: style.fill,
              fillOpacity: .9,
              weight: 2
            }).addTo(detailMap);

            marker.bindPopup(`
              ${iconOf(p.type)} <strong>${p.name}</strong><br>
              ระยะทาง ${(p.distance_km ?? 0).toFixed(2)} กม.<br>
              <a href="https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${plat},${plng}" target="_blank" style="color:#2563eb;">นำทางด้วย Google Maps</a>
            `);

            marker.on('click', () => {
              const fg = L.featureGroup([detailHouseMarker, marker]);
              detailMap.fitBounds(fg.getBounds().pad(0.35));
              marker.openPopup();
            });

            poiMarkers.push(marker);
            bounds.push([plat, plng]);
          });
        }

        if (bounds.length > 1) {
          detailMap.fitBounds(bounds, { padding: [16, 16], maxZoom: 16 });
        } else {
          detailMap.setView([lat, lng], 15);
        }

        // ⭐ สำคัญมาก: แจ้ง Leaflet ว่าขนาดเปลี่ยน
        setTimeout(() => {
          detailMap.invalidateSize();
        }, 200);

        // ----- รายการ POI แบบย่อ -----
        if (allowed.length) {
          const maxShow = 6;
          const first = allowed.slice(0, maxShow);
          const rest  = allowed.slice(maxShow);

          const ul = document.createElement('ul');
          ul.style.listStyle = 'none';
          ul.style.padding = '0';
          ul.style.margin = '0';

          first.forEach((p, i) => {
            const km = (typeof p.distance_km === 'number') ? p.distance_km.toFixed(2) : '-';
            const icon = iconOf(p.type);
            const li = document.createElement('li');
            li.dataset.index = i;
            li.style.cssText = 'cursor:pointer;padding:8px 0;border-bottom:1px solid #eee;display:flex;gap:.5rem;align-items:baseline;';
            li.innerHTML = `
              <span style="font-size:1.1rem;">${icon}</span>
              <span>
                <strong>${p.name}</strong> — ${km} กม. <span style="color:#6b7280;">(${p.type || 'poi'})</span>
                <button class="poi-nav-btn" data-i="${i}" style="margin-left:.5rem;background:transparent;border:0;color:#2563eb;cursor:pointer;">นำทาง</button>
              </span>
            `;
            ul.appendChild(li);
          });

          let hiddenWrap = null;
          if (rest.length) {
            hiddenWrap = document.createElement('div');
            hiddenWrap.style.display = 'none';

            rest.forEach((p, rIdx) => {
              const realIdx = maxShow + rIdx;
              const km = (typeof p.distance_km === 'number') ? p.distance_km.toFixed(2) : '-';
              const icon = iconOf(p.type);
              const li = document.createElement('li');
              li.dataset.index = realIdx;
              li.style.cssText = 'cursor:pointer;padding:8px 0;border-bottom:1px solid #eee;display:flex;gap:.5rem;align-items:baseline;';
              li.innerHTML = `
                <span style="font-size:1.1rem;">${icon}</span>
                <span>
                  <strong>${p.name}</strong> — ${km} กม. <span style="color:#6b7280;">(${p.type || 'poi'})</span>
                  <button class="poi-nav-btn" data-i="${realIdx}" style="margin-left:.5rem;background:transparent;border:0;color:#2563eb;cursor:pointer;">นำทาง</button>
                </span>
              `;
              hiddenWrap.appendChild(li);
            });

            ul.appendChild(hiddenWrap);

            const toggleBtn = document.createElement('button');
            toggleBtn.textContent = 'ดูสถานที่ใกล้เคียงทั้งหมด';
            toggleBtn.style.cssText = 'margin-top:.5rem;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:.9rem;';
            toggleBtn.addEventListener('click', () => {
              const open = hiddenWrap.style.display === 'block';
              hiddenWrap.style.display = open ? 'none' : 'block';
              toggleBtn.textContent = open ? 'ดูสถานที่ใกล้เคียงทั้งหมด' : 'ซ่อนรายการ';
              // เผื่อสูงขึ้น → แจ้งแผนที่อีกรอบ
              setTimeout(() => detailMap.invalidateSize(), 120);
            });
            listEl.appendChild(toggleBtn);
          }

          listEl.appendChild(ul);

          // คลิกทั้งแถว
          listEl.querySelectorAll('li[data-index]').forEach((li) => {
            li.addEventListener('click', (ev) => {
              if (ev.target && ev.target.classList.contains('poi-nav-btn')) return;
              const idx = Number(li.dataset.index);
              const p = allowed[idx];
              const m = poiMarkers[idx];
              if (!p || !m) return;
              const fg = L.featureGroup([detailHouseMarker, m]);
              detailMap.fitBounds(fg.getBounds().pad(0.35));
              m.openPopup();
            });
          });

          // ปุ่มนำทาง
          listEl.querySelectorAll('.poi-nav-btn').forEach((btn) => {
            btn.addEventListener('click', (ev) => {
              ev.stopPropagation();
              const idx = Number(btn.dataset.i);
              const p = allowed[idx];
              if (!p) return;
              const gurl = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${p.lat},${p.lng}`;
              window.open(gurl, '_blank');
            });
          });
        } else {
          listEl.innerHTML = `<p style="color:#6b7280;">ยังไม่มีสถานที่ใกล้เคียงที่บันทึกไว้</p>`;
        }

        // ⭐ ตอนเปลี่ยนขนาดจอ → รีเฟรชขนาดแผนที่
        window.addEventListener('resize', () => {
          const newH = getResponsiveMapHeight();
          mapEl.style.height = newH + 'px';
          setTimeout(() => detailMap.invalidateSize(), 120);
        });

      } catch (err) {
        console.warn('Leaflet fallback', err);
        mapEl.innerHTML = `<iframe src="https://www.google.com/maps?q=${lat},${lng}&output=embed&z=15" style="width:100%;height:100%;border:0;border-radius:12px;" loading="lazy"></iframe>`;
      }
    }, 0);
  }

  // ---------- Share + lead (เหมือนเดิมย่อ) ----------
  const shareBox = el('div', { className: 'share-buttons' });
  shareBox.innerHTML = `<p>แชร์ประกาศนี้:</p>`;
  const url = window.location.href;
  const text = `น่าสนใจ! ${property.title} ราคา ${formatPrice(property.price)}`;
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  const line = `https://line.me/R/share?text=${encodeURIComponent(text + '\n' + url)}`;
  const mss = `fb-messenger://share?link=${encodeURIComponent(url)}`;

  const fbA = el('a', { attributes:{href:fb,target:'_blank'}, textContent:'Facebook' });
  const lineA = el('a', { attributes:{href:line,target:'_blank'}, textContent:'LINE', style:'margin-left:.5rem;' });
  const mssA = el('a', { attributes:{href:mss,target:'_blank'}, textContent:'Messenger', style:'margin-left:.5rem;' });

  const formCard = el('div', { style:'background:#fff;padding:1.5rem;border-radius:12px;box-shadow:0 5px 20px rgba(15,23,42,0.08);margin-top:1.5rem;' });
  const formHd = el('h3', { textContent:'สนใจนัดชม / สอบถามข้อมูล' });
  const form = el('form', { attributes:{id:'lead-form'} });
  form.innerHTML = `
    <input type="hidden" name="property_id" value="${property.id}">
    <input type="hidden" name="property_slug" value="${property.slug || ''}">
    <div class="form-group"><label>ชื่อ</label><input name="name" required class="form-control"></div>
    <div class="form-group"><label>เบอร์โทร</label><input name="phone" required class="form-control" pattern="^0\\d{8,9}$"></div>
    <div class="form-group"><label>ข้อความเพิ่มเติม</label><textarea name="note" rows="3" class="form-control"></textarea></div>
    <button type="submit" class="btn" style="width:100%;">ส่งข้อมูล</button>
  `;
  form.addEventListener('submit', handleLeadSubmit);

  rightCol.append(shareBox, fbA, lineA, mssA, formCard);
  formCard.append(formHd, form);

  grid.append(leftCol, rightCol);
  container.append(grid);
}

async function handleLeadSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'กำลังส่ง...';

  const payload = getFormData(form);
  const { error } = await createLead(payload);
  if (error) {
    toast('เกิดข้อผิดพลาด: ' + error.message, 3000, 'error');
  } else {
    toast('ส่งข้อมูลสำเร็จ!', 2500, 'success');
    form.reset();
  }
  btn.disabled = false;
  btn.textContent = 'ส่งข้อมูล';
}

async function loadProperty() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');
  if (!slug) {
    clear(container);
    container.textContent = 'ไม่พบประกาศ';
    return;
  }

  container.innerHTML = `<div class="skeleton" style="height:400px;border-radius:16px;"></div>`;

  const { data, error } = await getBySlug(slug);
  if (error || !data) {
    clear(container);
    container.textContent = 'ไม่พบข้อมูลประกาศนี้';
    return;
  }
  await renderPropertyDetails(data);
}

document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  signOutIfAny();
  setupMobileNav();
  loadProperty();
});
