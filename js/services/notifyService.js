// /js/services/notifyService.js
// เรียก serverless function /api/notify/line
// payload: { message: string, to?: string, meta?: object }

let __lastSig = null;       // กันส่งซ้ำในหน้าต่างเวลา
let __lastAt  = 0;
let __inflight;             // กันกดรัว ให้คิวล่าสุดเท่านั้นทำงาน

function buildMessage(lead = {}) {
  const title = lead.property_title ? `📍 ${lead.property_title}` : 'มีผู้สนใจใหม่';
  const parts = [
    '🟡 Lead ใหม่',
    title,
    lead.name  ? `👤 ชื่อ: ${String(lead.name).trim()}`   : '',
    lead.phone ? `📞 โทร: ${String(lead.phone).trim()}`  : '',
    lead.note  ? `📝 ${String(lead.note).trim()}`         : '',
    lead.property_slug
      ? `🔗 /property-detail.html?slug=${encodeURIComponent(lead.property_slug)}`
      : ''
  ].filter(Boolean);
  return parts.join('\n');
}

function makeSig(lead = {}) {
  // ลายเซ็นสำหรับกันส่งซ้ำ (ฟิลด์ที่ทำให้ 1 lead “เหมือนเดิม”)
  const name = (lead.name || '').trim().toLowerCase();
  const phone = (lead.phone || '').trim();
  const slug = (lead.property_slug || '').trim().toLowerCase();
  const pid  = lead.property_id || lead.id || '';
  return [name, phone, slug, pid].join('|');
}

export async function notifyLeadNew(lead = {}, to) {
  try {
    // ===== de-dupe 45s =====
    const sig = makeSig(lead);
    const now = Date.now();
    if (sig && __lastSig === sig && (now - __lastAt) < 45_000) {
      console.debug('[notifyLeadNew] skipped duplicate within 45s');
      return { ok: true, skipped: true };
    }
    __lastSig = sig;
    __lastAt  = now;

    // ===== cancel previous inflight (กันกดรัว) =====
    if (__inflight?.abort) __inflight.abort();
    __inflight = new AbortController();

    const res = await fetch('/api/notify/line', {
      method: 'POST',
      signal: __inflight.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: buildMessage(lead),
        ...(to ? { to } : {}),
        // แนบ meta เผื่อฝั่ง server log หรือทำ idempotency
        meta: {
          sig,
          ts: new Date().toISOString(),
          slug: lead.property_slug || null,
          title: lead.property_title || null
        }
      })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[notifyLeadNew] server error', res.status, text);
      return { ok: false, status: res.status, error: text || 'server error' };
    }
    return { ok: true };
  } catch (err) {
    if (err?.name === 'AbortError') {
      console.debug('[notifyLeadNew] aborted previous request');
      return { ok: false, aborted: true };
    }
    console.error('[notifyLeadNew] fetch error', err);
    return { ok: false, error: String(err?.message || err) };
  }
}
