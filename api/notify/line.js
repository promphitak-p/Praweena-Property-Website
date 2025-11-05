// /api/notify/line.js
// ENV บน Vercel:
// - LINE_CHANNEL_ACCESS_TOKEN   (required)
// - LINE_DEFAULT_TO             (optional: userId เริ่มต้นสำหรับ push)

function isValidLineUserId(v) {
  // LINE userId ปกติขึ้นต้นด้วย U และตามด้วย hex 32 ตัว
  return typeof v === 'string' && /^U[a-f0-9]{32}$/i.test(v.trim());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    return res.status(500).json({ ok: false, error: 'Missing LINE_CHANNEL_ACCESS_TOKEN' });
  }

  try {
    const { message, to } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ ok: false, error: 'message is required (string)' });
    }

    // เลือก to ที่ “ใช้งานได้จริง” เท่านั้น
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
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await apiRes.text(); // LINE บางกรณีไม่คืน JSON
    if (!apiRes.ok) {
      // ส่งข้อมูลประกอบกลับไปช่วยดีบัก
      return res.status(502).json({
        ok: false,
        status: apiRes.status,
        endpoint,
        hasValidTo,
        body: text,
      });
    }

    return res.status(200).json({ ok: true, status: apiRes.status, endpoint, hasValidTo });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
