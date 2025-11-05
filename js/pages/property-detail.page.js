// js/pages/property-detail.page.js
//--------------------------------------------------
// หน้ารายละเอียดทรัพย์ Praweena Property
// - แกลเลอรี่ + lightbox
// - YouTube
// - แผนที่ใหญ่ (ใบเดียว) + POI ใต้แผนที่ (ล็อก interaction ผู้ใช้)
// - Share ปุ่มไอคอน + ใส่หัวเรื่องเวลาแชร์ (LINE/X)
// - Lead form + แจ้งเตือน LINE Messaging API
// - ผ่อนประมาณ (PayCalc)
//--------------------------------------------------
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
import { renderShareBar } from '../widgets/share.widget.js';
import { mountPayCalc } from '../widgets/payCalc.widget.js';
import { notifyLeadNew } from '../services/notifyService.js';

let detailMap = null;
let detailHouseMarker = null;
let leadSubmitting = false;                 // กันกดซ้ำระหว่างส่ง
let __lastLeadSig = { sig: null, at: 0 };   // กันส่ง LINE ซ้ำภายในช่วงสั้นๆ

const container = $('#property-detail-container');

// ============================
// util: map height responsive
// ============================
function getResponsiveMapHeight() {
  if (window.innerWidth >= 1024) return 400;
  const h = Math.floor(window.innerWidth * 0.55);
  return Math.max(h, 260);
}

// ==================================================
// util: ล็อก interaction ของ Leaflet
// ==================================================
function lockUserInteraction(map) {
  if (!map) return;
  map.dragging.disable();
  map.scrollWheelZoom.disable();
  map.touchZoom.disable();
  map.doubleClickZoom.disable();
  map.boxZoom.disable();
  map.keyboard.disable();
}

// ==================================================
// Lightbox
// ==================================================
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
    const img = el('img', {
      className: 'lightbox-image',
      attributes: { src: url, loading: 'lazy' }
    });
    gallery.append(img);
  });

  function openLightbox(index) {
    overlay.classList.add('show');
    gallery.scrollTo({
      left: gallery.offsetWidth * index,
      behavior: 'auto'
    });
  }
  function closeLightbox() {
    overlay.classList.remove('show');
  }

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
    if (e.target === overlay) closeLightbox();
  });

  return openLightbox;
}

// ==================================================
// YouTube helpers
// ==================================================
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
    p.youtube_video_ids,
    p.youtube_urls,
    p.youtube_url,
    p.youtube,
    p.videos
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
  if (!videoIds.length) return null;

  const wrap = el('section', { style: 'margin-top:1.5rem;' });
  const heading = el('h3', {
    textContent: 'วิดีโอแนะนำ',
    style: 'margin-bottom:.75rem;'
  });
  const list = el('div', { id: 'youtube-gallery' });

  videoIds.forEach((id) => {
    const thumbUrl = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    const card = el('div', {
      style: 'position:relative;margin-bottom:1rem;border-radius:12px;overflow:hidden;cursor:pointer;'
    });
    const img = el('img', {
      attributes: { src: thumbUrl, alt: `YouTube: ${id}`, loading: 'lazy' },
      style: 'width:100%;display:block;'
    });
    const play = el('div', {
      style: 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.25);'
    });
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

  wrap.append(heading, list);
  return wrap;
}

// ==================================================
// icon / color POI
// ==================================================
function iconOf(t = '') {
  const m = String(t).toLowerCase();
  if (m.includes('school') || m.includes('university') || m.includes('college') || m.includes('kindergarten')) return '🏫';
  if (m.includes('hospital') || m.includes('clinic') || m.includes('pharmacy')) return '🏥';
  if (m.includes('supermarket') || m.includes('convenience') || m.includes('mall') || m.includes('department')) return '🛒';
  if (m.includes('government') || m.includes('police') || m.includes('post_office')) return '🏛️';
  if (m.includes('restaurant')) return '🍽️';
  if (m.includes('cafe')) return '☕';
  return '📍';
}
function colorOf(t = '') {
  const m = String(t).toLowerCase();
  if (m.includes('school')) return { stroke: '#1d4ed8', fill: '#93c5fd' };
  if (m.includes('hospital') || m.includes('clinic')) return { stroke: '#7e22ce', fill: '#c4b5fd' };
  if (m.includes('supermarket') || m.includes('convenience')) return { stroke: '#065f46', fill: '#34d399' };
  if (m.includes('government') || m.includes('police')) return { stroke: '#111827', fill: '#9ca3af' };
  return { stroke: '#16a34a', fill: '#4ade80' };
}

