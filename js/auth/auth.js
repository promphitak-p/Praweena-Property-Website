// js/auth/auth.js
import { supabase } from '../lib/supabaseClient.js';
import { toast } from '../ui/toast.js';

/**
 * ฟังก์ชันสำหรับออกจากระบบ
 * เมื่อสำเร็จจะแสดง toast และ redirect ไปหน้าแรก
 */
export async function signOutIfAny() {
  const signOutBtn = document.getElementById('sign-out-btn');
  if (!signOutBtn) return;

  signOutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Error signing out:', error);
      toast('เกิดข้อผิดพลาดในการออกจากระบบ', 3000, 'error');
    } else {
      toast('ออกจากระบบสำเร็จ');
      // หลังจากออกจากระบบ ให้กลับไปที่หน้าแรก
      window.location.href = '/index.html';
    }
  });
}