
import { setupMobileNav } from '../ui/mobileNav.js';
import { protectPage } from '../auth/guard.js';
import { signOutIfAny } from '../auth/auth.js';
import { listAll, upsertProperty, updateProperty, removeProperty, restoreProperty, hardDeleteProperty, getBySlug, getBySlugOptional } from '../services/propertiesService.js';
import { setupNav } from '../utils/config.js';
import { formatPrice } from '../utils/format.js';
import { getFormData } from '../ui/forms.js';
import { $, $$, clear } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { supabase } from '../utils/supabaseClient.js';
import { setupScrollToTop } from '../utils/scroll.js';

// Renovation Services
import { listSpecsByProperty, upsertSpec, deleteSpec } from '../services/propertySpecsService.js';
import { listContractorsForProperty, upsertPropertyContractor, deletePropertyContractor } from '../services/propertyContractorsService.js';
import { upsertContractor } from '../services/contractorsService.js';
import { getRenovationBookByPropertyId, upsertRenovationBookForProperty } from '../services/renovationBookService.js';
import { getArticles, createArticle, updateArticle, deleteArticle, uploadArticleImage } from '../services/articlesService.js';
import { listPaymentsByProperty, upsertPaymentSchedule, markPaymentPaid, deletePaymentSchedule } from '../services/contractorPaymentsService.js';

// To-Do Services
import {
  listCategories,
  createCategory,
  listTodosByProperty,
  createTodo,
  updateTodo,
  deleteTodo,
  toggleTodoStatus,
  getTaskStats,
  getPendingReminders,
  markReminderSent
} from '../services/renovationTodosService.js';

// Notification Utility
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  sendTaskReminder,
  checkPendingReminders,
  scheduleNotificationCheck,
  getPermissionStatusText
} from '../utils/notifications.js';

// To-Do Tab Logic
import { initTodoTab, setTodoProperty } from './todoTab.js';

// =========== 👇👇 ตั้งค่าตรงนี้ให้ตรงกับ Cloudinary ของกุ้งก่อนนะ 👇👇 ===========
const CLOUDINARY_CLOUD_NAME = 'dupwjm8q2';        // <- ใส่ชื่อ cloud
const CLOUDINARY_UNSIGNED_PRESET = 'praweena_property_preset'; // <- ใส่ unsigned preset
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB (Cloudinary unsigned free limit)
// ============================================================================

// DOM หลัก
const propertyModal = document.getElementById('property-modal');
const propertyForm = document.getElementById('property-form');
const addPropertyBtn = document.getElementById('add-property-btn');
const toggleTrashBtn = document.getElementById('toggle-trash-btn');

// State
let modalMap = null;
let draggableMarker = null;
let poiMarker = null; // POI Picking Marker
let currentGallery = [];
let poiCandidatesInline = [];
let currentYoutube = [];
let searchTimeout = null;
let isTrashView = false;
let propertiesData = []; // Cache loaded properties
let currentRenovationPropertyId = null; // For renovation book tab
let todoTabInitialized = false; // For to-do tab
let articlesData = []; // Articles Cache
let currentPropertyContractors = []; // สำหรับเลือกทีมช่างในงวดจ่าย
let currentPaymentSchedules = [];
let renderPreview = () => {};

const isMobileDevice = () => {
  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
};

function escapeHtml(text = '') {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

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

async function uploadToCloudinary(file) {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UNSIGNED_PRESET) {
    throw new Error('ยังไม่ได้ตั้งค่า Cloudinary');
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const mb = (MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);
    throw new Error(`ไฟล์ใหญ่เกิน ${mb}MB`);
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

function renderGalleryPreview() {
  const wrap = document.getElementById('gallery-preview');
  const beforePreviewWrap = document.getElementById('before-image-preview-container');
  if (!wrap) return;
  clear(wrap);

  // Filter out Config Object from visual gallery
  // Also find the config object to update the "Before Image" preview area
  const visualGallery = [];
  let beforeImgUrl = null;

  currentGallery.forEach(item => {
    if (typeof item === 'string') {
      visualGallery.push(item);
    } else if (typeof item === 'object' && item.beforeImage) {
      beforeImgUrl = item.beforeImage;
    }
  });

  // Render Visual Gallery
  if (!visualGallery.length) {
    wrap.innerHTML = '<p style="color:#9ca3af;">ยังไม่มีรูปอัปโหลด</p>';
  } else {
    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexWrap = 'wrap';
    list.style.gap = '8px';

    visualGallery.forEach((url, idx) => {
      const box = document.createElement('div');
      box.style.position = 'relative';
      box.style.width = '90px';
      box.style.height = '90px';
      box.style.borderRadius = '8px';
      box.style.overflow = 'hidden';
      // Find real index in currentGallery to delete correctly? 
      // Actually easier to just filter by value when deleting.
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
        // Remove strictly by matching string URL
        currentGallery = currentGallery.filter(g => g !== url);
        renderGalleryPreview();
      });

      box.appendChild(img);
      box.appendChild(del);
      list.appendChild(box);
    });
    wrap.appendChild(list);
  }

  // Render Before Image Preview
  if (beforePreviewWrap) {
    clear(beforePreviewWrap);
    if (beforeImgUrl) {
      const box = document.createElement('div');
      box.style.position = 'relative';
      box.style.width = '150px';
      box.style.height = '100px';
      box.style.borderRadius = '8px';
      box.style.overflow = 'hidden';
      box.style.border = '1px solid #ddd';

      const img = document.createElement('img');
      img.src = beforeImgUrl;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';

      // Delete button for Before Image
      const del = document.createElement('button');
      del.textContent = 'Remove';
      del.style.position = 'absolute';
      del.style.bottom = '0';
      del.style.width = '100%';
      del.style.background = 'rgba(220,38,38,0.8)';
      del.style.color = '#fff';
      del.style.border = 'none';
      del.style.padding = '2px';
      del.style.fontSize = '0.8rem';
      del.style.cursor = 'pointer';
      del.onclick = () => {
        // Remove object from currentGallery
        currentGallery = currentGallery.filter(item => typeof item === 'string'); // Keep only strings
        renderGalleryPreview();
      };

      box.appendChild(img);
      box.appendChild(del);
      beforePreviewWrap.appendChild(box);
    } else {
      beforePreviewWrap.innerHTML = '<p style="color:#9ca3af; font-size:0.9rem;">ยังไม่มีรูป Before</p>';
    }
  }
}

function normalizeYoutubeIdOrUrl(input) {
  const raw = (input || '').trim();
  if (!raw) return '';
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const u = new URL(raw);
    const v = u.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    const m1 = u.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (m1) return m1[1];
  } catch { }
  return raw;
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
        if (!propertyForm.elements.id?.value) {
          fetchNearbyPOIInline(pos.lat, pos.lng);
        }
      });
    }
    if (!propertyForm.elements.id?.value) {
      fetchNearbyPOIInline(startLat, startLng);
    }
  } catch (err) {
    console.error('map error', err);
    mapContainer.innerHTML = '<p style="color:red;text-align:center;">เกิดข้อผิดพลาดในการโหลดแผนที่</p>';
  }
}

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
        radius_m: 5000,
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
    // Suppress CORS/Network errors on localhost to avoid alarming the user
    console.warn('[POI Auto-Fill] Skipped due to network/CORS (Safe to ignore):', err.message);
    poiCandidatesInline = getFallbackPoi(baseLat, baseLng);
    renderPOIInlineList();
  }
}

function mergePoiLists(savedList = [], suggestedList = []) {
  const out = [];
  const keySet = new Set();
  const makeKey = (p) => {
    const name = (p.name || '').trim().toLowerCase();
    const lat = Number(p.lat || 0).toFixed(6);
    const lng = Number(p.lng || 0).toFixed(6);
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
      // Reduce radius to 5000m (5km) to prevent timeout/500 errors
      const { data: sData, error: sErr } = await supabase.functions.invoke('fill_poi', {
        body: { lat: latNum, lng: lngNum, limit: 25, preview: true, radius_m: 5000 },
      });
      if (!sErr && Array.isArray(sData?.items)) {
        suggested = sData.items;
      } else {
        console.warn('fill_poi returned error or empty, using fallback:', sErr);
        suggested = getFallbackPoi(latNum, lngNum);
      }
    } catch (e) {
      console.error('loadPoisForProperty crash, using fallback:', e);
      suggested = getFallbackPoi(latNum, lngNum);
    }
  }

  let merged = mergePoiLists(saved, suggested);
  merged = injectPraweenaLandmarks(Number(baseLat), Number(baseLng), merged);
  poiCandidatesInline = merged;
  renderPOIInlineList();
}

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

function setupPoiManualForm() {
  const nameInput = document.getElementById('poi-name-input');
  const typeInput = document.getElementById('poi-type-input');
  const distInput = document.getElementById('poi-distance-input');
  const latInput = document.getElementById('poi-lat-input');
  const lngInput = document.getElementById('poi-lng-input');
  const addBtn = document.getElementById('poi-add-manual-btn');

  if (!addBtn) return;

  addBtn.addEventListener('click', (e) => {
    e.preventDefault();

    const name = (nameInput?.value || '').trim();
    if (!name) {
      toast('กรุณากรอกชื่อสถานที่', 2500, 'error');
      return;
    }

    const type = (typeInput?.value || '').trim();
    const baseLat = parseFloat(propertyForm?.elements.latitude?.value || '');
    const baseLng = parseFloat(propertyForm?.elements.longitude?.value || '');

    let lat = latInput?.value ? parseFloat(latInput.value) : NaN;
    let lng = lngInput?.value ? parseFloat(lngInput.value) : NaN;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      if (Number.isFinite(baseLat) && Number.isFinite(baseLng)) {
        lat = baseLat;
        lng = baseLng;
      } else {
        toast('กรุณาเลือกตำแหน่งบ้านบนแผนที่ หรือกรอกพิกัดสถานที่', 3000, 'error');
        return;
      }
    }

    let dist = distInput?.value ? parseFloat(distInput.value) : NaN;
    if (!Number.isFinite(dist) && Number.isFinite(baseLat) && Number.isFinite(baseLng)) {
      dist = kmDistance(baseLat, baseLng, lat, lng);
    }

    const poi = {
      name,
      type,
      lat,
      lng,
      distance_km: Number.isFinite(dist) ? dist : null,
      __saved: true
    };

    poiCandidatesInline.push(poi);
    renderPOIInlineList();

    if (nameInput) nameInput.value = '';
    if (typeInput) typeInput.value = '';
    if (distInput) distInput.value = '';
    if (latInput) latInput.value = '';
    if (lngInput) lngInput.value = '';

    toast('เพิ่มสถานที่ใกล้เคียงแล้ว (อย่าลืมกดบันทึกบ้าน)', 2500, 'success');
  });

  // Pick on Map Handler
  const pickBtn = document.getElementById('poi-pick-map-btn');
  if (pickBtn) {
    pickBtn.addEventListener('click', (e) => {
      e.preventDefault();

      if (!modalMap) {
        toast('แผนที่ยังไม่พร้อม', 2000, 'error');
        return;
      }

      const baseLat = parseFloat(propertyForm?.elements.latitude?.value || 0);
      const baseLng = parseFloat(propertyForm?.elements.longitude?.value || 0);

      // Create Picking Marker slightly offset
      let startLat = baseLat;
      let startLng = baseLng;

      // If base is 0, use default Surat
      if (!startLat && !startLng) {
        startLat = 9.1337;
        startLng = 99.3325;
      } else {
        // Offset slightly so it doesn't overlap exactly
        startLat += 0.002;
        startLng += 0.002;
      }

      if (poiMarker) poiMarker.remove();

      // Red Icon for POI
      const redIcon = new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      });

      // Custom Icon for POI (e.g. Red/Different color) - using default for now but maybe valid
      try {
        poiMarker = L.marker([startLat, startLng], {
          draggable: true,
          icon: redIcon,
          title: 'ลากไปที่สถานที่ต้องการ'
        }).addTo(modalMap);

        // Bind Popup
        poiMarker.bindPopup("<b>📍 สถานที่ใหม่</b><br>ลากไปไว้ที่ตำแหน่งสถานที่").openPopup();

        // Also label the main marker if not already
        if (draggableMarker) {
          draggableMarker.bindPopup("<b>🏠 ตำแหน่งบ้าน</b>").openPopup();
        }

        // Pan to it
        modalMap.setView([startLat, startLng], 15);

        toast('ลากหมุดใหม่ไปยังสถานที่ตั้ง', 3000, 'info');

        // Update inputs on drag
        const updateInputs = (m) => {
          const pos = m.getLatLng();
          if (latInput) latInput.value = pos.lat.toFixed(6);
          if (lngInput) lngInput.value = pos.lng.toFixed(6);

          // Calc distance
          const currentBaseLat = parseFloat(propertyForm?.elements.latitude?.value || 0);
          const currentBaseLng = parseFloat(propertyForm?.elements.longitude?.value || 0);
          if (currentBaseLat && currentBaseLng) {
            const d = kmDistance(currentBaseLat, currentBaseLng, pos.lat, pos.lng);
            if (distInput) distInput.value = d.toFixed(3);
          }
        };

        poiMarker.on('dragend', (evt) => updateInputs(evt.target));

        // Init inputs
        updateInputs(poiMarker);
      } catch (err) {
        console.error("Error creating POI marker", err);
        toast("สร้างหมุดไม่สำเร็จ: " + err.message, 3000, 'error');
      }
    });
  }
}

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

