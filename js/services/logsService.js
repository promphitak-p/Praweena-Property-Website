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

// /js/services/logService.js
// client → call serverless API เท่านั้น (ไม่แตะ lead_events โดยตรง)

export async function logLeadEvent(input = {}) {
  try {
    const res = await fetch('/api/logs/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input || {})
    });

    if (!res.ok) throw new Error(await res.text());
    return await res.json(); // { ok:true, data }
  } catch (err) {
    console.error('[logLeadEvent] error', err);
    return { ok: false, error: err.message };
  }
}
