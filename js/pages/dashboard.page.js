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

// =====================================================
// DOM Elements
// =====================================================
const tableBody = $('#properties-table tbody');
const modal = $('#property-modal');
const modalTitle = $('#modal-title');
const propertyForm = $('#property-form');
const addPropertyBtn = $('#add-property-btn');
const closeModalBtn = $('.modal-close');
const cancelModalBtn = $('.modal-cancel');
const coverImageInput = $('#cover-image-input');
const imagePreview = $('#image-preview');
const galleryImagesInput = $('#gallery-images-input');
const youtubeIdsContainer = $('#youtube-ids-container');
const addYoutubeIdBtn = $('#add-youtube-id-btn');

const pickCoverBtn = document.getElementById('pick-cover-btn');
const coverFileInput = document.getElementById('cover-file-input');
const imagePreviewEl = document.getElementById('image-preview');

const cropModal = document.getElementById('cover-crop-modal');
const cropClose = document.getElementById('cover-crop-close');
const cropperImage = document.getElementById('cropper-image');
const cropApplyBtn = document.getElementById('crop-apply-btn');
const cropCancelBtn = document.getElementById('crop-cancel-btn');
const cropAspectSelect = document.getElementById('crop-aspect');
const rotateLeftBtn = document.getElementById('crop-rotate-left');
const rotateRightBtn = document.getElementById('crop-rotate-right');

let cropper = null;           // instance ของ Cropper.js
let pickedFileURL = null;     // objectURL เก็บชั่วคราว
let coverUrl = null;          // URL หลังอัปโหลดเสร็จ (ไว้เซฟลง payload.cover_url)


// Cloudinary Picker UI
const pickCloudinaryBtn = $('#pick-cloudinary-btn');
const cloudinaryPickedPreview = $('#cloudinary-picked-preview');
let selectedCloudinaryUrls = [];

// Cloudinary Config
const CLOUD_NAME = 'dupwjm8q2';
const UPLOAD_PRESET = 'praweena_property_preset';
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

// Gallery Manager container
let galleryManager = $('#gallery-manager');
if (!galleryManager && galleryImagesInput) {
  galleryManager = el('div', { id: 'gallery-manager', style: 'margin-top:12px;' });
  galleryImagesInput.parentElement.append(galleryManager);
}

// Map Vars
let modalMap = null;
let draggableMarker = null;

// Local state
let currentGallery = [];

