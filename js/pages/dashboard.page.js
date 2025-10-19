// js/pages/dashboard.page.js
import { protectPage } from '../auth/guard.js';
import { signOutIfAny } from '../auth/auth.js';
import { listAll, upsertProperty, removeProperty } from '../services/propertiesService.js';
import { setupNav } from '../utils/config.js';
import { formatPrice } from '../utils/format.js';
import { getFormData } from '../ui/forms.js';
import { el, $, clear } from '../ui/dom.js';
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
let modalMap = null;       // ตัวแปรสำหรับเก็บ instance ของแผนที่
let draggableMarker = null; // ตัวแปรสำหรับเก็บ instance ของหมุด
const galleryImagesInput = $('#gallery-images-input'); // <-- เพิ่มตัวแปรนี้

// -- ADD YOUR CLOUDINARY DETAILS HERE --
const CLOUD_NAME = 'dupwjm8q2'; // << Replace with your Cloud Name
const UPLOAD_PRESET = 'praweena_property_preset'; // << Replace with your Upload Preset Name
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

/**
 * โหลดและแสดงรายการประกาศทั้งหมด
 */
async function loadProperties() {
  clear(tableBody);
  tableBody.append(el('tr', {}).appendChild(el('td', {
    textContent: 'กำลังโหลด...',
    attributes: { colspan: 5, style: 'text-align: center;' }
  })));

  const { data, error } = await listAll();

  clear(tableBody);
  if (error) return toast('Error: ' + error.message, 4000, 'error');

  if (data.length === 0) {
    tableBody.append(el('tr', {}).appendChild(el('td', {
      textContent: 'ยังไม่มีประกาศ',
      attributes: { colspan: 5, style: 'text-align: center;' }
    })));
  }

  data.forEach(renderPropertyRow);
}

/**
 * สร้างแถวในตารางสำหรับแต่ละประกาศ
 */
function renderPropertyRow(prop) {
  const tr = el('tr', { attributes: { 'data-id': prop.id } });
  
  tr.innerHTML = `
    <td>${prop.title}</td>
    <td>${formatPrice(prop.price)}</td>
    <td>${prop.published ? '✅ เผยแพร่' : '🚫 ฉบับร่าง'}</td>
    <td>${new Date(prop.updated_at).toLocaleDateString('th-TH')}</td>
    <td>
      <button class="btn btn-secondary edit-btn">แก้ไข</button>
      <button class="btn btn-secondary delete-btn" style="background: #fee2e2; color: #ef4444; border: none;">ลบ</button>
    </td>
  `;

  // Event Listeners for buttons in this row
  tr.querySelector('.edit-btn').addEventListener('click', () => handleEdit(prop));
  tr.querySelector('.delete-btn').addEventListener('click', () => handleDelete(prop.id, prop.title));

  tableBody.append(tr);
}

// --- Modal Handling ---
function openModal() { modal.classList.add('open'); }
function closeModal() {
  modal.classList.remove('open');
  propertyForm.reset();
  propertyForm.elements.id.value = '';
  // ซ่อนรูปตัวอย่าง
  imagePreview.src = '';
  imagePreview.style.display = 'none';
  // ซ่อนแผนที่
  const mapContainer = $('#modal-map');
  if (mapContainer) mapContainer.style.display = 'none';
}

addPropertyBtn.addEventListener('click', () => {
  modalTitle.textContent = 'เพิ่มประกาศใหม่';
  openModal();
  // เรียกแผนที่โดยใช้ตำแหน่งเริ่มต้น
  setTimeout(() => setupModalMap(), 100); // หน่วงเวลาเล็กน้อยเพื่อให้ Modal แสดงผลเสร็จก่อน
});
closeModalBtn.addEventListener('click', closeModal);
cancelModalBtn.addEventListener('click', closeModal);
window.addEventListener('click', e => { if (e.target === modal) closeModal(); });

