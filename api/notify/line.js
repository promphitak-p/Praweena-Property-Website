// /api/notify/line.js
// ใช้ส่ง LINE notify อย่างเดียว ยังไม่ต้อง log เข้า Supabase เพื่อตัดปัญหา 500 ก่อน
// ENV ที่ต้องมีบน Vercel:
// - LINE_CHANNEL_ACCESS_TOKEN   (required)
// - LINE_DEFAULT_TO             (optional: LINE userId ใช้ push; ถ้าไม่ valid จะ broadcast)
// - LINE_NOTI_DEBUG             ('1' = ไม่ยิงไป LINE แค่ตอบกลับ ok: true)

function isValidLineUserId(v) {
  return typeof v === 'string' && /^U[a-f0-9]{32}$/i.test(v.trim());
}

// ตอนนี้ยังไม่ใช้ Supabase เลย ให้เป็นฟังก์ชันเปล่า ๆ
async function writeLog(_) {
  // no-op
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
    const { message, to } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res
        .status(400)
        .json({ ok: false, error: 'message is required (string)' });
    }

    // โหมด debug: ไม่ยิงไป LINE แค่ตอบกลับ 200
    if (debug) {
      await writeLog({
        level: 'info',
        event: 'line_notify_debug_skip',
        status_code: 200,
        message,
        send_to: isValidLineUserId(to) ? to : null,
        meta: { note: 'debug mode: skip LINE call' },
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

    let apiRes;
    let bodyText = '';

    try {
      apiRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      bodyText = await apiRes.text();
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
      meta: { endpoint, payload, lineResponse: bodyText },
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
