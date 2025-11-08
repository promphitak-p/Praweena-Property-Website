// /js/services/notifyService.js
// เรียก serverless function /api/notify/line
// - notifyLeadNew        : แจ้งตอนมี Lead ใหม่
// - notifyLeadStatusChange: แจ้งตอนเปลี่ยนสถานะ Lead
// payload /api/notify/line: { message: string, to?: string, meta?: object }

async function postLine(message, to, meta) {
  try {
    const res = await fetch('/api/notify/line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        ...(to ? { to } : {}),
        ...(meta ? { meta } : {})
      })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[notify][server error]', res.status, text);
      return { ok: false, status: res.status, error: text || 'server error' };
    }
    return { ok: true };
  } catch (err) {
    console.error('[notify][fetch error]', err);
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function notifyLeadNew(lead = {}, to) {
  const title = lead.property_title ? `📍 ${lead.property_title}` : 'มีผู้สนใจใหม่';
  const lines = [
    `🟡 Lead ใหม่`,
    title,
    lead.name ? `👤 ชื่อ: ${lead.name}` : '',
    lead.phone ? `📞 โทร: ${lead.phone}` : '',
    lead.note ? `📝 ${lead.note}` : '',
    lead.property_slug ? `🔗 /property-detail.html?slug=${encodeURIComponent(lead.property_slug)}` : ''
  ].filter(Boolean);
  return postLine(lines.join('\n'), to, { kind: 'lead_new', lead });
}

// ✅ เวอร์ชันล่าสุด: แจ้งเตือนเฉพาะตอนเปลี่ยนสถานะ Lead
export async function notifyLeadStatusChange(lead = {}, newStatus) {
  try {
    const title = lead.property_title || lead.properties?.title || '';
    const slug  = lead.property_slug || lead.properties?.slug  || '';

    const lines = [
      '🟢 อัปเดตสถานะ Lead',
      title ? `📍 ${title}` : null,
      `➡️ สถานะใหม่: ${newStatus}`,
      lead.name ? `👤 ชื่อ: ${lead.name}` : null,
      lead.phone ? `📞 โทร: ${lead.phone}` : null,
      slug ? `🔗 /property-detail.html?slug=${encodeURIComponent(slug)}` : null
    ].filter(Boolean);

    await fetch('/api/notify/line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: lines.join('\n') })
    });
  } catch (err) {
    console.warn('[notifyLeadStatusChange] warn:', err);
  }
}