async function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('button[type=submit]');

  const payload = getFormData(form);
  const baseLat = parseFloat(payload.latitude);
  const baseLng = parseFloat(payload.longitude);

  // --- HANDLE COMPARISON SLIDER UPLOADS ---
  const compContainer = document.getElementById('comparison-list-container');
  const compInputs = compContainer ? compContainer.querySelectorAll('.comparison-pair') : [];
  const comparisons = [];

  if (compInputs.length > 0) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังอัปโหลดรูป Before/After...';

    for (const div of compInputs) {
      const fileBefore = div.querySelector('.file-before')?.files[0];
      const fileAfter = div.querySelector('.file-after')?.files[0];
      let urlBefore = div.querySelector('.url-before')?.value || null;
      let urlAfter = div.querySelector('.url-after')?.value || null;

      try {
        if (fileBefore) urlBefore = await uploadToCloudinary(fileBefore);
        if (fileAfter) urlAfter = await uploadToCloudinary(fileAfter);

        if (urlBefore || urlAfter) {
          comparisons.push({ before: urlBefore, after: urlAfter });
        }
      } catch (e) {
        console.error('Comparison Upload Error:', e);
        toast(`อัปโหลดรูปไม่สำเร็จ: ${e.message}`, 4000, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'บันทึกข้อมูล';
        return;
      }
    }
  }

  // Inject into Gallery
  // 1. Remove existing config object (both old {beforeImage} and new {comparisons})
  let newGallery = currentGallery.filter(item => {
    if (typeof item !== 'object') return true;
    if (item.beforeImage) return false; // Legacy
    if (item.comparisons) return false; // New
    return true; // Keep other objects if any? Actually we only use strings usually.
  });

  // 2. Add New Config if comparisons exist
  if (comparisons.length > 0) {
    newGallery.push({ comparisons: comparisons });
  } else {
    // Check if we need to preserve legacy "Before Image" that wasn't in the list?
    // No, the list replaces the old one. If user deleted all rows, valid to have no comparisons.
  }

  // NOTE: If old legacy "Before Image" existed but user didn't see it in the list (because fillForm logic isn't written yet),
  // saving now would DELETE it. This is acceptable since we are about to write fillForm logic next.

  payload.price = Number(payload.price) || 0;
  payload.gallery = newGallery;
  // Don't use payload.gallery[0] blindly for cover if index 0 is an object?
  // currentGallery entries are usually strings.
  // We pushed object to the END. So index 0 should be safe unless gallery is empty.
  payload.cover_url = (payload.gallery.length && typeof payload.gallery[0] === 'string') ? payload.gallery[0] : null;
  payload.youtube_video_ids = JSON.stringify(currentYoutube);

  payload.published = !!payload.published;
  payload.customer_status_visible = !!payload.customer_status_visible;

  // Validate Publish: require price and general info
  if (payload.published) {
    const missingFields = [];
    if (!payload.title) missingFields.push('ชื่อประกาศ');
    // Price removed from required
    if (!payload.property_type) missingFields.push('ประเภททรัพย์');
    if (!payload.district) missingFields.push('อำเภอ');
    if (!payload.province) missingFields.push('จังหวัด');

    if (missingFields.length > 0) {
      toast(`ไม่สามารถเผยแพร่ได้: ข้อมูลไม่ครบ (${missingFields.join(', ')})`, 4000, 'error');
      // Reset published to false visually? Or just stop.
      // If we stop, user can fix it.
      return;
    }
  }

  // Check for rule conflict
  const stage = String(payload.renovation_stage || '').trim().toLowerCase();
  const isConflict = (stage !== 'ready' && payload.customer_status_visible);

  if (isConflict) {
    showConfirmModal(
      '⚠ ขัดแย้งกับกฎที่ตั้งไว้',
      'กฎ: "งานรีโนเวทต้องเสร็จสิ้น (Ready) ถึงจะแสดงสถานะให้ลูกค้าเห็นได้"\n\nแต่คุณเลือกที่จะเปิดแสดงสถานะ ทั้งที่งานยังไม่เสร็จ\n\nต้องการยืนยันที่จะบันทึกหรือไม่?',
      () => performSave(payload, submitBtn)
    );
  } else {
    await performSave(payload, submitBtn);
  }
}

async function performSave(payload, submitBtn) {
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังบันทึก...';
  }

  try {
    const { data, error } = await upsertProperty(payload);
    if (error) throw error;

    const propId = data?.id || payload.id;
    const baseLat = parseFloat(payload.latitude);
    const baseLng = parseFloat(payload.longitude);

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

// ================== Actions (Helper for listeners) ==================

function showConfirmModal(title, message, onConfirm) {
  const modal = document.getElementById('confirmation-modal');
  const titleEl = document.getElementById('confirm-title');
  const msgEl = document.getElementById('confirm-message');
  const btnOk = document.getElementById('btn-confirm-ok');
  const btnCancel = document.getElementById('btn-confirm-cancel');

  if (!modal) {
    if (confirm(message)) onConfirm();
    return;
  }

  titleEl.textContent = title;
  msgEl.textContent = message;

  const close = () => {
    modal.classList.remove('open');
    btnOk.onclick = null;
    btnCancel.onclick = null;
  };

  btnOk.onclick = () => {
    close();
    onConfirm();
  };

  btnCancel.onclick = close;
  modal.classList.add('open');
}

async function handleDelete(id, title) {
  showConfirmModal(
    'ย้ายไปถังขยะ?',
    `คุณต้องการย้าย "${title || 'ประกาศนี้'}" ไปถังขยะใช่หรือไม่?`,
    async () => {
      try {
        const { error } = await removeProperty(id);
        if (error) throw error;
        toast('ย้ายไปถังขยะแล้ว', 2000, 'success');
        loadProperties();
      } catch (err) {
        console.error(err);
        toast('ลบไม่สำเร็จ: ' + err.message, 3000, 'error');
      }
    }
  );
}

async function handleRestore(id, title) {
  try {
    const { error } = await restoreProperty(id);
    if (error) throw error;
    toast('กู้คืนประกาศแล้ว', 2000, 'success');
    loadProperties();
  } catch (err) {
    console.error(err);
    toast('กู้คืนไม่สำเร็จ: ' + err.message, 3000, 'error');
  }
}

async function handleHardDelete(id, title) {
  showConfirmModal(
    'ลบถาวร?',
    `คำเตือน: "${title || 'ประกาศนี้'}" จะถูกลบถาวรและกู้คืนไม่ได้!`,
    async () => {
      try {
        const { error } = await hardDeleteProperty(id);
        if (error) throw error;
        toast('ลบถาวรเรียบร้อย', 2000, 'success');
        loadProperties();
      } catch (err) {
        console.error(err);
        toast('ลบถาวรไม่สำเร็จ: ' + err.message, 3000, 'error');
      }
    }
  );
}


function openModal() {
  if (!propertyModal) return;
  propertyModal.classList.add('open');

  // Fix Leaflet map size in modal
  setTimeout(() => {
    if (typeof modalMap !== 'undefined' && modalMap) {
      modalMap.invalidateSize();
    }
  }, 300);
}

function closeModal() {
  if (!propertyModal) return;
  propertyModal.classList.remove('open');

  // Cleanup Map Markers
  if (poiMarker) {
    poiMarker.remove();
    poiMarker = null;
  }

  if (propertyForm) {
    propertyForm.reset();
    if (propertyForm.elements.id) propertyForm.elements.id.value = '';
  }

  const poiList = document.getElementById('poi-candidate-list');
  if (poiList) poiList.innerHTML = '';

  currentGallery = [];
  renderGalleryPreview();
  currentYoutube = [];
  renderYoutubeList();

  const nameInput = document.getElementById('poi-name-input');
  const typeInput = document.getElementById('poi-type-input');
  const distInput = document.getElementById('poi-distance-input');
  const latInput = document.getElementById('poi-lat-input');
  const lngInput = document.getElementById('poi-lng-input');
  if (nameInput) nameInput.value = '';
  if (typeInput) typeInput.value = '';
  if (distInput) distInput.value = '';
  if (latInput) latInput.value = '';
  if (lngInput) lngInput.value = '';
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

  // NOTE: Disable backdrop click to prevent accidental closes
  // window.addEventListener('click', (e) => {
  //   if (e.target === propertyModal) {
  //     closeModal();
  //   }
  // });
}

function fillFormFromProperty(p = {}) {
  if (!propertyForm) return;
  const keys = [
    'id', 'title', 'slug', 'price', 'size_text', 'beds', 'baths',
    'parking', 'district', 'province', 'status', 'address', 'property_type',
    'latitude', 'longitude', 'renovation_stage', 'customer_status_text', 'land_size'
  ];
  keys.forEach(k => {
    if (propertyForm.elements[k] !== undefined) {
      propertyForm.elements[k].value = p[k] ?? '';
    }
  });
  if (propertyForm.elements.published) {
    propertyForm.elements.published.checked = !!p.published;
  }
  if (propertyForm.elements.customer_status_visible) {
    propertyForm.elements.customer_status_visible.checked = !!p.customer_status_visible;
  }

  currentGallery = Array.isArray(p.gallery)
    ? p.gallery
    : (typeof p.gallery === 'string' && p.gallery.startsWith('[')
      ? JSON.parse(p.gallery)
      : (p.cover_url ? [p.cover_url] : [])
    );
  renderGalleryPreview();

  // Populate Comparisons
  const compContainer = document.getElementById('comparison-list-container');
  if (compContainer) {
    compContainer.innerHTML = ''; // Clear
    let added = false;
    currentGallery.forEach(item => {
      if (typeof item === 'object') {
        if (item.comparisons && Array.isArray(item.comparisons)) {
          item.comparisons.forEach(pair => {
            addComparisonRow(pair);
            added = true;
          });
        } else if (item.beforeImage) {
          // Legacy Migration
          // Suggest Before Image, empty After
          addComparisonRow({ before: item.beforeImage });
          added = true;
        }
      }
    });
    // Optional: Add empty row if none? No, user can click add.
  }

  if (Array.isArray(p.youtube_video_ids)) {
    currentYoutube = p.youtube_video_ids;
  } else if (typeof p.youtube_video_ids === 'string' && p.youtube_video_ids.startsWith('[')) {
    try {
      currentYoutube = JSON.parse(p.youtube_video_ids);
    } catch {
      currentYoutube = [];
    }
  } else {
  }
  renderYoutubeList();

  // Init Map
  setupModalMap(p.latitude, p.longitude);

  // Load saved POIs
  if (p.id) loadPoisForProperty(p.id, p.latitude, p.longitude);
}

async function loadProperties(query = '') {
  const tbody = document.querySelector('#properties-table tbody');
  clear(tbody);
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">กำลังโหลด...</td></tr>';

  if (toggleTrashBtn) {
    toggleTrashBtn.classList.toggle('btn-secondary', !isTrashView);
    toggleTrashBtn.classList.toggle('btn-danger', isTrashView);
    toggleTrashBtn.textContent = isTrashView ? '← กลับรายการหลัก' : '🗑️ ถังขยะ';
  }

  if (addPropertyBtn) {
    addPropertyBtn.style.display = isTrashView ? 'none' : 'flex';
  }

  try {
    const filters = {};
    if (query) filters.q = query;
    if (isTrashView) filters.trash = true;

    const { data, error } = await listAll(filters);
    if (error) throw error;

    propertiesData = data || []; // Update Cache

    clear(tbody);
    if (!data || !data.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">ไม่มีข้อมูล' + (isTrashView ? 'ในถังขยะ' : '') + '</td></tr>';
      return;
    }

    data.forEach((p, idx) => {
      const tr = document.createElement('tr');
      // No more row event listeners

      const stage = String(p.renovation_stage || '').trim();
      const RENOVATION_MAP = {
        'planning': 'วางแผน',
        'survey': 'สำรวจ/ประเมิน',
        'demo': 'รื้อถอน',
        'structure': 'งานโครงสร้าง',
        'systems': 'ระบบน้ำ/ไฟ',
        'finishes': 'งานตกแต่ง',
        'staging': 'เก็บงาน/จัดบ้าน',
        'ready': 'พร้อมเข้าอยู่'
      };

      const stageLabel = RENOVATION_MAP[stage] || stage || '-';

      let actionButtons = '';
      if (isTrashView) {
        actionButtons = `
            <button class="btn btn-secondary btn-sm restore-btn" style="background:#d1fae5;color:#065f46;border-color:#a7f3d0;" data-id="${p.id}" data-action="restore">กู้คืน</button>
            <button class="btn btn-danger btn-sm hard-delete-btn" data-id="${p.id}" data-action="hard-delete">ลบถาวร</button>
          `;
      } else {
        actionButtons = `
            <button class="btn btn-secondary btn-sm edit-btn" data-id="${p.id}" data-action="edit">แก้ไข</button>
            <button class="btn btn-danger btn-sm delete-btn" data-id="${p.id}" data-action="delete">ลบ</button>
          `;
      }

      tr.innerHTML = `
        <td data-label="หัวข้อ">
          <a href="/property-detail.html?id=${p.id}" target="_blank" style="font-weight:600; text-decoration:none; color:#111827;" title="คลิกเพื่อดูหน้าเว็บจริง">
            ${p.title || '-'} <span style="font-size:0.8em; color:#6b7280;">↗️</span>
          </a>
        </td>
        <td data-label="ราคา">${formatPrice(Number(p.price) || 0)}</td>
        <td data-label="สถานะ">${p.published ? '✅' : '❌'}</td>
        <td data-label="รีโนเวท">${stageLabel}</td>
        <td data-label="โชว์ลูกค้า">${p.customer_status_visible ? '✅' : '—'}</td>
        <td data-label="อัปเดตล่าสุด">${p.updated_at ? new Date(p.updated_at).toLocaleDateString('th-TH') : '-'}</td>
        <td data-label="จัดการ">
          ${actionButtons}
        </td>
      `;

      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:red;">โหลดข้อมูลไม่สำเร็จ: ${err.message}</td></tr>`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();
  setupNav();
  setupMobileNav();
  await signOutIfAny();

  // === Event Delegation for Table Actions ===
  const table = document.getElementById('properties-table');
  if (table) {
    console.log('Table found, adding event listener');
    table.addEventListener('click', (e) => {
      console.log('Click on table:', e.target);
      const btn = e.target.closest('button');
      if (!btn) {
        console.log('Not a button');
        return;
      }

      const action = btn.dataset.action;
      const id = btn.dataset.id;
      console.log('Button clicked:', { action, id });

      if (!action || !id) {
        console.log('Missing action or id');
        return;
      }

      // Find property data from cache
      const prop = propertiesData.find(p => String(p.id) === String(id)) || { title: '' };
      console.log('Property found:', prop);

      if (action === 'edit') {
        openModal();
        fillFormFromProperty(prop);
      } else if (action === 'delete') {
        handleDelete(id, prop.title);
      } else if (action === 'restore') {
        handleRestore(id, prop.title);
      } else if (action === 'hard-delete') {
        handleHardDelete(id, prop.title);
      }
    });
  } else {
    console.error('Table #properties-table NOT FOUND');
  }
  // ==========================================

  if (toggleTrashBtn) {
    toggleTrashBtn.addEventListener('click', () => {
      isTrashView = !isTrashView;
      const searchInput = document.getElementById('property-search');
      if (searchInput) searchInput.value = '';
      loadProperties(); // Changed from loadData() to loadProperties() to match existing function name
      toggleTrashBtn.innerHTML = isTrashView ? '⬅️ กลับไปหน้าหลัก' : '🗑️ ถังขยะ';
      toggleTrashBtn.classList.toggle('btn-outline-danger', isTrashView);
    });
  }

  if (addPropertyBtn) {
    addPropertyBtn.addEventListener('click', () => {
      openModal();
      setupModalMap(); // Init default map
    });
  }
  if (propertyForm) propertyForm.addEventListener('submit', handleSubmit);
  installModalCloseHandlers();
  setupPoiManualForm();
  setupScrollToTop();

  const coverInput = document.getElementById('cover-upload'); // Legacy?

  const galleryInput = document.getElementById('gallery-upload');
  if (galleryInput) {
    galleryInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      for (const file of files) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          const mb = (MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);
          toast(`${file.name} ใหญ่เกิน ${mb}MB`, 2500, 'error');
          continue;
        }
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

  const searchInput = document.getElementById('property-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (searchTimeout) clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        loadProperties(val);
      }, 400);
    });
  }

  await loadProperties();

  // Renovation Init
  setupTabs();
  initSiteContentTab();
  await setupRenovationPropertySelect();
  document.getElementById('rb-save-btn')?.addEventListener('click', saveRenovationBookHandler);
  document.getElementById('rb-view-report-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('Opening report for:', currentRenovationPropertyId);
    if (currentRenovationPropertyId) {
      const modal = document.getElementById('rb-report-modal');
      const frame = document.getElementById('rb-report-frame');
      if (modal && frame) {
        // Add timestamp for cache bust
        frame.src = `/admin/renovation-book-report.html?property_id=${currentRenovationPropertyId}&t=${Date.now()}`;
        modal.classList.add('open');
      } else {
        console.error('Modal or frame not found');
      }
    } else {
      console.warn('No property ID selected');
    }
  });

  // Print Button in Modal
  document.getElementById('rb-modal-print-btn')?.addEventListener('click', () => {
    const frame = document.getElementById('rb-report-frame');
    if (frame && frame.contentWindow) {
      frame.contentWindow.print();
    }
  });

  // Close Report Modal
  document.getElementById('rb-report-modal-close')?.addEventListener('click', () => {
    const modal = document.getElementById('rb-report-modal');
    if (modal) modal.classList.remove('open');
    document.getElementById('rb-report-frame').src = ''; // reset
  });

  // Close on click outside
  window.addEventListener('click', (e) => {
    const m = document.getElementById('rb-report-modal');
    if (m && e.target === m) {
      m.classList.remove('open');
      document.getElementById('rb-report-frame').src = '';
    }
  });
  setupRenovationModals();
});

