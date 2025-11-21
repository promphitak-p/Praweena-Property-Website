// js/services/leadsService.js
import { supabase } from '../utils/supabaseClient.js';

export async function createLead(payload = {}) {
  const insert = {
    name: (payload.name || '').trim(),
    phone: (payload.phone || '').trim(),
    note: payload.note || '',
    property_id: payload.property_id || null,
    property_slug: payload.property_slug || null
  };

  const { data, error } = await supabase
    .from('leads')
    .insert(insert)
    .select('id')   // << สำคัญ: เอา id กลับมา
    .single();

  return { data, error };
}

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

export async function updateLead(id, changes) {
  return await supabase.from('leads').update(changes).eq('id', id);
}

export async function getLeadById(id) {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  return data || null;
}