// /api/logs/lead.js
// ใช้ Service Role (ฝั่งเซิร์ฟเวอร์เท่านั้น) เพื่อไม่ติด RLS

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // อย่าตั้งค่านี้ใน client
const sb  = createClient(url, key, { auth: { persistSession: false } });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    const { event_type, lead_id, payload } = req.body || {};
    if (!event_type || !lead_id) {
      return res.status(400).json({ ok: false, error: 'event_type & lead_id required' });
    }

    const { data, error } = await sb
      .from('lead_events')
      .insert({ event_type, lead_id, payload })
      .select()
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
