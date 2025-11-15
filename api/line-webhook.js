// /api/line-webhook.js
// เวอร์ชันทดสอบ: ยังไม่ยิง Supabase แค่ตอบกลับ userId ให้ก่อน

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    const body = req.body || {};
    const events = Array.isArray(body.events) ? body.events : [];
    const firstEvent = events[0] || null;
    const userId = firstEvent?.source?.userId ?? null;

    console.log('LINE webhook test body:', JSON.stringify(body));

    return res.status(200).json({
      ok: true,
      userId,
    });
  } catch (err) {
    console.error('line-webhook test error:', err);
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err),
    });
  }
}
