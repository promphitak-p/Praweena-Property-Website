// js/config.js
// ไฟล์นี้จะพยายามอ่านค่าจาก window object
// ซึ่งจะถูก "ฉีด" เข้ามาโดยไฟล์อื่น (สำหรับ local) หรือโดย Hosting Provider (สำหรับ production)
export const SUPABASE_URL = window.SUPABASE_URL;
export const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;