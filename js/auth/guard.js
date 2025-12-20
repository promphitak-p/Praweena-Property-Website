import { getSession, supabase } from '../lib/supabaseClient.js';

/**
 * ป้องกันการเข้าถึงหน้าหากผู้ใช้ยังไม่ได้ล็อกอิน หรือไม่ใช่ Admin
 * ถ้าไม่มี session, จะ redirect ไปยังหน้า auth (admin)
 * ถ้าไม่ใช่ admin, จะ redirect ไปหน้าแรก
 */
export async function protectPage() {
  console.log('[Guard] Checking session...');
  const session = await getSession();

  if (!session) {
    console.warn('[Guard] No session found, redirecting to login.');
    // ถ้าไม่มี session (ยังไม่ได้ล็อกอิน) ให้ส่งไปหน้าล็อกอิน
    window.location.href = '/admin/auth.html';
    return;
  }

  console.log('[Guard] Session found:', session.user.email);

  // Check if user is admin
  // (Assuming RLS allows read access to admin_emails for authenticated users, 
  // or relying on the fact that if they CAN read it, they are likely okay. 
  // If RLS blocks read, this might fail safe or fail hard. 
  // Ideally, use a secure RPC, but for now, direct query as requested.)
  try {
    const { data, error } = await supabase
      .from('admin_emails')
      .select('email')
      .eq('email', session.user.email)
      .maybeSingle();

    if (error || !data) {
      console.warn('Unauthorized: User is not an admin', session.user.email);
      alert('คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (Not an Admin)');
      window.location.href = '/'; // Kick to home
    }
  } catch (err) {
    console.error('Admin check failed:', err);
    window.location.href = '/';
  }
}
