// /api/log/index.js
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth:{ persistSession:false } });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok:false });
  const { level='info', source='web', message='', meta=null, user_id=null } = req.body || {};
  const { error } = await supabase.from('app_logs').insert({ level, source, message, meta, user_id });
  if (error) return res.status(500).json({ ok:false, error: error.message });
  res.status(200).json({ ok:true });
}
