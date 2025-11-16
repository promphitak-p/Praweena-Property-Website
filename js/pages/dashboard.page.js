// js/pages/dashboard.page.js
//------------------------------------------------------------
// Praweena Property Dashboard Page
// เลือกตำแหน่งบ้าน + ดึงสถานที่ใกล้เคียง (POI)
// + อัปโหลดรูปขึ้น Cloudinary
// + จัดการ YouTube
//------------------------------------------------------------

import { setupMobileNav } from '../ui/mobileNav.js';
import { protectPage } from '../auth/guard.js';
import { signOutIfAny } from '../auth/auth.js';
import { listAll, upsertProperty, removeProperty } from '../services/propertiesService.js';
import { setupNav } from '../utils/config.js';
import { formatPrice } from '../utils/format.js';
import { getFormData } from '../ui/forms.js';
import { $, $$, clear } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { supabase } from '../utils/supabaseClient.js';
import { listSpecsByProperty, upsertSpec, deleteSpec } from '../services/propertySpecsService.js';
import { listContractorsForProperty, upsertPropertyContractor, deletePropertyContractor } from '../services/propertyContractorsService.js';
import { upsertContractor } from '../services/contractorsService.js';

// =========== 👇👇 ตั้งค่าตรงนี้ให้ตรงกับ Cloudinary ของกุ้งก่อนนะ 👇👇 ===========
const CLOUDINARY_CLOUD_NAME = 'dupwjm8q2';        // <- ใส่ชื่อ cloud
const CLOUDINARY_UNSIGNED_PRESET = 'praweena_property_preset'; // <- ใส่ unsigned preset
// ============================================================================

// DOM หลัก
const propertyModal   = document.getElementById('property-modal');
const propertyForm    = document.getElementById('property-form');
const addPropertyBtn  = document.getElementById('add-property-btn');

// (ต้องมีใน html)
//  - <input type="file" id="cover-upload" accept="image/*">
//  - <input type="file" id="gallery-upload" accept="image/*" multiple>
//  - <div id="gallery-preview"></div>
//  - ส่วน youtube:
//      <input id="youtube-input">
//      <button id="youtube-add-btn">+ เพิ่มวิดีโอ YouTube</button>
//      <ul id="youtube-list"></ul>

// State
let modalMap = null;
let draggableMarker = null;
let currentGallery = [];          // เก็บ URL รูปทั้งหมด
let poiCandidatesInline = [];     // รายการ POI ที่ขึ้นในฟอร์ม
let currentYoutube = [];          // เก็บ YouTube IDs/URLs

// ====================== Utility ======================
function kmDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function poiEmoji(type = '') {
  const t = (type || '').toLowerCase();
  if (t.includes('school')) return '🏫';
  if (t.includes('hospital') || t.includes('clinic')) return '🏥';
  if (t.includes('government') || t.includes('office')) return '🏛️';
  if (t.includes('market') || t.includes('shop') || t.includes('super')) return '🛒';
  return '📍';
}

// ========== อัปโหลดรูปขึ้น Cloudinary ==========
// ใช้ unsigned upload (ฝั่ง client)
async function uploadToCloudinary(file) {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UNSIGNED_PRESET) {
    throw new Error('ยังไม่ได้ตั้งค่า Cloudinary');
  }
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY_UNSIGNED_PRESET);

  const res = await fetch(url, { method: 'POST', body: fd });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('อัปโหลดรูปไม่สำเร็จ: ' + txt);
  }
  const data = await res.json();
  return data.secure_url;
}

// แสดงตัวอย่างรูป
function renderGalleryPreview() {
  const wrap = document.getElementById('gallery-preview');
  if (!wrap) return;
  clear(wrap);

  if (!currentGallery.length) {
    wrap.innerHTML = '<p style="color:#9ca3af;">ยังไม่มีรูปอัปโหลด</p>';
    return;
  }

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexWrap = 'wrap';
  list.style.gap = '8px';

  currentGallery.forEach((url, idx) => {
    const box = document.createElement('div');
    box.style.position = 'relative';
    box.style.width = '90px';
    box.style.height = '90px';
    box.style.borderRadius = '8px';
    box.style.overflow = 'hidden';
    box.style.border = idx === 0 ? '2px solid #f59e0b' : '1px solid #e5e7eb';
    box.title = idx === 0 ? 'รูปหน้าปก' : 'รูปที่ ' + (idx + 1);

    const img = document.createElement('img');
    img.src = url;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';

    const del = document.createElement('button');
    del.textContent = '×';
    del.style.position = 'absolute';
    del.style.top = '4px';
    del.style.right = '4px';
    del.style.background = 'rgba(0,0,0,.6)';
    del.style.color = '#fff';
    del.style.border = 'none';
    del.style.width = '20px';
    del.style.height = '20px';
    del.style.cursor = 'pointer';
    del.style.borderRadius = '999px';
    del.addEventListener('click', () => {
      currentGallery = currentGallery.filter((_, i) => i !== idx);
      renderGalleryPreview();
    });

    box.appendChild(img);
    box.appendChild(del);
    list.appendChild(box);
  });

  wrap.appendChild(list);
}

