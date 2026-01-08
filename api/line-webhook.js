// /api/line-webhook.js
// รับ Webhook จาก LINE + log เข้า Supabase ผ่าน REST RPC (ไม่ใช้ supabase-js)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // webhook ใช้สิทธิ์สูง ต้องเป็น service-role เท่านั้น

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('[line-webhook] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

async function logWebhook(row) {
  const payload = {
    _level: row.level || 'info',
    _event: row.event || 'line_webhook',
    _status_code: row.status_code ?? null,
    _message: row.message ?? null,
    _send_to: row.send_to ?? null,
    _meta: row.meta ?? null,
    _request_id: row.request_id ?? null,
  };

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/log_notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();

    if (!resp.ok) {
      console.error('log_notify RPC failed', resp.status, text);
    }

    return {
      ok: resp.ok,
      status: resp.status,
      body: text || null,
    };
  } catch (err) {
    console.error('logWebhook exception:', err);
    return {
      ok: false,
      error: String(err?.message || err),
    };
  }
}

// Origin allowlist (ถ้า Origin ไม่ส่งมา เช่น จาก LINE จะไม่บล็อก)
const ALLOWED_ORIGINS = new Set([
  'http://praweenaproperty.com',
  'http://localhost:8000',
]);

function checkOrigin(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true; // webhook จาก LINE จะไม่มี Origin
  if (ALLOWED_ORIGINS.has(origin)) return true;
  res.status(403).json({ ok: false, error: 'forbidden_origin' });
  return false;
}

// In-memory rate limit (เบื้องต้น) 5 ครั้ง/ชั่วโมงต่อ IP สำหรับ webhook
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
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  if (!checkOrigin(req, res)) return;

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'rate_limited' });
  }

  const requestId =
    req.headers['x-request-id'] ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const body = req.body || {};
    const events = Array.isArray(body.events) ? body.events : [];
    const firstEvent = events[0] || null;
    const userId = firstEvent?.source?.userId ?? null;

    const logResult = await logWebhook({
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
      logResult,   // 👈 โชว์ผลจาก Supabase ด้วย
    });
  } catch (err) {
    console.error('line-webhook handler error:', err);

    const logResult = await logWebhook({
      level: 'error',
      event: 'line_webhook_handler_error',
      status_code: 500,
      message: err?.message || 'handler error',
      send_to: null,
      meta: null,
      request_id: requestId,
    });

    return res.status(200).json({
      ok: false,
      error: 'internal_error_logged',
      request_id: requestId,
      logResult,
    });
  }
}
