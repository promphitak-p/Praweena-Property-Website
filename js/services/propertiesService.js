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

/** Check uniqueness of slug and append suffix if needed */
async function ensureUniqueSlug(slug, currentId = null) {
  const missing = ensureClient();
  if (missing) return slug; // Can't check, hope for best

  let uniqueSlug = slug;
  let counter = 1;

  while (true) {
    let query = supabase
      .from('properties')
      .select('id')
      .eq('slug', uniqueSlug)
      .limit(1);

    if (currentId) {
      query = query.neq('id', currentId);
    }

    const { data, error } = await query;
    // If no record found (data empty), logic is safe -> return
    if (!error && (!data || data.length === 0)) {
      return uniqueSlug;
    }

    // Conflict -> increment
    counter++;
    uniqueSlug = `${slug}-${counter}`;
  }
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

/** ดึงด้วย slug (ไม่ error ถ้าไม่เจอ) */
export async function getBySlugOptional(slug) {
  const missing = ensureClient();
  if (missing) return { data: null, error: missing.error };

  return await supabase
    .from('properties')
    .select('*')
    .eq('slug', slug)
    .maybeSingle(); // Returns null data instead of error if not found (suppresses 406)
}

/** ดึงด้วย ID */
export async function getById(id) {
  const missing = ensureClient();
  if (missing) return { data: null, error: missing.error };

  return await supabase
    .from('properties')
    .select('*')
    .eq('id', id)
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

  // Soft Delete Logic: By default, show only non-deleted. If trash=true, show only deleted.
  if (filters.trash) {
    query = query.not('deleted_at', 'is', null);
  } else {
    query = query.is('deleted_at', null);
  }

  return await query;
}

/** Upsert (normalize ครบ) */
export async function upsertProperty(payload) {
  const missing = ensureClient();
  if (missing) return { data: null, error: missing.error };

  const body = { ...payload };

  // ให้ DB สร้าง id เองถ้าไม่ส่งมา
  if (!body.id) delete body.id;

  // Slug Logic
  let candidateSlug = body.slug;
  if (!candidateSlug && body.title) {
    candidateSlug = generateSlug(body.title);
  }

  if (candidateSlug) {
    body.slug = await ensureUniqueSlug(candidateSlug, body.id);
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

  // land_size -> number
  if (body.land_size !== undefined) {
    const ls = Number(body.land_size);
    body.land_size = Number.isFinite(ls) ? ls : null;
  }

  // ✅ upsert ครั้งเดียวด้วย body (ที่ normalize แล้ว)
  const attempt = await supabase
    .from('properties')
    .upsert(body)
    .select()
    .single();

  // -------- Fallback สำหรับ schema ที่ยังไม่อัปเดต --------
  // ถ้า DB ขาดคอลัมน์บางตัว ให้ retry โดยตัด field ที่ไม่รองรับออก (ป้องกัน error บน DB เดิม)
  const optionalFields = [
    'property_type',
    'youtube_video_ids',
    'renovations',
    'latitude',
    'longitude',
    'lat',
    'lng',
    'renovation_stage',
    'customer_status_visible',
    'customer_status_text',
    'land_size',
    'code',
  ];

  const isMissingColumn =
    attempt?.error &&
    (attempt.error.code === '42703' ||
      attempt.error.code === 'PGRST204' ||
      /column .* does not exist/i.test(String(attempt.error.message || '')) ||
      /Could not find the .* column/i.test(String(attempt.error.message || '')));

  if (isMissingColumn) {
    const fallbackBody = { ...body };
    const msg = String(attempt.error.message || '');
    const m = msg.match(/column \"([^\"]+)\"/i);
    const missingCol = m?.[1] || null;

    if (missingCol && Object.prototype.hasOwnProperty.call(fallbackBody, missingCol)) {
      delete fallbackBody[missingCol];
      console.warn(`Missing column "${missingCol}"; retrying upsert without it.`);
    } else {
      optionalFields.forEach((k) => delete fallbackBody[k]);
      console.warn('Schema is missing one or more optional columns; retrying upsert with optional fields removed.');
    }

    return await supabase.from('properties').upsert(fallbackBody).select().single();
  }

  return attempt;
}

// Re-map removeProperty to softDeleteProperty to maintain compatibility
export async function removeProperty(id) {
  return await softDeleteProperty(id);
}

// Soft Delete (ย้ายลงถังขยะ)
export async function softDeleteProperty(id) {
  const missing = ensureClient();
  if (missing) return { data: null, error: missing.error };

  return await supabase
    .from('properties')
    .update({ deleted_at: new Date(), published: false }) // Unpublish as well
    .eq('id', id)
    .select();
}

// Restore (กู้คืน)
export async function restoreProperty(id) {
  const missing = ensureClient();
  if (missing) return { data: null, error: missing.error };

  return await supabase
    .from('properties')
    .update({ deleted_at: null })
    .eq('id', id)
    .select();
}

// Hard Delete (ลบถาวร)
export async function hardDeleteProperty(id) {
  const missing = ensureClient();
  if (missing) return { data: null, error: missing.error };

  return await supabase.from('properties').delete().eq('id', id);
}

// Partial Update (แก้ไขบาง field โดยระบุ ID)
export async function updateProperty(id, fields) {
  const missing = ensureClient();
  if (missing) return { data: null, error: missing.error };

  const body = { ...fields };
  // Normalization for simple types
  if (body.price !== undefined) {
    const n = Number(body.price);
    body.price = Number.isFinite(n) ? n : null;
  }
  if (body.land_size !== undefined) {
    const ls = Number(body.land_size);
    body.land_size = Number.isFinite(ls) ? ls : null;
  }

  return await supabase.from('properties').update(body).eq('id', id).select().single();
}
