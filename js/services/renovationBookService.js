// js/services/renovationBookService.js
import { supabase } from '../utils/supabaseClient.js';

export async function getRenovationBookByPropertyId(property_id) {
  const { data, error } = await supabase
    .from('renovation_books')
    .select('*')
    .eq('property_id', property_id)
    .maybeSingle();

  // error PGRST116 = not found
  if (error && error.code !== 'PGRST116') throw error;

  return data || null;
}

export async function upsertRenovationBookForProperty(book) {
  const { data, error } = await supabase
    .from('renovation_books')
    .upsert(book, {
      onConflict: 'property_id'
    })
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

