// js/pages/dashboard.page.js
//------------------------------------------------------------
// Praweena Property Dashboard Page
// เลือกตำแหน่งบ้าน + ดึงสถานที่ใกล้เคียง (POI)
//------------------------------------------------------------

import { setupMobileNav } from '../ui/mobileNav.js';
import { protectPage } from '../auth/guard.js';
import { signOutIfAny } from '../auth/auth.js';
import { listAll, upsertProperty, removeProperty } from '../services/propertiesService.js';
import { setupNav } from '../utils/config.js';
import { formatPrice } from '../utils/format.js';
import { getFormData } from '../ui/forms.js';
import { el, $, $$, clear } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { supabase } from '../utils/supabaseClient.js';

// ============================================================
// DOM หลัก
// ============================================================
const propertyModal = document.getElementById('property-modal');
const propertyForm  = document.getElementById('property-form');
const addPropertyBtn = document.getElementById('add-property-btn');

// ============================================================
// State
// ============================================================
let modalMap = null;
let draggableMarker = null;
let currentGallery = [];
let coverUrl = null;
let poiCandidatesInline = []; // รายการ POI ที่ขึ้นในฟอร์ม

// ============================================================
// Utils
// ============================================================
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

// fallback POI ถ้าเรียก edge function ไม่ผ่าน
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

// ============================================================
// Map ในโมดัล
// ============================================================
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

// ============================================================
// ดึง POI จาก edge function
// ============================================================
async function fetchNearbyPOIInline(lat, lng) {
  const listEl = document.getElementById('poi-candidate-list');
  if (listEl) {
    listEl.innerHTML = '<li style="color:#6b7280;">กำลังค้นหาสถานที่ใกล้เคียง...</li>';
  }

  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    console.warn('พิกัดไม่ถูกต้อง ตอน fetchNearbyPOIInline');
    poiCandidatesInline = [];
    renderPOIInlineList();
    return;
  }

  try {
const { data, error } = await supabase.functions.invoke('fill_poi', {
  body: { lat, lng, limit: 5, preview: true }
});


    if (error) throw error;

    poiCandidatesInline = data?.items || [];
    renderPOIInlineList();
  } catch (err) {
    console.error('fetchNearbyPOIInline error:', err);
    // ถ้าเรียกไม่ได้ ให้ใช้ fallback
    poiCandidatesInline = getFallbackPoi(latNum, lngNum);
    toast('โหลดจากระบบไม่สำเร็จ แสดงรายการตัวอย่างให้ก่อน', 2500, 'error');
    renderPOIInlineList();
  }
}

// ============================================================
// รวม saved + suggested
// ============================================================
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

// ============================================================
// โหลด POI ของบ้านนี้ตอนกด "แก้ไข"
// ============================================================
async function loadPoisForProperty(propertyId, baseLat, baseLng) {
  const listEl = document.getElementById('poi-candidate-list');
  if (listEl) {
    listEl.innerHTML = '<li style="color:#6b7280;">กำลังโหลดสถานที่ที่บันทึกไว้...</li>';
  }

  // 1) โหลดของที่บันทึกในตาราง
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

  // 2) ลองเรียก edge function (ให้มันเป็น preview เสมอ)
  let suggested = [];
  const latNum = Number(baseLat);
  const lngNum = Number(baseLng);

  if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
    try {
      const { data: sData, error: sErr } = await supabase.functions.invoke('fill_poi', {
        body: { lat: latNum, lng: lngNum, limit: 5, preview: true },  // 👈 เพิ่ม preview: true
      });
      if (!sErr && Array.isArray(sData?.items)) {
        suggested = sData.items;
      } else {
        suggested = getFallbackPoi(latNum, lngNum);
      }
    } catch (e) {
      console.warn('แนะนำ POI ไม่สำเร็จ → ใช้ fallback', e);
      suggested = getFallbackPoi(latNum, lngNum);
    }
  }

  // 3) รวมสองชุด
  poiCandidatesInline = mergePoiLists(saved, suggested);
  renderPOIInlineList();
}


