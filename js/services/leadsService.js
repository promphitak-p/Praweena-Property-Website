// js/services/leadsService.js
import { supabase } from '../utils/supabaseClient.js';

export async function createLead(rawPayload = {}) {
  const payload = {
    name: rawPayload.name ?? '',
    phone: rawPayload.phone ?? '',
    note: rawPayload.note ?? '',
    property_id: rawPayload.property_id ? Number(rawPayload.property_id) : null,
    property_slug: rawPayload.property_slug ?? null,
    source_url: rawPayload.source_url ?? (typeof window !== 'undefined' ? window.location.href : null),
    utm_source: rawPayload.utm_source ?? null,
    utm_medium: rawPayload.utm_medium ?? null,
    utm_campaign: rawPayload.utm_campaign ?? null
  };

  const { data, error } = await supabase.from('leads').insert(payload);
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
