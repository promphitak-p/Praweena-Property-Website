// js/ui/mobileNav.js
import { $ } from './dom.js';

export function setupMobileNav() {
  const toggleBtn = $('#mobile-nav-toggle');
  const header = $('.header');

  if (!toggleBtn || !header) return;

  const links = header.querySelector('.nav-links');
  toggleBtn.setAttribute('aria-expanded', 'false');
  if (links) toggleBtn.setAttribute('aria-controls', 'primary-nav');
  if (links) links.id = 'primary-nav';

  toggleBtn.addEventListener('click', () => {
    header.classList.toggle('nav-open');
    const expanded = header.classList.contains('nav-open');
    toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  });
}
