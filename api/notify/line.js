// /api/notify/line.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const defaultTo = process.env.LINE_DEFAULT_TO; // userId เริ่มต้น
    if (!token) throw new Error('Missing LINE_CHANNEL_ACCESS_TOKEN');
    if (!defaultTo) throw new Error('Missing LINE_DEFAULT_TO');

    const body = await parseJson(req);
    const to = body.to || defaultTo;

    const text =
      body.text ||
      buildLeadText(body.lead || body); // รองรับทั้ง {lead:{...}} หรือ payload ตรง ๆ

    // เรียก Messaging API
    const r = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to,
        messages: [{ type: 'text', text }],
      }),
    });

    const txt = await r.text();
    const ok = r.ok;
    if (!ok) {
      console.error('[LINE push error]', r.status, txt);
      return res.status(500).json({ ok: false, status: r.status, body: txt });
    }

    if (process.env.LINE_NOTI_DEBUG) {
      console.log('[LINE push ok]', txt);
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[LINE API ERROR]', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

function buildLeadText(lead = {}) {
  const title = lead.property_title ? `\nทรัพย์: ${lead.property_title}` : '';
  const slug  = lead.property_slug ? `\nลิงก์: https://praweena-property-website.vercel.app/property-detail.html?slug=${encodeURIComponent(lead.property_slug)}` : '';
  return (
    `มี Lead ใหม่ 🎉\nชื่อ: ${lead.name || '-'}\nโทร: ${lead.phone || '-'}\nโน้ต: ${lead.note || '-'}` +
    title + slug
  );
}

async function parseJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