// ==================== TAB LOGIC ====================
function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active class
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      // Add active
      btn.classList.add('active');
      const targetId = `tab-${btn.dataset.tab}`;
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');

      // Trigger specific actions
      if (btn.dataset.tab === 'renovation') {
        renderRenovationListView();
      }

      // Initialize to-do tab on first view
      if (btn.dataset.tab === 'todos' && !todoTabInitialized) {
        initTodoTab();
        todoTabInitialized = true;
        setupTodoPropertySelector();
      }

      if (btn.dataset.tab === 'articles') {
        loadArticlesList();
      }
    });
  });
}

// ==================== RENOVATION LOGIC ====================
let currentRenovationData = null;

// Populate the Renovation Property Select
// Populate the Renovation Property Select (Searchable)
let renovationPropertiesList = [];
let paymentQuickModal = null;

async function setupRenovationPropertySelect() {
  const searchInput = document.getElementById('rb-property-search');
  const dropdown = document.getElementById('rb-property-dropdown');

  if (!searchInput || !dropdown) return;

  // Load Data
  const { data } = await listAll();
  renovationPropertiesList = data || [];

  // Sort: recently updated first? or alphabetical. Let's do Alphabetical.
  renovationPropertiesList.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

  const renderList = (properties) => {
    dropdown.innerHTML = '';
    if (properties.length === 0) {
      dropdown.innerHTML = '<div style="padding:1rem; color:#9ca3af; text-align:center;">ไม่พบข้อมูล</div>';
      return;
    }

    properties.forEach(p => {
      const item = document.createElement('div');
      item.style.padding = '0.75rem 1rem';
      item.style.cursor = 'pointer';
      item.style.borderBottom = '1px solid #f3f4f6';
      item.style.fontSize = '0.95rem';
      item.innerHTML = `
            <div style="font-weight:600; color:#374151;">${p.title || '(ไม่มีชื่อ)'}</div>
            <div style="font-size:0.8rem; color:#6b7280; margin-top:0.2rem;">
               ${p.code ? `<span style="background:#f3f4f6; padding:2px 6px; border-radius:4px;">${p.code}</span>` : ''} 
               ${p.project_name || ''}
            </div>
          `;

      item.addEventListener('mouseenter', () => item.style.background = '#fffcf5');
      item.addEventListener('mouseleave', () => item.style.background = '#fff');

      item.addEventListener('click', async (e) => {
        e.stopPropagation(); // prevent document click closing immediately
        searchInput.value = p.title;
        dropdown.style.display = 'none';

        // Load Renovation Data
        await loadRenovationForProperty(p.id);



      });

      dropdown.appendChild(item);
    });
  };

  const openDropdown = () => {
    // Filter if there is text, else show all
    const val = searchInput.value.toLowerCase().trim();
    if (val) {
      const filtered = renovationPropertiesList.filter(p =>
        (p.title && p.title.toLowerCase().includes(val)) ||
        (p.code && p.code.toLowerCase().includes(val))
      );
      renderList(filtered);
    } else {
      renderList(renovationPropertiesList);
    }
    dropdown.style.display = 'block';
  };

  // Trigger on click anywhere on input
  searchInput.addEventListener('click', (e) => {
    e.stopPropagation();
    openDropdown();
  });

  // Also input event
  searchInput.addEventListener('input', (e) => {
    openDropdown();
  });

  // Toggle on chevron (if we made it clickable, but input covers it mostly, so input click is main)
  // Actually input takes full width, so clicking chevron clicks input effectively if z-index is right.
  // But we have pointer-events:none on chevron. So input click handles it.

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

function hideRenovationContent() {
  const area = document.getElementById('renovation-content-area');
  const listView = document.getElementById('renovation-list-view');

  if (area) area.style.display = 'none';
  if (listView) {
    listView.style.display = 'block';
    renderRenovationListView();
  }
  currentRenovationPropertyId = null;
}

function renderRenovationListView() {
  const tbody = document.getElementById('renovation-list-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  // Use renovationPropertiesList populated earlier
  if (!renovationPropertiesList || !renovationPropertiesList.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="padding:2rem;text-align:center;color:#999;">ไม่มีข้อมูลบ้าน</td></tr>';
    return;
  }

  renovationPropertiesList.forEach(p => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #f3f4f6';

    const stageMap = {
      'planning': 'วางแผน',
      'survey': 'สำรวจ',
      'demo': 'รื้อถอน',
      'structure': 'โครงสร้าง',
      'systems': 'งานระบบ',
      'finishes': 'ตกแต่ง',
      'staging': 'จัดบ้าน',
      'ready': 'พร้อมอยู่'
    };
    const stage = stageMap[p.renovation_stage] || p.renovation_stage || '-';
    const price = p.price ? Number(p.price).toLocaleString() : '-';

    tr.innerHTML = `
            <td style="padding:1rem;">
                <div style="font-weight:600;color:#374151;">${p.title}</div>
                <div style="font-size:0.85rem;color:#6b7280;">${p.code || ''} ${p.project_name || ''}</div>
            </td>
            <td style="padding:1rem;">
                <span style="background:#f3f4f6; padding:2px 8px; border-radius:12px; font-size:0.85rem;">${stage}</span>
            </td>
            <td style="padding:1rem;">${price}</td>
            <td style="padding:1rem;">
                <div class="payment-badge" data-property-id="${p.id}" style="display:inline-flex;gap:8px;align-items:center;flex-wrap:wrap;">
                  <span style="font-size:0.9rem;color:#6b7280;">โหลด...</span>
                </div>
            </td>
            <td style="padding:1rem; text-align:right;">
                <button class="btn btn-sm btn-secondary edit-renovation-btn">แก้ไข</button>
                <button class="btn btn-sm btn-secondary view-renovation-report-btn" data-property-id="${p.id}"
                  style="margin-left:6px;">ดูรายงาน</button>
                <button class="btn btn-sm" data-quick-pay="${p.id}" style="margin-left:6px;">ดูงวดจ่าย</button>
            </td>
        `;

    // Click to open
    const open = async () => {
      // Update Search Input
      const searchInput = document.getElementById('rb-property-search');
      if (searchInput) searchInput.value = p.title;

      // Loads
      await loadRenovationForProperty(p.id);
    };

    tr.querySelector('.edit-renovation-btn').addEventListener('click', open);
    const viewBtn = tr.querySelector('.view-renovation-report-btn');
    if (viewBtn) {
      viewBtn.addEventListener('click', () => {
        const url = `/admin/renovation-book-report.html?property_id=${p.id}`;
        window.open(url, '_blank', 'noopener');
      });
    }
    const quickBtn = tr.querySelector('button[data-quick-pay]');
    if (quickBtn) {
      quickBtn.addEventListener('click', () => openPaymentQuickModal(p));
    }
    tbody.appendChild(tr);
  });

  // Fetch payment summary for each row
  renovationPropertiesList.forEach(p => loadRowPaymentSummary(p.id));
}

async function loadRenovationForProperty(propertyId) {
  currentRenovationPropertyId = propertyId;
  const contentArea = document.getElementById('renovation-content-area');
  const listView = document.getElementById('renovation-list-view');

  if (contentArea) contentArea.style.display = 'block';
  if (listView) listView.style.display = 'none';

  // Find Property Info for defaults
  const prop = propertiesData.find(p => p.id == propertyId) || {};

  // Load Data
  try {
    const data = await getRenovationBookByPropertyId(propertyId);
    currentRenovationData = data || {};

    // Auto-fill defaults if empty
    if (!currentRenovationData.house_code) currentRenovationData.house_code = prop.code || prop.title || '';
    if (!currentRenovationData.house_type) currentRenovationData.house_type = prop.property_type || '';
    if (!currentRenovationData.land_size && prop.land_size) currentRenovationData.land_size = prop.land_size;
    if (!currentRenovationData.house_location) {
      // Construct location from address + district
      const parts = [];
      if (prop.address) parts.push(prop.address);
      if (prop.district) parts.push(prop.district);
      if (parts.length) currentRenovationData.house_location = parts.join(' ');
    }
    // Try to parse usable area from size_text (e.g. "120") if valid number
    if (!currentRenovationData.usable_area && prop.size_text) {
      const num = parseFloat(prop.size_text);
      if (!isNaN(num)) currentRenovationData.usable_area = num;
    }

    fillRenovationFields(currentRenovationData);

    // Load Specs & Contractors
    await loadRenovationSpecs(propertyId);
    await loadRenovationContractors(propertyId);
    await loadPaymentSchedules(propertyId);

  } catch (err) {
    console.error("Error loading renovation book:", err);
    toast("โหลดข้อมูลไม่สำเร็จ", 3000, "error");
  }
}

// Map fields to IDs
function fillRenovationFields(data) {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };

  // Card 1
  setVal('rb_house_code', data.house_code);
  setVal('rb_house_location', data.house_location);
  setVal('rb_house_type', data.house_type);
  setVal('rb_house_storeys', data.house_storeys);
  setVal('rb_land_size', data.land_size);
  setVal('rb_usable_area', data.usable_area);
  setVal('rb_house_facing', data.house_facing);
  setVal('rb_house_age', data.house_age);
  setVal('rb_acquisition_type', data.acquisition_type);
  setVal('rb_project_goal', data.project_goal);
  setVal('rb_target_buyer', data.target_buyer);
  setVal('rb_design_concept', data.design_concept);

  // Card 2
  setVal('rb_structural_issues', data.structural_issues);
  setVal('rb_plumbing_issues', data.plumbing_issues);
  setVal('rb_water_supply_issues', data.water_supply_issues);
  setVal('rb_electrical_issues', data.electrical_issues);
  setVal('rb_other_risks', data.other_risks);
  setVal('rb_plan_reference_links', data.plan_reference_links);
  setVal('rb_before_photos_links', data.before_photos_links);

  // Card 3
  setVal('rb_remove_old_screed', data.remove_old_screed);
  setVal('rb_old_screed_thickness', data.old_screed_thickness);
  setVal('rb_new_screed_spec', data.new_screed_spec);
  setVal('rb_flooring_plan', data.flooring_plan);

  // Card 4
  setVal('rb_drainage_plan', data.drainage_plan);
  setVal('rb_pipe_size_main', data.pipe_size_main);
  setVal('rb_drainage_notes', data.drainage_notes);
  setVal('rb_water_supply_plan', data.water_supply_plan);
  setVal('rb_water_tank_pump', data.water_tank_pump);
  setVal('rb_water_notes', data.water_notes);

  // Card 5
  setVal('rb_electric_plan', data.electric_plan);
  setVal('rb_main_breaker_spec', data.main_breaker_spec);
  setVal('rb_lighting_plan', data.lighting_plan);

  // Card 6
  setVal('rb_bathroom_plan', data.bathroom_plan);
  setVal('rb_kitchen_plan', data.kitchen_plan);

  // Card 7 Summary
  setVal('rb_summary_notes', data.summary_notes);

  // Budget
  fillBudgetTable(data.budget);
}

