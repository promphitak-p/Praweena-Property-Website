// /api/line-webhook.js

// 🟢 ใช้ supabase client ตัวเดียวกับทั้งระบบ
// ปรับ path ให้เหมือนกับไฟล์ /api/notify/line ที่กุ้งใช้
import { supabase } from '../js/utils/supabaseClient.js'; // <- ถ้าโปรเจกต์กุ้งใช้ path อื่น ให้เปลี่ยนตามนั้น

async function logWebhook(row) {
  if (!supabase) return;

  try {
    const { error } = await supabase.rpc('log_notify', {
      _level: row.level || 'info',
      _event: row.event || 'line_webhook',
      _status_code: row.status_code ?? null,
      _message: row.message ?? null,
      _send_to: row.send_to ?? null,
      _meta: row.meta ?? null, // เก็บ body ทั้งก้อน
      _request_id: row.request_id ?? null,
    });

    if (error) {
      console.error('log_notify error:', error);
    }
  } catch (err) {
    console.error('logWebhook exception:', err);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const requestId =
    req.headers['x-request-id'] ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    // เผื่อบางกรณี body ยังเป็น string อยู่
    const rawBody = req.body || {};
    const body =
      typeof rawBody === 'string' ? JSON.parse(rawBody || '{}') : rawBody;

    const events = Array.isArray(body.events) ? body.events : [];
    const firstEvent = events[0] || null;

    const userId = firstEvent?.source?.userId ?? null;

    await logWebhook({
      level: 'info',
      event: 'line_webhook',
      status_code: 200,
      message: 'received webhook',
      send_to: userId,
      meta: body,
      request_id: requestId,
    });

    return res
      .status(200)
      .json({ ok: true, userId, request_id: requestId });
  } catch (err) {
    console.error('line-webhook handler error:', err);

    // กันพลาด: log ว่าฝั่ง handler เองเจ๊ง
    await logWebhook({
      level: 'error',
      event: 'line_webhook_handler_error',
      status_code: 500,
      message: err?.message || 'handler error',
      send_to: null,
      meta: null,
      request_id: requestId,
    });

    // สำหรับ LINE ขอแค่ตอบ 200 ก็พอ แต่บอกสถานะใน body เฉย ๆ
    return res
      .status(200)
      .json({ ok: false, error: 'internal_error_logged', request_id: requestId });
  }
}
