// js/config.js
// อ่านค่า Supabase URL/Anon จาก window.__SUPABASE (กำหนดผ่านสคริปต์หรือ env ระหว่าง deploy)
// ตัวแปรที่รองรับ: window.__SUPABASE = { url: '...', anonKey: '...' }
const w = typeof window !== 'undefined' ? window : {};
const globalSupabase = w.__SUPABASE || {};
const localUrl = (() => {
  try { return w.localStorage?.getItem('SUPABASE_URL') || ''; } catch { return ''; }
})();
const localAnon = (() => {
  try { return w.localStorage?.getItem('SUPABASE_ANON_KEY') || ''; } catch { return ''; }
})();

export const SUPABASE_URL = globalSupabase.url || globalSupabase.SUPABASE_URL || localUrl || '';
export const SUPABASE_ANON_KEY = globalSupabase.anonKey || globalSupabase.SUPABASE_ANON_KEY || localAnon || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Supabase URL/Anon key is missing. Set window.__SUPABASE = { url, anonKey } (or localStorage SUPABASE_URL / SUPABASE_ANON_KEY) before loading scripts.');
}