// ========== YouTube helper ==========
function normalizeYoutubeIdOrUrl(input) {
  const raw = (input || '').trim();
  if (!raw) return '';
  // แค่ id 11 ตัว
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  // พยายามดึงจาก url
  try {
    const u = new URL(raw);
    const v = u.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    const m1 = u.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (m1) return m1[1];
  } catch {
    // ไม่ใช่ url ก็ไม่เป็นไร
  }
  return raw; // อย่างน้อยก็เก็บไว้ก่อน
}

function renderYoutubeList() {
  const list = document.getElementById('youtube-list');
  if (!list) return;
  clear(list);

  if (!currentYoutube.length) {
    list.innerHTML = '<li style="color:#9ca3af;">ยังไม่ได้เพิ่มวิดีโอ</li>';
    return;
  }

  currentYoutube.forEach((id, idx) => {
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.alignItems = 'center';
    li.style.justifyContent = 'space-between';
    li.style.gap = '1rem';
    li.style.padding = '4px 0';

    const text = document.createElement('span');
    text.textContent = id;

    const btn = document.createElement('button');
    btn.textContent = 'ลบ';
    btn.className = 'btn btn-sm btn-danger';
    btn.addEventListener('click', () => {
      currentYoutube = currentYoutube.filter((_, i) => i !== idx);
      renderYoutubeList();
    });

    li.appendChild(text);
    li.appendChild(btn);
    list.appendChild(li);
  });
}

