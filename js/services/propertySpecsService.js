// js/services/propertySpecsService.js
import { supabase } from '../utils/supabaseClient.js';

export async function listSpecsByProperty(propertyId) {
  const { data, error } = await supabase
    .from('property_specs')
    .select('*')
    .eq('property_id', propertyId)
    .order('zone', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

export async function upsertSpec(row) {
  const payload = {
    id: row.id || undefined,
    property_id: row.property_id,
    zone: row.zone,
    item_type: row.item_type,
    brand: row.brand || null,
    model_or_series: row.model_or_series || null,
    color_code: row.color_code || null,
    supplier: row.supplier || null,
    unit: row.unit || null,
    quantity: row.quantity ?? null,
    note: row.note || null,
  };

  const { data, error } = await supabase
    .from('property_specs')
    .upsert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSpec(id) {
  const { error } = await supabase
    .from('property_specs')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
