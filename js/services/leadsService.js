import { supabase } from '../lib/supabaseClient.js';
import { getBySlug } from './propertiesService.js';

export async function createLead(payload = {}) {
  let propId = payload.property_id || null;
  const slug = payload.property_slug || null;

  // Resolve slug to ID if ID is missing
  if (!propId && slug) {
    const { data } = await getBySlug(slug);
    if (data) {
      propId = data.id;
    }
  }

  const insert = {
    name: (payload.name || '').trim(),
    phone: (payload.phone || '').trim(),
    note: payload.note || '',
    property_id: propId
    // Remove property_slug to avoid 400 error if column missing
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

// --- Duplicate Management ---

/**
 * ค้นหารายชื่อซ้ำจากเบอร์โทรและอีเมล
 * Returns: Array of Groups (Group = { key, leads: [] })
 */
export async function findDuplicates() {
  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, name, phone, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const groups = {};

  leads.forEach(lead => {
    // Normalize Key (Phone)
    const phone = lead.phone ? lead.phone.replace(/[^0-9]/g, '') : '';

    if (phone && phone.length >= 9) {
      if (!groups[`p:${phone}`]) groups[`p:${phone}`] = [];
      groups[`p:${phone}`].push(lead);
    }
  });

  // Return groups with > 1 member
  return Object.values(groups).filter(g => g.length > 1);
}

/**
 * รวม Leads เข้าด้วยกัน
 * - ย้าย Contracts ไปที่ Master
 * - ลบ Duplicates
 */
export async function mergeLeads(masterId, duplicateIds) {
  if (!duplicateIds || duplicateIds.length === 0) return;

  // 1. Move Contracts
  const { error: moveError } = await supabase
    .from('contracts')
    .update({ lead_id: masterId })
    .in('lead_id', duplicateIds);

  if (moveError) throw moveError;

  // 2. Delete Duplicates
  const { error: delError } = await supabase
    .from('leads')
    .delete()
    .in('id', duplicateIds);

  if (delError) throw delError;

  return true;
}