import { supabase } from '../utils/supabaseClient.js';

// list ทั้งหมด พร้อม join lead + property
export async function listContracts() {
  return await supabase
    .from('contracts')
    .select(`
      *,
      lead:leads(id, full_name, name, phone, email, id_card, address),
      property:properties(id, title, address, district, province, price, slug)
    `)
    .order('contract_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
}

export async function getContractById(id) {
  const { data, error } = await supabase
    .from('contracts')
    .select(`
      *,
      lead:leads(*),
      property:properties(*)
    `)
    .eq('id', id)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function upsertContract(payload) {
  const { data, error } = await supabase
    .from('contracts')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function deleteContract(id) {
  const { error } = await supabase
    .from('contracts')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