// ================== Map ในโมดัล ==================
function setupModalMap(lat, lng) {
  if (!propertyForm) return;

  let latInput = propertyForm.elements.latitude;
  let lngInput = propertyForm.elements.longitude;

  if (!latInput) {
    latInput = document.createElement('input');
    latInput.type = 'hidden';
    latInput.name = 'latitude';
    propertyForm.appendChild(latInput);
  }
  if (!lngInput) {
    lngInput = document.createElement('input');
    lngInput.type = 'hidden';
    lngInput.name = 'longitude';
    propertyForm.appendChild(lngInput);
  }

  const mapContainer = document.getElementById('modal-map');
  if (!mapContainer) return;

  let startLat = parseFloat(lat);
  let startLng = parseFloat(lng);
  startLat = !isNaN(startLat) ? startLat : 9.1337;
  startLng = !isNaN(startLng) ? startLng : 99.3325;

  latInput.value = startLat.toFixed(6);
  lngInput.value = startLng.toFixed(6);

  mapContainer.style.display = 'block';

  try {
    if (modalMap) {
      modalMap.setView([startLat, startLng], 15);
      if (draggableMarker) draggableMarker.setLatLng([startLat, startLng]);
    } else {
      modalMap = L.map('modal-map').setView([startLat, startLng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(modalMap);

      draggableMarker = L.marker([startLat, startLng], { draggable: true }).addTo(modalMap);
      draggableMarker.on('dragend', (event) => {
        const pos = event.target.getLatLng();
        latInput.value = pos.lat.toFixed(6);
        lngInput.value = pos.lng.toFixed(6);
      });
    }
  } catch (err) {
    console.error('map error', err);
    mapContainer.innerHTML = '<p style="color:red;text-align:center;">เกิดข้อผิดพลาดในการโหลดแผนที่</p>';
  }
}

// ================== ดึง POI จาก edge function ==================
function getFallbackPoi(baseLat, baseLng) {
  return [
    {
      name: 'ตลาดสดสุราษฎร์',
      type: 'market',
      lat: baseLat ? Number(baseLat) + 0.002 : 9.1337,
      lng: baseLng ? Number(baseLng) + 0.002 : 99.3325,
      distance_km: 0.25,
      __saved: false
    },
    {
      name: 'โรงเรียนสุราษฎร์พิทยา (ใกล้เคียง)',
      type: 'school',
      lat: baseLat ? Number(baseLat) + 0.0015 : 9.1337,
      lng: baseLng ? Number(baseLng) - 0.001 : 99.3325,
      distance_km: 0.4,
      __saved: false
    },
    {
      name: 'Tesco / Lotus ใกล้บ้าน',
      type: 'convenience',
      lat: baseLat ? Number(baseLat) - 0.0015 : 9.1337,
      lng: baseLng ? Number(baseLng) + 0.0015 : 99.3325,
      distance_km: 0.6,
      __saved: false
    }
  ];
}

// ✅ Landmark สำคัญสุราษฎร์ธานี (ของกุ้ง) — เดิมของกุ้ง
const PRAWEENA_LANDMARKS = [
  { name: 'โรงพยาบาลสุราษฎร์ธานี', type: 'hospital', lat: 9.1237537, lng: 99.3100007 },
  { name: 'โรงพยาบาลศรีวิชัย สุราษฎร์ธานี', type: 'hospital', lat: 9.1154684, lng: 99.3091824 },
  { name: 'ตลาดสำเภาทอง', type: 'market', lat: 9.132751, lng: 99.324087 },
  { name: 'ตลาดสดเทศบาลนครสุราษฎร์ธานี', type: 'market', lat: 9.1414417, lng: 99.3235889 },
  { name: 'โรงเรียนสุราษฎร์ธานี', type: 'school', lat: 9.133571, lng: 99.3299882 },
  { name: 'โรงเรียนสุราษฎร์พิทยา', type: 'school', lat: 9.141851, lng: 99.3261057 },
  { name: 'ที่ว่าการอำเภอเมืองสุราษฎร์ธานี', type: 'government', lat: 9.1360563, lng: 99.3202931 },
  { name: 'ศาลหลักเมืองสุราษฎร์ธานี', type: 'tourism', lat: 9.1391623, lng: 99.3216506 },
  { name: 'Central Suratthani', type: 'mall', lat: 9.1095245, lng: 99.30216 },
];

function injectPraweenaLandmarks(baseLat, baseLng, currentList = []) {
  if (!Number.isFinite(baseLat) || !Number.isFinite(baseLng)) {
    return currentList;
  }
  const fixed = PRAWEENA_LANDMARKS.map(lm => ({
    ...lm,
    distance_km: kmDistance(baseLat, baseLng, lm.lat, lm.lng),
    __saved: false,
  }));

  const map = new Map();
  currentList.forEach(p => {
    const k = (p.name || '').trim().toLowerCase();
    if (!map.has(k)) map.set(k, p);
  });
  fixed.forEach(p => {
    const k = (p.name || '').trim().toLowerCase();
    if (!map.has(k)) map.set(k, p);
  });

  return Array.from(map.values())
    .sort((a, b) => (a.distance_km || 999) - (b.distance_km || 999));
}

// ดึง POI แนะนำ
async function fetchNearbyPOIInline(lat, lng) {
  const listEl = document.getElementById('poi-candidate-list');
  if (listEl) {
    listEl.innerHTML = '<li style="color:#6b7280;">กำลังค้นหาสถานที่ใกล้เคียง...</li>';
  }

  const baseLat = Number(lat);
  const baseLng = Number(lng);

  if (!Number.isFinite(baseLat) || !Number.isFinite(baseLng)) {
    poiCandidatesInline = [];
    renderPOIInlineList();
    return;
  }

  try {
    const { data, error } = await supabase.functions.invoke('fill_poi', {
      body: {
        lat: baseLat,
        lng: baseLng,
        preview: true,
        radius_m: 10000,
        limit: 60
      }
    });
    if (error) throw error;
    let items = data?.items || [];
    items = items
      .map((p) => {
        const plat = Number(p.lat);
        const plng = Number(p.lng);
        let dist = p.distance_km;
        if ((!dist || isNaN(dist)) && Number.isFinite(plat) && Number.isFinite(plng)) {
          dist = kmDistance(baseLat, baseLng, plat, plng);
        }
        return { ...p, distance_km: dist };
      })
      .filter((p) => typeof p.distance_km === 'number' && p.distance_km <= 10)
      .sort((a, b) => (a.distance_km || 999) - (b.distance_km || 999));

    if (items.length < 15) {
      const fb = getFallbackPoi(baseLat, baseLng);
      const used = new Set(items.map((p) => p.name));
      fb.forEach((p) => {
        if (!used.has(p.name)) items.push(p);
      });
    }

    items = injectPraweenaLandmarks(baseLat, baseLng, items);
    poiCandidatesInline = items;
    renderPOIInlineList();
  } catch (err) {
    console.error('fetchNearbyPOIInline error:', err);
    poiCandidatesInline = getFallbackPoi(baseLat, baseLng);
    renderPOIInlineList();
  }
}

// รวม saved + suggested
function mergePoiLists(savedList = [], suggestedList = []) {
  const out = [];
  const keySet = new Set();
  const makeKey = (p) => {
    const name = (p.name || '').trim().toLowerCase();
    const lat  = Number(p.lat || 0).toFixed(6);
    const lng  = Number(p.lng || 0).toFixed(6);
    return `${name}|${lat}|${lng}`;
  };

  savedList.forEach(p => {
    const k = makeKey(p);
    if (keySet.has(k)) return;
    keySet.add(k);
    out.push({ ...p, __saved: true });
  });

  suggestedList.forEach(p => {
    const k = makeKey(p);
    if (keySet.has(k)) return;
    keySet.add(k);
    out.push({ ...p, __saved: false });
  });

  return out;
}

// โหลด POI ของบ้านนี้
async function loadPoisForProperty(propertyId, baseLat, baseLng) {
  const listEl = document.getElementById('poi-candidate-list');
  if (listEl) {
    listEl.innerHTML = '<li style="color:#6b7280;">กำลังโหลดสถานที่ที่บันทึกไว้...</li>';
  }

  let saved = [];
  if (propertyId) {
    const { data, error } = await supabase
      .from('property_poi')
      .select('id, name, type, lat, lng, distance_km')
      .eq('property_id', propertyId)
      .order('distance_km', { ascending: true });

    if (!error && Array.isArray(data)) {
      saved = data.map(row => ({
        id: row.id,
        name: row.name,
        type: row.type,
        lat: row.lat,
        lng: row.lng,
        distance_km: row.distance_km
      }));
    }
  }

  let suggested = [];
  const latNum = Number(baseLat);
  const lngNum = Number(baseLng);

  if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
    try {
      const { data: sData, error: sErr } = await supabase.functions.invoke('fill_poi', {
        body: { lat: latNum, lng: lngNum, limit: 25, preview: true, radius_m: 10000 },
      });
      if (!sErr && Array.isArray(sData?.items)) {
        suggested = sData.items;
      } else {
        suggested = getFallbackPoi(latNum, lngNum);
      }
    } catch (e) {
      suggested = getFallbackPoi(latNum, lngNum);
    }
  }

  let merged = mergePoiLists(saved, suggested);
  merged = injectPraweenaLandmarks(Number(baseLat), Number(baseLng), merged);
  poiCandidatesInline = merged;
  renderPOIInlineList();
}

// วาดลิสต์ POI
function renderPOIInlineList() {
  const list = document.getElementById('poi-candidate-list');
  if (!list) return;
  clear(list);

  if (!poiCandidatesInline.length) {
    list.innerHTML = '<li style="color:#9ca3af;">ไม่พบสถานที่ใกล้เคียง</li>';
    return;
  }

  poiCandidatesInline.forEach((p, i) => {
    const km = p.distance_km
      ? p.distance_km.toFixed(2)
      : (p.distance_m ? (p.distance_m / 1000).toFixed(2) : '-');

    const li = document.createElement('li');
    li.innerHTML = `
      <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;">
        <input type="checkbox" data-i="${i}" ${p.__saved ? 'checked' : ''}>
        <span>${poiEmoji(p.type)} ${p.name}</span>
        <small style="color:#6b7280;">${p.type || ''} • ${km} กม.</small>
      </label>
    `;
    list.appendChild(li);
  });
}

// บันทึก POI ที่ติ๊ก
async function saveInlinePois(propertyId, baseLat, baseLng) {
  if (!propertyId) return;

  const checked = [];
  $$('#poi-candidate-list input[type=checkbox]:checked').forEach(chk => {
    const idx = Number(chk.dataset.i);
    const poi = poiCandidatesInline[idx];
    if (poi) checked.push(poi);
  });

  await supabase.from('property_poi').delete().eq('property_id', propertyId);

  if (!checked.length) return;

  const rows = checked.map(p => {
    let dist = p.distance_km;
    if (!dist && p.lat && p.lng && baseLat && baseLng) {
      dist = kmDistance(baseLat, baseLng, p.lat, p.lng);
    }
    return {
      property_id: propertyId,
      name: p.name,
      type: p.type,
      lat: p.lat,
      lng: p.lng,
      distance_km: dist || null,
    };
  });

  await supabase.from('property_poi').insert(rows);
}

// ================== Submit ฟอร์ม ==================
async function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;

  const submitBtn = form.querySelector('button[type=submit]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังบันทึก...';
  }

  try {
    const payload = getFormData(form);
    const baseLat = parseFloat(payload.latitude);
    const baseLng = parseFloat(payload.longitude);

    payload.price = Number(payload.price) || 0;
    // ✅ รูป
    payload.gallery = currentGallery;
    payload.cover_url = payload.gallery[0] || null;
    // ✅ youtube
    payload.youtube_video_ids = JSON.stringify(currentYoutube);

    payload.published = !!payload.published;

    const { data, error } = await upsertProperty(payload);
    if (error) throw error;

    const propId = data?.id || payload.id;
    await saveInlinePois(propId, baseLat, baseLng);

    toast('บันทึกข้อมูลสำเร็จ!', 2000, 'success');
    closeModal();
    loadProperties();
  } catch (err) {
    console.error(err);
    toast(err.message || 'บันทึกไม่สำเร็จ', 3000, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'บันทึก';
    }
  }
}

