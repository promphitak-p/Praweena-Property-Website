// js/ui/forms.js

/**
 * ดึงข้อมูลจากฟอร์ม HTML แล้วแปลงเป็น JavaScript Object
 * @param {HTMLFormElement} formElement - element <form> ที่ต้องการดึงข้อมูล
 * @returns {object} - Object ที่มี key เป็น name ของ input และ value เป็นค่าที่กรอก
 */
export function getFormData(formElement) {
  const formData = new FormData(formElement);
  return Object.fromEntries(formData.entries());
}