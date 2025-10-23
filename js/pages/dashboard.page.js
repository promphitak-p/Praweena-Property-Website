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

const tableBody = $('#properties-table tbody');
const modal = $('#property-modal');
const modalTitle = $('#modal-title');
const propertyForm = $('#property-form');
const addPropertyBtn = $('#add-property-btn');
const closeModalBtn = $('.modal-close');
const cancelModalBtn = $('.modal-cancel');
const coverImageInput = $('#cover-image-input');
const imagePreview = $('#image-preview');

let modalMap = null;
let draggableMarker = null;
const galleryImagesInput = $('#gallery-images-input');

// Cloudinary
const CLOUD_NAME = 'dupwjm8q2';
const UPLOAD_PRESET = 'praweena_property_preset';
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

// โหลดรายการ
async function loadProperties() {
  clear(tableBody);
  {
    const tr = el('tr', {});
    const td = el('td', { textContent: 'กำลังโหลด...', attributes: { colspan: 5, style: 'text-align:center;' } });
    tr.appendChild(td);
    tableBody.appendChild(tr);
  }

  const { data, error } = await listAll();

  clear(tableBody);
  if (error) return toast('Error: ' + error.message, 4000, 'error');

  if (!data || data.length === 0) {
    const tr = el('tr', {});
    const td = el('td', { textContent: 'ยังไม่มีประกาศ', attributes: { colspan: 5, style: 'text-align:center;' } });
    tr.appendChild(td);
    tableBody.appendChild(tr);
    return;
  }

  data.forEach(renderPropertyRow);
}

// แสดงแต่ละแถว
function renderPropertyRow(prop) {
  const tr = el('tr', { attributes: { 'data-id': prop.id } });

  const updatedAt = prop.updated_at ? new Date(prop.updated_at) : null;
  const updatedAtText = updatedAt && !isNaN(updatedAt) ? updatedAt.toLocaleDateString('th-TH') : '-';

  tr.innerHTML = `
    <td>${prop.title || '-'}</td>
    <td>${typeof prop.price === 'number' ? formatPrice(prop.price) : '-'}</td>
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

// Modal หลัก
function openModal() { modal.classList.add('open'); }
function closeModal() {
  modal.classList.remove('open');
  propertyForm.reset();
  if (propertyForm.elements.id) propertyForm.elements.id.value = '';

  imagePreview.src = '';
  imagePreview.style.display = 'none';

  const mapContainer = $('#modal-map');
  if (mapContainer) mapContainer.style.display = 'none';
}

addPropertyBtn.addEventListener('click', () => {
  modalTitle.textContent = 'เพิ่มประกาศใหม่';
  openModal();
  setTimeout(() => setupModalMap(), 100);
});
if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);
window.addEventListener('click', e => { if (e.target === modal) closeModal(); });

// CRUD
function handleEdit(prop) {
  modalTitle.textContent = `แก้ไข: ${prop.title}`;

  for (const key in prop) {
    if (propertyForm.elements[key]) {
		if (key !== 'youtube_video_ids' && propertyForm.elements[key]) {
			propertyForm.elements[key].checked = !!prop[key];
			} else {
				propertyForm.elements[key].value = prop[key] ?? '';
				}
			}
		}

// --- *** เพิ่มโค้ดส่วนนี้: Populate YouTube IDs Textarea *** ---
  if (Array.isArray(prop.youtube_video_ids) && propertyForm.elements.youtube_video_ids_text) {
    // Join the array back into a string with newlines for editing
    propertyForm.elements.youtube_video_ids_text.value = prop.youtube_video_ids.join('\n');
  } else if (propertyForm.elements.youtube_video_ids_text) {
    propertyForm.elements.youtube_video_ids_text.value = ''; // Clear if no data or not an array
  }
  // ---------------------------------------------------------

  if (prop.cover_url) {
    imagePreview.src = prop.cover_url;
    imagePreview.style.display = 'block';
  } else {
    imagePreview.style.display = 'none';
  }

  openModal();
  setTimeout(() => setupModalMap(prop.latitude, prop.longitude), 100);
}

async function handleDelete(id, title) {
  if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ "${title}"?`)) {
    const { error } = await removeProperty(id);
    if (error) toast('ลบไม่สำเร็จ: ' + error.message, 4000, 'error');
    else {
      toast('ลบประกาศสำเร็จแล้ว', 2000, 'success');
      loadProperties();
    }
  }
}

propertyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = propertyForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังบันทึก...';

  const payload = getFormData(propertyForm);
  payload.published = !!payload.published;
  
  // --- Process YouTube Video IDs ---
  const videoIdsText = payload.youtube_video_ids_text || ''; // Get text from textarea
  if (videoIdsText.trim()) {
      // Split by comma or newline, trim whitespace, filter out empty strings
      const videoIdsArray = videoIdsText
          .split(/[\n,]+/) // Split by newline or comma
          .map(id => id.trim()) // Remove extra spaces
          .filter(id => id); // Remove empty entries
      // Store the clean array as JSON in the real payload field
      payload.youtube_video_ids = JSON.stringify(videoIdsArray); 
  } else {
      payload.youtube_video_ids = '[]'; // Save an empty JSON array if input is empty
  }
  // Remove the temporary text field from the payload
  delete payload.youtube_video_ids_text;
  // ---------------------------------

  try {
    // อัปโหลดรูปหน้าปก
    const coverFile = coverImageInput.files[0];
    if (coverFile) {
      const formData = new FormData();
      formData.append('file', coverFile);
      formData.append('upload_preset', UPLOAD_PRESET);
      const response = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Cover image upload failed');
      const imageData = await response.json();
      payload.cover_url = imageData.secure_url;
    }

    // อัปโหลดแกลเลอรี
    const galleryFiles = galleryImagesInput.files;
    if (galleryFiles && galleryFiles.length > 0) {
      submitBtn.textContent = `กำลังอัปโหลดแกลเลอรี (0/${galleryFiles.length})...`;
      const uploadedImages = await Promise.all(
        Array.from(galleryFiles).map(async (file) => {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('upload_preset', UPLOAD_PRESET);
          const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: fd });
          if (!res.ok) throw new Error(`Gallery image upload failed for ${file.name}`);
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

// Main
document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();
  setupNav();
  signOutIfAny();
  setupMobileNav();
  loadProperties();
});

// Preview รูป
coverImageInput.addEventListener('change', () => {
  const file = coverImageInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreview.src = e.target.result;
      imagePreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  } else {
    imagePreview.style.display = 'none';
  }
});

// แผนที่
function setupModalMap(lat, lng) {
  const latInput = propertyForm.elements.latitude;
  const lngInput = propertyForm.elements.longitude;

  const startLat = (typeof lat === 'number' ? lat : parseFloat(lat)) || 9.1337;
  const startLng = (typeof lng === 'number' ? lng : parseFloat(lng)) || 99.3325;

  if (latInput) latInput.value = startLat.toFixed(6);
  if (lngInput) lngInput.value = startLng.toFixed(6);

  const mapContainer = $('#modal-map');
  if (!mapContainer) return;
  mapContainer.style.display = 'block';

  if (modalMap) {
    modalMap.setView([startLat, startLng], 15);
    if (draggableMarker) draggableMarker.setLatLng([startLat, startLng]);
    return;
  }

  // ใช้ Leaflet จาก global L
  modalMap = L.map('modal-map').setView([startLat, startLng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(modalMap);

  draggableMarker = L.marker([startLat, startLng], { draggable: true }).addTo(modalMap);
  draggableMarker.on('dragend', (event) => {
    const position = event.target.getLatLng();
    if (latInput) latInput.value = position.lat.toFixed(6);
    if (lngInput) lngInput.value = position.lng.toFixed(6);
  });
}