// ==================================================
// lead submit
// ==================================================
async function handleLeadSubmit(e) {
  e.preventDefault();
  if (leadSubmitting) return; // กันดับเบิลคลิก / bind ซ้ำ
  leadSubmitting = true;

  const form = e.target;
  const btn  = form.querySelector('button[type=submit]');
  const old  = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'กำลังส่ง...';

  try {
    const payload = getFormData(form);

    // 1) บันทึกลง DB
    const { error } = await createLead(payload);
    if (error) {
      toast('เกิดข้อผิดพลาด: ' + error.message, 3000, 'error');
      return;
    }

    toast('ส่งข้อมูลสำเร็จ!', 2500, 'success');
    form.reset();

    // 2) เตรียมข้อมูลแจ้ง LINE
    const lead = {
      name: (payload.name || '').trim(),
      phone: (payload.phone || '').trim(),
      note: payload.note || '',
      property_title: window.__currentProperty?.title || '',
      property_slug: payload.property_slug || ''
    };

    // 3) ทำ "ลายเซ็น" กันส่งซ้ำ 45 วินาที (idempotency guard)
    const now = Date.now();
    const sig = JSON.stringify({
      n: lead.name, p: lead.phone, s: lead.property_slug,
      id: window.__currentProperty?.id || null
    });

    // ถ้าเหมือนอันก่อนหน้าและยังไม่เกิน 45s → ข้ามการ notify
    if (__lastLeadSig.sig === sig && (now - __lastLeadSig.at) < 45000) {
      console.debug('[notify] skipped (duplicate within 45s)');
    } else {
      __lastLeadSig = { sig, at: now };
      await notifyLeadNew(lead); // ✅ ยิงครั้งเดียว
    }

  } catch (err) {
    console.error(err);
    toast('ส่งข้อมูลไม่สำเร็จ', 2500, 'error');
  } finally {
    leadSubmitting = false;
    btn.disabled = false;
    btn.textContent = old;
  }
}

