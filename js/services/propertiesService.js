// js/services/propertiesService.js
import { supabase } from '../lib/supabaseClient.js';

function generateSlug(title) {
  if (!title) return '';
  return title.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u0e00-\u0e7f-]+/g, '')
    .replace(/--+/g, '-');
}

/** ดึง public list (ok) */
export async function listPublic(filters = {}) {
  let query = supabase
    .from('properties')
    .select('*')
    .eq('published', true)
    .order('updated_at', { ascending: false });

  if (filters.q) query = query.ilike('title', `%${filters.q}%`);
  if (filters.district) query = query.eq('district', filters.district);
  return await query;
}

/** ดึงด้วย slug (ok เพราะ select('*') จะได้ youtube_video_ids ถ้ามีคอลัมน์) */
export async function getBySlug(slug) {
  return await supabase
    .from('properties')
    .select('*')
    .eq('slug', slug)
    .single();
}

/** admin list (ok) */
export async function listAll(filters = {}) {
  let query = supabase
    .from('properties')
    .select('*')
    .order('updated_at', { ascending: false });

  if (filters.q) query = query.ilike('title', `%${filters.q}%`);
  return await query;
}

/** Upsert (เวอร์ชัน normalize ครบ) */
export async function upsertProperty(payload) {
  const body = { ...payload };

  // id: ให้ DB สร้างเองถ้าไม่ส่งมา
  if (!body.id) delete body.id;

  // slug: auto ถ้าไม่มี แต่มี title
  if (body.title && !body.slug) {
    body.slug = generateSlug(body.title);
  }

  // ค่าที่เป็น '' เปลี่ยนเป็น null (ยกเว้น slug)
  Object.keys(body).forEach((key) => {
    if (key !== 'slug' && body[key] === '') body[key] = null;
  });

  // --- Normalize ชนิดข้อมูลสำคัญ ๆ ---
  // price → number
  if (body.price !== undefined) {
    const n = Number(body.price);
    body.price = Number.isFinite(n) ? n : null;
  }

  // gallery → array<string>
  if (body.gallery != null) {
    if (typeof body.gallery === 'string') {
      // เผื่อส่งมาเป็น JSON string
      try { body.gallery = JSON.parse(body.gallery); } catch { body.gallery = []; }
    }
    if (!Array.isArray(body.gallery)) body.gallery = [];
  }

  // youtube_video_ids → array<string> (คอลัมน์ jsonb)
  if (body.youtube_video_ids != null) {
    if (typeof body.youtube_video_ids === 'string') {
      // กัน dev คนอื่น stringify มา
      try { body.youtube_video_ids = JSON.parse(body.youtube_video_ids); } catch { body.youtube_video_ids = []; }
    }
    if (!Array.isArray(body.youtube_video_ids)) body.youtube_video_ids = [];
    // กรองให้เหลือเฉพาะค่า string 11 ตัว (ID YouTube)
    body.youtube_video_ids = body.youtube_video_ids
      .map(x => (typeof x === 'string' ? x.trim() : ''))
      .filter(x => /^[a-zA-Z0-9_-]{11}$/.test(x));
  }

  // renovations → array<any> (ถ้ามี)
  if (body.renovations != null && typeof body.renovations === 'string') {
    try { body.renovations = JSON.parse(body.renovations); } catch { body.renovations = []; }
  }

  // latitude/longitude → number
  if (body.latitude !== undefined) {
    const lat = parseFloat(body.latitude);
    body.latitude = Number.isFinite(lat) ? lat : null;
  }
  if (body.longitude !== undefined) {
    const lng = parseFloat(body.longitude);
    body.longitude = Number.isFinite(lng) ? lng : null;
  }

  // ยิงขึ้น Supabase
  const { data, error } = await supabase
    .from('properties')
    .upsert(body)
    .select()
    .single();

  return { data, error };
}

export async function removeProperty(id) {
  return await supabase.from('properties').delete().eq('id', id);
}