function fillBudgetTable(budgetData) {
  let budget = (typeof budgetData === 'string' ? JSON.parse(budgetData) : budgetData) || {};

  const rows = document.querySelectorAll('#rb-budget-table tbody tr');
  rows.forEach(tr => {
    const cat = tr.dataset.cat;
    const b = budget[cat] || {};
    const inpPlan = tr.querySelector('input[name="plan"]');
    const inpActual = tr.querySelector('input[name="actual"]');
    const inpDiff = tr.querySelector('input[name="diff"]');
    const inpNote = tr.querySelector('input[name="note"]');

    if (inpPlan) inpPlan.value = b.plan || '';
    if (inpActual) inpActual.value = b.actual || '';
    if (inpDiff) inpDiff.value = b.diff || '';
    if (inpNote) inpNote.value = b.note || '';

    // Auto calc listener
    const inputs = tr.querySelectorAll('input');
    inputs.forEach(inp => inp.addEventListener('change', () => calculateBudgetRow(tr)));
  });
}

function calculateBudgetRow(tr) {
  const plan = parseFloat(tr.querySelector('input[name="plan"]').value) || 0;
  const actual = parseFloat(tr.querySelector('input[name="actual"]').value) || 0;
  const diff = actual - plan;
  tr.querySelector('input[name="diff"]').value = diff;
}

function collectRenovationData() {
  const getVal = (id) => document.getElementById(id)?.value?.trim() || null;

  // Budget
  const budget = {};
  document.querySelectorAll('#rb-budget-table tbody tr').forEach(tr => {
    const cat = tr.dataset.cat;
    budget[cat] = {
      plan: tr.querySelector('input[name="plan"]').value,
      actual: tr.querySelector('input[name="actual"]').value,
      diff: tr.querySelector('input[name="diff"]').value,
      note: tr.querySelector('input[name="note"]').value
    };
  });

  return {
    property_id: currentRenovationPropertyId,
    house_code: getVal('rb_house_code'),
    house_location: getVal('rb_house_location'),
    house_type: getVal('rb_house_type'),
    house_storeys: getVal('rb_house_storeys'),
    land_size: getVal('rb_land_size'),
    usable_area: getVal('rb_usable_area'),
    house_facing: getVal('rb_house_facing'),
    house_age: getVal('rb_house_age'),
    acquisition_type: getVal('rb_acquisition_type'),
    project_goal: getVal('rb_project_goal'),
    target_buyer: getVal('rb_target_buyer'),
    design_concept: getVal('rb_design_concept'),
    structural_issues: getVal('rb_structural_issues'),
    plumbing_issues: getVal('rb_plumbing_issues'),
    water_supply_issues: getVal('rb_water_supply_issues'),
    electrical_issues: getVal('rb_electrical_issues'),
    other_risks: getVal('rb_other_risks'),
    plan_reference_links: getVal('rb_plan_reference_links'),
    before_photos_links: getVal('rb_before_photos_links'),
    remove_old_screed: getVal('rb_remove_old_screed'),
    old_screed_thickness: getVal('rb_old_screed_thickness'),
    new_screed_spec: getVal('rb_new_screed_spec'),
    flooring_plan: getVal('rb_flooring_plan'),
    drainage_plan: getVal('rb_drainage_plan'),
    pipe_size_main: getVal('rb_pipe_size_main'),
    drainage_notes: getVal('rb_drainage_notes'),
    water_supply_plan: getVal('rb_water_supply_plan'),
    water_tank_pump: getVal('rb_water_tank_pump'),
    water_notes: getVal('rb_water_notes'),
    electric_plan: getVal('rb_electric_plan'),
    main_breaker_spec: getVal('rb_main_breaker_spec'),
    lighting_plan: getVal('rb_lighting_plan'),
    bathroom_plan: getVal('rb_bathroom_plan'),
    kitchen_plan: getVal('rb_kitchen_plan'),
    summary_notes: getVal('rb_summary_notes'),
    budget: budget
  };
}

async function saveRenovationBookHandler() {
  if (!currentRenovationPropertyId) return;
  const btn = document.getElementById('rb-save-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
  }

  try {
    const payload = collectRenovationData();
    await upsertRenovationBookForProperty(payload);

    // SYNC BACK TO PROPERTY (User Request: Prioritize Renovation Data)
    // We update the main property record with physical details from Renovation
    const propPayload = {
      // Sync Fields
      land_size: payload.land_size ? parseFloat(payload.land_size) : null,
      size_text: payload.usable_area ? String(payload.usable_area) : undefined,
    };

    // Map Type
    const typeMap = {
      'townhouse': 'ทาวน์เฮ้าส์',
      'single_house': 'บ้านเดี่ยว',
      'twin_house': 'บ้านแฝด',
      'commercial': 'อาคารพาณิชย์'
    };
    if (payload.house_type && typeMap[payload.house_type]) {
      propPayload.property_type = typeMap[payload.house_type];
    } else if (payload.house_type) {
      // Fallback if not in map but has value
      propPayload.property_type = payload.house_type;
    }

    // Only update if we have data to update. Use updateProperty explicitly.
    try {
      await updateProperty(currentRenovationPropertyId, propPayload);
      // Refresh Properties List in background to reflect changes
      loadProperties();
    } catch (syncErr) {
      console.warn('Sync to property failed (non-critical):', syncErr);
    }

    toast('บันทึกสมุดรีโนเวทและอัปเดตข้อมูลบ้านเรียบร้อย', 2500, 'success');
  } catch (err) {
    console.error(err);
    toast('บันทึกผิดพลาด: ' + err.message, 3000, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'บันทึกสมุดรีโนเวท';
    }
  }
}

// Specs & Contractors (Partial implementation for brevity)
async function loadRenovationSpecs(propId) {
  const list = await listSpecsByProperty(propId);
  const container = document.getElementById('rb-specs-container');
  if (!container) return;
  container.innerHTML = '';

  if (!list.length) {
    container.innerHTML = '<small style="color:#999;">ยังไม่มีสเปก</small>';
    return;
  }

  const ul = document.createElement('ul');
  ul.style.paddingLeft = '0';
  ul.style.display = 'grid';
  ul.style.gridTemplateColumns = 'repeat(auto-fit, minmax(260px, 1fr))';
  ul.style.gap = '10px';
  list.forEach(s => {
    const li = document.createElement('li');
    li.style.border = '1px solid #e5e7eb';
    li.style.borderRadius = '8px';
    li.style.padding = '10px 12px';
    li.style.background = '#fff';
    const info = [
      s.item_type ? `<div><b>ประเภท:</b> ${escapeHtml(s.item_type)}</div>` : '',
      s.brand ? `<div><b>ยี่ห้อ:</b> ${escapeHtml(s.brand)}</div>` : '',
      s.model_or_series ? `<div><b>รุ่น/สี:</b> ${escapeHtml(s.model_or_series)}</div>` : '',
      s.color_code ? `<div><b>โค้ดสี:</b> ${escapeHtml(s.color_code)}</div>` : '',
      s.tile_pattern ? `<div><b>ลาย/รหัสกระเบื้อง:</b> ${escapeHtml(s.tile_pattern)}</div>` : '',
      s.supplier ? `<div><b>ร้าน/ซัพพลายเออร์:</b> ${escapeHtml(s.supplier)}</div>` : '',
      (s.quantity || s.unit) ? `<div><b>จำนวน:</b> ${escapeHtml(String(s.quantity || ''))} ${escapeHtml(s.unit || '')}</div>` : '',
      s.note ? `<div style="color:#4b5563;">${escapeHtml(s.note)}</div>` : ''
    ].filter(Boolean).join('');

    li.innerHTML = `
      <div style="font-weight:700;margin-bottom:4px;">${escapeHtml(s.zone || '-')}</div>
      ${info || '<div style="color:#9ca3af;">-</div>'}
      <div style="margin-top:6px;">
        <a href="#" class="text-red-500 del-spec" data-id="${s.id}" style="color:red;">ลบ</a>
      </div>
    `;
    ul.appendChild(li);
  });
  container.appendChild(ul);

  ul.querySelectorAll('.del-spec').forEach(a => a.addEventListener('click', async (e) => {
    e.preventDefault();
    if (confirm('ลบ?')) {
      await deleteSpec(e.target.dataset.id);
      await loadRenovationSpecs(propId);
    }
  }));
}

