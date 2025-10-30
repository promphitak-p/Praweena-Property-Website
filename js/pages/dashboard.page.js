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
// DOM หลักที่ต้องมีไว้ก่อน
// ============================================================
const propertyForm   = $('#property-form');         // ← ตัวนี้แหละที่หาย
const propertyModal  = $('#property-modal');
const addPropertyBtn = $('#add-property-btn');
const propsTableBody = $('#properties-table tbody');

// ============================================================
// Global state
// ============================================================
let modalMap = null;
let draggableMarker = null;
let currentGallery = [];
let coverUrl = null;
let poiCandidatesInline = []; // เก็บสถานที่ใกล้เคียงที่โหลดจากฟังก์ชัน fill_poi

//------------------------------------------------------------
// Utility
//------------------------------------------------------------
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
  const t = type.toLowerCase();
  if (t.includes('school')) return '🏫';
  if (t.includes('hospital') || t.includes('clinic')) return '🏥';
  if (t.includes('government') || t.includes('office')) return '🏛️';
  if (t.includes('market') || t.includes('shop')) return '🛒';
  return '📍';
}

//------------------------------------------------------------
// Setup modal map (เลือกพิกัดบ้าน)
//------------------------------------------------------------
function setupModalMap(lat, lng) {
  if (!propertyForm) return;

  // 1) หา / หรือถ้าไม่มีให้สร้าง input latitude, longitude
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

  // 2) container แผนที่
  const mapContainer = $('#modal-map');
  if (!mapContainer) return;

  // 3) ค่าตั้งต้น ถ้าไม่ได้ส่งมาก็ใช้พิกัดสุราษฯ
  let startLat = parseFloat(lat);
  let startLng = parseFloat(lng);
  startLat = !isNaN(startLat) ? startLat : 9.1337;
  startLng = !isNaN(startLng) ? startLng : 99.3325;

  // ใส่ค่าให้ input (ตอนนี้ไม่ error แล้วเพราะเราสร้างแน่ ๆ)
  latInput.value = startLat.toFixed(6);
  lngInput.value = startLng.toFixed(6);

  // 4) แสดงแผนที่
  mapContainer.style.display = 'block';

  try {
    if (modalMap) {
      // ถ้าเคยสร้างแล้ว แค่ย้ายไปจุดใหม่
      modalMap.setView([startLat, startLng], 15);
      if (draggableMarker) {
        draggableMarker.setLatLng([startLat, startLng]);
      }
    } else {
      // ยังไม่เคยสร้าง → สร้างใหม่
      modalMap = L.map('modal-map').setView([startLat, startLng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(modalMap);

      // หมุดลากได้
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

//------------------------------------------------------------
// ดึงสถานที่ใกล้เคียงจาก Edge Function fill_poi
//------------------------------------------------------------
async function fetchNearbyPOIInline(lat, lng) {
  const poiList = $('#poi-candidate-list');
  poiList.innerHTML = '<li style="color:#6b7280;">กำลังค้นหาสถานที่ใกล้เคียง...</li>';
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

//------------------------------------------------------------
// แสดงรายการสถานที่ใกล้เคียง
//------------------------------------------------------------
function renderPOIInlineList() {
  const list = $('#poi-candidate-list');
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
        <input type="checkbox" data-i="${i}" checked>
        <span>${poiEmoji(p.type)} ${p.name}</span>
        <small style="color:#6b7280;">${p.type || ''} • ${km} กม.</small>
      </label>
    `;
    list.appendChild(li);
  });
}

//------------------------------------------------------------
// บันทึกสถานที่ใกล้เคียงลง property_poi
//------------------------------------------------------------
async function saveInlinePois(propertyId, baseLat, baseLng) {
  if (!propertyId) return;
  const selected = [];
  $$('#poi-candidate-list input[type=checkbox]:checked').forEach(chk => {
    const i = Number(chk.dataset.i);
    const p = poiCandidatesInline[i];
    if (p) selected.push(p);
  });

  if (!selected.length) return;

  const rows = selected.map(p => {
    let dist = p.distance_km;
    if (!dist && p.lat && p.lng)
      dist = kmDistance(baseLat, baseLng, p.lat, p.lng);
    return {
      property_id: propertyId,
      name: p.name,
      type: p.type,
      lat: p.lat,
      lng: p.lng,
      distance_km: dist || null
    };
  });

  await supabase.from('property_poi').delete().eq('property_id', propertyId);
  await supabase.from('property_poi').insert(rows);
}

//------------------------------------------------------------
// CRUD: Add/Edit/Delete Property
//------------------------------------------------------------
async function handleSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'กำลังบันทึก...';

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
    toast(err.message, 3000, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'บันทึก';
  }
}

async function handleDelete(id, title) {
  if (!confirm(`ลบ "${title}" ใช่ไหม?`)) return;
  try {
    const { error } = await removeProperty(id);
    if (error) throw error;
    toast('ลบสำเร็จ', 2000, 'success');
    loadProperties();
  } catch (err) {
    toast(err.message, 3000, 'error');
  }
}

//------------------------------------------------------------
// Modal open/close
//------------------------------------------------------------
function openModal() {
  $('#property-modal').classList.add('open');
}

function closeModal() {
  if (!propertyModal) return;
  propertyModal.classList.remove('open');

  if (propertyForm) {
    propertyForm.reset();
    // ล้าง id ด้วย
    if (propertyForm.elements.id) propertyForm.elements.id.value = '';
  }

  // ล้าง POI ที่แสดงในฟอร์ม
  poiCandidatesInline = [];
  const list = $('#poi-candidate-list');
  if (list) list.innerHTML = '';

  // ซ่อนแผนที่ใน modal ถ้ากุ้งอยากให้เปิดเฉพาะตอนเปิดใหม่
  const mapContainer = $('#modal-map');
  if (mapContainer) mapContainer.style.display = 'none';
}


$('#add-property-btn').addEventListener('click', () => {
  openModal();
  setupModalMap();
});

function fillFormFromProperty(prop) {
  if (!propertyForm || !prop) return;

  // เติม field ที่มีชื่อเหมือนกันในฟอร์ม
  for (const key in prop) {
    const field = propertyForm.elements[key];
    if (!field) continue;

    // checkbox
    if (field.type === 'checkbox') {
      field.checked = !!prop[key];
      continue;
    }

    // อื่น ๆ
    field.value = prop[key] ?? '';
  }

  // gallery / cover ยังไม่ได้ทำใน modal นี้ก็ข้ามไว้ก่อน
  // lat/lng ถ้ามีให้เติมเลย
  if (typeof prop.latitude === 'number' || typeof prop.latitude === 'string') {
    propertyForm.elements.latitude.value = Number(prop.latitude).toFixed(6);
  }
  if (typeof prop.longitude === 'number' || typeof prop.longitude === 'string') {
    propertyForm.elements.longitude.value = Number(prop.longitude).toFixed(6);
  }
}

//------------------------------------------------------------
// ตารางรายการประกาศ
//------------------------------------------------------------
async function loadProperties() {
  const tbody = $('#properties-table tbody');
  clear(tbody);
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">กำลังโหลด...</td></tr>';
  try {
    const { data, error } = await listAll();
    if (error) throw error;
    clear(tbody);
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">ไม่มีข้อมูล</td></tr>';
      return;
    }
    data.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${p.title}</td>
        <td>${formatPrice(p.price)}</td>
        <td>${p.published ? '✅' : '❌'}</td>
        <td>${new Date(p.updated_at).toLocaleDateString('th-TH')}</td>
        <td>
          <button class="btn btn-secondary edit-btn">แก้ไข</button>
          <button class="btn btn-danger delete-btn">ลบ</button>
        </td>
      `;

		tr.querySelector('.edit-btn').addEventListener('click', () => {
		  // เปิด modal ก่อน
		  openModal();

		  // เติมค่าลงฟอร์ม
		  fillFormFromProperty(p);

		  // เอา id เก่าใส่ลงฟอร์มด้วย (สำคัญมากตอน upsert)
		  if (propertyForm.elements.id) {
			propertyForm.elements.id.value = p.id;
		  } else {
			const hid = document.createElement('input');
			hid.type = 'hidden';
			hid.name = 'id';
			hid.value = p.id;
			propertyForm.appendChild(hid);
		  }

		  // ตั้ง gallery ปัจจุบัน (ถ้ายังอยากใช้)
		  currentGallery = Array.isArray(p.gallery) ? [...p.gallery] : [];

		  // ตั้ง cover
		  coverUrl = p.cover_url || (currentGallery[0] ?? null);

		  // ตั้งแผนที่
		  setTimeout(() => setupModalMap(p.latitude, p.longitude), 120);

		  // ถ้ามีปุ่มดึง POI ให้แสดงรายการที่เคยบันทึกของบ้านนี้ด้วยก็ทำได้ตรงนี้ (optional)
		});


      tr.querySelector('.delete-btn').addEventListener('click', () => handleDelete(p.id, p.title));
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:red;text-align:center;">โหลดไม่สำเร็จ</td></tr>';
  }
}

//------------------------------------------------------------
// Event binding
//------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  setupNav();
  await protectPage();
  await signOutIfAny();

  await loadProperties();
  propertyForm?.addEventListener('submit', handleSubmit);

  // ปุ่ม + บ้านใหม่
  addPropertyBtn?.addEventListener('click', () => {
    // reset form ทุกครั้งก่อนเปิด
    propertyForm.reset();
    // ล้าง id เก่า
    if (propertyForm.elements.id) propertyForm.elements.id.value = '';
    // ล้าง POI ชุดชั่วคราว
    poiCandidatesInline = [];
    renderPOIInlineList();
    // เปิด modal + map
    openModal();
    setTimeout(() => setupModalMap(), 100);
  });

  // ปุ่มยกเลิก
  const cancelBtn = document.querySelector('#property-modal .modal-cancel');
  cancelBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal();
  });

  // ปุ่ม X
  const closeBtn = document.querySelector('#property-modal .modal-close');
  closeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal();
  });

  // คลิกข้างนอกปิด
  window.addEventListener('click', (e) => {
    if (e.target === propertyModal) {
      closeModal();
    }
  });
});
