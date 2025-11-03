// js/services/leadsService.js

// ใช้ตัวเดียวกับที่ทุกเพจใช้
import { supabase } from '../utils/supabaseClient.js';

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
    property_id: rawPayload.property_id != null ? Number(rawPayload.property_id) : null,
    property_slug: rawPayload.property_slug ?? null,
    source_url:
      rawPayload.source_url ??
      (typeof window !== 'undefined' ? window.location.href : null),
    utm_source: rawPayload.utm_source ?? null,
    utm_medium: rawPayload.utm_medium ?? null,
    utm_campaign: rawPayload.utm_campaign ?? null,
  };

  const { data, error } = await supabase.from('leads').insert(payload);
  return { data, error };
}

/**
 * ดึงรายการ Leads ทั้งหมด
 * - พยายาม join กับ properties ก่อน (ต้องมี FK leads.property_id → properties.id)
 * - ถ้า join ไม่ได้ (ไม่มีความสัมพันธ์/ไม่มีสิทธิ์) → fallback เป็น select ธรรมดา
 */
export async function listLeads() {
  // 1) ลอง join ก่อน
  let { data, error } = await supabase
    .from('leads')
    .select(`
      id, name, phone, note, status,
      property_id, property_slug, created_at,
      properties ( title, slug )
    `)
    .order('created_at', { ascending: false });

  // 2) ถ้า join พัง (เช่น ไม่มี FK) → fallback
  if (error) {
    console.warn('[leadsService] join properties failed:', error.message);
    ({ data, error } = await supabase
      .from('leads')
      .select('id, name, phone, note, status, property_id, property_slug, created_at')
      .order('created_at', { ascending: false }));
  }

  return { data: data ?? [], error: error ?? null };
}

/**
 * อัปเดตสถานะ lead
 */
export async function updateLead(id, changes) {
  return await supabase.from('leads').update(changes).eq('id', id);
}
