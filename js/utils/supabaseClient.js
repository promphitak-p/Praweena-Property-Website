// /js/utils/supabaseClient.js
// ใช้ Supabase JS v2 แบบ ESM CDN
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Supabase URL/Anon key missing. Set window.__SUPABASE = { url, anonKey } before loading scripts.');
}

// export client ตัวเดียวไว้เรียกทั้ง DB / Auth / Edge Functions
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // หน้าเว็บเรามักไม่ได้ใช้ callback ที่มี access_token ใน URL
  },
});
