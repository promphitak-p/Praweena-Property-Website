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
  /**
   * เงื่อนไขสำคัญ:
   * - contracts.lead_id เป็น FK -> leads.id (uuid)
   * - contracts.property_id เป็น FK -> properties.id (bigint)
   *
   * NOTE:
   * ชื่อคอลัมน์ใน leads อาจไม่ใช่ full_name / name ตามเดิม
   * เพื่อกันพังเวลา schema เปลี่ยน ให้ดึง leads(*) และ properties(*) ทั้งแถว
   * แล้วไปเลือก field ที่มีจริงในหน้า render อีกที
   */

  const { data, error } = await supabase
    .from(TABLE)
    .select(`
      *,
      leads:lead_id (*),
      properties:property_id (*)
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
