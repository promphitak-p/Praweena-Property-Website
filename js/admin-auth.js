document.addEventListener('DOMContentLoaded', () => {
  const sb = window.getSupabase();
  const emailEl = document.getElementById('email');
  const passEl = document.getElementById('password');
  const btnLogin = document.getElementById('btn-login');
  const btnMagic = document.getElementById('btn-magic');

  btnLogin.addEventListener('click', async () => {
    const email = emailEl.value.trim();
    const password = passEl.value;
    if (!email || !password) return alert('กรอกอีเมลและรหัสผ่าน');

    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return alert(error.message);

    const { data: isAdmin } = await sb.rpc('is_admin');
    if (!isAdmin) {
      await sb.auth.signOut();
      return alert('อีเมลนี้ไม่ได้รับสิทธิ์ Admin');
    }
    location.href = '/dashboard.html';
  });

  btnMagic.addEventListener('click', async () => {
    const email = emailEl.value.trim();
    if (!email) return alert('กรอกอีเมลก่อน');
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + '/dashboard.html' } });
    if (error) alert(error.message);
    else alert('ส่ง Magic Link ไปที่อีเมลแล้ว');
  });
});