// --- CRUD Handlers ---
function handleEdit(prop) {
  modalTitle.textContent = `แก้ไข: ${prop.title}`;
  // Populate form with existing data
  for (const key in prop) {
    if (propertyForm.elements[key]) {
      if (propertyForm.elements[key].type === 'checkbox') {
        propertyForm.elements[key].checked = prop[key];
      } else {
        propertyForm.elements[key].value = prop[key] || '';
      }
    }
	openModal();
  // เรียกแผนที่โดยใช้ตำแหน่งเดิมของประกาศ
  setTimeout(() => setupModalMap(prop.latitude, prop.longitude), 100);
  }
  
  if (prop.cover_url) {
    imagePreview.src = prop.cover_url;
    imagePreview.style.display = 'block';
  } else {
    imagePreview.style.display = 'none';
  }
  
  openModal();
}

async function handleDelete(id, title) {
  if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ "${title}"?`)) {
    const { error } = await removeProperty(id);
    if (error) {
      toast('ลบไม่สำเร็จ: ' + error.message, 4000, 'error');
    } else {
      toast('ลบประกาศสำเร็จแล้ว', 2000, 'success');
      loadProperties(); // Refresh the list
    }
  }
}

propertyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = propertyForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังบันทึก...';

  const payload = getFormData(propertyForm);
  // ... (ส่วนตรวจสอบ title และ published ยังเหมือนเดิม) ...

  try {
    // --- 1. UPLOAD COVER IMAGE (ถ้ามี) ---
    const coverFile = coverImageInput.files[0];
    if (coverFile) {
      const formData = new FormData();
      formData.append('file', coverFile);
      formData.append('upload_preset', UPLOAD_PRESET);
      const response = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
      const imageData = await response.json();
      payload.cover_url = imageData.secure_url;
    }

    // --- 2. UPLOAD GALLERY IMAGES (ถ้ามี) ---
    const galleryFiles = galleryImagesInput.files;
    if (galleryFiles.length > 0) {
      submitBtn.textContent = `กำลังอัปโหลดแกลเลอรี (0/${galleryFiles.length})...`;
      const uploadPromises = [];

      for (const file of galleryFiles) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', UPLOAD_PRESET);
        uploadPromises.push(fetch(CLOUDINARY_URL, { method: 'POST', body: formData }).then(res => res.json()));
      }

      // รอให้ทุกไฟล์อัปโหลดเสร็จ
      const uploadedImages = await Promise.all(uploadPromises);
      // ดึงเฉพาะ URL ออกมาเก็บเป็น Array
      payload.gallery = uploadedImages.map(img => img.secure_url);
    }

    // --- 3. SAVE TO SUPABASE ---
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


// --- Main execution ---
document.addEventListener('DOMContentLoaded', async () => {
  await protectPage(); // ** สำคัญมาก: ป้องกันหน้านี้ **
  setupNav();
  signOutIfAny();
  loadProperties();
});

// --- Image Preview Handler ---
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

// --- Map Handling Function ---
function setupModalMap(lat, lng) {
  const latInput = propertyForm.elements.latitude;
  const lngInput = propertyForm.elements.longitude;

  // ตำแหน่งเริ่มต้น (ใจกลางเมืองสุราษฎร์) ถ้าไม่มีค่าส่งมา
  const startLat = lat || 9.1337;
  const startLng = lng || 99.3325;

  const mapContainer = $('#modal-map');
  mapContainer.style.display = 'block'; // แสดงแผนที่

  if (modalMap) {
    // ถ้าแผนที่มีอยู่แล้ว แค่ตั้งค่าตำแหน่งใหม่
    modalMap.setView([startLat, startLng], 15);
    draggableMarker.setLatLng([startLat, startLng]);
  } else {
    // ถ้ายังไม่มี ให้สร้างแผนที่และหมุดขึ้นมาใหม่
    modalMap = L.map('modal-map').setView([startLat, startLng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(modalMap);

    draggableMarker = L.marker([startLat, startLng], {
      draggable: true // *** ทำให้หมุดลากได้ ***
    }).addTo(modalMap);

    // Event Listener: ทำงานเมื่อผู้ใช้ลากหมุดแล้วปล่อย
    draggableMarker.on('dragend', function(event) {
      const marker = event.target;
      const position = marker.getLatLng();
      // อัปเดตค่าในฟอร์มให้อัตโนมัติ
      latInput.value = position.lat.toFixed(6);
      lngInput.value = position.lng.toFixed(6);
    });
  }
}