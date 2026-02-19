// js/services/renovationIssuesService.js
import { supabase } from '../utils/supabaseClient.js';

export async function listIssuesByProperty(propertyId) {
  const { data, error } = await supabase
    .from('renovation_issues')
    .select('*')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return { data, error: null };
}

export async function upsertIssue(payload) {
  const { data, error } = await supabase
    .from('renovation_issues')
    .upsert({
      id: payload.id || undefined,
      property_id: payload.property_id,
      todo_id: payload.todo_id || null,
      title: payload.title,
      detail: payload.detail || null,
      severity: payload.severity || 'medium',
      status: payload.status || 'open'
    })
    .select()
    .single();

  if (error) throw error;
  return { data, error: null };
}

export async function deleteIssue(id) {
  const { error } = await supabase
    .from('renovation_issues')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return { error: null };
}
