// /api/cron/daily-leads.js
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('[daily-leads] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (service role is required for cron)');
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

function todayRangeTZ(tzOffsetHours = 7) {
  const now = new Date();
  const tz = tzOffsetHours * 60; // minutes
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const local = new Date(utc + tz * 60000);

  const start = new Date(local);
  start.setHours(0, 0, 0, 0);
  const end = new Date(local);
  end.setHours(23, 59, 59, 999);

  // แปลงกลับเป็น UTC ISO สำหรับเก็บใน DB
  const startUTC = new Date(start.getTime() - tz * 60000).toISOString();
  const endUTC = new Date(end.getTime() - tz * 60000).toISOString();
  return { startUTC, endUTC, localDateLabel: local.toLocaleDateString('th-TH') };
}

export default async function handler(req, res) {
  try {
    const { startUTC, endUTC, localDateLabel } = todayRangeTZ(7);

    const { data, error } = await supabase
      .from('leads')
      .select('id, created_at, name, phone, note, property_slug')
      .gte('created_at', startUTC)
      .lte('created_at', endUTC)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[daily-leads] supabase error', error);
      return res.status(500).json({ ok: false, error: error.message });
    }

    const count = data?.length || 0;
    const lines = [
      `📊 สรุป Leads ประจำวัน ${localDateLabel}`,
      `จำนวนทั้งหมด: ${count} รายการ`,
      ''
    ];

    if (count) {
      data.forEach((r, i) => {
        const t = new Date(r.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        lines.push(
          `${i + 1}. ${t} — ${r.name || '-'} (${r.phone || '-'})` +
          (r.property_slug ? ` • /property-detail.html?slug=${encodeURIComponent(r.property_slug)}` : '')
        );
      });
    } else {
      lines.push('— วันนี้ยังไม่มีรายการ —');
    }

    // ส่งเข้า LINE ผ่าน endpoint เดิม
    const baseUrl = process.env.SELF_BASE_URL || `https://${req.headers.host}`;
    const resp = await fetch(new URL('/api/notify/line', baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: lines.join('\n') })
    });

    const ok = resp.ok;
    if (!ok) {
      const txt = await resp.text().catch(() => '');
      console.error('[daily-leads] notify error', txt);
    }

    return res.status(200).json({ ok });
  } catch (err) {
    console.error('[daily-leads] fatal', err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