// =====================================================
// Core Load Table
// =====================================================
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
    </td>
  `;

  tr.querySelector('.edit-btn').addEventListener('click', () => handleEdit(prop));
  tr.querySelector('.delete-btn').addEventListener('click', () => handleDelete(prop.id, prop.title));

  tableBody.append(tr);
}

// =====================================================
// Gallery Manager
// =====================================================

// ====== เปิดเลือกไฟล์หน้าปก ======
if (pickCoverBtn && coverFileInput) {
  pickCoverBtn.addEventListener('click', () => coverFileInput.click());

  coverFileInput.addEventListener('change', () => {
    const file = coverFileInput.files?.[0];
    if (!file) return;
    // สร้าง objectURL แล้วโยนให้ Cropper
    if (pickedFileURL) URL.revokeObjectURL(pickedFileURL);
    pickedFileURL = URL.createObjectURL(file);
    cropperImage.src = pickedFileURL;
    openCropModal();
  });
}

// ====== Modal helpers ======
function openCropModal() {
  cropModal.classList.add('open');
  // รอภาพโหลดเสร็จ ก่อน init cropper
  cropperImage.onload = () => {
    if (cropper) cropper.destroy();
    cropper = new Cropper(cropperImage, {
      viewMode: 1,
      dragMode: 'move',
      aspectRatio: 16 / 9,      // ค่าเริ่มต้น
      autoCropArea: 1,
      responsive: true,
      background: false,
      checkCrossOrigin: false,
    });
  };
}
function closeCropModal() {
  cropModal.classList.remove('open');
  if (cropper) { cropper.destroy(); cropper = null; }
  if (pickedFileURL) { URL.revokeObjectURL(pickedFileURL); pickedFileURL = null; }
}

// ปุ่มปิด/ยกเลิก
if (cropClose) cropClose.addEventListener('click', closeCropModal);
if (cropCancelBtn) cropCancelBtn.addEventListener('click', closeCropModal);

// เปลี่ยนอัตราส่วน
if (cropAspectSelect) {
  cropAspectSelect.addEventListener('change', () => {
    if (!cropper) return;
    const val = cropAspectSelect.value;
    const ratio = isNaN(Number(val)) ? eval(val) : Number(val); // "16/9" -> 1.777...
    cropper.setAspectRatio(isNaN(ratio) ? NaN : ratio);
  });
}

// หมุน
if (rotateLeftBtn) rotateLeftBtn.addEventListener('click', () => { if (cropper) cropper.rotate(-90); });
if (rotateRightBtn) rotateRightBtn.addEventListener('click', () => { if (cropper) cropper.rotate(90); });

// ยืนยันครอบ → export canvas → อัปโหลด Cloudinary → แสดงพรีวิว
if (cropApplyBtn) {
  cropApplyBtn.addEventListener('click', async () => {
    if (!cropper) return;

    try {
      // สร้าง canvas ตามอัตราส่วนปัจจุบัน (กำหนดความกว้างเป้าหมายเพื่อคุณภาพ)
      const canvas = cropper.getCroppedCanvas({ 
        // ปรับขนาดตามความเหมาะสมของเว็บ: 1600px กว้างพอสำหรับ hero/cover
        width: 1600,
        fillColor: '#fff',
      });
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.9));

      // อัปขึ้น Cloudinary (unsigned)
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

      // แสดงพรีวิว
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

// ====== รวมเข้ากับการ “บันทึกประกาศ” เดิม ======
// ก่อนส่ง payload (เวลาคุณกดปุ่ม บันทึก)
// ... สมมติคุณมี payload จาก getFormData() เหมือนเดิม
// ให้ตั้งค่า cover_url จาก coverUrl (ถ้ามี) หรือ fallback เป็นรูปแรกของ gallery

// ตัวอย่างใน handler submit ของฟอร์ม:
function applyCoverToPayload(payload, galleryArray) {
  // ถ้าเพิ่งครอบใหม่ → ใช้ url ใหม่นี้
  if (coverUrl) {
    payload.cover_url = coverUrl;
  } else if (!payload.cover_url) {
    // ยังไม่มี -> ใช้รูปแรกในแกลเลอรี
    payload.cover_url = Array.isArray(galleryArray) && galleryArray.length ? galleryArray[0] : null;
  }
}


function renderGalleryManager() {
  if (!galleryManager) return;
  clear(galleryManager);

  if (!currentGallery.length) {
    galleryManager.append(el('p', { style: 'color:var(--text-light);', textContent: 'ยังไม่มีรูปในแกลเลอรี' }));
    return;
  }

  const wrap = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;' });

  currentGallery.forEach((url, idx) => {
    const card = el('div', {
      className: 'gm-card',
      style: 'position:relative;border-radius:8px;overflow:hidden;background:#f3f4f6;'
    });

    const img = el('img', {
      attributes: { src: url, alt: 'gallery-image' },
      style: 'width:100%;height:100px;object-fit:cover;display:block;'
    });

    if (idx === 0) {
      const badge = el('div', {
        className: 'gm-cover-badge',
        style: 'position:absolute;left:6px;top:6px;background:rgba(0,0,0,.55);color:#fff;font-size:12px;padding:2px 6px;border-radius:6px;'
      });
      badge.textContent = 'หน้าปก';
      card.append(badge);
    }

    const bar = el('div', {
      style: 'position:absolute;inset:auto 0 0 0;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.55));padding:6px;display:flex;gap:6px;justify-content:flex-end;'
    });

    const setCoverBtn = el('button', {
      className: 'btn btn-secondary',
      style: 'padding:4px 8px;font-size:12px;background:rgba(255,255,255,.9);color:#111;border:none;border-radius:6px;',
      textContent: 'ตั้งเป็นหน้าปก'
    });
    setCoverBtn.addEventListener('click', () => {
      if (idx === 0) return;
      const [item] = currentGallery.splice(idx, 1);
      currentGallery.unshift(item);
      renderGalleryManager();
    });

    const removeBtn = el('button', {
      className: 'btn btn-secondary',
      style: 'padding:4px 8px;font-size:12px;background:rgba(239,68,68,.95);color:#fff;border:none;border-radius:6px;',
      textContent: 'ลบ'
    });
    removeBtn.addEventListener('click', () => {
      currentGallery.splice(idx, 1);
      renderGalleryManager();
    });

    bar.append(setCoverBtn, removeBtn);
    card.append(img, bar);
    wrap.append(card);
  });

  galleryManager.append(wrap);
}

// =====================================================
// Upload new gallery images
// =====================================================
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

      currentGallery.push(...uploaded.map(x => x.secure_url));
      renderGalleryManager();
      galleryImagesInput.value = '';
    } catch (e) {
      toast('อัปโหลดแกลเลอรีไม่สำเร็จ: ' + e.message, 4000, 'error');
    }
  });
}

// =====================================================
// Cloudinary Picker
// =====================================================
function renderPickedPreview() {
  if (!cloudinaryPickedPreview) return;
  cloudinaryPickedPreview.innerHTML = '';

  selectedCloudinaryUrls.forEach((url, idx) => {
    const wrap = el('div', {
      style: 'position:relative;width:84px;height:84px;border-radius:8px;overflow:hidden;background:#eee;'
    });
    const img = el('img', {
      attributes: { src: url, alt: 'gallery' },
      style: 'width:100%;height:100%;object-fit:cover;display:block;'
    });

    const del = el('button', {
      type: 'button',
      style: 'position:absolute;top:4px;right:4px;width:24px;height:24px;border:none;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;'
    });
    del.innerHTML = '&times;';
    del.addEventListener('click', () => {
      selectedCloudinaryUrls.splice(idx, 1);
      renderPickedPreview();
    });

    wrap.append(img, del);
    cloudinaryPickedPreview.append(wrap);
  });
}

// =====================================================
// Modal Handling
// =====================================================
function openModal() { if (modal) modal.classList.add('open'); }

function closeModal() {
  if (!modal || !propertyForm) return;
  modal.classList.remove('open');
  propertyForm.reset();
  if (propertyForm.elements.id) propertyForm.elements.id.value = '';
  if (imagePreview) { imagePreview.src = ''; imagePreview.style.display = 'none'; }
  const mapContainer = $('#modal-map');
  if (mapContainer) mapContainer.style.display = 'none';
  if (youtubeIdsContainer) clear(youtubeIdsContainer);
  selectedCloudinaryUrls = [];
  if (cloudinaryPickedPreview) cloudinaryPickedPreview.innerHTML = '';
  currentGallery = [];
  renderGalleryManager();
}

// =====================================================
// Handle Edit
// =====================================================
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

  for (const key in prop) {
    if (key === 'youtube_video_ids') continue;
    const elmt = propertyForm.elements[key];
    if (!elmt) continue;

    if (elmt.type === 'checkbox') {
      elmt.checked = !!prop[key];
    } else if (elmt.name === 'youtube_video_ids_text') {
      continue;
    } else {
      elmt.value = prop[key] ?? '';
    }
  }

  selectedCloudinaryUrls = Array.isArray(prop.gallery) ? [...prop.gallery] : [];
  renderPickedPreview();

  currentGallery = Array.isArray(prop.gallery) ? [...prop.gallery] : [];
  renderGalleryManager();

  if (imagePreview) {
    const url = prop.cover_url || currentGallery[0] || '';
    if (url) { imagePreview.src = url; imagePreview.style.display = 'block'; }
    else imagePreview.style.display = 'none';
  }

  if (youtubeIdsContainer) {
    clear(youtubeIdsContainer);
    const ids = normalizeYoutubeIds(prop.youtube_video_ids);
    ids.forEach(id => youtubeIdsContainer.append(createYoutubeIdInput(id)));
  }

  openModal();
  setTimeout(() => setupModalMap(prop.latitude, prop.longitude), 100);
}

// =====================================================
// CRUD
// =====================================================
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

propertyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = propertyForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังบันทึก...';
  const payload = getFormData(propertyForm);
  payload.published = !!payload.published;
  if (payload.price !== undefined) payload.price = Number(payload.price) || 0;

  const videoIdInputs = $$('#youtube-ids-container .youtube-id-input');
  const newIds = Array.from(videoIdInputs).map(i => parseYouTubeId(i.value)).filter(Boolean);
  payload.youtube_video_ids = Array.from(new Set(newIds));
  payload.gallery = [...currentGallery];
  payload.cover_url = payload.gallery.length ? payload.gallery[0] : null;

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

// =====================================================
// Helper: YouTube Input
// =====================================================
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
    } else previewWrap.textContent = 'ใส่ YouTube ID หรือ URL ให้ถูกต้อง';
    previewWrap.append(removeBtn);
  }
  input.addEventListener('input', (e) => updatePreview(e.target.value));
  updatePreview(videoId);
  itemDiv.append(input, previewWrap);
  return itemDiv;
}

// =====================================================
// Map
// =====================================================
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
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(modalMap);
      draggableMarker = L.marker([startLat, startLng], { draggable: true }).addTo(modalMap);
      draggableMarker.on('dragend', (event) => {
        const pos = event.target.getLatLng();
        if (latInput) latInput.value = pos.lat.toFixed(6);
        if (lngInput) lngInput.value = pos.lng.toFixed(6);
      });
    }
  } catch (err) {
    mapContainer.innerHTML = '<p style="color:red;text-align:center;">เกิดข้อผิดพลาดในการโหลดแผนที่</p>';
  }
}

// =====================================================
// Parse YouTube
// =====================================================
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

// =====================================================
// Init
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await protectPage();
    setupNav();
    signOutIfAny();
    setupMobileNav();

    if (addPropertyBtn) {
      addPropertyBtn.addEventListener('click', () => {
        if (youtubeIdsContainer) {
          clear(youtubeIdsContainer);
          youtubeIdsContainer.append(createYoutubeIdInput());
        }
        currentGallery = [];
        renderGalleryManager();
        openModal();
        setTimeout(() => setupModalMap(), 100);
      });
    }

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

    await loadProperties();

if (pickCloudinaryBtn) {
  pickCloudinaryBtn.addEventListener('click', () => {
    try {
      if (!window.cloudinary) {
        toast('ยังโหลดวิดเจ็ต Cloudinary ไม่เสร็จ ลองรีเฟรชหน้าอีกครั้ง', 4000, 'error');
        return;
      }

      window.cloudinary.openMediaLibrary(
        {
          cloud_name: CLOUD_NAME,
          api_key: '847189155667559', // ใส่ API key จริง
          multiple: true,
          max_files: 50,
          // กรองเฉพาะรูปถ้าต้องการ:
          // asset: 'image'
        },
        {
          insertHandler: ({ assets }) => {
            if (!assets || !assets.length) return;
            const urls = assets.map(a => a.secure_url).filter(Boolean);
            selectedCloudinaryUrls = Array.from(new Set([...selectedCloudinaryUrls, ...urls]));
            renderPickedPreview();
            toast(`เพิ่มรูปจาก Cloudinary แล้ว ${urls.length} รูป`, 2000, 'success');
          }
        }
      );
    } catch (err) {
      console.error(err);
      toast('เปิด Media Library ไม่สำเร็จ: ' + (err?.message || 'ไม่ทราบสาเหตุ'), 4000, 'error');
    }
  });
}


  } catch (initError) {
    console.error('Initialization error:', initError);
    if (tableBody)
      tableBody.innerHTML = `<tr><td colspan="5" style="color:red;text-align:center;">เกิดข้อผิดพลาดในการโหลดหน้าเว็บ</td></tr>`;
  }

  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);
  window.addEventListener('click', e => { if (e.target === modal) closeModal(); });
});
