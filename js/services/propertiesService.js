// js/services/propertiesService.js
import { supabase } from '../lib/supabaseClient.js';

const missingClientError = (() => {
  const err = new Error('Supabase client not initialized. Please configure SUPABASE_URL / SUPABASE_ANON_KEY.');
  err.code = 'SUPABASE_CLIENT_MISSING';
  return err;
})();

function ensureClient() {
  if (!supabase) {
    return { error: missingClientError };
  }
  return null;
}

function generateSlug(title) {
  if (!title) return '';
  return title.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u0e00-\u0e7f-]+/g, '')
    .replace(/--+/g, '-');
}

/** ดึง public list */
export async function listPublic(filters = {}) {
  const missing = ensureClient();
  if (missing) return { data: [], error: missing.error };

  const typeFilter = filters.property_type || filters.type;

  const buildQuery = (includeType = true) => {
    let query = supabase
      .from('properties')
      .select('*')
      .eq('published', true)
      .order('updated_at', { ascending: false });

    if (filters.q) query = query.ilike('title', `%${filters.q}%`);
    if (filters.district) query = query.eq('district', filters.district);

    const minRaw = filters.price_min;
    const maxRaw = filters.price_max;

    if (minRaw !== undefined && minRaw !== null && minRaw !== '') {
      const min = Number(minRaw);
      if (Number.isFinite(min)) query = query.gte('price', min);
    }

    if (maxRaw !== undefined && maxRaw !== null && maxRaw !== '') {
      const max = Number(maxRaw);
      if (Number.isFinite(max)) query = query.lte('price', max);
    }

    if (includeType && typeFilter) query = query.eq('property_type', typeFilter);
    return query;
  };

  const primary = await buildQuery(true);
  if (!primary.error || !typeFilter) return primary;

  // Fallback: if property_type column missing in DB, retry without server-side filter and filter client-side
  if (primary.error.message && primary.error.message.includes('property_type')) {
    const fallback = await buildQuery(false);
    if (fallback.data) {
      fallback.data = fallback.data.filter((p) => (p.property_type || '') === typeFilter);
      fallback.error = null;
    }
    return fallback;
  }

  return primary;
}

/** ดึงด้วย slug */
export async function getBySlug(slug) {
  const missing = ensureClient();
  if (missing) return { data: null, error: missing.error };

  return await supabase
    .from('properties')
    .select('*')
    .eq('slug', slug)
    .single();
}

/** admin list */
export async function listAll(filters = {}) {
  const missing = ensureClient();
  if (missing) return { data: [], error: missing.error };

  let query = supabase
    .from('properties')
    .select('*')
    .order('updated_at', { ascending: false });

  if (filters.q) query = query.ilike('title', `%${filters.q}%`);
  return await query;
}

/** Upsert (normalize ครบ) */
export async function upsertProperty(payload) {
  const missing = ensureClient();
  if (missing) return { data: null, error: missing.error };

  const body = { ...payload };

  // ให้ DB สร้าง id เองถ้าไม่ส่งมา
  if (!body.id) delete body.id;

  // slug อัตโนมัติ
  if (body.title && !body.slug) {
    body.slug = generateSlug(body.title);
  }

  // '' -> null (ยกเว้น slug)
  Object.keys(body).forEach((key) => {
    if (key !== 'slug' && body[key] === '') body[key] = null;
  });

  // price -> number
  if (body.price !== undefined) {
    const n = Number(body.price);
    body.price = Number.isFinite(n) ? n : null;
  }

  // gallery -> array<string>
  if (body.gallery != null) {
    if (typeof body.gallery === 'string') {
      try { body.gallery = JSON.parse(body.gallery); } catch { body.gallery = []; }
    }
    if (!Array.isArray(body.gallery)) body.gallery = [];
  }

  // youtube_video_ids -> array<string> (คอลัมน์ jsonb)
  if (body.youtube_video_ids != null) {
    if (typeof body.youtube_video_ids === 'string') {
      try { body.youtube_video_ids = JSON.parse(body.youtube_video_ids); } catch { body.youtube_video_ids = []; }
    }
    if (!Array.isArray(body.youtube_video_ids)) body.youtube_video_ids = [];
    body.youtube_video_ids = body.youtube_video_ids
      .map(x => (typeof x === 'string' ? x.trim() : ''))
      .filter(x => /^[a-zA-Z0-9_-]{11}$/.test(x));
  }

  // renovations -> array (ถ้ามี)
  if (body.renovations != null && typeof body.renovations === 'string') {
    try { body.renovations = JSON.parse(body.renovations); } catch { body.renovations = []; }
  }

  // lat/lng -> number
  if (body.latitude !== undefined) {
    const lat = parseFloat(body.latitude);
    body.latitude = Number.isFinite(lat) ? lat : null;
  }
  if (body.longitude !== undefined) {
    const lng = parseFloat(body.longitude);
    body.longitude = Number.isFinite(lng) ? lng : null;
  }

  // ✅ upsert ครั้งเดียวด้วย body (ที่ normalize แล้ว)
  const attempt = await supabase
    .from('properties')
    .upsert(body)
    .select()
    .single();

  // ถ้า schema ยังไม่มี property_type ให้บันทึกต่อโดยตัด field นี้ออก (ป้องกัน error บน DB เดิม)
  const missingType =
    attempt?.error &&
    (attempt.error.code === '42703' || (attempt.error.message || '').includes('property_type'));

  if (missingType) {
    const fallbackBody = { ...body };
    delete fallbackBody.property_type;
    console.warn('property_type column missing; upserting without it. Please add property_type to properties table.');
    return await supabase
      .from('properties')
      .upsert(fallbackBody)
      .select()
      .single();
  }

  return attempt;
}

export async function removeProperty(id) {
  const missing = ensureClient();
  if (missing) return { data: null, error: missing.error };

  return await supabase.from('properties').delete().eq('id', id);
}
