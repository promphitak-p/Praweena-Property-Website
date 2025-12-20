
import { setupMobileNav } from '../ui/mobileNav.js';
import { protectPage } from '../auth/guard.js';
import { signOutIfAny } from '../auth/auth.js';
import { listAll, upsertProperty, removeProperty, restoreProperty, hardDeleteProperty } from '../services/propertiesService.js';
import { setupNav } from '../utils/config.js';
import { formatPrice } from '../utils/format.js';
import { getFormData } from '../ui/forms.js';
import { $, $$, clear } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { supabase } from '../utils/supabaseClient.js';
import { setupScrollToTop } from '../utils/scroll.js';

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
let currentGallery = [];
let poiCandidatesInline = [];
let currentYoutube = [];
let searchTimeout = null;
let isTrashView = false;
let propertiesData = []; // Cache loaded properties

const isMobileDevice = () => {
  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
};

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
    console.error('fetchNearbyPOIInline error:', err);
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

  payload.price = Number(payload.price) || 0;
  payload.gallery = currentGallery;
  payload.cover_url = payload.gallery[0] || null;
  payload.youtube_video_ids = JSON.stringify(currentYoutube);

  payload.published = !!payload.published;
  payload.customer_status_visible = !!payload.customer_status_visible;

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
    'latitude', 'longitude', 'renovation_stage', 'customer_status_text'
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
      const stageLabel = stage ? stage : '-';

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
        <td data-label="หัวข้อ">${p.title || '-'}</td>
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
      loadProperties();
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
});