// ================== ลบประกาศ ==================
async function handleDelete(id, title) {
  if (!confirm(`ลบ "${title || 'ประกาศนี้'}" ใช่ไหม?`)) return;
  try {
    const { error } = await removeProperty(id);
    if (error) throw error;
    toast('ลบสำเร็จ', 2000, 'success');
    loadProperties();
  } catch (err) {
    toast(err.message, 3000, 'error');
  }
}

// ================== Modal ==================
function openModal() {
  if (!propertyModal) return;
  propertyModal.classList.add('open');
}
function closeModal() {
  if (!propertyModal) return;
  propertyModal.classList.remove('open');

  if (propertyForm) {
    propertyForm.reset();
    if (propertyForm.elements.id) propertyForm.elements.id.value = '';
  }

const poiList = document.getElementById('poi-candidate-list');
if (poiList) poiList.innerHTML = '';

// เคลียร์สเปก / ทีมช่างในโมดัล
const specsList = document.getElementById('specs-list');
if (specsList) specsList.innerHTML = '';
const contractorsList = document.getElementById('property-contractors-list');
if (contractorsList) contractorsList.innerHTML = '';

// ซ่อนฟอร์มเพิ่มสเปก ถ้าเปิดค้างอยู่
const specFormWrapper = document.getElementById('spec-form-wrapper');
if (specFormWrapper) specFormWrapper.style.display = 'none';

// ซ่อนฟอร์มเพิ่มทีมช่าง ถ้าเปิดค้างอยู่
const contractorFormWrapper = document.getElementById('contractor-form-wrapper');
if (contractorFormWrapper) contractorFormWrapper.style.display = 'none';

// reset รูป / youtube ทุกครั้งที่ปิด
currentGallery = [];
renderGalleryPreview();
currentYoutube = [];
renderYoutubeList();
}


