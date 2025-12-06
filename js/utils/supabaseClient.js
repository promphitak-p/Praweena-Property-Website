// /js/utils/supabaseClient.js
// ใช้ Supabase JS v2 แบบ ESM CDN (pin เวอร์ชันให้แน่นอน ลดโอกาส wrapper เปลี่ยนจน error)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.48.0/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Supabase URL/Anon key missing. Set window.__SUPABASE = { url, anonKey } before loading scripts.');
}

// export client ตัวเดียวไว้เรียกทั้ง DB / Auth / Edge Functions
export const supabase = (() => {
  try {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false, // หน้าเว็บเรามักไม่ได้ใช้ callback ที่มี access_token ใน URL
      },
    });
  } catch (err) {
    console.error('Failed to init Supabase client', err);
    return null;
  }
})();
