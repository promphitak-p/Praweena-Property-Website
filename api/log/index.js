// /api/logs/index.js
import { createClient } from '@supabase/supabase-js';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  try {
    const supabase = getClient();

    if (req.method === 'POST') {
      const { type, actor, message, meta } = req.body || {};
      if (!type) return res.status(400).json({ ok: false, error: 'type is required' });
      const { error } = await supabase.from('event_logs').insert({
        type,
        actor: actor || null,
        message: message || null,
        meta: meta || {}
      });
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(201).json({ ok: true });
    }

    if (req.method === 'GET') {
      const { type, limit } = req.query || {};
      const q = supabase.from('event_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(Math.min(Number(limit) || 200, 1000));
      if (type) q.eq('type', type);
      const { data, error } = await q;
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, data });
    }

    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