function installModalCloseHandlers() {
  document.querySelectorAll('#property-modal .modal-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal();
    });
  });
  document.querySelectorAll('#property-modal .modal-cancel, #property-modal .btn-cancel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeModal();
    });
  });
  window.addEventListener('click', (e) => {
    if (e.target === propertyModal) {
      closeModal();
    }
  });
}

// ================== เติมฟอร์มตอนแก้ไข ==================
function fillFormFromProperty(p = {}) {
  if (!propertyForm) return;
  const keys = [
    'id', 'title', 'slug', 'price', 'size_text', 'beds', 'baths',
    'parking', 'district', 'province', 'status', 'address',
    'latitude', 'longitude'
  ];
  keys.forEach(k => {
    if (propertyForm.elements[k] !== undefined) {
      propertyForm.elements[k].value = p[k] ?? '';
    }
  });
  if (propertyForm.elements.published) {
    propertyForm.elements.published.checked = !!p.published;
  }

  // ✅ ถ้ามีรูปเก่า โหลดมาให้
  currentGallery = Array.isArray(p.gallery)
    ? p.gallery
    : (typeof p.gallery === 'string' && p.gallery.startsWith('[')
        ? JSON.parse(p.gallery)
        : (p.cover_url ? [p.cover_url] : [])
      );
  renderGalleryPreview();

  // ✅ ถ้ามี youtube เก่า โหลดมาให้
  if (Array.isArray(p.youtube_video_ids)) {
    currentYoutube = p.youtube_video_ids;
  } else if (typeof p.youtube_video_ids === 'string' && p.youtube_video_ids.startsWith('[')) {
    try {
      currentYoutube = JSON.parse(p.youtube_video_ids);
    } catch {
      currentYoutube = [];
    }
  } else {
    currentYoutube = [];
  }
  renderYoutubeList();
}

