// js/auth/guard.js
import { getSession } from '../lib/supabaseClient.js';

/**
 * ป้องกันการเข้าถึงหน้าหากผู้ใช้ยังไม่ได้ล็อกอิน
 * ถ้าไม่มี session, จะ redirect ไปยังหน้า auth.html
 */
export async function protectPage() {
  const session = await getSession();
  
  if (!session) {
    // ถ้าไม่มี session (ยังไม่ได้ล็อกอิน) ให้ส่งไปหน้าล็อกอิน
    window.location.href = '/auth.html';
  }
}