import { getSession, supabase } from '../lib/supabaseClient.js';

/**
 * ป้องกันการเข้าถึงหน้าหากผู้ใช้ยังไม่ได้ล็อกอิน หรือไม่ใช่ Admin
 * - ไม่มี session: redirect ไปหน้า login
 * - ไม่ใช่ admin: redirect ไปหน้าแรก (การบล็อกจริงให้พึ่ง RLS + RPC)
 */
export async function protectPage() {
  console.log('[Guard] Checking session...');
  const session = await getSession();

  if (!session) {
    console.warn('[Guard] No session found, redirecting to login.');
    window.location.href = '/admin/auth.html';
    return;
  }

  console.log('[Guard] Session found:', session.user.email);

  // ตรวจสิทธิ์ admin ผ่าน RPC is_admin() (security definer) เพื่อให้ตรงกับ policy ฝั่ง DB
  try {
    const { data, error } = await supabase.rpc('is_admin');

    if (error || !data) {
      console.warn('Unauthorized: User is not an admin', session.user.email, error);
      alert('คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (Not an Admin)');
      window.location.href = '/';
      return;
    }
  } catch (err) {
    console.error('Admin check failed:', err);
    window.location.href = '/';
  }
}