async function loadRenovationContractors(propId) {
  const list = await listContractorsForProperty(propId);
  currentPropertyContractors = list || [];
  const container = document.getElementById('rb-contractors-container');
  if (!container) return;
  container.innerHTML = '';

  if (!list.length) {
    container.innerHTML = '<small style="color:#999;">ยังไม่มีทีมช่าง</small>';
    return;
  }
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(260px, 1fr))';
  grid.style.gap = '10px';

  list.forEach(c => {
    const name = c.contractor?.name || 'ไม่ระบุ';
    const card = document.createElement('div');
    card.style.border = '1px solid #e5e7eb';
    card.style.borderRadius = '10px';
    card.style.padding = '10px 12px';
    card.style.background = '#fff';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:6px;align-items:center;">
        <div>
          <div style="font-weight:700;">${escapeHtml(name)}</div>
          <div style="color:#6b7280;font-size:12px;">${escapeHtml(c.scope || '-')}</div>
        </div>
        <a href="#" class="text-red-500 del-con" data-id="${c.id}" style="color:red;font-size:18px;line-height:1;">×</a>
      </div>
      <div style="margin-top:8px;">
        <button class="btn btn-sm btn-secondary add-payment-for-contractor" data-pc="${c.id}" style="padding:6px 10px;">+ เพิ่มงวดจ่าย</button>
      </div>
      <div class="contractor-payments" data-payment-list-for="${c.id}" style="margin-top:8px;"></div>
    `;
    grid.appendChild(card);
  });
  container.appendChild(grid);

  container.querySelectorAll('.del-con').forEach(a => a.addEventListener('click', async (e) => {
    e.preventDefault();
    if (confirm('ลบ?')) {
      await deletePropertyContractor(e.target.dataset.id);
      await loadRenovationContractors(propId);
      await loadPaymentSchedules(propId);
    }
  }));

  container.querySelectorAll('.add-payment-for-contractor').forEach(btn => {
    btn.addEventListener('click', () => {
      const pcId = btn.dataset.pc;
      openPaymentModal(pcId);
    });
  });

  renderPaymentsIntoCards();
}

// Modal logic for Spec/Contractor Add (Basic)
function setupRenovationModals() {
  const modal = document.getElementById('rb-modal');
  if (!modal) return;
  const closeBtn = document.getElementById('rb-modal-close');
  const cancelBtn = document.getElementById('rb-modal-cancel');
  const form = document.getElementById('rb-modal-form');
  let mode = '';

  function openPaymentModal(selectedPcId = null) {
    mode = 'payment';
    const contractorOptions = currentPropertyContractors.map(c => {
      const name = c.contractor?.name || 'ไม่ระบุ';
      const scope = c.scope ? ` (${c.scope})` : '';
      return `<option value="${c.id}">${escapeHtml(name + scope)}</option>`;
    }).join('');
    document.getElementById('rb-modal-title').textContent = 'เพิ่มงวดจ่าย';
    document.getElementById('rb-modal-fields-container').innerHTML = `
            <div class="form-group"><label>ชื่องวด/เงื่อนไข</label><input name="title" class="form-control" placeholder="เช่น มัดจำ, ปูกระเบื้อง" required></div>
            <div class="form-group"><label>ทีมช่าง</label>
              <select name="property_contractor_id" class="form-control">
                <option value="">-- ไม่ระบุ --</option>
                ${contractorOptions}
              </select>
            </div>
            <div class="form-group"><label>จำนวนเงิน (บาท)</label><input name="amount" type="number" step="0.01" class="form-control" required></div>
            <div class="form-group"><label>กำหนดจ่าย</label><input name="due_date" type="date" class="form-control"></div>
            <div class="form-group"><label>สถานะ</label>
              <select name="status" class="form-control">
                <option value="pending" selected>รอดำเนินการ</option>
                <option value="paid">จ่ายแล้ว</option>
                <option value="deferred">เลื่อน</option>
              </select>
            </div>
            <div class="form-group"><label>หมายเหตุ/เงื่อนไข</label><textarea name="note" class="form-control" rows="2"></textarea></div>
        `;
    modal.classList.add('open');
    if (selectedPcId) {
      const sel = document.querySelector('#rb-modal-fields-container select[name="property_contractor_id"]');
      if (sel) sel.value = selectedPcId;
    }
  }

  // เปิดใช้ภายนอกสำหรับปุ่มในรายการทีมช่าง
  window.openPaymentModal = openPaymentModal;

  const close = () => modal.classList.remove('open');
  if (closeBtn) closeBtn.onclick = close;
  if (cancelBtn) cancelBtn.onclick = close;

  document.getElementById('rb-add-spec-btn')?.addEventListener('click', () => {
    mode = 'spec';
    document.getElementById('rb-modal-title').textContent = 'เพิ่มสเปก';
    document.getElementById('rb-modal-fields-container').innerHTML = `
            <div class="form-group"><label>โซน</label><input name="zone" class="form-control" placeholder="เช่น ห้องนั่งเล่น, ห้องครัว" required></div>
            <div class="form-group"><label>ประเภท</label><input name="item_type" class="form-control" placeholder="สี, กระเบื้อง, สุขภัณฑ์..."></div>
            <div class="form-group"><label>ยี่ห้อ</label><input name="brand" class="form-control"></div>
            <div class="form-group"><label>รุ่น/สี</label><input name="model_or_series" class="form-control" placeholder="รุ่น/ซีรีส์ หรือชื่อสี"></div>
            <div class="form-group"><label>เบอร์สี / โค้ดสี</label><input name="color_code" class="form-control" placeholder="เช่น 1A02, #F5F5F5"></div>
            <div class="form-group"><label>ลาย/รหัสกระเบื้อง</label><input name="tile_pattern" class="form-control" placeholder="เช่น รหัสสินค้า, ลายหินอ่อน"></div>
            <div class="form-group"><label>ร้าน/ซัพพลายเออร์</label><input name="supplier" class="form-control" placeholder="ร้านที่ซื้อ/แหล่งสั่งของ"></div>
            <div class="form-group"><label>จำนวน/หน่วย</label>
              <div style="display:flex; gap:8px;">
                <input name="quantity" type="number" step="0.01" class="form-control" style="flex:1;" placeholder="เช่น 5">
                <input name="unit" class="form-control" style="width:120px;" placeholder="กล., กล่อง, ตรม.">
              </div>
            </div>
            <div class="form-group"><label>โน้ต/วิธีติดตั้ง</label><textarea name="note" class="form-control" rows="2" placeholder="วิธีผสมสี, ทิศทางปูกระเบื้อง, อื่น ๆ"></textarea></div>
        `;
    modal.classList.add('open');
  });

  document.getElementById('rb-add-contractor-btn')?.addEventListener('click', () => {
    mode = 'contractor';
    document.getElementById('rb-modal-title').textContent = 'เพิ่มทีมช่าง';
    document.getElementById('rb-modal-fields-container').innerHTML = `
            <div class="form-group"><label>ชื่อช่าง</label><input name="contractor_name" class="form-control" required></div>
            <div class="form-group"><label>สายงาน</label><input name="contractor_trade" class="form-control"></div>
            <div class="form-group"><label>เบอร์โทร</label><input name="contractor_phone" class="form-control"></div>
            <div class="form-group"><label>ขอบเขตงาน</label><input name="scope" class="form-control"></div>
        `;
    modal.classList.add('open');
  });

  document.getElementById('rb-add-payment-btn')?.addEventListener('click', () => {
    openPaymentModal();
  });

  // Quick payment modal controls
  paymentQuickModal = document.getElementById('payment-quick-modal');
  const pqClose = document.getElementById('payment-quick-close');
  if (pqClose) pqClose.addEventListener('click', closePaymentQuickModal);

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    if (mode === 'spec') {
      await upsertSpec({
        property_id: currentRenovationPropertyId,
        zone: fd.get('zone'),
        item_type: fd.get('item_type'),
        brand: fd.get('brand'),
        model_or_series: fd.get('model_or_series'),
        color_code: fd.get('color_code'),
        supplier: fd.get('supplier'),
        unit: fd.get('unit'),
        quantity: fd.get('quantity'),
        note: fd.get('note'),
        tile_pattern: fd.get('tile_pattern')
      });
      await loadRenovationSpecs(currentRenovationPropertyId);
    } else if (mode === 'contractor') {
      const contractor = await upsertContractor({
        name: fd.get('contractor_name'),
        trade: fd.get('contractor_trade'),
        phone: fd.get('contractor_phone')
      });
      await upsertPropertyContractor({
        property_id: currentRenovationPropertyId,
        contractor_id: contractor.id,
        scope: fd.get('scope')
      });
      await loadRenovationContractors(currentRenovationPropertyId);
      await loadPaymentSchedules(currentRenovationPropertyId);
    } else if (mode === 'payment') {
      const property_contractor_id = fd.get('property_contractor_id') || null;
      const amount = parseFloat(fd.get('amount') || '0');
      const status = fd.get('status') || 'pending';
      const contractorLink = currentPropertyContractors.find(c => String(c.id) === String(property_contractor_id));
      await upsertPaymentSchedule({
        property_id: currentRenovationPropertyId,
        property_contractor_id,
        contractor_id: contractorLink?.contractor_id || null,
        title: fd.get('title'),
        amount,
        due_date: fd.get('due_date') || null,
        status,
        note: fd.get('note'),
        paid_at: status === 'paid' ? new Date().toISOString() : null
      });
      await loadPaymentSchedules(currentRenovationPropertyId);
    }
    close();
    toast('บันทึกสำเร็จ', 2000, 'success');
  });
}

async function loadPaymentSchedules(propId) {
  const container = document.getElementById('rb-payments-container');
  if (!container) return;
  if (!propId) {
    container.innerHTML = '<small style="color:#999;">เลือกบ้านก่อน</small>';
    return;
  }
  container.innerHTML = '<small style="color:#999;">กำลังโหลด...</small>';

  let list = [];
  try {
    list = await listPaymentsByProperty(propId);
  } catch (err) {
    console.error(err);
    container.innerHTML = '<small style="color:#dc2626;">โหลดงวดจ่ายไม่สำเร็จ</small>';
    return;
  }
  currentPaymentSchedules = list || [];

  container.innerHTML = '<small style="color:#6b7280;">จัดการงวดจ่ายจากทีมช่างด้านบน</small>';
  renderPaymentsIntoCards();
  renderPaymentSummary();
}

function renderPaymentsIntoCards() {
  const contractorName = (payment) => {
    const pc = currentPropertyContractors.find(c => c.id === payment.property_contractor_id);
    if (pc?.contractor?.name) return pc.contractor.name;
    if (payment.contractor?.name) return payment.contractor.name;
    return 'ไม่ระบุทีม';
  };

  const badge = (status) => {
    const color = {
      pending: '#f59e0b',
      paid: '#16a34a',
      overdue: '#dc2626',
      deferred: '#6b7280'
    }[status] || '#6b7280';
    const text = {
      pending: 'รอดำเนินการ',
      paid: 'จ่ายแล้ว',
      overdue: 'เกินกำหนด',
      deferred: 'เลื่อน'
    }[status] || status;
    return `<span style="background:${color}1a;color:${color};padding:2px 8px;border-radius:999px;font-size:12px;">${text}</span>`;
  };

  const fmtDate = (d) => {
    if (!d) return '-';
    const date = new Date(d);
    if (isNaN(date)) return '-';
    return date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  document.querySelectorAll('.contractor-payments[data-payment-list-for]').forEach(wrap => {
    const pcId = wrap.getAttribute('data-payment-list-for');
    const list = currentPaymentSchedules.filter(p => String(p.property_contractor_id || '') === String(pcId));
    wrap.innerHTML = '';
    if (!list.length) {
      wrap.innerHTML = '<small style="color:#999;">ยังไม่มีงวดจ่าย</small>';
      return;
    }
    const stack = document.createElement('div');
    stack.style.display = 'flex';
    stack.style.flexDirection = 'column';
    stack.style.gap = '8px';

    list.forEach(p => {
      const card = document.createElement('div');
      card.style.border = '1px solid #e5e7eb';
      card.style.borderRadius = '8px';
      card.style.padding = '8px 10px';
      card.style.background = '#f9fafb';
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
          <div style="font-weight:700;font-size:13px;">${escapeHtml(p.title || 'งวดจ่าย')}</div>
          ${badge(p.status)}
        </div>
        <div style="margin-top:2px;font-size:12px;">กำหนด: <b>${fmtDate(p.due_date)}</b></div>
        <div style="margin-top:2px;font-size:12px;">จำนวน: <b>${formatPrice(p.amount || 0)} บาท</b></div>
        ${p.paid_at ? `<div style="margin-top:2px;font-size:11px;color:#16a34a;">จ่ายเมื่อ ${fmtDate(p.paid_at)}</div>` : ''}
        ${p.note ? `<div style="margin-top:4px;font-size:12px;color:#4b5563;">${escapeHtml(p.note)}</div>` : ''}
        <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;">
          ${p.status !== 'paid' ? `<button class="btn btn-sm pay-mark-paid" data-id="${p.id}" style="background:#16a34a;color:#fff;border:none;padding:5px 8px;font-size:12px;">จ่ายแล้ว</button>` : ''}
          <button class="btn btn-sm btn-secondary pay-delete" data-id="${p.id}" style="padding:5px 8px;font-size:12px;">ลบ</button>
        </div>
      `;
      stack.appendChild(card);
    });

    wrap.appendChild(stack);

    wrap.querySelectorAll('.pay-mark-paid').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        try {
          await markPaymentPaid(id);
          await loadPaymentSchedules(currentRenovationPropertyId);
          toast('บันทึกการจ่ายแล้ว', 2000, 'success');
        } catch (err) {
          console.error(err);
          toast('ไม่สามารถอัปเดตสถานะได้', 2500, 'error');
        }
      });
    });

    wrap.querySelectorAll('.pay-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const id = e.currentTarget.dataset.id;
        if (!confirm('ลบงวดจ่ายนี้?')) return;
        try {
          await deletePaymentSchedule(id);
          await loadPaymentSchedules(currentRenovationPropertyId);
          toast('ลบเรียบร้อย', 2000, 'success');
        } catch (err) {
          console.error(err);
          toast('ลบไม่สำเร็จ', 2500, 'error');
        }
      });
    });
  });
}

