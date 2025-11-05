// /api/line-webhook.js
import crypto from 'crypto';

// ปิด bodyParser เพื่ออ่าน "raw body" สำหรับตรวจลายเซ็น
export const config = {
  api: {
    bodyParser: false,
  },
};

// อ่าน raw body จาก req
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function verifySignature(channelSecret, body, signature) {
  const hmac = crypto.createHmac('sha256', channelSecret);
  hmac.update(body);
  const expected = hmac.digest('base64');
  return expected === signature;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, message: 'LINE webhook is alive' });
  }

  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers['x-line-signature'] || '';
    const secret = process.env.LINE_CHANNEL_SECRET || '';

    // ถ้าตั้งค่า secret แล้วให้ตรวจลายเซ็น (ถ้าไม่ตั้ง จะข้ามตรวจได้)
    if (secret) {
      const ok = verifySignature(secret, rawBody, signature);
      if (!ok) {
        console.warn('[LINE Webhook] Invalid signature');
        return res.status(401).json({ ok: false });
      }
    }

    const body = JSON.parse(rawBody || '{}');

    // ---- ตัวอย่าง: loop ทุก event ----
    if (Array.isArray(body.events)) {
      for (const ev of body.events) {
        console.log('[LINE Event]', ev.type, ev.source?.userId, ev.message?.text);

        // กรณีข้อความ: ตอบกลับง่าย ๆ
        // *ต้องมี LINE_CHANNEL_ACCESS_TOKEN ใน Environment
        if (ev.type === 'message' && ev.message?.type === 'text') {
          await replyText(ev.replyToken, `รับข้อความแล้วค่ะ: ${ev.message.text}`);
        }
      }
    }

    // LINE ต้องการ 200 เสมอ (ห้ามช้า/ห้าม timeout)
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[LINE Webhook] error', err);
    // อย่าตอบ 500 ตอน verify — ตอบ 200 ไปก่อนเพื่อไม่ให้ fail
    return res.status(200).json({ ok: false });
  }
}

// ---- helper: ตอบกลับผู้ใช้ ----
async function replyText(replyToken, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !replyToken) return;

  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  });
}
