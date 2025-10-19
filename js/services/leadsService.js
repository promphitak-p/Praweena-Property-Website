// js/services/leadsService.js
import { supabase } from '../lib/supabaseClient.js';

/**
 * สร้าง Lead ใหม่
 * @param {object} payload - ข้อมูล Lead { name, phone, note, property_id }
 */
export async function createLead(payload) {
  return await supabase.from('leads').insert(payload);
}

/**
 * (สำหรับ Staff/Admin) ดึงรายการ Leads ทั้งหมด
 * พร้อมข้อมูล property ที่เกี่ยวข้อง
 */
export async function listLeads() {
  // join กับตาราง properties เพื่อดึง title กับ slug มาแสดง
  return await supabase
    .from('leads')
    .select(`
      *,
      properties (
        title,
        slug
      )
    `)
    .order('created_at', { ascending: false });
}

/**
 * อัปเดตสถานะของ Lead
 * @param {string} id - UUID ของ Lead
 * @param {object} changes - ข้อมูลที่ต้องการอัปเดต (เช่น { status: 'contacted' })
 */
export async function updateLead(id, changes) {
  return await supabase.from('leads').update(changes).eq('id', id);
}