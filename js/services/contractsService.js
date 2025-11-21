// js/services/contractsService.js
import { supabase } from '../utils/supabaseClient.js';

// ดึงสัญญาจาก lead_id (1 lead : 1 contract)
export async function getContractByLeadId(leadId) {
  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle();

  // PGRST116 = not found
  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  return data || null;
}

// upsert ตาม lead_id (เพราะเราตั้ง unique index ไว้)
export async function upsertContractForLead(payload) {
  const { data, error } = await supabase
    .from('contracts')
    .upsert(payload, {
      onConflict: 'lead_id'
    })
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}