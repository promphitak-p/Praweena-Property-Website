// js/utils/format.js

/**
 * จัดรูปแบบตัวเลขเป็นสกุลเงินบาท (THB)
 * @param {number} amount - จำนวนเงิน
 * @returns {string} - สตริงที่จัดรูปแบบแล้ว (เช่น '฿1,890,000')
 */
export function formatPrice(amount) {
  if (!amount || isNaN(amount) || Number(amount) <= 0) {
    return 'กำลังปรับปรุง';
  }
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}