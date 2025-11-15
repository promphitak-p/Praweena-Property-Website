// /api/line-webhook.js
// รับ Webhook จาก LINE + log เข้า Supabase

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
      })
    : null;

async function logWebhook(row) {
  if (!supabase) {
    console.warn('Supabase not configured, skip log', row?.event);
    return;
  }

  try {
    const { error } = await supabase.rpc('log_notify', {
      _level: row.level || 'info',
      _event: row.event || 'line_webhook',
      _status_code: row.status_code ?? null,
      _message: row.message ?? null,
      _send_to: row.send_to ?? null,
      _meta: row.meta ?? null,
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
    const body = req.body || {};
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

    return res.status(200).json({
      ok: true,
      userId,
      request_id: requestId,
    });
  } catch (err) {
    console.error('line-webhook handler error:', err);

    await logWebhook({
      level: 'error',
      event: 'line_webhook_handler_error',
      status_code: 500,
      message: err?.message || 'handler error',
      send_to: null,
      meta: null,
      request_id: requestId,
    });

    // LINE ขอแค่ 200 ก็รอด แต่เราบอกว่า error ใน body
    return res.status(200).json({
      ok: false,
      error: 'internal_error_logged',
      request_id: requestId,
    });
  }
}
