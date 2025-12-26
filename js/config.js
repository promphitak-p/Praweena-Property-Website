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

const isValidFn = (val) => val && val !== 'undefined' && val !== 'null' && !val.includes('${');

export const SUPABASE_URL = [globalSupabase.url, globalSupabase.SUPABASE_URL, localUrl].find(isValidFn) || '';
export const SUPABASE_ANON_KEY = [globalSupabase.anonKey, globalSupabase.SUPABASE_ANON_KEY, localAnon].find(isValidFn) || '';

console.log('Supabase Config:', {
  url: SUPABASE_URL,
  keyExists: !!SUPABASE_ANON_KEY,
  fromGlobal: !!globalSupabase.url,
  fromLocal: !!localUrl
});

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Supabase URL/Anon key is missing. Set window.__SUPABASE = { url, anonKey } (or localStorage SUPABASE_URL / SUPABASE_ANON_KEY) before loading scripts.');
}
