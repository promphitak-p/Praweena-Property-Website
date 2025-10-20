// js/ui/mobileNav.js
import { $ } from './dom.js';

export function setupMobileNav() {
  const toggleBtn = $('#mobile-nav-toggle');
  const header = $('.header');

  if (!toggleBtn || !header) return;

  toggleBtn.addEventListener('click', () => {
    header.classList.toggle('nav-open');
  });
}