async function loadRowPaymentSummary(propertyId) {
  const badge = document.querySelector(`.payment-badge[data-property-id="${propertyId}"]`);
  if (!badge) return;
  badge.innerHTML = '<span style="font-size:0.9rem;color:#6b7280;">โหลด...</span>';
  try {
    const list = await listPaymentsByProperty(propertyId);
    const sum = (arr, condFn) => arr.filter(condFn).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const total = sum(list, () => true);
    const paid = sum(list, p => p.status === 'paid');
    const now = new Date();
    const overdue = sum(list, p => p.status !== 'paid' && p.due_date && new Date(p.due_date) < now);
    const pending = total - paid;

    const pill = (label, val, color) => `<span style="background:${color}1a;color:${color};padding:2px 8px;border-radius:999px;font-size:12px;">${label}: ${formatPrice(val)}</span>`;
    badge.innerHTML = `
      ${pill('จ่ายแล้ว', paid, '#16a34a')}
      ${pill('ค้าง', pending, '#f59e0b')}
      ${pill('เกินกำหนด', overdue, '#dc2626')}
    `;
  } catch (err) {
    console.error(err);
    badge.innerHTML = '<span style="color:#dc2626;font-size:12px;">โหลดไม่ได้</span>';
  }
}

async function openPaymentQuickModal(property) {
  if (!property) return;
  if (!paymentQuickModal) paymentQuickModal = document.getElementById('payment-quick-modal');
  const title = document.getElementById('payment-quick-title');
  const summary = document.getElementById('payment-quick-summary');
  const listWrap = document.getElementById('payment-quick-list');
  if (title) title.textContent = `งวดจ่าย: ${property.title || ''}`;
  summary.innerHTML = 'กำลังโหลด...';
  listWrap.innerHTML = '';

  if (paymentQuickModal) paymentQuickModal.classList.add('open');

  try {
    const list = await listPaymentsByProperty(property.id);
    const sum = (arr, condFn) => arr.filter(condFn).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const total = sum(list, () => true);
    const paid = sum(list, p => p.status === 'paid');
    const now = new Date();
    const overdue = sum(list, p => p.status !== 'paid' && p.due_date && new Date(p.due_date) < now);
    const pending = total - paid;
    summary.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <span style="background:#1111;color:#111;padding:2px 8px;border-radius:999px;font-size:12px;">รวม: ${formatPrice(total)}</span>
        <span style="background:#16a34a1a;color:#16a34a;padding:2px 8px;border-radius:999px;font-size:12px;">จ่ายแล้ว: ${formatPrice(paid)}</span>
        <span style="background:#f59e0b1a;color:#f59e0b;padding:2px 8px;border-radius:999px;font-size:12px;">ค้าง: ${formatPrice(pending)}</span>
        <span style="background:#dc26261a;color:#dc2626;padding:2px 8px;border-radius:999px;font-size:12px;">เกินกำหนด: ${formatPrice(overdue)}</span>
      </div>
    `;

    if (!list.length) {
      listWrap.innerHTML = '<small style="color:#999;">ยังไม่มีงวดจ่าย</small>';
      return;
    }

    const fmtDate = (d) => {
      if (!d) return '-';
      const date = new Date(d);
      if (isNaN(date)) return '-';
      return date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const badge = (status) => {
      const color = {
        pending: '#f59e0b',
        paid: '#16a34a',
        overdue: '#dc2626',
        deferred: '#6b7280'
      }[status] || '#6b7280';
      const text = {
        pending: 'รอดำเนินการ',
        paid: 'จ่ายแล้ว',
        overdue: 'เกินกำหนด',
        deferred: 'เลื่อน'
      }[status] || status;
      return `<span style="background:${color}1a;color:${color};padding:2px 8px;border-radius:999px;font-size:12px;">${text}</span>`;
    };

    const listEl = document.createElement('div');
    listEl.style.display = 'flex';
    listEl.style.flexDirection = 'column';
    listEl.style.gap = '8px';

    list.forEach(p => {
      const item = document.createElement('div');
      item.style.border = '1px solid #e5e7eb';
      item.style.borderRadius = '8px';
      item.style.padding = '8px 10px';
      item.style.background = '#fff';
      item.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
          <div style="font-weight:700;font-size:13px;">${escapeHtml(p.title || 'งวดจ่าย')}</div>
          ${badge(p.status)}
        </div>
        <div style="margin-top:2px;font-size:12px;">กำหนด: <b>${fmtDate(p.due_date)}</b></div>
        <div style="margin-top:2px;font-size:12px;">จำนวน: <b>${formatPrice(p.amount || 0)} บาท</b></div>
        ${p.paid_at ? `<div style="margin-top:2px;font-size:11px;color:#16a34a;">จ่ายเมื่อ ${fmtDate(p.paid_at)}</div>` : ''}
        ${p.note ? `<div style="margin-top:4px;font-size:12px;color:#4b5563;">${escapeHtml(p.note)}</div>` : ''}
      `;
      listEl.appendChild(item);
    });

    listWrap.appendChild(listEl);
  } catch (err) {
    console.error(err);
    summary.innerHTML = '<small style="color:#dc2626;">โหลดไม่สำเร็จ</small>';
    listWrap.innerHTML = '';
  }
}

function closePaymentQuickModal() {
  if (paymentQuickModal) paymentQuickModal.classList.remove('open');
}
function renderPaymentSummary() {
  const box = document.getElementById('rb-payments-summary');
  if (!box) return;

  const list = currentPaymentSchedules || [];
  const sum = (arr, condFn) => arr.filter(condFn).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const total = sum(list, () => true);
  const paid = sum(list, p => p.status === 'paid');
  const now = new Date();
  const overdue = sum(list, p => p.status !== 'paid' && p.due_date && new Date(p.due_date) < now);
  const pending = total - paid;

  const item = (label, value, color) => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;background:#fff;min-width:0;">
      <div style="color:#6b7280;font-size:12px;">${label}</div>
      <div style="font-weight:700;font-size:14px;color:${color};">${formatPrice(value)} บาท</div>
    </div>
  `;

  box.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${item('รวมทั้งหมด', total, '#111')}
      ${item('จ่ายแล้ว', paid, '#16a34a')}
      ${item('ค้าง/รอดำเนินการ', pending, '#f59e0b')}
      ${item('เกินกำหนด', overdue, '#dc2626')}
    </div>
  `;
}

// ==================== TO-DO TAB PROPERTY SELECTOR ====================

function setupTodoPropertySelector() {
  const searchInput = document.getElementById('todo-property-search');
  const dropdown = document.getElementById('todo-property-dropdown');

  if (!searchInput || !dropdown) return;

  // Show dropdown on focus
  searchInput.addEventListener('focus', () => {
    dropdown.style.display = 'block';
    populateTodoPropertyDropdown();
  });

  // Hide dropdown on blur (with delay for click)
  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      dropdown.style.display = 'none';
    }, 200);
  });

  // Filter on input
  searchInput.addEventListener('input', () => {
    populateTodoPropertyDropdown(searchInput.value);
  });
}

function populateTodoPropertyDropdown(filter = '') {
  const dropdown = document.getElementById('todo-property-dropdown');
  if (!dropdown) return;

  dropdown.innerHTML = '';

  // Filter properties
  const filtered = propertiesData.filter(p => {
    if (!filter) return true;
    const title = (p.title || '').toLowerCase();
    return title.includes(filter.toLowerCase());
  });

  if (filtered.length === 0) {
    dropdown.innerHTML = '<div style="padding:1rem;color:#9ca3af;">ไม่พบบ้านที่ค้นหา</div>';
    return;
  }

  filtered.forEach(property => {
    const item = document.createElement('div');
    item.style.cssText = 'padding:0.75rem 1rem;cursor:pointer;border-bottom:1px solid #f3f4f6;transition:background 0.2s;';
    item.innerHTML = `
      <div style="font-weight:600;color:#111827;">${property.title || 'ไม่มีชื่อ'}</div>
      <div style="font-size:0.85rem;color:#6b7280;">${property.district || ''} ${property.province || ''}</div>
    `;

    item.addEventListener('mouseenter', () => {
      item.style.background = '#f9fafb';
    });

    item.addEventListener('mouseleave', () => {
      item.style.background = 'transparent';
    });

    item.addEventListener('click', () => {
      selectTodoProperty(property);
    });

    dropdown.appendChild(item);
  });
}

function selectTodoProperty(property) {
  const searchInput = document.getElementById('todo-property-search');
  const dropdown = document.getElementById('todo-property-dropdown');

  if (searchInput) {
    searchInput.value = property.title || 'ไม่มีชื่อ';
  }

  if (dropdown) {
    dropdown.style.display = 'none';
  }

  // Set property in to-do tab
  setTodoProperty(property.id, property.title);
}

