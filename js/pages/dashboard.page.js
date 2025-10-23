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

// DOM Elements
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

// Map Variables
let modalMap = null;
let draggableMarker = null;

// Cloudinary Config
const CLOUD_NAME = 'dupwjm8q2';
const UPLOAD_PRESET = 'praweena_property_preset';
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

// --- Core Functions ---

async function loadProperties() {
  clear(tableBody);
  // Loading Row
  const loadingRow = el('tr', {});
  const loadingCell = el('td', { textContent: 'กำลังโหลด...', attributes: { colspan: 5, style: 'text-align:center;' } });
  loadingRow.appendChild(loadingCell);
  tableBody.appendChild(loadingRow);

  try {
      const { data, error } = await listAll();
      clear(tableBody); // Clear loading row

      if (error) throw error;

      if (!data || data.length === 0) {
          const emptyRow = el('tr', {});
          const emptyCell = el('td', { textContent: 'ยังไม่มีประกาศ', attributes: { colspan: 5, style: 'text-align:center;' } });
          emptyRow.appendChild(emptyCell);
          tableBody.appendChild(emptyRow);
      } else {
          data.forEach(renderPropertyRow);
      }
  } catch (error) {
      clear(tableBody); // Clear loading row on error too
      toast('Error loading properties: ' + error.message, 4000, 'error');
  }
}

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

// --- Modal Handling ---
function openModal() { modal.classList.add('open'); }
function closeModal() {
  modal.classList.remove('open');
  propertyForm.reset();
  if (propertyForm.elements.id) propertyForm.elements.id.value = '';

  imagePreview.src = '';
  imagePreview.style.display = 'none';

  const mapContainer = $('#modal-map');
  if (mapContainer) mapContainer.style.display = 'none';

  // *** Add this line to clear dynamic YouTube inputs ***
  if (youtubeIdsContainer) clear(youtubeIdsContainer);
}

