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
import { supabase } from '../utils/supabaseClient.js'; // เพิ่มบรรทัดนี้

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

// แผนที่
let modalMap = null;
let draggableMarker = null;

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

let cropper = null;        // instance ของ Cropper.js
let pickedFileURL = null;  // objectURL ชั่วคราว
let coverUrl = null;       // URL หน้าปกหลังอัปโหลดเสร็จ

/* =====================================================
   Local state
===================================================== */
let currentGallery = [];   // เก็บ URL ของรูปในแกลเลอรีตามลำดับ

// กล่องแสดงตัวจัดการแกลเลอรี (thumbnail + ปุ่ม)
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
  tr.querySelector('.btn-fill-poi')
	.addEventListener('click', () => fillPOI(prop.id));

  tableBody.append(tr);
  
    // ถ้าไม่ใช่แอดมิน ซ่อน/ปิดปุ่มแก้ไข-ลบ
  if (!IS_ADMIN) {
    tr.querySelector('.edit-btn')?.setAttribute('disabled', 'true');
    tr.querySelector('.edit-btn')?.classList.add('btn-disabled');
    tr.querySelector('.edit-btn')?.setAttribute('title', 'เฉพาะแอดมิน');

    tr.querySelector('.delete-btn')?.setAttribute('disabled', 'true');
    tr.querySelector('.delete-btn')?.classList.add('btn-disabled');
    tr.querySelector('.delete-btn')?.setAttribute('title', 'เฉพาะแอดมิน');
  }

  
}