// ====================== Site Content Tab Logic ======================
async function initSiteContentTab() {
  const tabBtn = document.querySelector('.tab-btn[data-tab="content"]');
  if (!tabBtn) return;

  // Init click listener for tab switching (if not handled globally)
  // The global tab handler switches .active class on content.
  // We just need to load data when this tab is clicked.
  tabBtn.addEventListener('click', () => {
    loadSiteContent();
  });

  // Elements
  const uploadBefore = document.getElementById('upload-before-area');
  const fileBefore = document.getElementById('file-before');
  const previewBefore = document.getElementById('preview-before');
  const msgBefore = document.getElementById('before-placeholder');

  const uploadAfter = document.getElementById('upload-after-area');
  const fileAfter = document.getElementById('file-after');
  const previewAfter = document.getElementById('preview-after');
  const msgAfter = document.getElementById('after-placeholder');

  const heroImageInput = document.getElementById('hero-image-input');
  const heroImageFile = document.getElementById('hero-image-file');
  const heroImagePreview = document.getElementById('hero-image-preview');
  const heroImagePlaceholder = document.getElementById('hero-image-placeholder');
  const heroImageUploadBtn = document.getElementById('hero-image-upload-btn');
  const heroImageStatus = document.getElementById('hero-image-status');
  const heroBadgeTopInput = document.getElementById('hero-badge-top');
  const heroBadgeTitleInput = document.getElementById('hero-badge-title');
  const heroBadgeBottomInput = document.getElementById('hero-badge-bottom');
  const heroCta1Text = document.getElementById('hero-cta1-text');
  const heroCta1Link = document.getElementById('hero-cta1-link');
  const heroCta2Text = document.getElementById('hero-cta2-text');
  const heroCta2Link = document.getElementById('hero-cta2-link');
  const whyTitleInput = document.getElementById('why-title-input');
  const whySubtitleInput = document.getElementById('why-subtitle-input');
  const whyCard1Title = document.getElementById('why-card1-title');
  const whyCard1Desc = document.getElementById('why-card1-desc');
  const whyCard2Title = document.getElementById('why-card2-title');
  const whyCard2Desc = document.getElementById('why-card2-desc');
  const whyCard3Title = document.getElementById('why-card3-title');
  const whyCard3Desc = document.getElementById('why-card3-desc');

  const saveBtn = document.getElementById('save-content-btn');

  // Helpers for file input
  const setupUpload = (area, input, preview, msg) => {
    if (!area || !input) return;
    area.addEventListener('click', () => input.click());
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          preview.src = ev.target.result;
          preview.style.display = 'block';
          if (msg) msg.style.display = 'none';
          renderPreview();
        };
        reader.readAsDataURL(file);
      }
    });
  };

  setupUpload(uploadBefore, fileBefore, previewBefore, msgBefore);
  setupUpload(uploadAfter, fileAfter, previewAfter, msgAfter);

  // Hero image input/update
  const setHeroPreview = (url) => {
    if (!heroImagePreview || !heroImagePlaceholder) return;
    if (url) {
      heroImagePreview.src = url;
      heroImagePreview.style.display = 'block';
      heroImagePlaceholder.style.display = 'none';
    } else {
      heroImagePreview.removeAttribute('src');
      heroImagePreview.style.display = 'none';
      heroImagePlaceholder.style.display = 'flex';
    }
    renderPreview();
  };

  if (heroImageInput) {
    heroImageInput.addEventListener('input', (e) => setHeroPreview(e.target.value.trim()));
  }

  if (heroImageUploadBtn && heroImageFile) {
    heroImageUploadBtn.addEventListener('click', () => heroImageFile.click());
  }

  if (heroImageFile) {
    heroImageFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => setHeroPreview(ev.target.result);
        reader.readAsDataURL(file);
      }
    });
  }

  renderPreview = () => {
    // Hero
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val || '';
    };
    const setHtml = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = val || '';
    };
    setHtml('preview-hero-title', document.getElementById('hero-title-input')?.value || '');
    setText('preview-hero-subtitle', document.getElementById('hero-subtitle-input')?.value || '');
    const heroImg = document.getElementById('preview-hero-image');
    if (heroImg) heroImg.src = heroImagePreview?.src || document.getElementById('hero-image-input')?.value || heroImg.src;
    const cta1 = document.getElementById('preview-hero-cta1');
    if (cta1) {
      cta1.textContent = heroCta1Text?.value || 'ดูมาตรฐานงานรีโนเวท';
      cta1.href = heroCta1Link?.value || '#why';
    }
    const cta2 = document.getElementById('preview-hero-cta2');
    if (cta2) {
      cta2.textContent = heroCta2Text?.value || 'ค้นหาบ้านที่เสร็จแล้ว';
      cta2.href = heroCta2Link?.value || '#listings';
    }
    setText('preview-hero-badge-top', heroBadgeTopInput?.value || '');
    setText('preview-hero-badge-title', heroBadgeTitleInput?.value || '');
    setText('preview-hero-badge-bottom', heroBadgeBottomInput?.value || '');

    // Why
    setHtml('preview-why-title', whyTitleInput?.value || '');
    setText('preview-why-subtitle', whySubtitleInput?.value || '');
    setText('preview-why-card1-title', whyCard1Title?.value || '');
    setText('preview-why-card1-desc', whyCard1Desc?.value || '');
    setText('preview-why-card2-title', whyCard2Title?.value || '');
    setText('preview-why-card2-desc', whyCard2Desc?.value || '');
    setText('preview-why-card3-title', whyCard3Title?.value || '');
    setText('preview-why-card3-desc', whyCard3Desc?.value || '');
  };

  // Bind realtime preview
  const bindPreviewInputs = (selectors = []) => {
    selectors.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', renderPreview);
    });
  };
  bindPreviewInputs([
    'hero-title-input', 'hero-subtitle-input',
    'hero-cta1-text', 'hero-cta1-link',
    'hero-cta2-text', 'hero-cta2-link',
    'hero-badge-top', 'hero-badge-title', 'hero-badge-bottom',
    'why-title-input', 'why-subtitle-input',
    'why-card1-title', 'why-card1-desc',
    'why-card2-title', 'why-card2-desc',
    'why-card3-title', 'why-card3-desc'
  ]);

  // Save
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      try {
        saveBtn.textContent = 'กำลังบันทึก...';
        saveBtn.disabled = true;

        // Helper to get current URL safely
        const getCurrentUrl = (imgEl) => {
          if (!imgEl) return null;
          const src = imgEl.getAttribute('src');
          if (!src || src === '' || src === 'null' || src === window.location.href) return null;
          // If it starts with data:image (preview base64) but NO file selected, we should probably ignore it? 
          // Actually, if file IS selected, we upload. If NOT selected, we rely on existing URL.
          // If existing URL is base64, that means it wasn't uploaded? (Shouldn't happen on reload).
          return src;
        };

        let beforeUrl = getCurrentUrl(previewBefore);
        let afterUrl = getCurrentUrl(previewAfter);

        if (fileBefore.files[0]) {
          try {
            const uploadedUrl = await uploadToCloudinary(fileBefore.files[0]);
            beforeUrl = uploadedUrl;
          } catch (e) {
            console.error('Upload Before failed', e);
            toast('อัปโหลดรูป Before ไม่สำเร็จ: ' + e.message, 4000, 'error');
          }
        }

        if (fileAfter.files[0]) {
          try {
            const uploadedUrl = await uploadToCloudinary(fileAfter.files[0]);
            afterUrl = uploadedUrl;
          } catch (e) {
            console.error('Upload After failed', e);
            toast('อัปโหลดรูป After ไม่สำเร็จ: ' + e.message, 4000, 'error');
          }
        }
        if (!beforeUrl) beforeUrl = null;
        if (!afterUrl) afterUrl = null;

        // Prepare Hero Config
        const heroTitle = document.getElementById('hero-title-input')?.value || '';
        const heroSubtitle = document.getElementById('hero-subtitle-input')?.value || '';
        let heroImage = heroImageInput?.value?.trim() || getCurrentUrl(heroImagePreview) || '';

        if (heroImageFile?.files?.[0]) {
          if (heroImageStatus) heroImageStatus.textContent = 'กำลังอัปโหลด...';
          try {
            heroImage = await uploadToCloudinary(heroImageFile.files[0]);
            if (heroImageStatus) heroImageStatus.textContent = 'อัปโหลดสำเร็จ';
          } catch (e) {
            console.error('Upload Hero failed', e);
            if (heroImageStatus) heroImageStatus.textContent = 'อัปโหลดไม่สำเร็จ';
            toast('อัปโหลดรูป Hero ไม่สำเร็จ: ' + e.message, 4000, 'error');
          }
        }

        const configObj = {
          heroTitle,
          heroSubtitle,
          heroImage,
          heroBadgeTop: heroBadgeTopInput?.value || '',
          heroBadgeTitle: heroBadgeTitleInput?.value || '',
          heroBadgeBottom: heroBadgeBottomInput?.value || '',
          heroCta1Text: heroCta1Text?.value || '',
          heroCta1Link: heroCta1Link?.value || '',
          heroCta2Text: heroCta2Text?.value || '',
          heroCta2Link: heroCta2Link?.value || '',
          whyTitle: whyTitleInput?.value || '',
          whySubtitle: whySubtitleInput?.value || '',
          whyCard1Title: whyCard1Title?.value || '',
          whyCard1Desc: whyCard1Desc?.value || '',
          whyCard2Title: whyCard2Title?.value || '',
          whyCard2Desc: whyCard2Desc?.value || '',
          whyCard3Title: whyCard3Title?.value || '',
          whyCard3Desc: whyCard3Desc?.value || ''
        };

        // Combine Images + Config into Gallery Array: [before, after, config]
        const combinedGallery = [beforeUrl, afterUrl, configObj];

        // Prepare payload - Config Property
        const payload = {
          slug: 'config-homepage-dream-home',
          title: 'Site Config: Homepage',
          published: true,
          property_type: 'commercial',
          gallery: JSON.stringify(combinedGallery)
          // description removed
        };

        console.log('[Dash-Debug] Payload:', payload); // DEBUG
        const existing = await getBySlugOptional('config-homepage-dream-home');
        if (existing && existing.data) {
          payload.id = existing.data.id;
        }

        // Upsert
        const result = await upsertProperty(payload);
        if (result.error) throw result.error;

        toast('บันทึกข้อมูลเรียบร้อยแล้ว', 2500, 'success');

        // Reload to ensure state is clean
        loadSiteContent();

      } catch (err) {
        console.error(err);
        toast('บันทึกผิดพลาด: ' + err.message, 3000, 'error');
      } finally {
        saveBtn.textContent = 'บันทึกการเปลี่ยนแปลง';
        saveBtn.disabled = false;
      }
    });
  }

  // Load immediately if active (e.g. reload on this tab)
  if (tabBtn.classList.contains('active')) {
    loadSiteContent();
  } else {
    renderPreview();
  }
}

