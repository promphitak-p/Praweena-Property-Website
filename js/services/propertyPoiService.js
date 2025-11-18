// js/services/propertyPoiService.js
import { supabase } from '../utils/supabaseClient.js';

// ดึงสถานที่ใกล้เคียงทั้งหมดของบ้านหนึ่งหลัง
export async function listPoiByProperty(propertyId) {
  const { data, error } = await supabase
    .from('property_poi')
    .select('id, name, type, distance_km, lat, lng')
    .eq('property_id', propertyId)
    .order('distance_km', { ascending: true });

  if (error) throw error;
  return data || [];
}

// เพิ่ม/แก้ไข (ถ้ามี id = แก้, ถ้าไม่มี id = เพิ่ม)
export async function upsertPoi(payload) {
  const { data, error } = await supabase
    .from('property_poi')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ลบ
export async function deletePoi(id) {
  const { error } = await supabase
    .from('property_poi')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
