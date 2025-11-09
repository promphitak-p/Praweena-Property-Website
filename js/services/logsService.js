// อ่าน log (ถ้าต้องใช้)
export async function listLogs({ type, limit = 200 } = {}) {
  const qs = new URLSearchParams();
  if (type) qs.set('type', type);
  if (limit) qs.set('limit', String(limit));
  const res = await fetch(`/api/logs?${qs.toString()}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data || [];
}

// เขียน log lead (ยิง serverless เท่านั้น)
export async function logLeadEvent(input = {}) {
  try {
    const res = await fetch('/api/logs/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input || {})
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } catch (err) {
    console.error('[logLeadEvent] error:', err);
    return { ok: false, error: String(err?.message || err) };
  }
}
