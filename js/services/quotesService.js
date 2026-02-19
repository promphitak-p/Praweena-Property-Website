// js/services/quotesService.js
import { supabase } from '../utils/supabaseClient.js';

export async function listQuotesByProperty(propertyId) {
  const { data, error } = await supabase
    .from('property_quotes')
    .select('*')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function upsertPropertyQuote(row) {
  const payload = {
    id: row.id || undefined,
    property_id: row.property_id,
    contractor_id: row.contractor_id || null,
    title: row.title || null,
    vendor_name: row.vendor_name || null,
    total_price: row.total_price ?? null,
    timeline_days: row.timeline_days ?? null,
    warranty_months: row.warranty_months ?? null,
    payment_terms: row.payment_terms || null,
    scope: row.scope || null,
    notes: row.notes || null,
    items: row.items || null,
    file_url: row.file_url || null
  };

  const { data, error } = await supabase
    .from('property_quotes')
    .upsert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deletePropertyQuote(id) {
  const { error } = await supabase
    .from('property_quotes')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function uploadQuoteFile(file) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
  const filePath = `${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('quote-files')
    .upload(filePath, file);

  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from('quote-files')
    .getPublicUrl(filePath);

  return data?.publicUrl || '';
}
