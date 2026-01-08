// js/services/contractorPaymentsService.js
import { supabase } from '../utils/supabaseClient.js';

export async function listPaymentsByProperty(propertyId) {
  const { data, error } = await supabase
    .from('contractor_payment_schedules')
    .select(`
      *,
      contractor:contractors(id, name, phone, trade),
      property_contractor:property_contractors(id, scope)
    `)
    .eq('property_id', propertyId)
    .order('due_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

export async function upsertPaymentSchedule(row) {
  const payload = {
    id: row.id || undefined,
    property_id: row.property_id,
    property_contractor_id: row.property_contractor_id || null,
    contractor_id: row.contractor_id || null,
    title: row.title,
    amount: row.amount ?? 0,
    due_date: row.due_date || null,
    status: row.status || 'pending',
    paid_at: row.paid_at || null,
    note: row.note || null,
    attachment_url: row.attachment_url || null,
  };

  const { data, error } = await supabase
    .from('contractor_payment_schedules')
    .upsert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function markPaymentPaid(id, fields = {}) {
  const { data, error } = await supabase
    .from('contractor_payment_schedules')
    .update({
      status: 'paid',
      paid_at: fields.paid_at || new Date().toISOString(),
      note: fields.note ?? null,
      attachment_url: fields.attachment_url ?? null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deletePaymentSchedule(id) {
  const { error } = await supabase
    .from('contractor_payment_schedules')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
