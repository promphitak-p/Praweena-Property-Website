// js/pages/auth.page.js
import { supabase } from '../lib/supabaseClient.js';
import { getFormData } from '../ui/forms.js';
import { $, $$ } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

const loginForm = $('#login-form');
const registerForm = $('#register-form');
const resetForm = $('#reset-form');

const loginError = $('#login-form .error-message');
const registerError = $('#register-form .error-message');
const resetError = $('#reset-form .error-message');

// Check if Supabase is initialized
if (!supabase) {
  loginError.textContent = 'System Error: Supabase connection not configured. Please check your setup.';
  loginError.style.display = 'block';
  console.error('Supabase client is null. Redirecting to setup...');
  // Optional: Auto-redirect to setup if not configured
  // window.location.href = '/setup.html';
}

// --- Event Handlers ---

// จัดการการเข้าสู่ระบบ
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = getFormData(loginForm);
  const { error } = await supabase.auth.signInWithPassword(formData);

  if (error) {
    loginError.textContent = error.message;
    loginError.style.display = 'block';
  } else {
    toast('เข้าสู่ระบบสำเร็จ!', 2000, 'success');
    window.location.href = '/admin.html';
  }
});

// จัดการการสมัครสมาชิก
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = getFormData(registerForm);
  const { error } = await supabase.auth.signUp(formData);

  if (error) {
    registerError.textContent = error.message;
    registerError.style.display = 'block';
  } else {
    toast('สมัครสมาชิกสำเร็จ! กรุณายืนยันอีเมลของคุณ', 5000, 'success');
    registerForm.reset();
  }
});

// จัดการการรีเซ็ตรหัสผ่าน
resetForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const { email } = getFormData(resetForm);
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin, // URL ที่จะกลับมาหลังรีเซ็ตรหัสผ่าน
  });

  if (error) {
    resetError.textContent = error.message;
    resetError.style.display = 'block';
  } else {
    toast('ส่งลิงก์สำหรับรีเซ็ตรหัสผ่านไปที่อีเมลแล้ว', 5000, 'success');
    resetForm.reset();
  }
});

// --- UI Toggling ---
const formLinks = $$('.auth-toggle a');
const authForms = $$('.auth-form');

formLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const formId = link.dataset.form;

    // Active link
    formLinks.forEach(l => l.classList.remove('active'));
    link.classList.add('active');

    // Active form
    authForms.forEach(form => {
      form.classList.remove('active');
      if (form.id === `${formId}-form`) {
        form.classList.add('active');
      }
    });
  });
});