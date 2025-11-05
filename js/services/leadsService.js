// js/services/leadsService.js

// ใช้ตัวเดียวกับที่ทุกเพจใช้
import { supabase } from '../utils/supabaseClient.js';
import { notifyLeadNew } from './notifyService.js';

/**
 * สร้าง Lead ใหม่จากหน้า property
 * payload:
 * {
 *   name, phone, note?,
 *   property_id?, property_slug?,
 *   source_url?, utm_source?, utm_medium?, utm_campaign?
 * }
 */
export async function createLead(rawPayload = {}) {
  const payload = {
    name: rawPayload.name ?? '',
    phone: rawPayload.phone ?? '',
    note: rawPayload.note ?? '',
    property_id: rawPayload.property_id ? Number(rawPayload.property_id) : null,
    property_slug: rawPayload.property_slug ?? null,
    source_url: rawPayload.source_url ?? (typeof window !== 'undefined' ? window.location.href : null),
    utm_source: rawPayload.utm_source ?? null,
    utm_medium: rawPayload.utm_medium ?? null,
    utm_campaign: rawPayload.utm_campaign ?? null,
  };

  const { data, error } = await supabase.from('leads').insert(payload).select().limit(1); 
  // ^ ใส่ .select() เพื่อให้ได้แถวที่เพิ่ง insert มาใช้งานต่อ

  // ✅ แจ้งเตือนเมื่อสำเร็จ
  if (!error && data && data.length) {
    try { await notifyLeadNew(data[0]); } catch {}
  }

  return { data, error };
}

/**
 * ดึงรายการ Leads ทั้งหมด
 * - พยายาม join กับ properties ก่อน (ต้องมี FK leads.property_id → properties.id)
 * - ถ้า join ไม่ได้ (ไม่มีความสัมพันธ์/ไม่มีสิทธิ์) → fallback เป็น select ธรรมดา
 */

export async function listLeads() {
  // ถ้า view ไม่มี จะ fallback ไปตาราง leads + nested select ได้ (ตามของเดิม)
  const v = await supabase.from('leads_with_property').select('*').order('created_at',{ascending:false});
  if (!v.error && Array.isArray(v.data)) return v;
  // fallback (ของเดิม)
  return await supabase
    .from('leads')
    .select(`*, properties (title, slug)`)
    .order('created_at', { ascending: false });
}

/**
 * อัปเดตสถานะ lead
 */
export async function updateLead(id, changes) {
  return await supabase.from('leads').update(changes).eq('id', id);
}
