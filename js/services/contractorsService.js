// js/services/contractorsService.js
import { supabase } from '../utils/supabaseClient.js';

export async function listContractors() {
  const { data, error } = await supabase
    .from('contractors')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return data;
}

export async function listContractorsWithAssignments() {
  const baseSelect = `
      id,
      name,
      phone,
      trade,
      note,
      status,
      line_url,
      facebook_url,
      email,
      other_contact,
      property_contractors (
        id,
        property_id,
        scope,
        work_comment,
        rating_quality,
        rating_timeliness,
        rating_commitment,
        rating_cleanliness,
        rating_system_fit,
        rating_total,
        property:properties (
          id,
          title
        )
      )
    `;

  let { data, error } = await supabase
    .from('contractors')
    .select(baseSelect)
    .order('name', { ascending: true });

  if (error) {
    const msg = String(error.message || '');
    if (/line_url|facebook_url|other_contact|status|work_comment|rating_cleanliness|rating_system_fit/i.test(msg)) {
      const fallback = await supabase
        .from('contractors')
        .select(`
          id,
          name,
          phone,
          trade,
          note,
          property_contractors (
            id,
            property_id,
            scope,
            rating_quality,
            rating_timeliness,
            rating_commitment,
            rating_total,
            property:properties (
              id,
              title
            )
          )
        `)
        .order('name', { ascending: true });
      if (fallback.error) throw fallback.error;
      return fallback.data;
    }
    throw error;
  }

  return data;
}

export async function upsertContractor(row) {
  const payload = {
    id: row.id || undefined,
    name: row.name,
    phone: row.phone || null,
    trade: row.trade || null,
    note: row.note || null,
    status: row.status || null,
    line_url: row.line_url || null,
    facebook_url: row.facebook_url || null,
    email: row.email || null,
    other_contact: row.other_contact || null,
  };

  const { data, error } = await supabase
    .from('contractors')
    .upsert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteContractor(id) {
  const { error } = await supabase
    .from('contractors')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