async function loadSiteContent() {
  try {
    const { data, error } = await getBySlugOptional('config-homepage-dream-home');
    if (error || !data) return; // No config yet

    // Supabase returns gallery as array (if jsonb) or string. 
    // upsertProperty handles JSON.parse/stringify
    // But `getBySlug` returns raw row.
    // Ensure gallery is array
    let gallery = data.gallery;
    if (typeof gallery === 'string') {
      try { gallery = JSON.parse(gallery); } catch { gallery = []; }
    }

    // Parse Hero Config from Gallery [2]
    let config = {};
    if (Array.isArray(gallery) && gallery.length > 2 && typeof gallery[2] === 'object') {
      config = gallery[2];
    }

    const previewBefore = document.getElementById('preview-before');
    const msgBefore = document.getElementById('before-placeholder');
    const previewAfter = document.getElementById('preview-after');
    const msgAfter = document.getElementById('after-placeholder');

    // Set Hero Inputs
    const heroTitleInput = document.getElementById('hero-title-input');
    const heroSubtitleInput = document.getElementById('hero-subtitle-input');
    const heroImageInput = document.getElementById('hero-image-input');
    const heroBadgeTopInput = document.getElementById('hero-badge-top');
    const heroBadgeTitleInput = document.getElementById('hero-badge-title');
    const heroBadgeBottomInput = document.getElementById('hero-badge-bottom');
    const heroCta1Text = document.getElementById('hero-cta1-text');
    const heroCta1Link = document.getElementById('hero-cta1-link');
    const heroCta2Text = document.getElementById('hero-cta2-text');
    const heroCta2Link = document.getElementById('hero-cta2-link');
    const whyTitleInput = document.getElementById('why-title-input');
    const whySubtitleInput = document.getElementById('why-subtitle-input');
    const whyCard1Title = document.getElementById('why-card1-title');
    const whyCard1Desc = document.getElementById('why-card1-desc');
    const whyCard2Title = document.getElementById('why-card2-title');
    const whyCard2Desc = document.getElementById('why-card2-desc');
    const whyCard3Title = document.getElementById('why-card3-title');
    const whyCard3Desc = document.getElementById('why-card3-desc');

    if (heroTitleInput) heroTitleInput.value = config.heroTitle || '';
    if (heroSubtitleInput) heroSubtitleInput.value = config.heroSubtitle || '';
    if (heroImageInput) heroImageInput.value = config.heroImage || '';
    if (heroBadgeTopInput) heroBadgeTopInput.value = config.heroBadgeTop || '';
    if (heroBadgeTitleInput) heroBadgeTitleInput.value = config.heroBadgeTitle || '';
    if (heroBadgeBottomInput) heroBadgeBottomInput.value = config.heroBadgeBottom || '';
    if (heroCta1Text) heroCta1Text.value = config.heroCta1Text || '';
    if (heroCta1Link) heroCta1Link.value = config.heroCta1Link || '';
    if (heroCta2Text) heroCta2Text.value = config.heroCta2Text || '';
    if (heroCta2Link) heroCta2Link.value = config.heroCta2Link || '';
    if (whyTitleInput) whyTitleInput.value = config.whyTitle || '';
    if (whySubtitleInput) whySubtitleInput.value = config.whySubtitle || '';
    if (whyCard1Title) whyCard1Title.value = config.whyCard1Title || '';
    if (whyCard1Desc) whyCard1Desc.value = config.whyCard1Desc || '';
    if (whyCard2Title) whyCard2Title.value = config.whyCard2Title || '';
    if (whyCard2Desc) whyCard2Desc.value = config.whyCard2Desc || '';
    if (whyCard3Title) whyCard3Title.value = config.whyCard3Title || '';
    if (whyCard3Desc) whyCard3Desc.value = config.whyCard3Desc || '';

    // Set Images
    const setPreview = (url, imgEl, msgEl) => {
      if (url && typeof url === 'string' && url !== 'null') {
        imgEl.src = url;
        imgEl.style.display = 'block';
        msgEl.style.display = 'none';
      } else {
        // No valid image
        imgEl.removeAttribute('src');
        imgEl.style.display = 'none';
        msgEl.style.display = 'block';
      }
    };

    const setHeroPreview = (url) => {
      const heroImagePreview = document.getElementById('hero-image-preview');
      const heroImagePlaceholder = document.getElementById('hero-image-placeholder');
      if (!heroImagePreview || !heroImagePlaceholder) return;
      if (url && typeof url === 'string' && url !== 'null') {
        heroImagePreview.src = url;
        heroImagePreview.style.display = 'block';
        heroImagePlaceholder.style.display = 'none';
      } else {
        heroImagePreview.removeAttribute('src');
        heroImagePreview.style.display = 'none';
        heroImagePlaceholder.style.display = 'flex';
      }
    };

    if (Array.isArray(gallery) && gallery.length >= 2) {
      setPreview(gallery[0], previewBefore, msgBefore);
      setPreview(gallery[1], previewAfter, msgAfter);
    }
    setHeroPreview(config.heroImage || null);
    renderPreview();

  } catch (err) {
    console.error('Error loading site content:', err);
  }
}

// ================== Comparison Slider Logic ==================

function addComparisonRow(data = {}) {
  const container = document.getElementById('comparison-list-container');
  if (!container) return;

  const div = document.createElement('div');
  div.className = 'comparison-pair';
  div.style.cssText = 'border: 1px solid #eee; padding: 1rem; margin-bottom: 0.5rem; border-radius: 8px; background: #fff; position: relative; margin-top: 5px;';

  // Before
  const beforeHtml = `
    <div style="flex:1;">
      <label style="font-size:0.8rem; font-weight:600; color:#ea580c; display:block; margin-bottom:4px;">Before</label>
      <input type="file" class="file-before form-control" accept="image/*" style="font-size:0.8rem; padding: 0.4rem;">
      <div class="preview-before-box" style="margin-top:0.5rem; height:100px; background:#f9fafb; border:1px dashed #ddd; display:flex; align-items:center; justify-content:center; overflow:hidden; position:relative; border-radius:4px;">
        ${data.before ? `<img src="${data.before}" style="width:100%; height:100%; object-fit:cover;">` : '<span style="color:#ccc; font-size:0.8rem;">No Image</span>'}
      </div>
      <input type="hidden" class="url-before" value="${data.before || ''}">
    </div>
  `;

  // After
  const afterHtml = `
    <div style="flex:1;">
      <label style="font-size:0.8rem; font-weight:600; color:#059669; display:block; margin-bottom:4px;">After</label>
      <input type="file" class="file-after form-control" accept="image/*" style="font-size:0.8rem; padding: 0.4rem;">
      <div class="preview-after-box" style="margin-top:0.5rem; height:100px; background:#f9fafb; border:1px dashed #ddd; display:flex; align-items:center; justify-content:center; overflow:hidden; position:relative; border-radius:4px;">
         ${data.after ? `<img src="${data.after}" style="width:100%; height:100%; object-fit:cover;">` : '<span style="color:#ccc; font-size:0.8rem;">No Image</span>'}
      </div>
      <input type="hidden" class="url-after" value="${data.after || ''}">
    </div>
  `;

  div.innerHTML = beforeHtml + afterHtml + `
    <button type="button" class="btn-remove-pair" style="background:#fee2e2; color:#b91c1c; border:none; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; position:absolute; top:-10px; right:-10px; box-shadow:0 2px 4px rgba(0,0,0,0.1); font-weight:bold;">×</button>
  `;

  // Event Listeners for Previews
  const bindPreview = (fileInput, previewBox) => {
    fileInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = evt => {
          previewBox.innerHTML = `<img src="${evt.target.result}" style="width:100%; height:100%; object-fit:cover;">`;
        };
        reader.readAsDataURL(file);
      }
    });
  };

  bindPreview(div.querySelector('.file-before'), div.querySelector('.preview-before-box'));
  bindPreview(div.querySelector('.file-after'), div.querySelector('.preview-after-box'));

  // Remove
  div.querySelector('.btn-remove-pair').addEventListener('click', () => div.remove());

  container.appendChild(div);
}

// Init Add Button
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-add-comparison');
  if (btn) btn.addEventListener('click', () => addComparisonRow());
});

// =========================================================
// ARTICLE MANAGEMENT (CMS)
// =========================================================

async function loadArticlesList() {
  const tbody = document.getElementById('articles-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">กำลังโหลด...</td></tr>';

  try {
    articlesData = await getArticles();
    renderArticlesTable(articlesData);
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:red;">โหลดข้อมูลล้มเหลว</td></tr>';
  }
}

function renderArticlesTable(articles) {
  const tbody = document.getElementById('articles-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!articles.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; color:#999;">ยังไม่มีบทความ</td></tr>';
    return;
  }

  articles.forEach(article => {
    const tr = document.createElement('tr');

    // Status Badge
    const statusBadges = {
      true: '<span class="status-badge status-active">เผยแพร่แล้ว</span>',
      false: '<span class="status-badge" style="background:#f3f4f6; color:#6b7280;">ฉบับร่าง</span>'
    };

    // Date Format
    const dateStr = new Date(article.created_at).toLocaleDateString('th-TH', {
      year: 'numeric', month: 'short', day: 'numeric'
    });

    tr.innerHTML = `
      <td style="font-weight:600; color:#1f2937;">${article.title}</td>
      <td><span class="badge" style="background:#fff7ed; color:#c2410c;">${article.category || 'General'}</span></td>
      <td>${statusBadges[article.is_published]}</td>
      <td style="color:#6b7280; font-size:0.9rem;">${dateStr}</td>
      <td>
        <div style="display:flex; gap:0.5rem;">
          <button class="btn btn-sm edit-article-btn" style="padding:0.4rem 0.8rem; font-size:0.85rem;">แก้ไข</button>
          <button class="btn btn-sm btn-secondary delete-article-btn" style="padding:0.4rem 0.8rem; font-size:0.85rem; background:#fee2e2; color:#b91c1c; border:none;">ลบ</button>
        </div>
      </td>
    `;

    // Events
    tr.querySelector('.edit-article-btn').addEventListener('click', () => openArticleModal(article));
    tr.querySelector('.delete-article-btn').addEventListener('click', () => handleArticleDelete(article.id));

    tbody.appendChild(tr);
  });
}

// Modal Logic
function getArticleElements() {
  return {
    modal: document.getElementById('article-modal'),
    form: document.getElementById('article-form'),
    title: document.getElementById('article-modal-title')
  };
}

function openArticleModal(article = null) {
  const { modal: articleModal, form: articleForm, title: titleEl } = getArticleElements();

  if (!articleModal || !articleForm) {
    console.error('Article elements not found via getArticleElements');
    return;
  }
  articleForm.reset();

  if (article) {
    if (titleEl) titleEl.textContent = 'แก้ไขบทความ';
    articleForm.id.value = article.id;
    articleForm.title.value = article.title;
    articleForm.category.value = article.category || 'General';
    articleForm.is_published.value = article.is_published.toString();
    articleForm.cover_image.value = article.cover_image || '';
    document.getElementById('article-cover-preview').src = article.cover_image || 'https://placehold.co/150x100?text=No+Image';
    articleForm.excerpt.value = article.excerpt || '';
    articleForm.content.value = article.content || '';
  } else {
    if (titleEl) titleEl.textContent = 'เขียนบทความใหม่';
    articleForm.id.value = '';
    articleForm.is_published.value = 'false'; // Default Draft
    document.getElementById('article-cover-preview').src = 'https://placehold.co/150x100?text=No+Image';
  }

  articleModal.classList.add('open');
}

function closeArticleModal() {
  const { modal } = getArticleElements();
  if (modal) modal.classList.remove('open');
}

// Save Logic
async function handleArticleSave(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const oldText = btn ? btn.textContent : 'บันทึก';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
  }

  try {
    const formData = new FormData(e.target);
    const payload = {
      title: formData.get('title'),
      category: formData.get('category'),
      is_published: formData.get('is_published') === 'true',
      cover_image: formData.get('cover_image'),
      excerpt: formData.get('excerpt'),
      content: formData.get('content')
    };

    const id = formData.get('id');

    if (id) {
      // Update
      await updateArticle(id, { ...payload, updated_at: new Date() });
      toast('บันทึกการแก้ไขเรียบร้อย', 2000, 'success');
    } else {
      // Create
      await createArticle(payload);
      toast('สร้างบทความใหม่เรียบร้อย', 2000, 'success');
    }

    closeArticleModal();
    loadArticlesList(); // Refresh

  } catch (err) {
    console.error(err);
    toast('เกิดข้อผิดพลาด: ' + err.message, 3000, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  }
}

async function handleArticleDelete(id) {
  if (!confirm('ยืนยันที่จะลบบทความนี้? การกระทำนี้ไม่สามารถเรียกคืนได้')) return;

  try {
    await deleteArticle(id);
    toast('ลบบทความเรียบร้อย', 2000, 'success');
    loadArticlesList();
  } catch (err) {
    toast('ลบไม่สำเร็จ: ' + err.message, 3000, 'error');
  }
}

// Setup Article Listeners
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing Article Listeners...');
  const addBtn = document.getElementById('add-article-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      console.log('Add Article Clicked');
      openArticleModal(null);
    });
  } else {
    console.error('Add Article Button NOT FOUND');
  }

  const { form } = getArticleElements();
  if (form) {
    form.addEventListener('submit', handleArticleSave);
  } else {
    console.error('Article Form NOT FOUND');
  }

  // Article Image Upload
  const coverFile = document.getElementById('article-cover-file');
  if (coverFile) {
    coverFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const statusEl = document.getElementById('upload-status');
      if (statusEl) statusEl.textContent = 'กำลังอัปโหลด...';

      try {
        const url = await uploadArticleImage(file);
        document.getElementById('article-cover-input').value = url;
        document.getElementById('article-cover-preview').src = url;
        if (statusEl) statusEl.textContent = 'เสร็จสิ้น';
      } catch (err) {
        console.error(err);
        if (statusEl) statusEl.textContent = 'ล้มเหลว';
        alert('อัปโหลดรูปภาพไม่สำเร็จ: ' + err.message);
      }
    });
  }

  // Valid for all modals close buttons
  document.querySelectorAll('.modal-close, .modal-close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal').forEach(m => m.classList.remove('open'));
    });
  });
});
