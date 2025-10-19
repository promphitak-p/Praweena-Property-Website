// js/services/propertiesService.js
import { supabase } from '../lib/supabaseClient.js';

// ฟังก์ชันสร้าง slug จาก title ภาษาไทย/อังกฤษ
function generateSlug(title) {
  if (!title) return '';
  return title
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // แทนที่ช่องว่างด้วย -
    .replace(/[^\w\u0e00-\u0e7f-]+/g, '') // ลบอักขระพิเศษที่ไม่ใช่ตัวอักษร, ตัวเลข, หรือภาษาไทย
    .replace(/--+/g, '-'); // แทนที่ -- ด้วย -
}

/**
 * ดึงรายการประกาศ (เฉพาะที่ published) พร้อมตัวกรอง
 * @param {object} filters - ตัวกรอง { q, district, beds, price }
 */
export async function listPublic(filters = {}) {
  let query = supabase
    .from('properties')
    .select('*')
    .eq('published', true)
    .order('updated_at', { ascending: false });

  if (filters.q) {
    query = query.ilike('title', `%${filters.q}%`);
  }
  if (filters.district) {
    query = query.eq('district', filters.district);
  }
  // สามารถเพิ่ม filter อื่นๆ ได้ตามต้องการ

  return await query;
}

/**
 * ดึงข้อมูลประกาศชิ้นเดียวด้วย slug
 * @param {string} slug - slug ของประกาศ
 */
export async function getBySlug(slug) {
  return await supabase
    .from('properties')
    .select('*')
    .eq('slug', slug)
    .single(); // .single() เพื่อให้ได้ผลลัพธ์เป็น object เดียว
}

/**
 * (สำหรับ Admin) ดึงรายการประกาศทั้งหมด
 * @param {object} filters - ตัวกรอง { q }
 */
export async function listAll(filters = {}) {
  let query = supabase
    .from('properties')
    .select('*')
    .order('updated_at', { ascending: false });
    
  if (filters.q) {
    query = query.ilike('title', `%${filters.q}%`);
  }

  return await query;
}

/**
 * สร้างหรืออัปเดตข้อมูลประกาศ (Upsert)
 * @param {object} payload - ข้อมูลประกาศที่จะบันทึก
 */
// js/services/propertiesService.js

/**
 * สร้างหรืออัปเดตข้อมูลประกาศ (Upsert) - **เวอร์ชันสมบูรณ์**
 * @param {object} payload - ข้อมูลประกาศที่จะบันทึก
 */
export async function upsertProperty(payload) {
  // --- จัดการ ID ก่อน: ถ้าไม่มี ID (กำลังสร้างใหม่) ให้ลบทิ้ง ---
  // เพื่อให้ฐานข้อมูลสร้าง UUID ใหม่ให้โดยอัตโนมัติ
  if (!payload.id) {
    delete payload.id;
  }

  // สร้าง Slug ถ้าจำเป็น
  if (payload.title && !payload.slug) {
    payload.slug = generateSlug(payload.title);
  }

  // แปลงค่าว่างอื่นๆ ที่เหลือให้เป็น null
  Object.keys(payload).forEach(key => {
    if (key !== 'slug' && payload[key] === '') {
      payload[key] = null;
    }
  });

  // ส่งข้อมูลที่สมบูรณ์แล้วไปบันทึก
  return await supabase.from('properties').upsert(payload).select().single();
}



/**
 * ลบประกาศ
 * @param {string} id - UUID ของประกาศ
 */
export async function removeProperty(id) {
  return await supabase.from('properties').delete().eq('id', id);
}