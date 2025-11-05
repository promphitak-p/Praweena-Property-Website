// /js/services/notifyService.js
// เรียก serverless function /api/notify/line
// payload: { message: string, to?: string, meta?: object }

export async function notifyLeadNew(lead = {}, to) {
  try {
    const title = lead.property_title ? `📍 ${lead.property_title}` : 'มีผู้สนใจใหม่';
    const lines = [
      `🟡 Lead ใหม่`,
      title,
      lead.name ? `👤 ชื่อ: ${lead.name}` : '',
      lead.phone ? `📞 โทร: ${lead.phone}` : '',
      lead.note ? `📝 ${lead.note}` : '',
      lead.property_slug ? `🔗 /property-detail.html?slug=${encodeURIComponent(lead.property_slug)}` : ''
    ].filter(Boolean);

    const res = await fetch('/api/notify/line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: lines.join('\n'),
        // ให้ to เป็น optional — ถ้าไม่ส่งจะไปใช้ LINE_DEFAULT_TO ฝั่ง server
        ...(to ? { to } : {})
      })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[notifyLeadNew] server error', res.status, text);
      return { ok: false, status: res.status, error: text || 'server error' };
    }
    return { ok: true };
  } catch (err) {
    console.error('[notifyLeadNew] fetch error', err);
    return { ok: false, error: String(err?.message || err) };
  }
}
