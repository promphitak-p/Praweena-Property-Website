// /api/logs/index.js
import { createClient } from '@supabase/supabase-js';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // ต้องใช้ service role เท่านั้น
  if (!url || !key) throw new Error('Missing Supabase env (service role required)');
  return createClient(url, key, { auth: { persistSession: false } });
}

// Origin allowlist
const ALLOWED_ORIGINS = new Set([
  'http://praweenaproperty.com',
  'http://localhost:8000',
]);

function checkOrigin(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true; // อนุญาตถ้าเป็น internal/server call
  if (ALLOWED_ORIGINS.has(origin)) return true;
  res.status(403).json({ ok: false, error: 'forbidden_origin' });
  return false;
}

// In-memory rate limit 5 ครั้ง/ชั่วโมงต่อ IP สำหรับ POST
const rateMap = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 5;
function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip) || [];
  const recent = entry.filter(ts => now - ts < WINDOW_MS);
  recent.push(now);
  rateMap.set(ip, recent);
  return recent.length > LIMIT;
}

export default async function handler(req, res) {
  try {
    if (!checkOrigin(req, res)) return;

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';

    const supabase = getClient();

    if (req.method === 'POST') {
      if (isRateLimited(ip)) {
        return res.status(429).json({ ok: false, error: 'rate_limited' });
      }
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
