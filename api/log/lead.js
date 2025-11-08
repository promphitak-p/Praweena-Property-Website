import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,   // ✅ ใช้ service key
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { event_type, lead_id, payload } = req.body || {};
  if (!event_type || !lead_id)
    return res.status(400).json({ ok: false, error: 'Missing fields' });

  const { data, error } = await supabaseAdmin
    .from('lead_events')
    .insert({ event_type, lead_id, payload })
    .select()
    .single();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.status(200).json({ ok: true, data });
}
