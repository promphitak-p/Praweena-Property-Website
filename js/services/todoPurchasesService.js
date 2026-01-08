// js/services/todoPurchasesService.js
import { supabase } from '../utils/supabaseClient.js';

export async function listPurchasesByTodo(todoId) {
  const { data, error } = await supabase
    .from('todo_purchase_items')
    .select('*')
    .eq('todo_id', todoId)
    .order('due_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

export async function listPurchasesByProperty(propertyId) {
  const { data, error } = await supabase
    .from('todo_purchase_items')
    .select('*')
    .eq('property_id', propertyId)
    .order('due_date', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function upsertPurchaseItem(row) {
  const payload = {
    id: row.id || undefined,
    todo_id: row.todo_id,
    property_id: row.property_id,
    title: row.title,
    vendor: row.vendor || null,
    quantity: row.quantity ?? null,
    unit: row.unit || null,
    unit_price: row.unit_price ?? null,
    status: row.status || 'pending',
    due_date: row.due_date || null,
    note: row.note || null,
    attachment_url: row.attachment_url || null,
  };

  const { data, error } = await supabase
    .from('todo_purchase_items')
    .upsert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updatePurchaseStatus(id, status, extra = {}) {
  const { data, error } = await supabase
    .from('todo_purchase_items')
    .update({
      status,
      due_date: extra.due_date ?? undefined,
      note: extra.note ?? undefined,
      attachment_url: extra.attachment_url ?? undefined,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deletePurchaseItem(id) {
  const { error } = await supabase
    .from('todo_purchase_items')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
