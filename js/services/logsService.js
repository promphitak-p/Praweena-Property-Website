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
export async function logLeadEvent({ event_type, lead_id = null, payload = {} }) {
  try {
    const res = await fetch('/api/logs/lead', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ event_type, lead_id, payload })
    });
    if (!res.ok) {
      const t = await res.text().catch(()=> '');
      console.error('[logLeadEvent] server error', res.status, t);
      return { ok:false, status: res.status, error: t || 'server error' };
    }
    return { ok:true };
  } catch (e) {
    console.error('[logLeadEvent] fetch error', e);
    return { ok:false, error: String(e?.message||e) };
  }
}
