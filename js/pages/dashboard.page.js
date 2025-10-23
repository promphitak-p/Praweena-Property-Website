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

// --- DOM Elements ---
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

// --- Map Vars ---
let modalMap = null;
let draggableMarker = null;

// --- Cloudinary ---
const CLOUD_NAME = 'dupwjm8q2';
const UPLOAD_PRESET = 'praweena_property_preset';
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

// =====================================================
// Core
// =====================================================
async function loadProperties() {
  if (!tableBody) return;
  clear(tableBody);

  const loadingRow = el('tr', {});
  const loadingCell = el('td', {
    textContent: 'กำลังโหลด...',
    attributes: { colspan: 5, style: 'text-align:center;' }
  });
  loadingRow.appendChild(loadingCell);
  tableBody.appendChild(loadingRow);

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
      emptyRow.appendChild(emptyCell);
      tableBody.appendChild(emptyRow);
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

  tableBody.appendChild(tr);
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

  if (imagePreview) {
    imagePreview.src = '';
    imagePreview.style.display = 'none';
  }

  const mapContainer = $('#modal-map');
  if (mapContainer) mapContainer.style.display = 'none';

  if (youtubeIdsContainer) clear(youtubeIdsContainer);
}

function handleEdit(prop) {
  if (modalTitle) modalTitle.textContent = `แก้ไข: ${prop.title || 'ประกาศ'}`;

  // เติมค่าให้ฟอร์ม (ยกเว้น youtube_video_ids)
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

  // เติม YouTube IDs แบบไดนามิก
  if (youtubeIdsContainer) {
    clear(youtubeIdsContainer);
    const ids = Array.isArray(prop.youtube_video_ids) ? prop.youtube_video_ids : [];
    ids.forEach(id => id && youtubeIdsContainer.append(createYoutubeIdInput(id)));
  }

  // Preview รูป
  if (imagePreview) {
    if (prop.cover_url) {
      imagePreview.src = prop.cover_url;
      imagePreview.style.display = 'block';
    } else {
      imagePreview.style.display = 'none';
    }
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

  // เก็บ YouTube IDs จากอินพุตไดนามิก
  const videoIdInputs = $$('#youtube-ids-container .youtube-id-input');
  const videoIdsArray = Array.from(videoIdInputs)
    .map(i => parseYouTubeId(i.value))
    .filter(id => id);
  payload.youtube_video_ids = videoIdsArray;
  delete payload.youtube_video_ids_text;

  try {
    // อัปโหลด Cover
    const coverFile = coverImageInput?.files?.[0];
    if (coverFile) {
      const formData = new FormData();
      formData.append('file', coverFile);
      formData.append('upload_preset', UPLOAD_PRESET);
      const response = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(`Cover image upload failed: ${errData?.error?.message || response.statusText}`);
      }
      const imageData = await response.json();
      payload.cover_url = imageData.secure_url;
    }

    // อัปโหลด Gallery
    const galleryFiles = galleryImagesInput?.files || [];
    if (galleryFiles.length > 0) {
      submitBtn.textContent = `กำลังอัปโหลดแกลเลอรี (0/${galleryFiles.length})...`;
      const uploadedImages = await Promise.all(
        Array.from(galleryFiles).map(async (file, index) => {
          submitBtn.textContent = `กำลังอัปโหลดแกลเลอรี (${index + 1}/${galleryFiles.length})...`;
          const fd = new FormData();
          fd.append('file', file);
          fd.append('upload_preset', UPLOAD_PRESET);
          const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: fd });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(`Gallery image upload failed for ${file.name}: ${errData?.error?.message || res.statusText}`);
          }
          return res.json();
        })
      );
      payload.gallery = uploadedImages.map(img => img.secure_url);
    }

    const { error } = await upsertProperty(payload);
    if (error) throw error;

    toast('บันทึกข้อมูลสำเร็จ!', 2000, 'success');
    closeModal();
    loadProperties();
  } catch (error) {
    console.error('Failed to save property:', error);
    toast('เกิดข้อผิดพลาด: ' + error.message, 4000, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'บันทึก';
  }
});

// =====================================================
/** Helpers */
// =====================================================
function createYoutubeIdInput(videoId = '') {
  const itemDiv = el('div', {
    className: 'youtube-id-item',
    style: 'display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;'
  });
  const input = el('input', {
    type: 'text',
    className: 'form-control youtube-id-input',
    style: 'flex-grow:1;',
    value: videoId,
    placeholder: 'เช่น dQw4w9WgXcQ หรือ URL YouTube'
  });
  const removeBtn = el('button', {
    type: 'button',
    className: 'btn btn-secondary remove-youtube-id-btn',
    textContent: 'ลบ',
    style: 'padding:.5rem .75rem;background:#fee2e2;color:#ef4444;border:none;flex-shrink:0;'
  });
  removeBtn.addEventListener('click', () => itemDiv.remove());
  itemDiv.append(input, removeBtn);
  return itemDiv;
}

if (coverImageInput) {
  coverImageInput.addEventListener('change', () => {
    const file = coverImageInput.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => { imagePreview.src = e.target.result; imagePreview.style.display = 'block'; };
      reader.readAsDataURL(file);
    } else {
      imagePreview.src = '';
      imagePreview.style.display = 'none';
    }
  });
}

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
        const position = event.target.getLatLng();
        if (latInput) latInput.value = position.lat.toFixed(6);
        if (lngInput) lngInput.value = position.lng.toFixed(6);
      });
    }
  } catch (mapError) {
    console.error('Error initializing Leaflet map:', mapError);
    mapContainer.innerHTML = '<p style="color:red;text-align:center;">เกิดข้อผิดพลาดในการโหลดแผนที่</p>';
  }
}

// แยก parser YouTube ID ให้ครอบคลุม watch?v=, youtu.be/, /shorts/
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
  } catch (_) {}
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

    // ปุ่ม + YouTube (ผูกครั้งเดียว)
    if (addYoutubeIdBtn && youtubeIdsContainer) {
      addYoutubeIdBtn.addEventListener('click', () => {
        youtubeIdsContainer.append(createYoutubeIdInput());
      });
    }

// ตอนกด "เพิ่มประกาศใหม่"
if (addPropertyBtn) {
  addPropertyBtn.addEventListener('click', () => {
    if (youtubeIdsContainer) {
      clear(youtubeIdsContainer);
      youtubeIdsContainer.append(createYoutubeIdInput()); // เริ่มด้วย 1 ช่อง
    }
    openModal();
    setTimeout(() => setupModalMap(), 100);
  });
}

// จำกัดสูงสุด 5 คลิป
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


  // ปุ่มปิดโมดัล
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);
  window.addEventListener('click', e => { if (e.target === modal) closeModal(); });
});
