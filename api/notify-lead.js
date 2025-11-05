// /api/notify-lead.js
// POST { message: string, to?: string }
import { linePush } from './_utils/lineClient.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { message, to } = await req.json?.() || await req.body || {};
    const defaultTo = process.env.LINE_DEFAULT_TO; // userId/roomId/groupId

    if (!message) return res.status(400).json({ ok: false, error: 'message required' });
    const target = to || defaultTo;
    if (!target) return res.status(400).json({ ok: false, error: 'to (or LINE_DEFAULT_TO) required' });

    await linePush(target, { type: 'text', text: message });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
