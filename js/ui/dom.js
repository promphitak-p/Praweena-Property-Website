// js/ui/dom.js

/**
 * สร้าง HTML element ใหม่
 * @param {string} tag - ชื่อแท็ก (เช่น 'div', 'p', 'a')
 * @param {object} [options] - ออปชันสำหรับ element
 * @param {string} [options.className] - คลาสของ element
 * @param {string} [options.textContent] - ข้อความภายใน element
 * @param {object} [options.attributes] - Attributes (เช่น { href: '/', 'data-id': '123' })
 * @returns {HTMLElement} element ที่สร้างขึ้น
 */
export function el(tag, options = {}) {
  const element = document.createElement(tag);
  if (options.className) {
    element.className = options.className;
  }
  if (options.textContent) {
    element.textContent = options.textContent;
  }
  if (options.style) {
    element.style.cssText = options.style;
  }
  if (options.attributes) {
    for (const [key, value] of Object.entries(options.attributes)) {
      element.setAttribute(key, value);
    }
  }
  return element;
}

/**
 * ค้นหา element แรกที่ตรงกับ selector
 * @param {string} selector - CSS selector
 * @returns {HTMLElement|null}
 */
export function $(selector) {
  return document.querySelector(selector);
}

/**
 * ค้นหาทุก elements ที่ตรงกับ selector
 * @param {string} selector - CSS selector
 * @returns {NodeListOf<HTMLElement>}
 */
export function $$(selector) {
  return document.querySelectorAll(selector);
}

/**
 * ลบ children ทั้งหมดออกจาก parent element
 * @param {HTMLElement} parentElement - element ที่ต้องการล้าง
 */
export function clear(parentElement) {
  while (parentElement.firstChild) {
    parentElement.removeChild(parentElement.firstChild);
  }
}