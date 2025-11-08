// /js/services/logsService.js
export async function createLog({ type, actor, message, meta }) {
  const res = await fetch('/api/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, actor, message, meta })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return true;
}

export async function listLogs({ type, limit = 200 } = {}) {
  const qs = new URLSearchParams();
  if (type) qs.set('type', type);
  if (limit) qs.set('limit', String(limit));
  const res = await fetch(`/api/logs?${qs.toString()}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data || [];
}

// เรียก serverless function เขียน log (ไม่ไปแตะ lead_events ตรง ๆ)
// client-side: เรียก serverless เท่านั้น
export async function logLeadEvent(input) {
  try {
    const res = await fetch('/api/logs/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input || {})
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[logLeadEvent] server error', res.status, text);
      return { ok:false, status:res.status, error:text || 'server error' };
    }
    return { ok:true, data: await res.json().catch(()=>null) };
  } catch (e) {
    console.error('[logLeadEvent] fetch error', e);
    return { ok:false, error:String(e?.message || e) };
  }
}
