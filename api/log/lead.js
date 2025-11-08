// API: POST /api/logs/lead
// body: { event_type: 'lead.created'|'lead.status_changed', lead_id?: string, payload?: object }

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });
  }
  try {
    const { event_type, lead_id = null, payload = {} } = req.body || {};
    if (!event_type) {
      return res.status(400).json({ ok:false, error:'event_type is required' });
    }

    const { error } = await supabaseAdmin
      .from('lead_events')
      .insert({
        lead_id,
        event_type,
        payload
      });

    if (error) {
      return res.status(500).json({ ok:false, error: error.message });
    }
    return res.status(200).json({ ok:true });
  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e?.message||e) });
  }
}
