// /js/utils/supabaseClient.js
// ใช้ Supabase JS v2 แบบ ESM CDN
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 🔧 ใส่ค่าจริงจาก Project Settings → API
const SUPABASE_URL = 'https://sihvgfnvleoloyhzcgll.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpaHZnZm52bGVvbG95aHpjZ2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NTEzNzAsImV4cCI6MjA3NjMyNzM3MH0.QVGsCHFmmzytiwtF90KNCIsHjCw4r15omI9RMTmCFxw';

// export client ตัวเดียวไว้เรียกทั้ง DB / Auth / Edge Functions
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // หน้าเว็บเรามักไม่ได้ใช้ callback ที่มี access_token ใน URL
  },
});
