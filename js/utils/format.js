// js/utils/format.js

/**
 * จัดรูปแบบตัวเลขเป็นสกุลเงินบาท (THB)
 * @param {number} amount - จำนวนเงิน
 * @returns {string} - สตริงที่จัดรูปแบบแล้ว (เช่น '฿1,890,000')
 */
export function formatPrice(amount) {
  if (amount === null || isNaN(amount)) {
    return 'N/A';
  }
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}