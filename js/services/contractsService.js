// js/services/contractsService.js
import { supabase } from '../utils/supabaseClient.js';

const TABLE = 'contracts';

export async function upsertContract(payload) {
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getContractById(id) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function listContracts() {
  const { data, error } = await supabase
    .from(TABLE)
    .select(`
      *,
      leads:lead_id ( id, full_name, name, phone, email ),
      properties:property_id ( id, title, name, address, price )
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function deleteContract(id) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id);
  if (error) throw error;
  return true;
}