/* =====================================================
   Cover: เลือกไฟล์ + ครอบรูป + อัปโหลด
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
    // ต้องมี <link/script> ของ cropperjs ใน HTML:
    // https://unpkg.com/cropperjs@1.6.2/dist/cropper.min.css
    // https://unpkg.com/cropperjs@1.6.2/dist/cropper.min.js
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
    const val = cropAspectSelect.value; // "16/9" | "4/3" | "1/1" | "NaN"
    let ratio;
    try { ratio = eval(val); } catch { ratio = NaN; }
    cropper.setAspectRatio(isNaN(ratio) ? NaN : ratio);
  });
}
if (rotateLeftBtn)  rotateLeftBtn.addEventListener('click',  () => { if (cropper) cropper.rotate(-90); });
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

// helper เอาไปใช้ก่อน upsert
function applyCoverToPayload(payload, galleryArray) {
  if (coverUrl) {
    payload.cover_url = coverUrl;
  } else if (!payload.cover_url) {
    payload.cover_url = Array.isArray(galleryArray) && galleryArray.length ? galleryArray[0] : null;
  }
}

/* =====================================================
   Gallery Manager (UI + Upload)
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

  // ใช้ .gm-wrap (flex + wrap) ไม่ใช้ inline-style แล้ว
  const wrap = el('div', { className: 'gm-wrap' });

  currentGallery.forEach((url, idx) => {
    const card = el('div', { className: 'gm-card' });

const img = el('img', {
  attributes: { src: cldThumb(url, 220, 160), alt: 'gallery-image', loading: 'lazy' }
});


    // badge "หน้าปก" เฉพาะรูปแรก
    if (idx === 0) {
      const badge = el('div', { className: 'gm-cover-badge' });
      badge.textContent = 'หน้าปก';
      card.append(badge);
    }

    // ปุ่มลบ (ใช้สไตล์เดียวกับลบวิดีโอ)
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

  // อัปเดตพรีวิวหน้าปกเป็นรูปแรกเสมอ
  const cover = currentGallery[0] || '';
  if (imagePreviewEl) {
    if (cover) { imagePreviewEl.src = cover; imagePreviewEl.style.display = 'block'; }
    else { imagePreviewEl.src = ''; imagePreviewEl.style.display = 'none'; }
  }
}



// อัปโหลดรูปเพิ่มเข้าแกลเลอรี (จากเครื่องผู้ใช้)
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

      // ถ้าไม่มีหน้าปก ให้ตั้งรูปแรกของแกลเลอรีที่เพิ่มมาเป็นพรีวิว
      if (imagePreviewEl && currentGallery.length && !imagePreviewEl.src) {
        imagePreviewEl.src = currentGallery[0];
        imagePreviewEl.style.display = 'block';
      }

      galleryImagesInput.value = ''; // reset เพื่อเลือกไฟล์เดิมซ้ำได้
    } catch (e) {
      toast('อัปโหลดแกลเลอรีไม่สำเร็จ: ' + e.message, 4000, 'error');
    }
  });
}

// แปลง Cloudinary URL ให้เป็นรูปย่อ (ถ้าไม่ใช่ Cloudinary จะคืน url เดิม)
function cldThumb(url, w = 240, h = 160) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('res.cloudinary.com')) return url;
    // แทรกทรานส์ฟอร์ม c_fill, f_auto, q_auto, dpr_auto
    // https://res.cloudinary.com/<cloud>/image/upload/<transforms>/<publicId>...
    const parts = u.pathname.split('/'); // ["","<cloud>","image","upload", ... ]
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
    document.body.classList.add('no-scroll'); // <— ล็อกพื้นหลัง
  }
}

function closeModal() {
  if (!modal || !propertyForm) return;
  modal.classList.remove('open');
  document.body.classList.remove('no-scroll'); // <— คืนสกรอลพื้นหลัง
  propertyForm.reset();
  if (propertyForm.elements.id) propertyForm.elements.id.value = '';
  if (imagePreviewEl) { imagePreviewEl.src = ''; imagePreviewEl.style.display = 'none'; }

  const mapContainer = $('#modal-map');
  if (mapContainer) mapContainer.style.display = 'none';

  if (youtubeIdsContainer) clear(youtubeIdsContainer);

  // รีเซ็ต state
  currentGallery = [];
  coverUrl = null;
  renderGalleryManager();

  // ปิด + ทำลาย cropper ถ้ายังเปิดค้าง
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

  // เติมค่าให้ input ต่าง ๆ
  for (const key in prop) {
    if (key === 'youtube_video_ids') continue;
    const elmt = propertyForm.elements[key];
    if (!elmt) continue;
    if (elmt.type === 'checkbox') elmt.checked = !!prop[key];
    else if (elmt.name === 'youtube_video_ids_text') continue;
    else elmt.value = prop[key] ?? '';
  }

  // โหลดแกลเลอรีเดิม
  currentGallery = Array.isArray(prop.gallery) ? [...prop.gallery] : [];
  renderGalleryManager();

  // พรีวิว cover (ถ้าไม่มี ใช้รูปแรกของแกลเลอรี)
  if (imagePreviewEl) {
    const url = prop.cover_url || currentGallery[0] || '';
    if (url) { imagePreviewEl.src = url; imagePreviewEl.style.display = 'block'; }
    else imagePreviewEl.style.display = 'none';
  }

  // YouTube IDs
  if (youtubeIdsContainer) {
    clear(youtubeIdsContainer);
    const ids = normalizeYoutubeIds(prop.youtube_video_ids);
    ids.forEach(id => youtubeIdsContainer.append(createYoutubeIdInput(id)));
  }

  openModal();
  setTimeout(() => setupModalMap(prop.latitude, prop.longitude), 100);
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

  // gallery และ cover
  payload.gallery = [...currentGallery];
  payload.cover_url = payload.gallery.length ? payload.gallery[0] : null; // รูปแรกเสมอ

  try {
    const { error } = await upsertProperty(payload);
    if (error) throw error;
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

// ครอบคลุม watch?v=, youtu.be/, /shorts/
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
   แผนที่ (Leaflet)
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
      draggableMarker.on('dragend', (event) => {
        const pos = event.target.getLatLng();
        if (latInput) latInput.value = pos.lat.toFixed(6);
        if (lngInput) lngInput.value = pos.lng.toFixed(6);
      });
    }
  } catch {
    mapContainer.innerHTML = '<p style="color:red;text-align:center;">เกิดข้อผิดพลาดในการโหลดแผนที่</p>';
  }
}

/* =====================================================
   เติมสถานที่ใกล้เคียง (Edge Function)
===================================================== */
async function fillPOI(propertyId) {
  const btn = document.querySelector(`tr[data-id="${propertyId}"] .btn-fill-poi`);
  try {
    btn && (btn.disabled = true, btn.textContent = 'กำลังสร้าง…');
    toast('⏳ กำลังสร้างข้อมูลสถานที่ใกล้เคียง...', 3000, 'info');

    const { data, error } = await supabase.functions.invoke('fill_poi', {
      body: { property_id: propertyId },
    });
    if (error) throw error;

    const pois = Array.isArray(data?.items) ? data.items : [];
    toast(`✅ สร้างข้อมูลสถานที่ใกล้เคียง ${data?.inserted ?? pois.length} จุดสำเร็จ!`, 2000, 'success');

    const title  = document.querySelector(`tr[data-id="${propertyId}"] td:first-child`)?.textContent?.trim() || 'ประกาศ';
    const center = (typeof data?.lat === 'number' && typeof data?.lng === 'number')
      ? { lat: data.lat, lng: data.lng }
      : null;

    showPOIModal(title, pois, center);
  } catch (err) {
    console.error('fillPOI error:', err);
    toast('❌ เกิดข้อผิดพลาด: ' + err.message, 4000, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'เติมสถานที่ใกล้เคียง'; }
  }
}