// ==================================================
// render หลัก
// ==================================================
async function renderPropertyDetails(property) {
  // เก็บทรัพย์ไว้ใช้ตอนแจ้งเตือน
  window.__currentProperty = property;

  // meta
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
  if (window.innerWidth < 1024) {
    grid.style.display = 'block';
  }

  const leftCol  = el('div', { className: 'col-span-2' });
  const rightCol = el('div', { className: 'col-span-1' });

  // ============ gallery ============
  const galleryWrapper    = el('div', { className: 'gallery-wrapper' });
  const galleryContainer  = el('div', { className: 'image-gallery' });
  const thumbnailContainer= el('div', { className: 'thumbnail-container' });

  const allImages = [property.cover_url, ...(property.gallery || [])].filter(Boolean);
  if (!allImages.length) allImages.push('/assets/img/placeholder.jpg');

  const openLightbox = setupLightbox(allImages);
  const thumbEls = [];

  allImages.forEach((url, index) => {
    const img = el('img', {
      className: 'gallery-image',
      attributes: { src: url, alt: 'Property image', loading: 'lazy' }
    });
    img.addEventListener('click', () => openLightbox(index));
    galleryContainer.append(img);

    const thumb = el('img', {
      className: 'thumbnail-image',
      attributes: { src: url, alt: `Thumbnail ${index + 1}` }
    });
    thumb.addEventListener('click', () => {
      galleryContainer.scrollTo({ left: galleryContainer.offsetWidth * index, behavior: 'smooth' });
    });
    thumbnailContainer.append(thumb);
    thumbEls.push(thumb);
  });

  if (thumbEls.length) thumbEls[0].classList.add('active');
  galleryContainer.addEventListener('scroll', () => {
    const idx = Math.round(galleryContainer.scrollLeft / galleryContainer.offsetWidth);
    thumbEls.forEach((t, i) => t.classList.toggle('active', i === idx));
  });

  if (allImages.length > 1) {
    const prevBtn = el('button', { className: 'gallery-nav prev', textContent: '‹' });
    const nextBtn = el('button', { className: 'gallery-nav next', textContent: '›' });
    prevBtn.addEventListener('click', () => galleryContainer.scrollBy({ left: -galleryContainer.offsetWidth, behavior: 'smooth' }));
    nextBtn.addEventListener('click', () => galleryContainer.scrollBy({ left: galleryContainer.offsetWidth, behavior: 'smooth' }));
    galleryWrapper.append(prevBtn, nextBtn);
  }
  galleryWrapper.prepend(galleryContainer);

  // text
  const title   = el('h1', { textContent: property.title, style: 'margin-top:1.5rem;' });
  const price   = el('h2', { textContent: formatPrice(property.price), style: 'color:var(--brand);margin-bottom:1rem;' });
  const address = el('p',  { textContent: `ที่อยู่: ${property.address || 'N/A'}, ${property.district}, ${property.province}` });
  const details = el('p',  { textContent: `ขนาด: ${property.size_text || 'N/A'} | ${property.beds} ห้องนอน | ${property.baths} ห้องน้ำ | ${property.parking} ที่จอดรถ` });

  leftCol.append(galleryWrapper, thumbnailContainer, title, price, address, details);

  // youtube
  const ytIds = collectYoutubeValues(property).map(parseYouTubeId).filter(Boolean);
  const ytSection = renderYouTubeGallery(ytIds);
  if (ytSection) leftCol.append(ytSection);

  // ============ MAP =============
  const latRaw = property.lat ?? property.latitude ?? property.geo_lat;
  const lngRaw = property.lng ?? property.longitude ?? property.geo_lng;
  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  const mapWrap  = el('section', { style: 'margin-top:1.5rem;' });
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
      style: `width:100%;height:${getResponsiveMapHeight()}px;border-radius:12px;overflow:hidden;background:#f3f4f6;`
    });
    mapWrap.append(mapEl);

    // ลิงก์เปิด Google Maps
    const openInGmaps = el('a', {
      attributes:{ href:`https://www.google.com/maps?q=${lat},${lng}`, target:'_blank', rel:'noopener' },
      textContent:'🗺️ เปิดใน Google Maps',
      style:'display:inline-block;margin-top:.5rem;color:#2563eb;'
    });
    mapWrap.append(openInGmaps);

    const poiListWrap = el('div', { id: 'poi-list-main', style: 'margin-top:1rem;' });
    mapWrap.append(poiListWrap);

    // ดึง POI ที่บันทึกไว้
    const { data: pois = [] } = await supabase
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

        // 🔒 ล็อกไม่ให้ผู้ใช้เลื่อน/ซูม
        lockUserInteraction(detailMap);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors'
        }).addTo(detailMap);

        // หมุดบ้าน
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

        // วาด POI
        if (pois.length) {
          pois.forEach((p, i) => {
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

            // คลิกหมุด → ซูมดูบ้าน+ที่นี่
            marker.on('click', () => {
              const fg = L.featureGroup([detailHouseMarker, marker]);
              detailMap.fitBounds(fg.getBounds().pad(0.35));
              marker.openPopup();
            });

            poiMarkers.push(marker);
            bounds.push([plat, plng]);
          });
        }

        // ซูมให้พอดีทั้งหมด
        if (bounds.length > 1) {
          detailMap.fitBounds(bounds, { padding: [16, 16], maxZoom: 16 });
        } else {
          detailMap.setView([lat, lng], 15);
        }

        // แจ้ง leaflet ให้คำนวณขนาดใหม่ (กันแผนที่หด)
        setTimeout(() => detailMap.invalidateSize(), 200);

        // ====== รายการ POI ใต้แผนที่ (แบบย่อ + ดูทั้งหมด) ======
        if (pois.length) {
          const allowed = pois;
          const maxShow = 6;
          const first = allowed.slice(0, maxShow);
          const rest  = allowed.slice(maxShow);

          const ul = document.createElement('ul');
          ul.style.listStyle = 'none';
          ul.style.padding = '0';
          ul.style.margin = '0';

          function addLi(p, i) {
            const km = (typeof p.distance_km === 'number') ? p.distance_km.toFixed(2) : '-';
            const li = document.createElement('li');
            li.dataset.index = i;
            li.style.cssText = 'cursor:pointer;padding:8px 0;border-bottom:1px solid #eee;display:flex;gap:.5rem;align-items:baseline;';
            li.innerHTML = `
              <span style="font-size:1.1rem;">${iconOf(p.type)}</span>
              <span>
                <strong>${p.name}</strong> — ${km} กม.
                <span style="color:#6b7280;">(${p.type || 'poi'})</span>
                <button class="poi-nav-btn" data-i="${i}" style="margin-left:.5rem;background:transparent;border:0;color:#2563eb;cursor:pointer;">นำทาง</button>
              </span>
            `;
            return li;
          }

          first.forEach((p, i) => ul.appendChild(addLi(p, i)));

          let hiddenWrap = null;
          if (rest.length) {
            hiddenWrap = document.createElement('div');
            hiddenWrap.style.display = 'none';
            rest.forEach((p, rIdx) => {
              const realIdx = maxShow + rIdx;
              hiddenWrap.appendChild(addLi(p, realIdx));
            });
            ul.appendChild(hiddenWrap);

            const toggleBtn = document.createElement('button');
            toggleBtn.textContent = 'ดูสถานที่ใกล้เคียงทั้งหมด';
            toggleBtn.style.cssText = 'margin-top:.5rem;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:.9rem;';
            toggleBtn.addEventListener('click', () => {
              const open = hiddenWrap.style.display === 'block';
              hiddenWrap.style.display = open ? 'none' : 'block';
              toggleBtn.textContent = open ? 'ดูสถานที่ใกล้เคียงทั้งหมด' : 'ซ่อนรายการ';
              setTimeout(() => detailMap.invalidateSize(), 120);
            });
            poiListWrap.appendChild(toggleBtn);
          }

          poiListWrap.appendChild(ul);

          // คลิกรายการ → ซูม
          poiListWrap.querySelectorAll('li[data-index]').forEach((li) => {
            li.addEventListener('click', (ev) => {
              if (ev.target && ev.target.classList.contains('poi-nav-btn')) return;
              const idx = Number(li.dataset.index);
              const p = allowed[idx];
              const marker = poiMarkers[idx];
              if (!p || !marker) return;
              const fg = L.featureGroup([detailHouseMarker, marker]);
              detailMap.fitBounds(fg.getBounds().pad(0.35));
              marker.openPopup();
            });
          });

          // ปุ่มนำทาง → Google Maps
          poiListWrap.querySelectorAll('.poi-nav-btn').forEach((btn) => {
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
          poiListWrap.innerHTML = `<p style="color:#6b7280;">ยังไม่มีสถานที่ใกล้เคียงที่บันทึกไว้</p>`;
        }

        // resize → update map
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

  // ==================================================
  // SHARE + LEAD (รวมอยู่ที่นี่)
  // ==================================================
  const shareBox = el('div', { className: 'share-buttons' });
  shareBox.innerHTML = `<p style="font-weight:600;margin-bottom:.5rem;">แชร์ประกาศนี้</p>`;

  const currentUrl = window.location.href;
  const headline   = `บ้านสวยทำเลดี : ${property.title}`;   // หัวเรื่องที่อยากให้ติดไป
  const shareText  = `${headline}\nราคา ${formatPrice(property.price)}\n${currentUrl}`;
  const isMobile   = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Messenger (มือถือ)
  const messengerAppUrl = `fb-messenger://share?link=${encodeURIComponent(currentUrl)}`;
  // Messenger (เดสก์ท็อป) → ต้องใส่ app_id เอง
  const messengerWebUrl =
    `https://www.facebook.com/dialog/send?link=${encodeURIComponent(currentUrl)}&app_id=YOUR_APP_ID&redirect_uri=${encodeURIComponent(currentUrl)}`;

  // LINE (คุมข้อความได้)
  const lineUrl = `https://line.me/R/share?text=${encodeURIComponent(shareText)}`;
  // Facebook (คุมไม่ได้ ใช้ meta)
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}`;
  // X/Twitter (คุมหัวเรื่องได้)
  const twitterUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(currentUrl)}&text=${encodeURIComponent(headline)}`;

  // helper สร้างปุ่ม
  function makeShareBtn({ href, label, svg, extraStyle = '' }) {
    const a = el('a', {
      attributes: { href, target: '_blank', rel: 'noopener' },
      style: `
        display:inline-flex;align-items:center;gap:.4rem;
        background:#f3f4f6;border:1px solid #e5e7eb;border-radius:9999px;
        padding:.35rem .8rem;font-size:.8rem;text-decoration:none;color:#111827;
        margin-right:.4rem;${extraStyle}
      `
    });
    a.innerHTML = `${svg}<span>${label}</span>`;
    return a;
  }

  // Messenger แยก mobile/desktop
  if (isMobile) {
    shareBox.appendChild(
      makeShareBtn({
        href: messengerAppUrl,
        label: 'Messenger',
        svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="#0084FF" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.37 0 0 4.98 0 11.13 0 14.57 1.71 17.6 4.45 19.5v4.15l4.07-2.23c1.01.28 2.09.44 3.21.44 6.63 0 12-4.98 12-11.13C23.73 4.98 18.36 0 12 0zm1.19 14.98l-2.97-3.17-5.82 3.17 6.39-6.78 3.03 3.17 5.76-3.17-6.39 6.78z"/></svg>`
      })
    );
  } else {
    shareBox.appendChild(
      makeShareBtn({
        href: messengerWebUrl,
        label: 'Messenger',
        svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="#0084FF" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.37 0 0 4.98 0 11.13 0 14.57 1.71 17.6 4.45 19.5v4.15l4.07-2.23c1.01.28 2.09.44 3.21.44 6.63 0 12-4.98 12-11.13C23.73 4.98 18.36 0 12 0zm1.19 14.98l-2.97-3.17-5.82 3.17 6.39-6.78 3.03 3.17 5.76-3.17-6.39 6.78z"/></svg>`
      })
    );
  }

  // LINE
  shareBox.appendChild(
    makeShareBtn({
      href: lineUrl,
      label: 'LINE',
      svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="#06C755" xmlns="http://www.w3.org/2000/svg"><path d="M20.666 10.08c0-3.63-3.46-6.58-7.733-6.58-4.273 0-7.733 2.95-7.733 6.58 0 3.25 2.934 5.96 6.836 6.5.267.058.630.178.720.408.082.213.054.545.026.758l-.115.7c-.035.213-.17.84.74.458 3.512-1.46 5.68-3.997 5.68-7.824z"/></svg>`
    })
  );

  // Facebook
  shareBox.appendChild(
    makeShareBtn({
      href: facebookUrl,
      label: 'Facebook',
      svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2" xmlns="http://www.w3.org/2000/svg"><path d="M22.676 0H1.324C.593 0 0 .593 0 1.324v21.352C0 23.406.593 24 1.324 24H12.82v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116C23.407 24 24 23.406 24 22.676V1.324C24 .593 23.407 0 22.676 0z"/></svg>`
    })
  );

  // X / Twitter
  shareBox.appendChild(
    makeShareBtn({
      href: twitterUrl,
      label: 'X / Twitter',
      svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="#000" xmlns="http://www.w3.org/2000/svg"><path d="M18.9 1.2h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.59l5.24 7.18 6.07-7.14z"/></svg>`
    })
  );

  // ปุ่มคัดลอกข้อความ
  const copyBtn = makeShareBtn({
    href: '#',
    label: 'คัดลอก',
    svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="#0f172a" xmlns="http://www.w3.org/2000/svg"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`
  });
  copyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    navigator.clipboard.writeText(`${headline}\nราคา ${formatPrice(property.price)}\n${currentUrl}`)
      .then(() => toast('คัดลอกข้อความแล้ว', 2000, 'success'))
      .catch(() => toast('คัดลอกไม่สำเร็จ', 2000, 'error'));
  });
  shareBox.appendChild(copyBtn);

  const shareWrap = el('div', { id: 'share-bar' });

  // ====== Lead form ======
  const formCard = el('div', {
    style: 'background:#fff;padding:1.5rem;border-radius:12px;box-shadow:0 5px 20px rgba(15,23,42,0.08);margin-top:1.5rem;'
  });
  const formHd = el('h3', { textContent: 'สนใจนัดชม / สอบถามข้อมูล' });
  const form = el('form', { attributes: { id: 'lead-form' } });
  form.innerHTML = `
    <input type="hidden" name="property_id" value="${property.id}">
    <input type="hidden" name="property_slug" value="${property.slug || ''}">
    <div class="form-group"><label>ชื่อ</label><input name="name" required class="form-control"></div>
    <div class="form-group"><label>เบอร์โทร</label><input name="phone" required class="form-control" pattern="^0\\d{8,9}$"></div>
    <div class="form-group"><label>ข้อความเพิ่มเติม</label><textarea name="note" rows="3" class="form-control"></textarea></div>
    <button type="submit" class="btn" style="width:100%;">ส่งข้อมูล</button>
  `;
  form.addEventListener('submit', handleLeadSubmit);
  formCard.append(formHd, form);
  
  // ...หลังสร้าง form.innerHTML แล้ว
if (!form.dataset.boundSubmit) {
  form.addEventListener('submit', handleLeadSubmit);
  form.dataset.boundSubmit = '1';
}

  // mount share widget + กล่องแชร์ custom
  rightCol.append(shareWrap);
  renderShareBar(shareWrap, {
    title: `${property.title} | ราคา ${formatPrice(property.price)} บาท`,
    url: window.location.href,
    image: property.cover_url
  });
  rightCol.append(shareBox);

  // ผ่อนประมาณ
  const calcWrap = el('div', { id: 'paycalc', style: 'margin-top:1rem;' });
  rightCol.append(calcWrap);
  mountPayCalc(calcWrap, { price: Number(property.price) || 0 });

  // ฟอร์มท้ายสุด
  rightCol.append(formCard);

  // ใส่ลงกริด
  grid.append(leftCol, rightCol);
  container.append(grid);
}

// ==================================================
// โหลดประกาศ
// ==================================================
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

// ==================================================
// main
// ==================================================
document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  signOutIfAny();
  setupMobileNav();
  loadProperty();
});
