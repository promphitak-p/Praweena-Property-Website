import { supabase } from '../utils/supabaseClient.js';

(async () => {
  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  // ถ้าไม่มี user และอยู่ในโซน admin → เด้งออก
  if (!user && window.location.pathname.startsWith('/admin')) {
    window.location.href = '/admin/auth.html';
    return;
  }

  // โหลด header ตามปกติ
  loadHeader();
})();