/* =====================================================
   Modal แสดงผล POI ใกล้เคียง
===================================================== */
const poiModal = $('#poi-modal');
const poiModalBody = $('#poi-modal-body');
const poiModalTitle = $('#poi-modal-title');
const poiModalClose = $('#poi-modal-close');
const poiModalOk = $('#poi-modal-ok');

// วางไว้ใกล้ ๆ ส่วน Modal แสดงผล POI
let poiMiniMap = null;
let poiMiniMapLayerGroup = null;

// แปลประเภทให้เป็นไทยแบบกว้าง ๆ
function thaiType(t = '') {
  const m = t.toLowerCase();
  if (m.includes('convenience')) return 'ร้านสะดวกซื้อ';
  if (m.includes('supermarket') || m.includes('mall') || m.includes('department')) return 'ซูเปอร์/ห้าง';
  if (m.includes('cafe')) return 'คาเฟ่';
  if (m.includes('restaurant')) return 'ร้านอาหาร';
  if (m.includes('school') || m.includes('college') || m.includes('university') || m.includes('kindergarten')) return 'สถานศึกษา';
  if (m.includes('hospital') || m.includes('clinic') || m.includes('pharmacy')) return 'สถานพยาบาล';
  if (m.includes('bank') || m.includes('atm')) return 'ธนาคาร/เอทีเอ็ม';
  if (m.includes('police')) return 'สถานีตำรวจ';
  if (m.includes('post_office')) return 'ไปรษณีย์';
  if (m.includes('fuel')) return 'ปั๊มน้ำมัน';
  if (m.includes('bus') || m.includes('taxi')) return 'ขนส่งสาธารณะ';
  if (m.includes('library')) return 'ห้องสมุด';
  if (m.includes('museum') || m.includes('zoo') || m.includes('aquarium') || m.includes('attraction')) return 'แหล่งท่องเที่ยว';
  return 'สถานที่';
}

function typeEmoji(t = '') {
  const m = t.toLowerCase();
  if (m.includes('school') || m.includes('university') || m.includes('college') || m.includes('kindergarten')) return '🏫';
  if (m.includes('hospital') || m.includes('clinic') || m.includes('pharmacy')) return '🏥';
  if (m.includes('bank') || m.includes('atm')) return '🏧';
  if (m.includes('police')) return '👮';
  if (m.includes('post_office')) return '📮';
  if (m.includes('fuel')) return '⛽';
  if (m.includes('cafe')) return '☕';
  if (m.includes('restaurant')) return '🍽️';
  if (m.includes('supermarket') || m.includes('convenience') || m.includes('mall')) return '🛒';
  if (m.includes('bus') || m.includes('taxi')) return '🚌';
  if (m.includes('library')) return '📚';
  if (m.includes('museum') || m.includes('zoo') || m.includes('aquarium') || m.includes('attraction')) return '🎡';
  return '📍';
}

