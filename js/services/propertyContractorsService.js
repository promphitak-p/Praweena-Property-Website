// js/services/propertyContractorsService.js
import { supabase } from '../utils/supabaseClient.js';

export async function listContractorsForProperty(propertyId) {
  const baseSelect = `
      id,
      property_id,
      contractor_id,
      scope,
      work_comment,
      start_date,
      end_date,
      warranty_months,
      contractor:contractors (
        id,
        name,
        phone,
        trade
      )
    `;

  const ratingSelect = `
      rating_quality,
      rating_timeliness,
      rating_commitment,
      rating_cleanliness,
      rating_system_fit,
      rating_total
    `;

  let { data, error } = await supabase
    .from('property_contractors')
    .select(`${baseSelect},${ratingSelect}`)
    .eq('property_id', propertyId)
    .order('created_at', { ascending: true });

  if (error) {
    const msg = String(error.message || '');
    if (/rating_cleanliness|rating_system_fit/i.test(msg)) {
      const fallback = await supabase
        .from('property_contractors')
        .select(baseSelect)
        .eq('property_id', propertyId)
        .order('created_at', { ascending: true });
      if (fallback.error) throw fallback.error;
      return fallback.data;
    }
    throw error;
  }

  return data;
}


export async function upsertPropertyContractor(row) {
  const payload = {
    id: row.id || undefined,
    property_id: row.property_id,
    contractor_id: row.contractor_id,
    scope: row.scope || null,
    work_comment: row.work_comment ?? null,
    start_date: row.start_date || null,
    end_date: row.end_date || null,
    warranty_months: row.warranty_months ?? null,
    rating_quality: row.rating_quality ?? null,
    rating_timeliness: row.rating_timeliness ?? null,
    rating_commitment: row.rating_commitment ?? null,
    rating_cleanliness: row.rating_cleanliness ?? null,
    rating_system_fit: row.rating_system_fit ?? null,
    rating_total: row.rating_total ?? null,
  };

  const { data, error } = await supabase
    .from('property_contractors')
    .upsert(payload)
    .select()
    .single();

  if (!error) return data;

  const msg = String(error.message || '');
  if (/rating_cleanliness|rating_system_fit/i.test(msg)) {
    const legacyPayload = {
      id: row.id || undefined,
      property_id: row.property_id,
      contractor_id: row.contractor_id,
      scope: row.scope || null,
      work_comment: row.work_comment ?? null,
      start_date: row.start_date || null,
      end_date: row.end_date || null,
      warranty_months: row.warranty_months ?? null,
      rating_quality: row.rating_quality ?? null,
      rating_timeliness: row.rating_timeliness ?? null,
      rating_commitment: row.rating_commitment ?? null,
      rating_total: row.rating_total ?? null,
    };

    const fallback = await supabase
      .from('property_contractors')
      .upsert(legacyPayload)
      .select()
      .single();

    if (fallback.error) throw fallback.error;
    return fallback.data;
  }

  throw error;
}

export async function deletePropertyContractor(id) {
  const { error } = await supabase
    .from('property_contractors')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
