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

export async function listContracts(showDeleted = false) {
  /**
   * เงื่อนไขสำคัญ:
   * - contracts.lead_id เป็น FK -> leads.id (uuid)
   * - contracts.property_id เป็น FK -> properties.id (bigint)
   */

  let query = supabase
    .from(TABLE)
    .select(`
      *,
      leads:lead_id (*),
      properties:property_id (*)
    `)
    .order('created_at', { ascending: false });

  if (!showDeleted) {
    query = query.is('deleted_at', null); // Filter out soft-deleted items by default
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function deleteContract(id) {
  // Soft Delete: Update deleted_at instead of hard delete
  const { error } = await supabase
    .from(TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
  return true;
}

export async function restoreContract(id) {
  const { error } = await supabase
    .from(TABLE)
    .update({ deleted_at: null })
    .eq('id', id);

  if (error) throw error;
  return true;
}
