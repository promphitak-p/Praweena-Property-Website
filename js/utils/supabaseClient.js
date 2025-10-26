// /js/utils/supabaseClient.js
// ใช้ Supabase JS v2 แบบ ESM CDN
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 🔧 ใส่ค่าจริงจาก Project Settings → API
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY';

// export client ตัวเดียวไว้เรียกทั้ง DB / Auth / Edge Functions
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // หน้าเว็บเรามักไม่ได้ใช้ callback ที่มี access_token ใน URL
  },
});
