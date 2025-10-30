// js/pages/dashboard.page.js

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

// 👇 เพิ่ม import ชุดแมพที่กุ้งมีอยู่
import {
  ensureLeafletLoaded, initMap, createMiniMap,
  addPrecisionControl, addCopyButton, addOpenInGoogleControl,
  addPoiLegendControl, addCopyMenuControl, iconForPoiType, brandIcon
} from '../ui/leafletMap.js';

/* =====================================================
   DOM Elements
===================================================== */
const tableBody = $('#properties-table tbody');
const modal = $('#property-modal');
const modalTitle = $('#modal-title');
const propertyForm = $('#property-form');
const addPropertyBtn = $('#add-property-btn');
const closeModalBtn = $('.modal-close');
const cancelModalBtn = $('.modal-cancel');

// cover (แบบใหม่: ครอบรูปก่อนอัป)
const pickCoverBtn = $('#pick-cover-btn');
const coverFileInput = $('#cover-file-input');
const imagePreviewEl = $('#image-preview'); // พรีวิวหน้าปก

// gallery (เลือกหลายไฟล์)
const galleryImagesInput = $('#gallery-images-input');

// YouTube
const youtubeIdsContainer = $('#youtube-ids-container');
const addYoutubeIdBtn = $('#add-youtube-id-btn');

// แผนที่ใน modal
let modalMap = null;
let draggableMarker = null;

// ====== 👇 โซนใหม่: inline POI ในฟอร์ม ======
const poiInlineBox = $('#poi-inline-box');      // div ครอบรายการ POI
const poiInlineList = $('#poi-inline-list');    // ul / div แสดงรายการ
const poiInlineBtn = $('#poi-inline-fetch');    // ปุ่ม “ค้นหาจากพิกัดนี้”
let poiCandidatesInline = [];                   // เก็บรายการ POI ที่โหลดมา (สูงสุด 5)
let currentPropertyIdEditing = null;            // เก็บ id ตอนแก้ เพื่อใช้บันทึก POI

// Cloudinary (unsigned)
const CLOUD_NAME = 'dupwjm8q2';
const UPLOAD_PRESET = 'praweena_property_preset';
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

/* =====================================================
   Cropper Modal (ครอบรูปหน้าปก)
===================================================== */
const cropModal = $('#cover-crop-modal');
const cropClose = $('#cover-crop-close');
const cropperImage = $('#cropper-image');
const cropApplyBtn = $('#crop-apply-btn');
const cropCancelBtn = $('#crop-cancel-btn');
const cropAspectSelect = $('#crop-aspect');
const rotateLeftBtn = $('#crop-rotate-left');
const rotateRightBtn = $('#crop-rotate-right');

let cropper = null;
let pickedFileURL = null;
let coverUrl = null;

/* =====================================================
   Local state
===================================================== */
let currentGallery = [];   // เก็บ URL ของรูปในแกลเลอรีตามลำดับ

// กล่องแสดงตัวจัดการแกลเลอรี
let galleryManager = $('#gallery-manager');
if (!galleryManager && galleryImagesInput) {
  galleryManager = el('div', { id: 'gallery-manager', style: 'margin-top:12px;' });
  galleryImagesInput.parentElement.append(galleryManager);
}

/* =====================================================
   Load ตารางรายการประกาศ
===================================================== */
async function loadProperties() {
  if (!tableBody) return;
  clear(tableBody);

  const loadingRow = el('tr', {});
  const loadingCell = el('td', {
    textContent: 'กำลังโหลด...',
    attributes: { colspan: 5, style: 'text-align:center;' }
  });
  loadingRow.append(loadingCell);
  tableBody.append(loadingRow);

  try {
    const { data, error } = await listAll();
    clear(tableBody);
    if (error) throw error;

    if (!data || data.length === 0) {
      const emptyRow = el('tr', {});
      const emptyCell = el('td', {
        textContent: 'ยังไม่มีประกาศ',
        attributes: { colspan: 5, style: 'text-align:center;' }
      });
      emptyRow.append(emptyCell);
      tableBody.append(emptyRow);
      return;
    }

    data.forEach(renderPropertyRow);
  } catch (error) {
    clear(tableBody);
    toast('Error loading properties: ' + error.message, 4000, 'error');
  }
}

