// js/services/propertyContractorsService.js
import { supabase } from '../utils/supabaseClient.js';

export async function listContractorsForProperty(propertyId) {
  const { data, error } = await supabase
    .from('property_contractors')
    .select(`
      id,
      property_id,
      contractor_id,
      scope,
      start_date,
      end_date,
      warranty_months,
      contractor:contractors (
        id,
        name,
        phone,
        trade
      )
    `)
    .eq('property_id', propertyId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}


export async function upsertPropertyContractor(row) {
  const payload = {
    id: row.id || undefined,
    property_id: row.property_id,
    contractor_id: row.contractor_id,
    scope: row.scope || null,
    start_date: row.start_date || null,
    end_date: row.end_date || null,
    warranty_months: row.warranty_months ?? null,
  };

  const { data, error } = await supabase
    .from('property_contractors')
    .upsert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deletePropertyContractor(id) {
  const { error } = await supabase
    .from('property_contractors')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