function handleEdit(prop) {
  modalTitle.textContent = `แก้ไข: ${prop.title || 'ประกาศ'}`;

  // --- Populate form fields (Corrected Loop) ---
  for (const key in prop) {
    // ข้ามฟิลด์ youtube_video_ids หลัก (ที่เป็น array) เราจะจัดการมันแยกต่างหาก
    if (key === 'youtube_video_ids') continue; 

    const element = propertyForm.elements[key];
    if (element) { // ตรวจสอบว่ามี input field ชื่อนี้ในฟอร์มหรือไม่
      if (element.type === 'checkbox') {
        element.checked = !!prop[key]; // ตั้งค่า checked สำหรับ checkbox
      } else if (element.name === 'youtube_video_ids_text') {
         // ข้าม textarea นี้ไปก่อน เพราะเราจะ populate มันทีหลัง
         continue; 
      } else {
        // ตั้งค่า value สำหรับ input ประเภทอื่นๆ (text, number, etc.)
        element.value = prop[key] ?? ''; 
      }
    }
  }
  // --- End Corrected Loop ---

  // --- Populate Dynamic YouTube ID Inputs ---
  if (youtubeIdsContainer) {
    clear(youtubeIdsContainer);
    const videoIds = Array.isArray(prop.youtube_video_ids) ? prop.youtube_video_ids : [];
    if (videoIds.length > 0) {
      videoIds.forEach(id => {
        if (id) youtubeIdsContainer.append(createYoutubeIdInput(id));
      });
    }
  }
  // ------------------------------------

  // Populate Image Preview
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
  if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ "${title || 'ประกาศนี้'}"?`)) {
    try {
        const { error } = await removeProperty(id);
        if (error) throw error;
        toast('ลบประกาศสำเร็จแล้ว', 2000, 'success');
        loadProperties();
    } catch(error) {
        toast('ลบไม่สำเร็จ: ' + error.message, 4000, 'error');
    }
  }
}

// --- Form Submission ---
propertyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = propertyForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังบันทึก...';

  const payload = getFormData(propertyForm);
  payload.published = !!payload.published;

// --- Collect YouTube Video IDs from Dynamic Inputs (Improved) ---
const videoIdInputs = $$('#youtube-ids-container .youtube-id-input');
const videoIdsArray = Array.from(videoIdInputs)
    .map(input => {
        let value = input.value.trim();
        // พยายามดึง ID จาก URL ถ้าผู้ใช้ใส่ URL เต็มมา
        try {
            const urlParams = new URLSearchParams(new URL(value).search);
            const idFromUrl = urlParams.get('v');
            if (idFromUrl) {
                value = idFromUrl; // ถ้าเจอ v=... ให้ใช้ค่านั้นแทน
            }
        } catch (e) {
            // ไม่ใช่ URL ที่ถูกต้อง หรือไม่มี v=... ก็ให้ใช้ค่าเดิมที่ผู้ใช้กรอก
        }
        return value;
    })
    .filter(id => id && /^[a-zA-Z0-9_-]{11}$/.test(id)); // กรองค่าว่าง และเช็ครูปแบบ ID มาตรฐาน (11 ตัวอักษร/ตัวเลข/ขีด)

payload.youtube_video_ids = JSON.stringify(videoIdsArray);
delete payload.youtube_video_ids_text;
// ---------------------------------------------------------

  try {
    // Upload Cover Image
    const coverFile = coverImageInput.files[0];
    if (coverFile) {
      const formData = new FormData();
      formData.append('file', coverFile);
      formData.append('upload_preset', UPLOAD_PRESET);
      const response = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
      if (!response.ok) {
          const errData = await response.json();
          throw new Error(`Cover image upload failed: ${errData?.error?.message || response.statusText}`);
      }
      const imageData = await response.json();
      payload.cover_url = imageData.secure_url;
    }

    // Upload Gallery Images
    const galleryFiles = galleryImagesInput.files;
    if (galleryFiles && galleryFiles.length > 0) {
      submitBtn.textContent = `กำลังอัปโหลดแกลเลอรี (0/${galleryFiles.length})...`;
      const uploadedImages = await Promise.all(
        Array.from(galleryFiles).map(async (file, index) => {
          submitBtn.textContent = `กำลังอัปโหลดแกลเลอรี (${index + 1}/${galleryFiles.length})...`;
          const fd = new FormData();
          fd.append('file', file);
          fd.append('upload_preset', UPLOAD_PRESET);
          const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: fd });
          if (!res.ok) {
              const errData = await res.json();
              throw new Error(`Gallery image upload failed for ${file.name}: ${errData?.error?.message || res.statusText}`);
          }
          return res.json();
        })
      );
      payload.gallery = uploadedImages.map(img => img.secure_url);
    }

    // Save data to Supabase
    const { data, error } = await upsertProperty(payload);
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

// --- Helper Functions ---

// Function to create YouTube ID input row
function createYoutubeIdInput(videoId = '') {
  const itemDiv = el('div', {
    className: 'youtube-id-item',
    style: 'display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;'
  });
  const input = el('input', {
    type: 'text',
    className: 'form-control youtube-id-input',
    style: 'flex-grow: 1;', // Make input take available space
    value: videoId,
    placeholder: 'เช่น dQw4w9WgXcQ'
  });
  const removeBtn = el('button', {
    type: 'button',
    className: 'btn btn-secondary remove-youtube-id-btn',
    textContent: 'ลบ',
    style: 'padding: 0.5rem 0.75rem; background: #fee2e2; color: #ef4444; border: none; flex-shrink: 0;'
  });
  removeBtn.addEventListener('click', () => itemDiv.remove());
  itemDiv.append(input, removeBtn);
  return itemDiv;
}

// Image Preview Handler
if (coverImageInput) {
    coverImageInput.addEventListener('change', () => {
      const file = coverImageInput.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => { imagePreview.src = e.target.result; imagePreview.style.display = 'block'; };
        reader.readAsDataURL(file);
      } else {
        imagePreview.src = ''; imagePreview.style.display = 'none';
      }
    });
}

// Map Handling Function
function setupModalMap(lat, lng) {
  const latInput = propertyForm.elements.latitude;
  const lngInput = propertyForm.elements.longitude;
  const mapContainer = $('#modal-map');
  if (!mapContainer) return; // Exit if map container doesn't exist

  // Convert lat/lng safely and set defaults
  let startLat = parseFloat(lat);
  let startLng = parseFloat(lng);
  startLat = !isNaN(startLat) ? startLat : 9.1337; // Default Lat
  startLng = !isNaN(startLng) ? startLng : 99.3325; // Default Lng

  // Update form inputs if they exist
  if (latInput) latInput.value = startLat.toFixed(6);
  if (lngInput) lngInput.value = startLng.toFixed(6);

  mapContainer.style.display = 'block';

  try { // Add try-catch for Leaflet initialization
      if (modalMap) {
          modalMap.setView([startLat, startLng], 15);
          if (draggableMarker) draggableMarker.setLatLng([startLat, startLng]);
      } else {
          modalMap = L.map('modal-map').setView([startLat, startLng], 15);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              attribution: '© OpenStreetMap contributors' // Add attribution
          }).addTo(modalMap);

          draggableMarker = L.marker([startLat, startLng], { draggable: true }).addTo(modalMap);
          draggableMarker.on('dragend', (event) => {
              const position = event.target.getLatLng();
              if (latInput) latInput.value = position.lat.toFixed(6);
              if (lngInput) lngInput.value = position.lng.toFixed(6);
          });
      }
  } catch (mapError) {
      console.error("Error initializing Leaflet map:", mapError);
      mapContainer.innerHTML = '<p style="color: red; text-align: center;">เกิดข้อผิดพลาดในการโหลดแผนที่</p>';
  }
}

// --- Main execution ---
document.addEventListener('DOMContentLoaded', async () => {
  try {
      await protectPage();
      setupNav();
      signOutIfAny();
      setupMobileNav();

      // Add listener for the YouTube '+' button safely
      if (addYoutubeIdBtn && youtubeIdsContainer) {
          addYoutubeIdBtn.addEventListener('click', () => {
              youtubeIdsContainer.append(createYoutubeIdInput());
          });
      }

      await loadProperties(); // Load properties last

  } catch (initError) {
      console.error("Initialization error:", initError);
      // Display error to user if appropriate
      if (tableBody) tableBody.innerHTML = `<tr><td colspan="5" style="color: red; text-align: center;">เกิดข้อผิดพลาดในการโหลดหน้าเว็บ</td></tr>`;
  }

  // Event listeners for the main modal (safer placement)
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);
  window.addEventListener('click', e => { if (e.target === modal) closeModal(); });

}); // End DOMContentLoaded