function renderMiniMap(containerId, center, pois = []) {
  // ทำลายของเก่าถ้ามี
  if (poiMiniMap) { poiMiniMap.remove(); poiMiniMap = null; poiMiniMapLayerGroup = null; }

  poiMiniMap = L.map(containerId, { zoomControl: false, attributionControl: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(poiMiniMap);

  poiMiniMapLayerGroup = L.layerGroup().addTo(poiMiniMap);

  const bounds = [];

  // พินบ้าน (ถ้ามีพิกัด)
  if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
    const homeMarker = L.circleMarker([center.lat, center.lng], {
      radius: 6, weight: 2, color: '#2563eb', fillColor: '#60a5fa', fillOpacity: 0.9
    }).bindTooltip('ตำแหน่งบ้าน', { direction: 'top' });
    homeMarker.addTo(poiMiniMapLayerGroup);
    bounds.push([center.lat, center.lng]);
  }

  // พิน POI เล็ก ๆ
  pois.forEach(p => {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
    const marker = L.circleMarker([p.lat, p.lng], {
      radius: 4, weight: 1.5, color: '#16a34a', fillColor: '#86efac', fillOpacity: 0.9
    }).bindTooltip(`${p.name || 'สถานที่'} — ${thaiType(p.type || p.category)}`, { direction: 'top' });
    marker.addTo(poiMiniMapLayerGroup);
    bounds.push([p.lat, p.lng]);
  });

  if (bounds.length >= 2) poiMiniMap.fitBounds(bounds, { padding: [12, 12], maxZoom: 16 });
  else if (bounds.length === 1) poiMiniMap.setView(bounds[0], 15);
  else poiMiniMap.setView([13.736, 100.523], 12); // fallback กรุงเทพ
}

function showPOIModal(title, pois = [], center = null) {
  if (!poiModal) return;

  poiModalTitle.textContent = `🏠 ${title}`;
  clear(poiModalBody);

  // ถ้าไม่มีข้อมูลเลย ก็ยังแสดงมินิแมพตำแหน่งบ้านได้
  const hasPOI = Array.isArray(pois) && pois.length > 0;

  // ทำลิสต์ (แสดง 5 รายการแรก)
  const esc = (s='') => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  const itemsHtml = hasPOI ? pois.slice(0,5).map((p, idx) => {
    const km = typeof p.distance_km === 'number' ? p.distance_km
              : typeof p.distance_m === 'number' ? p.distance_m/1000 : NaN;
    const t  = thaiType(p.type || p.category || '');
    const gmaps = (Number.isFinite(p.lat) && Number.isFinite(p.lng))
      ? ` <a href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noopener">ดูแผนที่</a>` : '';
    const line = `
      <li style="padding:.35rem 0;">
        <strong>${typeEmoji(p.type || p.category)} ${esc(p.name || '(ไม่ทราบชื่อ)')}</strong>
        — ${Number.isFinite(km) ? km.toFixed(2) : '-'} กม.
        <span style="color:var(--text-light)">(${esc(t)})</span>${gmaps}
      </li>`;
    return idx < 4 ? line + '<hr class="poi-hr"/>' : line;
  }).join('') : '<li style="color:var(--text-light);padding:.35rem 0;">ไม่พบสถานที่ใกล้เคียง</li>';

  // เติม HTML: มินิแมพ + รายการ
  poiModalBody.innerHTML = `
    <div id="poi-mini-map" class="mini-map"></div>
    <ul class="poi-list">${itemsHtml}</ul>
  `;

  // สร้างมินิแมพ
  setTimeout(() => renderMiniMap('poi-mini-map', center, pois), 0);

  poiModal.classList.add('open');
}


function closePOIModal() {
  if (poiModal) poiModal.classList.remove('open');
  if (poiMiniMap) { poiMiniMap.remove(); poiMiniMap = null; poiMiniMapLayerGroup = null; }
}

if (poiModalClose) poiModalClose.addEventListener('click', closePOIModal);
if (poiModalOk) poiModalOk.addEventListener('click', closePOIModal);
window.addEventListener('click', (e) => { if (e.target === poiModal) closePOIModal(); });

// ===== Role Detection (Admin / Viewer) =====
let IS_ADMIN = false;

async function detectRoleAndRender() {
  try {
    // เรียก RPC ฟังก์ชัน is_admin() ที่ทำใน SQL ข้อ 1
    const { data, error } = await supabase.rpc('is_admin');
    if (error) throw error;

    IS_ADMIN = !!data;

    // หา/สร้างตำแหน่งแสดงผล
    let badge = document.getElementById('role-indicator');
    if (!badge) {
      const h1 = document.querySelector('main h1');
      badge = el('div', { id: 'role-indicator' });
      if (h1 && h1.parentElement) {
        h1.insertAdjacentElement('afterend', badge);
      } else {
        (document.querySelector('main') || document.body).prepend(badge);
      }
    }

    // แต่งข้อความ + สไตล์
    badge.textContent = IS_ADMIN ? 'คุณคือแอดมิน ✅  (จัดการข้อมูลได้ทุกอย่าง)' 
                                 : 'คุณคือผู้ใช้งานทั่วไป 🔒  (โหมดอ่านอย่างเดียว)';
    badge.style.cssText = `
      display:inline-block;margin:.25rem 0 1rem 0;padding:.35rem .6rem;border-radius:999px;
      font-size:.9rem;line-height:1;background:${IS_ADMIN ? '#dcfce7' : '#e5e7eb'};
      color:${IS_ADMIN ? '#14532d' : '#374151'};border:1px solid ${IS_ADMIN ? '#86efac' : '#d1d5db'};
    `;

    // ถ้าไม่ใช่แอดมิน → ล็อก/พรางปุ่มที่เป็นงาน admin-only
    if (!IS_ADMIN) {
      addPropertyBtn?.setAttribute('disabled', 'true');
      addPropertyBtn?.classList.add('btn-disabled');
      addPropertyBtn?.setAttribute('title', 'ปุ่มนี้ใช้ได้เฉพาะแอดมิน');
      // ซ่อนปุ่มแก้ไข/ลบในตารางหลังจาก render เสร็จ
      hideAdminControlsInTable();
    }
  } catch (e) {
    console.error('detectRoleAndRender error:', e);
  }
}

// เรียกซ้ำหลัง render ตาราง เพื่อซ่อนปุ่ม edit/delete ถ้าไม่ใช่แอดมิน
function hideAdminControlsInTable() {
  if (IS_ADMIN) return;
  // ปุ่มในแถว: .edit-btn, .delete-btn
  $$('.edit-btn')?.forEach(btn => { btn.disabled = true; btn.style.opacity = .4; btn.title = 'เฉพาะแอดมิน'; });
  $$('.delete-btn')?.forEach(btn => { btn.disabled = true; btn.style.opacity = .4; btn.title = 'เฉพาะแอดมิน'; });
}


/* =====================================================
   Init
===================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await protectPage();
    setupNav();
    signOutIfAny();
    setupMobileNav();

    // 🔐 ตรวจสิทธิ์ก่อน แล้วค่อยโหลดข้อมูล
    await detectRoleAndRender();

    // ปุ่มเพิ่มประกาศ (ล็อกไว้ถ้าไม่ใช่แอดมิน — โค้ดใน detectRoleAndRender จะจัดการ)
    if (addPropertyBtn) {
      addPropertyBtn.addEventListener('click', () => {
        if (!IS_ADMIN) return; // กันเผื่อไว้
        if (youtubeIdsContainer) {
          clear(youtubeIdsContainer);
          youtubeIdsContainer.append(createYoutubeIdInput());
        }
        currentGallery = [];
        coverUrl = null;
        renderGalleryManager();
        if (imagePreviewEl) { imagePreviewEl.src = ''; imagePreviewEl.style.display = 'none'; }
        openModal();
        setTimeout(() => setupModalMap(), 100);
      });
    }

    // ปุ่ม + YouTube …
    const MAX_YT = 5;
    if (addYoutubeIdBtn && youtubeIdsContainer) {
      addYoutubeIdBtn.addEventListener('click', () => {
        const count = $$('#youtube-ids-container .youtube-id-input').length;
        if (count >= MAX_YT) {
          toast(`ใส่ได้สูงสุด ${MAX_YT} คลิป`, 3000, 'error');
          return;
        }
        youtubeIdsContainer.append(createYoutubeIdInput());
      });
    }

    await loadProperties();     // โหลดตารางหลังรู้สิทธิ์
    hideAdminControlsInTable(); // กันเหนียว เรียกอีกครั้งหลัง render แล้ว
  } catch (initError) {
    console.error('Initialization error:', initError);
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="5" style="color:red;text-align:center;">เกิดข้อผิดพลาดในการโหลดหน้าเว็บ</td></tr>`;
    }
  }

  // ปิดโมดัล…
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);
  window.addEventListener('click', e => { if (e.target === modal) closeModal(); });
});