function renderPropertyRow(prop) {
  const tr = el('tr', { attributes: { 'data-id': prop.id } });
  const updatedAt = prop.updated_at ? new Date(prop.updated_at) : null;
  const updatedAtText = updatedAt && !isNaN(updatedAt) ? updatedAt.toLocaleDateString('th-TH') : '-';
  const priceNum = Number(prop.price);
  const priceText = Number.isFinite(priceNum) ? formatPrice(priceNum) : '-';

  tr.innerHTML = `
    <td>${prop.title || '-'}</td>
    <td>${priceText}</td>
    <td>${prop.published ? '✅ เผยแพร่' : '🚫 ฉบับร่าง'}</td>
    <td>${updatedAtText}</td>
    <td>
      <button class="btn btn-secondary edit-btn">แก้ไข</button>
      <button class="btn btn-secondary delete-btn" style="background:#fee2e2;color:#ef4444;border:none;">ลบ</button>
      <button class="btn btn-secondary btn-fill-poi" style="margin-left:.5rem;background:#dcfce7;color:#15803d;">เติมสถานที่ใกล้เคียง</button>
    </td>
  `;
  tr.querySelector('.edit-btn').addEventListener('click', () => handleEdit(prop));
  tr.querySelector('.delete-btn').addEventListener('click', () => handleDelete(prop.id, prop.title));
  tr.querySelector('.btn-fill-poi').addEventListener('click', () => fillPOI(prop.id));

  tableBody.append(tr);

  // ถ้าไม่ใช่แอดมิน ซ่อนปุ่ม
  if (!IS_ADMIN) {
    tr.querySelector('.edit-btn')?.setAttribute('disabled', 'true');
    tr.querySelector('.edit-btn')?.classList.add('btn-disabled');
    tr.querySelector('.delete-btn')?.setAttribute('disabled', 'true');
    tr.querySelector('.delete-btn')?.classList.add('btn-disabled');
  }
}

/* =====================================================
   Cover
===================================================== */
if (pickCoverBtn && coverFileInput) {
  pickCoverBtn.addEventListener('click', () => coverFileInput.click());
  coverFileInput.addEventListener('change', () => {
    const file = coverFileInput.files?.[0];
    if (!file) return;
    if (pickedFileURL) URL.revokeObjectURL(pickedFileURL);
    pickedFileURL = URL.createObjectURL(file);
    if (cropperImage) cropperImage.src = pickedFileURL;
    openCropModal();
  });
}

function openCropModal() {
  if (!cropModal || !cropperImage) return;
  cropModal.classList.add('open');
  cropperImage.onload = () => {
    if (cropper) cropper.destroy();
    cropper = new Cropper(cropperImage, {
      viewMode: 1,
      dragMode: 'move',
      aspectRatio: 16 / 9,
      autoCropArea: 1,
      background: false,
      responsive: true,
      checkCrossOrigin: false
    });
  };
}
function closeCropModal() {
  if (!cropModal) return;
  cropModal.classList.remove('open');
  if (cropper) { cropper.destroy(); cropper = null; }
  if (pickedFileURL) { URL.revokeObjectURL(pickedFileURL); pickedFileURL = null; }
}
if (cropClose) cropClose.addEventListener('click', closeCropModal);
if (cropCancelBtn) cropCancelBtn.addEventListener('click', closeCropModal);

if (cropAspectSelect) {
  cropAspectSelect.addEventListener('change', () => {
    if (!cropper) return;
    const val = cropAspectSelect.value;
    let ratio;
    try { ratio = eval(val); } catch { ratio = NaN; }
    cropper.setAspectRatio(isNaN(ratio) ? NaN : ratio);
  });
}
if (rotateLeftBtn) rotateLeftBtn.addEventListener('click', () => { if (cropper) cropper.rotate(-90); });
if (rotateRightBtn) rotateRightBtn.addEventListener('click', () => { if (cropper) cropper.rotate(90); });

if (cropApplyBtn) {
  cropApplyBtn.addEventListener('click', async () => {
    if (!cropper) return;
    try {
      const canvas = cropper.getCroppedCanvas({ width: 1600, fillColor: '#fff' });
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.9));

      const fd = new FormData();
      fd.append('file', blob, 'cover.jpg');
      fd.append('upload_preset', UPLOAD_PRESET);

      const resp = await fetch(CLOUDINARY_URL, { method: 'POST', body: fd });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error?.message || 'อัปโหลดหน้าปกไม่สำเร็จ');
      }
      const data = await resp.json();
      coverUrl = data.secure_url;

      if (imagePreviewEl) {
        imagePreviewEl.src = coverUrl;
        imagePreviewEl.style.display = 'block';
      }
      toast('อัปโหลดหน้าปกสำเร็จ', 1800, 'success');
      closeCropModal();
    } catch (e) {
      toast(e.message || 'เกิดข้อผิดพลาดในการอัปโหลดหน้าปก', 3000, 'error');
    }
  });
}

