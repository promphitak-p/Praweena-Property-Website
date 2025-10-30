// js/pages/dashboard.page.js
//------------------------------------------------------------
// Praweena Property Dashboard Page
// เพิ่มระบบเลือกตำแหน่งบ้าน + ดึงสถานที่ใกล้เคียง (POI)
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
  $('#property-modal').classList.remove('open');
  poiCandidatesInline = [];
  renderPOIInlineList();
}
$('#add-property-btn').addEventListener('click', () => {
  openModal();
  setupModalMap();
});

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
        openModal();
        setTimeout(() => setupModalMap(p.latitude, p.longitude), 300);
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
  $('#property-form').addEventListener('submit', handleSubmit);

  const fetchPoiBtn = $('#fetch-poi-btn');
  if (fetchPoiBtn) {
    fetchPoiBtn.addEventListener('click', async () => {
      const lat = Number($('#latitude').value);
      const lng = Number($('#longitude').value);
      if (!lat || !lng) {
        toast('กรุณาเลือกตำแหน่งบ้านก่อน', 2000, 'error');
        return;
      }
      await fetchNearbyPOIInline(lat, lng);
    });
  }
});
