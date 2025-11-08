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
