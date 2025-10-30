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
const propertiesTableBody = document.querySelector('#properties-table tbody');

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

// ============================================================
// Map ในโมดัล
// ============================================================
function setupModalMap(lat, lng) {
  if (!propertyForm) return;

  let latInput = propertyForm.elements.latitude;
  let lngInput = propertyForm.elements.longitude;

  // ถ้าใน form ไม่มี input lat/lng ให้สร้างซ่อนไว้เลย
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
  // fallback → สุราษฎร์ฯ
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
        // ถ้าลากตำแหน่งใหม่ แล้วอยาก refresh POI อัตโนมัติ ก็เรียกตรงนี้ได้
        // fetchNearbyPOIInline(pos.lat, pos.lng);
      });
    }
  } catch (err) {
    console.error('map error', err);
    mapContainer.innerHTML = '<p style="color:red;text-align:center;">เกิดข้อผิดพลาดในการโหลดแผนที่</p>';
  }
}

// ============================================================
// ดึง POI จากฟังก์ชัน (ค้นรอบบ้าน 5 จุด) — สำหรับตอนเพิ่ม
// ============================================================
async function fetchNearbyPOIInline(lat, lng) {
  const listEl = document.getElementById('poi-candidate-list');
  if (listEl) {
    listEl.innerHTML = '<li style="color:#6b7280;">กำลังค้นหาสถานที่ใกล้เคียง...</li>';
  }
  try {
    const { data, error } = await supabase.functions.invoke('fill_poi', {
      body: { lat, lng, preview: true, limit: 5 }
    });
    if (error) throw error;
    poiCandidatesInline = data?.items || [];
    renderPOIInlineList();
  } catch (err) {
    console.error(err);
    toast('ค้นหาสถานที่ใกล้เคียงไม่สำเร็จ', 2500, 'error');
    poiCandidatesInline = [];
    renderPOIInlineList();
  }
}

// รวมรายการ POI ที่ "เคยบันทึก" + "ระบบแนะนำ" แล้วตัดซ้ำ
function mergePoiLists(savedList = [], suggestedList = []) {
  const out = [];
  const keySet = new Set();

  // ตัวช่วยสร้าง key กันซ้ำ (ใช้ชื่อ+lat+lng)
  const makeKey = (p) => {
    const name = (p.name || '').trim().toLowerCase();
    const lat  = Number(p.lat).toFixed(6);
    const lng  = Number(p.lng).toFixed(6);
    return `${name}|${lat}|${lng}`;
  };

  // 1) ใส่ที่บันทึกจริงก่อน (พวกนี้ต้องติ๊ก)
  savedList.forEach(p => {
    const k = makeKey(p);
    if (keySet.has(k)) return;
    keySet.add(k);
    out.push({
      ...p,
      __saved: true,   // <<== ตัวบอกว่ามาจากฐาน
    });
  });

  // 2) ใส่ที่ระบบแนะนำ (แต่ยังไม่บันทึกจริง)
  suggestedList.forEach(p => {
    const k = makeKey(p);
    if (keySet.has(k)) return;
    keySet.add(k);
    out.push({
      ...p,
      __saved: false,
    });
  });

  return out;
}

// ============================================================
// โหลด POI ที่เคยบันทึกของบ้านนี้ — สำหรับตอนแก้ไข
// ============================================================
async function loadPoisForProperty(propertyId, baseLat, baseLng) {
  const listEl = document.getElementById('poi-candidate-list');
  if (listEl) {
    listEl.innerHTML = '<li style="color:#6b7280;">กำลังโหลดสถานที่ที่บันทึกไว้...</li>';
  }

  // 1) ดึงจากตารางจริงก่อน (อันนี้คือที่เคยติ๊กแล้ว)
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

  // 2) เรียก edge function มาแนะนำเพิ่ม (แต่ไม่บังคับ ถ้าเรียก fail ก็ยังโชว์ของเดิม)
  let suggested = [];
  if (Number.isFinite(Number(baseLat)) && Number.isFinite(Number(baseLng))) {
    try {
      const { data: sData, error: sErr } = await supabase.functions.invoke('fill_poi', {
        body: { lat: baseLat, lng: baseLng, preview: true, limit: 5 }
      });
      if (!sErr && Array.isArray(sData?.items)) {
        suggested = sData.items;
      }
    } catch (e) {
      // ถ้าเรียกไม่สำเร็จก็แค่ใช้ saved อย่างเดียว
    }
  }

  // 3) รวมสองกอง แล้วเก็บลง state กลาง
  poiCandidatesInline = mergePoiLists(saved, suggested);

  // 4) วาดใหม่
  renderPOIInlineList();
}


// ============================================================
// แสดงลิสต์ POI ในฟอร์ม
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
// บันทึก POI ที่ติ๊กไว้ลงตาราง property_poi
// ============================================================
async function saveInlinePois(propertyId, baseLat, baseLng) {
  if (!propertyId) return;

  const checked = [];
  $$('#poi-candidate-list input[type=checkbox]:checked').forEach(chk => {
    const idx = Number(chk.dataset.i);
    const poi = poiCandidatesInline[idx];
    if (poi) checked.push(poi);
  });

  // ไม่ได้เลือกอะไร → ไม่ต้องแตะ POI
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
      distance_km: dist || null
    };
  });

  // ลบทิ้งแล้วลงใหม่
  await supabase.from('property_poi').delete().eq('property_id', propertyId);
  await supabase.from('property_poi').insert(rows);
}

// ============================================================
// ฟอร์ม → Submit
// ============================================================
async function handleSubmit(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type=submit]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังบันทึก...';
  }

  try {
    const payload = getFormData(e.target);
    payload.price = Number(payload.price) || 0;
    payload.gallery = currentGallery;
    payload.cover_url = payload.gallery[0] || null;
    payload.published = !!payload.published;

    const { data, error } = await upsertProperty(payload);
    if (error) throw error;

    const propId = data?.id || payload.id;
    await saveInlinePois(propId, payload.latitude, payload.longitude);

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
// Modal open/close
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

  // ล้าง POI ลิสต์
  const poiList = document.getElementById('poi-candidate-list');
  if (poiList) poiList.innerHTML = '';
}

// ผูกปุ่มปิดทุกแบบ
function installModalCloseHandlers() {
  // ปุ่ม X
  document.querySelectorAll('#property-modal .modal-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal();
    });
  });

  // ปุ่มยกเลิก
  document.querySelectorAll('#property-modal .modal-cancel, #property-modal .btn-cancel, #property-modal [data-dismiss="modal"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeModal();
    });
  });

  // คลิกนอกกล่อง
  window.addEventListener('click', (e) => {
    if (e.target === propertyModal) {
      closeModal();
    }
  });
}

// ============================================================
// เติมค่าลงฟอร์มตอนแก้ไข
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
// โหลดตารางประกาศ
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

        // เติมค่าลงฟอร์ม
        fillFormFromProperty(p);

        // เปิดแผนที่
        setTimeout(() => {
          setupModalMap(p.latitude, p.longitude);
        }, 100);

        // โหลด POI ที่เคยบันทึก
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

  // ปุ่มเพิ่ม
  addPropertyBtn?.addEventListener('click', () => {
    if (propertyForm) {
      propertyForm.reset();
      if (propertyForm.elements.id) propertyForm.elements.id.value = '';
    }
    poiCandidatesInline = [];
    renderPOIInlineList();
    openModal();
    setTimeout(() => setupModalMap(), 100);
  });

  // submit form
  propertyForm?.addEventListener('submit', handleSubmit);

  // โหลดรายการ
  await loadProperties();
});
