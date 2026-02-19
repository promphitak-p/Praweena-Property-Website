// js/services/renovationPhaseService.js
import { supabase } from '../utils/supabaseClient.js';

export async function getPhaseLockSetting(propertyId) {
  const { data, error } = await supabase
    .from('renovation_phase_settings')
    .select('property_id, lock_enabled')
    .eq('property_id', propertyId)
    .single();

  if (error) return { data: null, error };
  return { data, error: null };
}

export async function savePhaseLockSetting(propertyId, lockEnabled) {
  const { error } = await supabase
    .from('renovation_phase_settings')
    .upsert({
      property_id: propertyId,
      lock_enabled: !!lockEnabled
    })
    .select()
    .single();

  if (error) return { error };
  return { error: null };
}