// ============================================================
// วาดลิสต์ POI
// ============================================================
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

// ============================================================
// บันทึก POI ที่ติ๊กในฟอร์ม dashboard
// ============================================================
async function saveInlinePois(propertyId, baseLat, baseLng) {
  if (!propertyId) return;

  // เก็บรายการที่ติ๊กไว้
  const checked = [];
  $$('#poi-candidate-list input[type=checkbox]:checked').forEach(chk => {
    const idx = Number(chk.dataset.i);
    const poi = poiCandidatesInline[idx];
    if (poi) checked.push(poi);
  });

  // ลบของเก่าก่อน
  await supabase.from('property_poi').delete().eq('property_id', propertyId);

  // ถ้าไม่ติ๊กอะไรเลย ก็จบแค่นี้
  if (!checked.length) return;

  const rows = checked.map(p => {
    const plat = parseFloat(p.lat);
    const plng = parseFloat(p.lng);

    // คำนวณระยะถ้าพิกัดครบ
    let dist = p.distance_km;
    if (
      (!dist || isNaN(dist)) &&
      Number.isFinite(baseLat) &&
      Number.isFinite(baseLng) &&
      Number.isFinite(plat) &&
      Number.isFinite(plng)
    ) {
      dist = kmDistance(baseLat, baseLng, plat, plng);
    }

    return {
      property_id: propertyId,
      name: p.name,
      type: p.type,
      lat: Number.isFinite(plat) ? plat : null,
      lng: Number.isFinite(plng) ? plng : null,
      distance_km: dist ?? null,
    };
  });

  // insert รอบเดียวพอ
  await supabase.from('property_poi').insert(rows);
}

// ====== map utils (ใช้คำนวณระยะทาง) ======
const mapUtils = {
  // ระยะทางระหว่าง 2 พิกัด (กม.)
  distanceKm(lat1, lon1, lat2, lon2) {
    const toRad = v => v * Math.PI / 180;
    const R = 6371; // โลก กม.
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
};

// ============================================================
// Submit ฟอร์ม
// ============================================================
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

    // เอาพิกัดจากฟอร์ม (ชื่อ field จริง)
    const baseLat = parseFloat(payload.latitude);
    const baseLng = parseFloat(payload.longitude);

    // ------- บันทึกประกาศก่อน -------
    payload.price = Number(payload.price) || 0;
    payload.gallery = currentGallery;
    payload.cover_url = payload.gallery[0] || null;
    payload.published = !!payload.published;

    const { data, error } = await upsertProperty(payload);
    if (error) throw error;

    const propId = data?.id || payload.id;

    // ------- แล้วค่อยบันทึก POI ที่ติ๊ก -------
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

// ============================================================
// ลบประกาศ
// ============================================================
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

// ============================================================
// Modal
// ============================================================
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

// ============================================================
// เติมฟอร์มตอนแก้ไข
// ============================================================
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
}

// ============================================================
// โหลดรายการประกาศ
// ============================================================
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

      // แก้ไข
      tr.querySelector('.edit-btn').addEventListener('click', async () => {
        openModal();
        fillFormFromProperty(p);
        setTimeout(() => setupModalMap(p.latitude, p.longitude), 80);
        await loadPoisForProperty(p.id, p.latitude, p.longitude);
      });

      // ลบ
      tr.querySelector('.delete-btn').addEventListener('click', () => handleDelete(p.id, p.title));

      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="5" style="color:red;text-align:center;">โหลดไม่สำเร็จ</td></tr>';
  }
}

// ============================================================
// Init
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();
  setupNav();
  setupMobileNav();
  await signOutIfAny();

  installModalCloseHandlers();

  addPropertyBtn?.addEventListener('click', () => {
    propertyForm?.reset();
    if (propertyForm?.elements.id) propertyForm.elements.id.value = '';
    poiCandidatesInline = [];
    renderPOIInlineList();
    openModal();
    setTimeout(() => setupModalMap(), 80);
  });

  propertyForm?.addEventListener('submit', handleSubmit);

  await loadProperties();
});