function applyCoverToPayload(payload, galleryArray) {
  if (coverUrl) {
    payload.cover_url = coverUrl;
  } else if (!payload.cover_url) {
    payload.cover_url = Array.isArray(galleryArray) && galleryArray.length ? galleryArray[0] : null;
  }
}

/* =====================================================
   Gallery Manager
===================================================== */
function renderGalleryManager() {
  if (!galleryManager) return;
  clear(galleryManager);

  if (!currentGallery.length) {
    galleryManager.append(
      el('p', { style: 'color:var(--text-light);text-align:center;', textContent: 'ยังไม่มีรูปในแกลเลอรี' })
    );
    if (imagePreviewEl) { imagePreviewEl.src = ''; imagePreviewEl.style.display = 'none'; }
    return;
  }

  const wrap = el('div', { className: 'gm-wrap' });

  currentGallery.forEach((url, idx) => {
    const card = el('div', { className: 'gm-card' });
    const img = el('img', {
      attributes: { src: cldThumb(url, 220, 160), alt: 'gallery-image', loading: 'lazy' }
    });

    if (idx === 0) {
      const badge = el('div', { className: 'gm-cover-badge' });
      badge.textContent = 'หน้าปก';
      card.append(badge);
    }

    const removeBtn = el('button', {
      type: 'button',
      className: 'yt-remove-btn',
      attributes: { 'aria-label': 'ลบรูปนี้', title: 'ลบรูปนี้' }
    });
    removeBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 6h18" stroke="white" stroke-width="2" stroke-linecap="round"/>
        <path d="M8 6v-.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V6" stroke="white" stroke-width="2"/>
        <path d="M8 10v8M12 10v8M16 10v8" stroke="white" stroke-width="2" stroke-linecap="round"/>
        <rect x="6" y="6" width="12" height="14" rx="2" stroke="white" stroke-width="2"/>
      </svg>
    `;
    removeBtn.addEventListener('click', () => {
      currentGallery.splice(idx, 1);
      renderGalleryManager();
    });

    card.append(img, removeBtn);
    wrap.append(card);
  });

  galleryManager.append(wrap);

  const cover = currentGallery[0] || '';
  if (imagePreviewEl) {
    if (cover) { imagePreviewEl.src = cover; imagePreviewEl.style.display = 'block'; }
    else { imagePreviewEl.src = ''; imagePreviewEl.style.display = 'none'; }
  }
}

if (galleryImagesInput) {
  galleryImagesInput.addEventListener('change', async () => {
    const files = galleryImagesInput.files || [];
    if (!files.length) return;
    try {
      const uploaded = await Promise.all(
        Array.from(files).map(async (file) => {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('upload_preset', UPLOAD_PRESET);
          const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: fd });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error?.message || 'upload failed');
          }
          return res.json();
        })
      );
      const urls = uploaded.map(x => x.secure_url);
      currentGallery.push(...urls);
      renderGalleryManager();

      if (imagePreviewEl && currentGallery.length && !imagePreviewEl.src) {
        imagePreviewEl.src = currentGallery[0];
        imagePreviewEl.style.display = 'block';
      }

      galleryImagesInput.value = '';
    } catch (e) {
      toast('อัปโหลดแกลเลอรีไม่สำเร็จ: ' + e.message, 4000, 'error');
    }
  });
}

function cldThumb(url, w = 240, h = 160) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('res.cloudinary.com')) return url;
    const parts = u.pathname.split('/');
    const uploadIdx = parts.indexOf('upload');
    if (uploadIdx === -1) return url;
    const transforms = `c_fill,w_${w},h_${h},f_auto,q_auto,dpr_auto`;
    parts.splice(uploadIdx + 1, 0, transforms);
    u.pathname = parts.join('/');
    return u.toString();
  } catch {
    return url;
  }
}

/* =====================================================
   Modal Handling
===================================================== */
function openModal() {
  if (modal) {
    modal.classList.add('open');
    document.body.classList.add('no-scroll');
  }
}

function closeModal() {
  if (!modal || !propertyForm) return;
  modal.classList.remove('open');
  document.body.classList.remove('no-scroll');
  propertyForm.reset();
  if (propertyForm.elements.id) propertyForm.elements.id.value = '';
  if (imagePreviewEl) { imagePreviewEl.src = ''; imagePreviewEl.style.display = 'none'; }

  const mapContainer = $('#modal-map');
  if (mapContainer) mapContainer.style.display = 'none';

  if (youtubeIdsContainer) clear(youtubeIdsContainer);

  // reset state
  currentGallery = [];
  coverUrl = null;
  renderGalleryManager();

  // reset inline POI
  poiCandidatesInline = [];
  renderPOIInlineList();

  closeCropModal();
}

/* =====================================================
   Edit ฟอร์ม
===================================================== */
function normalizeYoutubeIds(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
      return val.split(',').map(s => s.trim()).filter(Boolean);
    } catch {
      return val.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function handleEdit(prop) {
  if (modalTitle) modalTitle.textContent = `แก้ไข: ${prop.title || 'ประกาศ'}`;

  currentPropertyIdEditing = prop.id || null;

  for (const key in prop) {
    if (key === 'youtube_video_ids') continue;
    const elmt = propertyForm.elements[key];
    if (!elmt) continue;
    if (elmt.type === 'checkbox') elmt.checked = !!prop[key];
    else if (elmt.name === 'youtube_video_ids_text') continue;
    else elmt.value = prop[key] ?? '';
  }

  currentGallery = Array.isArray(prop.gallery) ? [...prop.gallery] : [];
  renderGalleryManager();

  if (imagePreviewEl) {
    const url = prop.cover_url || currentGallery[0] || '';
    if (url) { imagePreviewEl.src = url; imagePreviewEl.style.display = 'block'; }
    else imagePreviewEl.style.display = 'none';
  }

  if (youtubeIdsContainer) {
    clear(youtubeIdsContainer);
    const ids = normalizeYoutubeIds(prop.youtube_video_ids);
    ids.forEach(id => youtubeIdsContainer.append(createYoutubeIdInput(id)));
  }

  openModal();
  setTimeout(() => {
    setupModalMap(prop.latitude, prop.longitude);
    // โหลด POI เก่าเข้ามาแสดงเป็นรายการติ๊ก (ดึงจาก table)
    loadExistingPoiForProperty(prop.id, prop.latitude, prop.longitude);
  }, 100);
}

/* =====================================================
   CRUD
===================================================== */
async function handleDelete(id, title) {
  if (!id) return;
  if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ "${title || 'ประกาศนี้'}"?`)) return;
  try {
    const { error } = await removeProperty(id);
    if (error) throw error;
    toast('ลบประกาศสำเร็จแล้ว', 2000, 'success');
    loadProperties();
  } catch (error) {
    toast('ลบไม่สำเร็จ: ' + error.message, 4000, 'error');
  }
}

propertyForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = propertyForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังบันทึก...';

  const payload = getFormData(propertyForm);
  payload.published = !!payload.published;
  if (payload.price !== undefined) payload.price = Number(payload.price) || 0;

  // YouTube ids
  const videoIdInputs = $$('#youtube-ids-container .youtube-id-input');
  const newIds = Array.from(videoIdInputs).map(i => parseYouTubeId(i.value)).filter(Boolean);
  payload.youtube_video_ids = Array.from(new Set(newIds));

  // gallery & cover
  payload.gallery = [...currentGallery];
  payload.cover_url = payload.gallery.length ? payload.gallery[0] : null;

  try {
    // 1) บันทึก property ก่อน
    const { data, error } = await upsertProperty(payload);
    if (error) throw error;

    const newPropId = data?.id || payload.id;
    // 2) บันทึก POI ที่เลือกไว้ (inline)
    await saveInlinePois(newPropId, payload.latitude, payload.longitude);

    toast('บันทึกข้อมูลสำเร็จ!', 2000, 'success');
    closeModal();
    loadProperties();
  } catch (error) {
    toast('เกิดข้อผิดพลาด: ' + error.message, 4000, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'บันทึก';
  }
});

/* =====================================================
   YouTube helper
===================================================== */
function createYoutubeIdInput(videoId = '') {
  const itemDiv = el('div', { className: 'youtube-id-item' });
  const input = el('input', {
    type: 'text',
    className: 'form-control youtube-id-input',
    value: videoId,
    placeholder: 'เช่น dQw4w9WgXcQ หรือ URL YouTube'
  });
  const previewWrap = el('div', { className: 'yt-preview' });
  const removeBtn = el('button', {
    type: 'button',
    className: 'yt-remove-btn',
    attributes: { 'aria-label': 'ลบวิดีโอนี้', title: 'ลบวิดีโอนี้' }
  });
  removeBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6h18" stroke="white" stroke-width="2" stroke-linecap="round"/>
      <path d="M8 6v-.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V6" stroke="white" stroke-width="2"/>
      <path d="M8 10v8M12 10v8M16 10v8" stroke="white" stroke-width="2" stroke-linecap="round"/>
      <rect x="6" y="6" width="12" height="14" rx="2" stroke="white" stroke-width="2"/>
    </svg>`;
  removeBtn.addEventListener('click', () => itemDiv.remove());

  function updatePreview(value) {
    const id = parseYouTubeId(value);
    previewWrap.innerHTML = '';
    if (id) {
      const thumb = el('img', {
        className: 'yt-thumb',
        attributes: { src: `https://img.youtube.com/vi/${id}/hqdefault.jpg`, alt: `Preview ${id}` }
      });
      previewWrap.append(thumb);
    } else {
      previewWrap.textContent = 'ใส่ YouTube ID หรือ URL ให้ถูกต้อง';
    }
    previewWrap.append(removeBtn);
  }
  input.addEventListener('input', (e) => updatePreview(e.target.value));
  updatePreview(videoId);
  itemDiv.append(input, previewWrap);
  return itemDiv;
}

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

