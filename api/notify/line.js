// /api/notify/line.js
// ส่งแจ้งเตือนผ่าน LINE Messaging API
// ENV ที่ต้องตั้งใน Vercel:
// - LINE_CHANNEL_ACCESS_TOKEN (จำเป็น)
// - LINE_DEFAULT_TO (optional: userId ที่จะ push เสมอถ้า client ไม่ส่ง to มา)

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

    // ตัดสินใจ endpoint ตามการมีอยู่ของ "to"
    const userId = to || process.env.LINE_DEFAULT_TO || '';
    let endpoint = '';
    let payload = {};

    if (userId) {
      // ใช้ push เมื่อมี to (หรือ LINE_DEFAULT_TO)
      endpoint = 'https://api.line.me/v2/bot/message/push';
      payload = {
        to: userId,
        messages: [{ type: 'text', text: message.slice(0, 5000) }]
      };
    } else {
      // ไม่มี to → broadcast (ต้องเปิดสิทธิ์ใน OA)
      endpoint = 'https://api.line.me/v2/bot/message/broadcast';
      payload = {
        messages: [{ type: 'text', text: message.slice(0, 5000) }]
      };
    }

    const apiRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await apiRes.text(); // LINE บางครั้งไม่คืน JSON
    if (!apiRes.ok) {
      // ส่งรายละเอียดกลับไปช่วยดีบัก
      return res.status(502).json({ ok: false, status: apiRes.status, body: text });
    }

    return res.status(200).json({ ok: true, status: apiRes.status, body: text });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
