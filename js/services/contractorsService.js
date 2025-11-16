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

export async function upsertContractor(row) {
  const payload = {
    id: row.id || undefined,
    name: row.name,
    phone: row.phone || null,
    trade: row.trade || null,
    note: row.note || null,
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