/* =====================================================
   แผนที่ (Leaflet) + Inline POI
===================================================== */
function setupModalMap(lat, lng) {
  if (!propertyForm) return;
  const latInput = propertyForm.elements.latitude;
  const lngInput = propertyForm.elements.longitude;
  const mapContainer = $('#modal-map');
  if (!mapContainer) return;

  let startLat = parseFloat(lat);
  let startLng = parseFloat(lng);
  startLat = !isNaN(startLat) ? startLat : 9.1337;
  startLng = !isNaN(startLng) ? startLng : 99.3325;

  if (latInput) latInput.value = startLat.toFixed(6);
  if (lngInput) lngInput.value = startLng.toFixed(6);

  mapContainer.style.display = 'block';
  try {
    if (modalMap) {
      modalMap.setView([startLat, startLng], 15);
      if (draggableMarker) draggableMarker.setLatLng([startLat, startLng]);
    } else {
      modalMap = L.map('modal-map').setView([startLat, startLng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(modalMap);
      draggableMarker = L.marker([startLat, startLng], { draggable: true }).addTo(modalMap);
      draggableMarker.on('dragend', async (event) => {
        const pos = event.target.getLatLng();
        if (latInput) latInput.value = pos.lat.toFixed(6);
        if (lngInput) lngInput.value = pos.lng.toFixed(6);
        // 👇 ลากหมุดแล้วโหลด POI ใหม่
        await fetchNearbyPOIInline(pos.lat, pos.lng);
      });
    }
    // เปิดมาให้โหลดเลย
    fetchNearbyPOIInline(startLat, startLng);
  } catch {
    mapContainer.innerHTML = '<p style="color:red;text-align:center;">เกิดข้อผิดพลาดในการโหลดแผนที่</p>';
  }
}

// โหลด POI จาก edge function เดิม แล้วให้ผู้ใช้เลือกในฟอร์มได้
async function fetchNearbyPOIInline(lat, lng) {
  if (!poiInlineBox) return;
  try {
    poiInlineBox.classList.add('loading');
    // เรียกฟังก์ชันบน supabase ที่กุ้งมี (เหมือนปุ่ม “เติมสถานที่ใกล้เคียง” แต่มาแค่รายการ)
    const { data, error } = await supabase.functions.invoke('fill_poi', {
      body: {
        lat,
        lng,
        preview: true,    // ให้ฝั่ง function เข้าใจว่าเอาแค่ list
        limit: 5
      }
    });
    if (error) throw error;
    // สมมติฝั่ง function ส่ง { items: [...] }
    poiCandidatesInline = Array.isArray(data?.items) ? data.items.slice(0, 5) : [];
    renderPOIInlineList();
  } catch (err) {
    console.error('fetchNearbyPOIInline error:', err);
    toast('โหลดสถานที่ใกล้เคียงไม่สำเร็จ', 2500, 'error');
    poiCandidatesInline = [];
    renderPOIInlineList();
  } finally {
    poiInlineBox.classList.remove('loading');
  }
}

function renderPOIInlineList() {
  if (!poiInlineList) return;

  clear(poiInlineList);

  if (!poiCandidatesInline.length) {
    poiInlineList.innerHTML = `<li class="poi-inline-empty">ยังไม่มีสถานที่ใกล้เคียง (ลองกด "ค้นหาจากพิกัดนี้")</li>`;
    return;
  }

  poiCandidatesInline.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'poi-inline-item';
    li.innerHTML = `
      <label class="poi-inline-row">
        <input type="checkbox" class="poi-inline-check" data-i="${i}" checked>
        <span class="poi-inline-name">${p.name || 'สถานที่'}</span>
        <span class="poi-inline-meta">${(p.distance_km ?? p.distance_m/1000 ?? 0).toFixed
