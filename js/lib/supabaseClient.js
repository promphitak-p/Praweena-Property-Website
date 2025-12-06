// js/lib/supabaseClient.js
// อ่านค่า Supabase จาก config (ต้องตั้ง window.__SUPABASE = { url, anonKey } ก่อนโหลดสคริปต์)
// Pin เวอร์ชันชัดเจนเพื่อเลี่ยงปัญหา wrapper_ads.mjs บน CDN ที่เปลี่ยนแปลงอัตโนมัติ
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.48.0/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Supabase URL and Anon Key are missing. Set window.__SUPABASE = { url, anonKey } before loading scripts.');
}

// สร้างและ export Supabase client (ครอบด้วย try/catch ป้องกันกรณี CDN ล้มเหลว)
export const supabase = (() => {
  try {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  } catch (err) {
    console.error('Failed to init Supabase client', err);
    return null;
  }
})();

/**
 * ดึงข้อมูล session ของผู้ใช้ปัจจุบัน
 * @returns {Promise<object|null>} ข้อมูล session หรือ null ถ้าไม่มี
 */
export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Error getting session:', error);
    return null;
  }
  return data.session;
}

/**
 * ดึงข้อมูลโปรไฟล์ของผู้ใช้ปัจจุบันจากตาราง 'profiles'
 * @returns {Promise<object|null>} ข้อมูลโปรไฟล์ หรือ null ถ้าไม่มี
 */
export async function getProfile() {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error getting profile:', error);
    return null;
  }
  return data;
}