// ================== โหลดรายการประกาศ ==================
async function loadProperties() {
  const tbody = document.querySelector('#properties-table tbody');
  clear(tbody);
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">กำลังโหลด...</td></tr>';

  try {
    const { data, error } = await listAll();
    if (error) throw error;

    clear(tbody);
    if (!data || !data.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">ไม่มีข้อมูล</td></tr>';
      return;
    }

    data.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${p.title || '-'}</td>
        <td>${formatPrice(Number(p.price) || 0)}</td>
        <td>${p.published ? '✅' : '❌'}</td>
        <td>${p.updated_at ? new Date(p.updated_at).toLocaleDateString('th-TH') : '-'}</td>
        <td>
          <button class="btn btn-secondary edit-btn">แก้ไข</button>
          <button class="btn btn-danger delete-btn">ลบ</button>
        </td>
      `;

      tr.querySelector('.edit-btn').addEventListener('click', async () => {
        openModal();
        fillFormFromProperty(p);
        setTimeout(() => setupModalMap(p.latitude, p.longitude), 80);

        // โหลด POI ที่บันทึกไว้
        await loadPoisForProperty(p.id, p.latitude, p.longitude);

        // โหลดสเปกรีโนเวทของบ้านหลังนี้
        await loadSpecsForProperty(p.id);

        // โหลดทีมช่างของบ้านหลังนี้
        await loadContractorsForProperty(p.id);
      });


      tr.querySelector('.delete-btn').addEventListener('click', () => handleDelete(p.id, p.title));

      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="5" style="color:red;text-align:center;">โหลดไม่สำเร็จ</td></tr>';
  }
}

// ================== Init ==================
document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();
  setupNav();
  setupMobileNav();
  await signOutIfAny();

  installModalCloseHandlers();

  // ปุ่มเพิ่มบ้าน
  addPropertyBtn?.addEventListener('click', () => {
    propertyForm?.reset();
    if (propertyForm?.elements.id) propertyForm.elements.id.value = '';
    poiCandidatesInline = [];
    renderPOIInlineList();
    currentGallery = [];
    renderGalleryPreview();
    currentYoutube = [];
    renderYoutubeList();
    openModal();
    setTimeout(() => setupModalMap(), 80);
  });

  // ฟอร์มบันทึก
  propertyForm?.addEventListener('submit', handleSubmit);

  // === อัปโหลดรูปหน้าปก / แกลลอรี่ ===
  const coverInput = document.getElementById('cover-upload');
  if (coverInput) {
    coverInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        toast('กำลังอัปโหลดรูปหน้าปก...', 2000, 'info');
        const url = await uploadToCloudinary(file);
        // ใส่เป็นรูปแรก
        currentGallery = [url, ...currentGallery];
        renderGalleryPreview();
        toast('อัปโหลดรูปหน้าปกสำเร็จ', 2000, 'success');
      } catch (err) {
        console.error(err);
        toast(err.message, 3000, 'error');
      } finally {
        coverInput.value = '';
      }
    });
  }

  const galleryInput = document.getElementById('gallery-upload');
  if (galleryInput) {
    galleryInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      for (const file of files) {
        try {
          toast(`กำลังอัปโหลด ${file.name} ...`, 1500, 'info');
          const url = await uploadToCloudinary(file);
          currentGallery.push(url);
          renderGalleryPreview();
        } catch (err) {
          console.error(err);
          toast('อัปโหลดบางไฟล์ไม่สำเร็จ: ' + err.message, 3000, 'error');
        }
      }
      galleryInput.value = '';
      toast('อัปโหลดรูปแกลลอรี่สำเร็จ', 2000, 'success');
    });
  }

  // === YouTube ===
  const ytInput = document.getElementById('youtube-input');
  const ytAddBtn = document.getElementById('youtube-add-btn');
  if (ytAddBtn && ytInput) {
    ytAddBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const val = normalizeYoutubeIdOrUrl(ytInput.value);
      if (!val) return;
      currentYoutube.push(val);
      ytInput.value = '';
      renderYoutubeList();
    });
  }

  setupRenovationTabs();
  setupAddSpecButton();
  setupAddPropertyContractorButton();

  await loadProperties();
});

async function loadSpecsForProperty(propertyId) {
  const container = document.getElementById('specs-list');
  if (!container) return;

  // แสดงสถานะกำลังโหลด
  container.innerHTML = `
    <p style="color:#6b7280;margin:0.25rem 0;">
      กำลังโหลดข้อมูลสเปกรีโนเวท...
    </p>
  `;

  if (!propertyId) {
    container.innerHTML = `
      <p style="color:#9ca3af;">กรุณาบันทึกประกาศก่อน จึงจะเพิ่มสเปกได้</p>
    `;
    return;
  }

  try {
    const specs = await listSpecsByProperty(propertyId);

    if (!specs.length) {
      container.innerHTML = `
        <p style="color:#9ca3af;">ยังไม่มีสเปกรีโนเวทสำหรับบ้านหลังนี้</p>
      `;
      return;
    }

    const table = document.createElement('table');
    table.className = 'table-compact';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>โซน</th>
        <th>ประเภท</th>
        <th>ยี่ห้อ / รุ่น</th>
        <th>เบอร์สี / โค้ด</th>
        <th>ร้าน / ผู้ขาย</th>
        <th>หมายเหตุ</th>
        <th></th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    specs.forEach((s) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${s.zone || ''}</td>
        <td>${s.item_type || ''}</td>
        <td>${[s.brand, s.model_or_series].filter(Boolean).join(' / ')}</td>
        <td>${s.color_code || ''}</td>
        <td>${s.supplier || ''}</td>
        <td>${s.note || ''}</td>
        <td style="text-align:right;">
          <button data-id="${s.id}" class="btn btn-xs btn-danger spec-delete-btn">ลบ</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);

    container.querySelectorAll('.spec-delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!id) return;
        if (!confirm('ต้องการลบสเปกนี้หรือไม่?')) return;
        await deleteSpec(id);
        await loadSpecsForProperty(propertyId);
      });
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <p style="color:#b91c1c;">
        โหลดสเปกไม่สำเร็จ: ${err.message || err}
      </p>
    `;
  }
}

