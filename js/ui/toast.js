// js/ui/toast.js

let toastContainer = null;

function ensureContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);
  }
}

/**
 * แสดงข้อความแจ้งเตือน (toast) แบบ Premium
 * @param {string} message - ข้อความ
 * @param {number} [duration=3500] - ระยะเวลา (ms)
 * @param {string} [type='info'] - 'success', 'error', 'info', 'warning'
 */
export function toast(message, duration = 3500, type = 'info') {
  ensureContainer();

  const toastEl = document.createElement('div');
  toastEl.className = `toast toast-${type}`;

  // Icon selection
  let icon = '';
  if (type === 'success') icon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  else if (type === 'error') icon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
  else icon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';

  toastEl.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-content">${message}</div>
    <div class="toast-close">&times;</div>
  `;

  // Close on click
  toastEl.querySelector('.toast-close').addEventListener('click', () => {
    removeToast(toastEl);
  });

  toastContainer.appendChild(toastEl);

  // Auto remove
  if (duration > 0) {
    setTimeout(() => {
      removeToast(toastEl);
    }, duration);
  }
}

function removeToast(el) {
  el.classList.add('hide');
  el.addEventListener('animationend', () => {
    if (el.parentNode) el.parentNode.removeChild(el);
  });
}