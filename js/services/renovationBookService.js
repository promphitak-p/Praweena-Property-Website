// js/services/renovationBookService.js
import { supabase } from '../utils/supabaseClient.js';

// ดึงสมุดรีโนเวทของบ้าน 1 หลัง (ถ้ายังไม่มีจะได้ null)
export async function getRenovationBookByPropertyId(propertyId) {
  const { data, error } = await supabase
    .from('renovation_books')
    .select('*')
    .eq('property_id', propertyId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') { // not found
    throw error;
  }
  return data || null;
}

// บันทึก (insert/update) สมุดรีโนเวทของบ้าน 1 หลัง
export async function upsertRenovationBookForProperty(payload) {
  const { data, error } = await supabase
    .from('renovation_books')
    .upsert(payload, {
      onConflict: 'property_id'
    })
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}
