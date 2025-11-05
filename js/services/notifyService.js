// js/services/notifyService.js
/**
 * ส่งแจ้งเตือนไป LINE ผ่าน API ของเรา
 * @param {object} lead { name, phone, note, property_title?, property_slug? }
 * @param {string} to (ไม่บังคับ) userId หรือ groupId ถ้าไม่ใส่จะใช้ LINE_DEFAULT_TO
 */
export async function notifyLeadNew(lead = {}, to) {
  const title = lead.property_title || lead.property_slug || '-';
  const url = lead.property_slug
    ? `${location.origin}/property-detail.html?slug=${encodeURIComponent(lead.property_slug)}`
    : `${location.origin}`;

  const msg =
`📩 มี Lead ใหม่เข้ามา
ชื่อ: ${lead.name || '-'}
เบอร์: ${lead.phone || '-'}
ทรัพย์: ${title}
ลิงก์: ${url}
โน้ต: ${lead.note || '-'}`;

  try {
    await fetch('/api/notify-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, message: msg })
    });
  } catch (e) {
    console.warn('notifyLeadNew error:', e);
  }
}