function getCurrentPropertyId() {
  const form = document.getElementById('property-form');
  if (!form) return null;

  const raw = form.elements.id?.value;
  if (!raw) return null;

  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function setupRenovationTabs() {
  const modal = document.getElementById('property-modal');
  if (!modal) return;

  const buttons = modal.querySelectorAll('.card-header .tab-button');
  const panels = modal.querySelectorAll('.tab-panel');

  buttons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tab = btn.dataset.tab;

      buttons.forEach(b => b.classList.toggle('active', b === btn));
      panels.forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));

      const propertyId = getCurrentPropertyId();
      if (!propertyId) {
        // ยังไม่ได้บันทึกประกาศ
        return;
      }

      if (tab === 'specs') {
        await loadSpecsForProperty(propertyId);
      } else if (tab === 'contractors') {
        await loadContractorsForProperty(propertyId);
      }
    });
  });
}

function setupAddSpecButton() {
  const btn = document.getElementById('btn-add-spec');
  const wrapper = document.getElementById('spec-form-wrapper');
  if (!btn || !wrapper) return;

  const zoneInput = document.getElementById('spec-zone');
  const itemTypeInput = document.getElementById('spec-item-type');
  const brandInput = document.getElementById('spec-brand');
  const modelInput = document.getElementById('spec-model');
  const colorInput = document.getElementById('spec-color');
  const supplierInput = document.getElementById('spec-supplier');
  const noteInput = document.getElementById('spec-note');
  const saveBtn = document.getElementById('spec-save');
  const cancelBtn = document.getElementById('spec-cancel');

  // เปิดฟอร์มเมื่อกดปุ่ม "+ เพิ่มสเปก"
  btn.addEventListener('click', () => {
    const propertyId = getCurrentPropertyId();
    if (!propertyId) {
      alert('กรุณาบันทึกประกาศก่อน แล้วจึงเพิ่มสเปกได้');
      return;
    }

    // เคลียร์ค่าเก่า
    zoneInput.value = '';
    itemTypeInput.value = '';
    brandInput.value = '';
    modelInput.value = '';
    colorInput.value = '';
    supplierInput.value = '';
    noteInput.value = '';

    wrapper.style.display = 'block';
    zoneInput.focus();
  });

  // ปุ่มยกเลิก
  cancelBtn?.addEventListener('click', () => {
    wrapper.style.display = 'none';
  });

  // ปุ่มบันทึกสเปก
  saveBtn?.addEventListener('click', async () => {
    const propertyId = getCurrentPropertyId();
    if (!propertyId) {
      alert('กรุณาบันทึกประกาศก่อน แล้วจึงเพิ่มสเปกได้');
      return;
    }

    const zone = zoneInput.value.trim();
    if (!zone) {
      alert('กรุณาระบุโซน');
      zoneInput.focus();
      return;
    }

    try {
      await upsertSpec({
        property_id: propertyId,
        zone,
        item_type: itemTypeInput.value.trim(),
        brand: brandInput.value.trim(),
        model_or_series: modelInput.value.trim(),
        color_code: colorInput.value.trim(),
        supplier: supplierInput.value.trim(),
        note: noteInput.value.trim(),
      });

      wrapper.style.display = 'none';
      await loadSpecsForProperty(propertyId);
    } catch (err) {
      console.error(err);
      alert('บันทึกสเปกไม่สำเร็จ: ' + (err.message || err));
    }
  });
}

