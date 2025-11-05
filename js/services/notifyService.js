// /js/services/notifyService.js
export async function notifyLeadNew(lead, to /* optional userId */) {
  try {
    const r = await fetch('/api/notify/line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead, to }),
    });
    // ช่วยดีบักเวลามี 500: โยนข้อความ error ออกมา
    if (!r.ok) {
      const txt = await r.text();
      console.warn('[notifyLeadNew] server error', r.status, txt);
      return { ok: false, status: r.status, body: txt };
    }
    return { ok: true };
  } catch (e) {
    console.warn('[notifyLeadNew] fetch failed', e);
    return { ok: false, error: String(e) };
  }
}
