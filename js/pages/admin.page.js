// js/pages/admin.page.js
import { protectPage } from '../auth/guard.js';
import { setupNav } from '../utils/config.js';
import { setupMobileNav } from '../ui/mobileNav.js';
import { signOutIfAny } from '../auth/auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();      // ✅ ไม่ล็อกอิน = เด้งออก
  setupNav();
  setupMobileNav();
  autoActiveNav();
  await signOutIfAny();
});
