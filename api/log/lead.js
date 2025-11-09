// ใช้ Service Role (ฝั่งเซิร์ฟเวอร์เท่านั้น) เพื่อไม่ติด RLS
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // *** server only ***
const sb  = createClient(url, key, { auth: { persistSession: false } });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    const { event_type, lead_id, payload } = req.body || {};

    const allowed = new Set(['lead.created','lead.status_changed','lead.assigned']);
    if (!event_type || !allowed.has(String(event_type))) {
      return res.status(400).json({ ok:false, error:'invalid event_type' });
    }

    const leadIdNum = Number(lead_id);
    if (!Number.isFinite(leadIdNum) || leadIdNum <= 0) {
      return res.status(400).json({ ok:false, error:'invalid lead_id' });
    }

    const safePayload = (payload && JSON.stringify(payload).length <= 10_000) ? payload : null;

    const { data, error } = await sb
      .from('lead_events')
      .insert({
        event_type,
        lead_id: leadIdNum,
        payload: safePayload,
        meta: {
          ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
          ua: req.headers['user-agent'] || ''
        }
      })
      .select()
      .single();

    if (error) return res.status(500).json({ ok:false, error: error.message });
    return res.status(200).json({ ok:true, data });
  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e?.message || e) });
  }
}
