// js/services/contractsService.js
import { supabase } from '../utils/supabaseClient.js';

export async function upsertContract(payload) {
  const { data, error } = await supabase
    .from('contracts')
    .upsert(payload)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getContractById(id) {
  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function listContracts() {
  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function deleteContract(id) {
  const { error } = await supabase
    .from('contracts')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return true;
}

/* ================================
   Leads helper (ถ้าไม่มีในโปรเจกต์)
   ================================ */
export async function listLeads() {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}
