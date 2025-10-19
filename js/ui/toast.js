// js/ui/toast.js
import { el, $ } from './dom.js';

let toastContainer = null;

/**
 * แสดงข้อความแจ้งเตือน (toast)
 * @param {string} message - ข้อความที่ต้องการแสดง
 * @param {number} [duration=3000] - ระยะเวลาที่แสดง (ms)
 * @param {string} [type='info'] - ประเภท ('info', 'success', 'error')
 */
export function toast(message, duration = 3000, type = 'info') {
  if (!toastContainer) {
    toastContainer = el('div', { className: 'toast' });
    document.body.appendChild(toastContainer);
  }

  toastContainer.textContent = message;
  toastContainer.className = `toast show type-${type}`; // เพิ่มคลาสสำหรับ styling ตามประเภท

  setTimeout(() => {
    toastContainer.classList.remove('show');
  }, duration);
}