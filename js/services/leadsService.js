// js/services/leadsService.js

// ❗ ใช้ตัวเดียวกับที่หน้าเพจใช้
import { supabase } from '../utils/supabaseClient.js';

/**
 * สร้าง Lead ใหม่จากหน้า property
 * payload ที่คาดหวัง:
 * {
 *   name: string,
 *   phone: string,
 *   note?: string,
 *   property_id?: number | string,
 *   property_slug?: string,
 *   source_url?: string,
 *   utm_source?: string,
 *   utm_medium?: string,
 *   utm_campaign?: string
 * }
 */
export async function createLead(rawPayload = {}) {
  // 1) แปลงเป็นฟอร์แมตที่ DB รับชัวร์
  const payload = {
    name: rawPayload.name ?? '',
    phone: rawPayload.phone ?? '',
    note: rawPayload.note ?? '',
    property_id: rawPayload.property_id
      ? Number(rawPayload.property_id)
      : null,
    property_slug: rawPayload.property_slug ?? null,
    source_url: rawPayload.source_url ?? (typeof window !== 'undefined' ? window.location.href : null),
    utm_source: rawPayload.utm_source ?? null,
    utm_medium: rawPayload.utm_medium ?? null,
    utm_campaign: rawPayload.utm_campaign ?? null,
  };

  // 2) ยิงเข้า supabase
  const { data, error } = await supabase.from('leads').insert(payload);

  return { data, error };
}

/**
 * (สำหรับ Staff/Admin) ดึงรายการ Leads ทั้งหมด
 */
export async function listLeads() {
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
 * อัปเดตสถานะ lead
 */
export async function updateLead(id, changes) {
  return await supabase.from('leads').update(changes).eq('id', id);
}
