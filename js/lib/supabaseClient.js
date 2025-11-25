// js/lib/supabaseClient.js
// อ่านค่า Supabase จาก config (ต้องตั้ง window.__SUPABASE = { url, anonKey } ก่อนโหลดสคริปต์)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Supabase URL and Anon Key are missing. Set window.__SUPABASE = { url, anonKey } before loading scripts.');
}

// สร้างและ export Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * ดึงข้อมูล session ของผู้ใช้ปัจจุบัน
 * @returns {Promise<object|null>} ข้อมูล session หรือ null ถ้าไม่มี
 */
export async function getSession() {
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
