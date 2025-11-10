// /api/notify/line.js
// ENV on Vercel:
// - LINE_CHANNEL_ACCESS_TOKEN   (required)
// - LINE_DEFAULT_TO             (optional, LINE userId ใช้ push; ถ้าไม่ valid จะ broadcast)
// - SUPABASE_URL                (required for logging)
// - SUPABASE_ANON_KEY           (ใช้ร่วมกับ RPC log_notify)
// - LINE_NOTI_DEBUG             ('1' = skip call LINE แล้ว log ไว้เฉย ๆ)

import { createClient } from '@supabase/supabase-js';

function isValidLineUserId(v) {
  return typeof v === 'string' && /^U[a-f0-9]{32}$/i.test(v.trim());
}

// ---------- Supabase client (ใช้ ANON + RPC log_notify) ----------
const supabase =
  process.env.SUPABASE_URL
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      })
    : null;

async function writeLog(row) {
  if (!supabase) return;
  try {
    await supabase.rpc('log_notify', {
      _level: row.level || 'info',
      _event: row.event || 'line_notify',
      _status_code: row.status_code ?? null,
      _message: row.message ?? null,
      _send_to: row.send_to ?? null,
      _meta: row.meta ?? null,
      _request_id: row.request_id ?? null,
    });
  } catch {
    // swallow—อย่าให้มีผลกับ response
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const requestId =
    req.headers['x-request-id'] ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const debug = String(process.env.LINE_NOTI_DEBUG || '').trim() === '1';

  try {
    const { message, to, meta } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res
        .status(400)
        .json({ ok: false, error: 'message is required (string)' });
    }

    // ถ้าเปิด debug: ไม่ยิงไป LINE แค่ log แล้วกลับ 200
    if (debug) {
      await writeLog({
        level: 'info',
        event: 'line_notify_debug_skip',
        status_code: 200,
        message,
        send_to: isValidLineUserId(to) ? to : null,
        meta: { meta, note: 'debug mode: skip LINE call' },
        request_id: requestId,
      });
      return res
        .status(200)
        .json({ ok: true, debug: true, request_id: requestId });
    }

    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) {
      return res
        .status(500)
        .json({ ok: false, error: 'Missing LINE_CHANNEL_ACCESS_TOKEN' });
    }

    const candidate =
      (to && String(to).trim()) ||
      (process.env.LINE_DEFAULT_TO || '').trim();
    const hasValidTo = isValidLineUserId(candidate);

    const endpoint = hasValidTo
      ? 'https://api.line.me/v2/bot/message/push'
      : 'https://api.line.me/v2/bot/message/broadcast';

    const payload = hasValidTo
      ? { to: candidate, messages: [{ type: 'text', text: message.slice(0, 5000) }] }
      : { messages: [{ type: 'text', text: message.slice(0, 5000) }] };

    let apiRes, bodyText = '';
    try {
      apiRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      bodyText = await apiRes.text(); // LINE อาจไม่คืน JSON
    } catch (e) {
      await writeLog({
        level: 'error',
        event: 'line_fetch_exception',
        status_code: 0,
        message,
        send_to: hasValidTo ? candidate : null,
        meta: { error: String(e?.stack || e?.message || e), endpoint, payload },
        request_id: requestId,
      });
      return res.status(502).json({
        ok: false,
        error: 'fetch failed',
        detail: String(e?.message || e),
        request_id: requestId,
      });
    }

    await writeLog({
      level: apiRes.ok ? 'info' : 'error',
      event: 'line_notify',
      status_code: apiRes.status,
      message,
      send_to: hasValidTo ? candidate : null,
      meta: { endpoint, payload, lineResponse: bodyText, meta },
      request_id: requestId,
    });

    if (!apiRes.ok) {
      return res.status(502).json({
        ok: false,
        status: apiRes.status,
        endpoint,
        hasValidTo,
        lineResponse: bodyText,
        request_id: requestId,
      });
    }

    return res.status(200).json({
      ok: true,
      status: apiRes.status,
      endpoint,
      hasValidTo,
      request_id: requestId,
    });
  } catch (err) {
    await writeLog({
      level: 'error',
      event: 'line_notify_exception',
      status_code: 0,
      message: req.body?.message,
      send_to: isValidLineUserId(req.body?.to) ? req.body.to : null,
      meta: { error: String(err?.stack || err?.message || err) },
      request_id: requestId,
    });
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err),
      request_id: requestId,
    });
  }
}