async function loadContractorsForProperty(propertyId) {
  const container = document.getElementById('property-contractors-list');
  if (!container) return;

  container.innerHTML = `
    <p style="color:#6b7280;margin:0.25rem 0;">
      กำลังโหลดข้อมูลทีมช่าง...
    </p>
  `;

  if (!propertyId) {
    container.innerHTML = `
      <p style="color:#9ca3af;">กรุณาบันทึกประกาศก่อน จึงจะเพิ่มทีมช่างได้</p>
    `;
    return;
  }

  try {
    const links = await listContractorsForProperty(propertyId);

    if (!links.length) {
      container.innerHTML = `
        <p style="color:#9ca3af;">ยังไม่ได้ผูกทีมช่างกับบ้านหลังนี้</p>
      `;
      return;
    }

    const table = document.createElement('table');
    table.className = 'table-compact';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>ชื่อช่าง</th>
        <th>สายงาน</th>
        <th>เบอร์ติดต่อ</th>
        <th>ขอบเขตงาน</th>
        <th>รับประกัน (เดือน)</th>
        <th></th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    links.forEach((link) => {
      const c = link.contractor || {};
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.name || ''}</td>
        <td>${c.trade || ''}</td>
        <td>${c.phone || ''}</td>
        <td>${link.scope || ''}</td>
        <td>${link.warranty_months ?? ''}</td>
        <td style="text-align:right;">
          <button data-id="${link.id}" class="btn btn-xs btn-danger contractor-delete-btn">ลบ</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);

    container.querySelectorAll('.contractor-delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!id) return;
        if (!confirm('ต้องการลบทีมช่างนี้ออกจากบ้านหลังนี้หรือไม่?')) return;
        await deletePropertyContractor(id);
        await loadContractorsForProperty(propertyId);
      });
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <p style="color:#b91c1c;">
        โหลดทีมช่างไม่สำเร็จ: ${err.message || err}
      </p>
    `;
  }
}

function setupAddPropertyContractorButton() {
  const btn = document.getElementById('btn-add-property-contractor');
  const wrapper = document.getElementById('contractor-form-wrapper');
  if (!btn || !wrapper) return;

  const nameInput = document.getElementById('contractor-name');
  const tradeInput = document.getElementById('contractor-trade');
  const phoneInput = document.getElementById('contractor-phone');
  const scopeInput = document.getElementById('contractor-scope');
  const warrantyInput = document.getElementById('contractor-warranty');
  const saveBtn = document.getElementById('contractor-save');
  const cancelBtn = document.getElementById('contractor-cancel');

  // เปิดฟอร์มเมื่อกด "+ เพิ่มทีมช่าง"
  btn.addEventListener('click', () => {
    const propertyId = getCurrentPropertyId();
    if (!propertyId) {
      alert('กรุณาบันทึกประกาศก่อน แล้วจึงเพิ่มทีมช่างได้');
      return;
    }

    nameInput.value = '';
    tradeInput.value = '';
    phoneInput.value = '';
    scopeInput.value = '';
    warrantyInput.value = '';

    wrapper.style.display = 'block';
    nameInput.focus();
  });

  // ยกเลิก
  cancelBtn?.addEventListener('click', () => {
    wrapper.style.display = 'none';
  });

  // บันทึกทีมช่าง
  saveBtn?.addEventListener('click', async () => {
    const propertyId = getCurrentPropertyId();
    if (!propertyId) {
      alert('กรุณาบันทึกประกาศก่อน แล้วจึงเพิ่มทีมช่างได้');
      return;
    }

    const name = nameInput.value.trim();
    const trade = tradeInput.value.trim();
    const scope = scopeInput.value.trim();
    const phone = phoneInput.value.trim();
    const warrantyStr = warrantyInput.value.trim();

    if (!name) {
      alert('กรุณากรอกชื่อช่าง');
      nameInput.focus();
      return;
    }
    if (!trade) {
      alert('กรุณากรอกสายงานของช่าง');
      tradeInput.focus();
      return;
    }
    if (!scope) {
      alert('กรุณากรอกขอบเขตงานของช่างในบ้านหลังนี้');
      scopeInput.focus();
      return;
    }

    const warranty = warrantyStr ? Number(warrantyStr) : null;

    try {
      const contractor = await upsertContractor({
        name,
        phone,
        trade,
      });

      await upsertPropertyContractor({
        property_id: propertyId,
        contractor_id: contractor.id,
        scope,
        warranty_months: warranty,
      });

      wrapper.style.display = 'none';
      await loadContractorsForProperty(propertyId);
    } catch (err) {
      console.error(err);
      alert('บันทึกทีมช่างไม่สำเร็จ: ' + (err.message || err));
    }
  });
}
