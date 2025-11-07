// /api/notify/line.js
// ENV ที่ต้องมีบน Vercel:
// - LINE_CHANNEL_ACCESS_TOKEN   (required)
// - LINE_DEFAULT_TO             (optional: LINE userId เริ่มต้น ใช้กับ push)
// - SUPABASE_URL                (required สำหรับ logging)
// - SUPABASE_SERVICE_ROLE_KEY   (แนะนำ สำหรับ logging ผ่าน RLS)

import { createClient } from '@supabase/supabase-js';

function isValidLineUserId(v) {
  // LINE userId ปกติขึ้นต้นด้วย U และตามด้วย hex 32 ตัว
  return typeof v === 'string' && /^U[a-f0-9]{32}$/i.test(v.trim());
}

// ---------- Supabase client สำหรับบันทึก notify_logs ----------
const supabase =
  process.env.SUPABASE_URL
    ? createClient(
        process.env.SUPABASE_URL,
        // ใช้ Service Role หากมี (ผ่าน RLS) ไม่งั้น fallback เป็น ANON (เฉพาะกรณี RLS ผ่อนผัน)
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
        { auth: { persistSession: false } }
      )
    : null;

async function writeLog(row) {
  if (!supabase) return;
  try {
    await supabase.from('notify_logs').insert({
      level: row.level || 'info',
      source: 'api/notify/line',
      event: row.event || 'line_notify',
      status_code: row.status_code ?? null,
      message: row.message ?? null,
      send_to: row.send_to ?? null,
      meta: row.meta ?? null,
      request_id: row.request_id ?? null
    });
  } catch (_) {
    // เงียบไว้ ไม่ให้กระทบ response ผู้ใช้
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    return res.status(500).json({ ok: false, error: 'Missing LINE_CHANNEL_ACCESS_TOKEN' });
  }

  // ผูก request_id ง่าย ๆ ไว้ตามรอย (เช่นจากหน้า detail)
  const requestId = req.headers['x-request-id'] || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const { message, to, meta } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ ok: false, error: 'message is required (string)' });
    }

    // เลือก "to" ที่ใช้งานได้จริงเท่านั้น (ไม่งั้นจะ broadcast)
    const envDefault = process.env.LINE_DEFAULT_TO;
    const candidate = (to && String(to).trim()) || (envDefault && String(envDefault).trim()) || '';
    const hasValidTo = isValidLineUserId(candidate);

    const endpoint = hasValidTo
      ? 'https://api.line.me/v2/bot/message/push'
      : 'https://api.line.me/v2/bot/message/broadcast';

    const payload = hasValidTo
      ? { to: candidate, messages: [{ type: 'text', text: message.slice(0, 5000) }] }
      : { messages: [{ type: 'text', text: message.slice(0, 5000) }] };

    const apiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const text = await apiRes.text(); // LINE บางกรณีไม่คืน JSON

    // ---- write log ทุกเคส ----
    await writeLog({
      level: apiRes.ok ? 'info' : 'error',
      event: 'line_notify',
      status_code: apiRes.status,
      message,
      send_to: hasValidTo ? candidate : null,
      meta: { hasValidTo, endpoint, payload, lineResponse: text, meta },
      request_id: requestId
    });

    if (!apiRes.ok) {
      return res.status(502).json({
        ok: false,
        status: apiRes.status,
        endpoint,
        hasValidTo,
        body: text
      });
    }

    return res.status(200).json({ ok: true, status: apiRes.status, endpoint, hasValidTo, request_id: requestId });
  } catch (err) {
    await writeLog({
      level: 'error',
      event: 'line_notify_exception',
      status_code: 0,
      message: req.body?.message,
      send_to: isValidLineUserId(req.body?.to) ? req.body.to : null,
      meta: { error: String(err?.stack || err?.message || err) },
      request_id: requestId
    });
    return res.status(500).json({ ok: false, error: String(err?.message || err), request_id: requestId });
  }
}
