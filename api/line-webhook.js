// /api/line-webhook.js
// ใช้สำหรับรับ Webhook จาก LINE เพื่อดู userId

import { createClient } from '@supabase/supabase-js';

const supabase =
  process.env.SUPABASE_URL
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      })
    : null;

async function logWebhook(row) {
  if (!supabase) return;
  try {
    await supabase.rpc('log_notify', {
      _level: row.level || 'info',
      _event: row.event || 'line_webhook',
      _status_code: row.status_code ?? null,
      _message: row.message ?? null,
      _send_to: row.send_to ?? null,
      _meta: row.meta ?? null,      // เก็บ body ทั้งก้อน
      _request_id: row.request_id ?? null,
    });
  } catch {
    // ไม่ต้องทำอะไร ปล่อยผ่าน
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const requestId =
    req.headers['x-request-id'] ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const body = req.body || {};

  const userId =
    body?.events?.[0]?.source?.userId ||
    null;

  await logWebhook({
    level: 'info',
    event: 'line_webhook',
    status_code: 200,
    message: 'received webhook',
    send_to: userId,
    meta: body,
    request_id: requestId,
  });

  // LINE แค่ต้องการ status 200 ก็พอ
  return res.status(200).json({ ok: true, userId, request_id: requestId });
}
