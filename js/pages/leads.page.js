// js/pages/leads.page.js
import { protectPage } from '../auth/guard.js';
import { signOutIfAny } from '../auth/auth.js';
import { listLeads, updateLead } from '../services/leadsService.js';
import { setupNav } from '../utils/config.js';
import { el, $, clear } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

const tableBody = $('#leads-table tbody');
const leadStatuses = ['new', 'contacted', 'qualified', 'won', 'lost'];

/**
 * โหลดและแสดงรายการ Leads ทั้งหมด
 */
async function loadLeads() {
  clear(tableBody);
  tableBody.append(el('tr', {}).appendChild(el('td', {
    textContent: 'กำลังโหลด...',
    attributes: { colspan: 6, style: 'text-align: center;' }
  })));

  const { data, error } = await listLeads();

  clear(tableBody);
  if (error) {
    toast('เกิดข้อผิดพลาด: ' + error.message, 4000, 'error');
    console.error(error);
    return;
  }

  if (data.length === 0) {
    tableBody.append(el('tr', {}).appendChild(el('td', {
      textContent: 'ยังไม่มีผู้สนใจติดต่อเข้ามา',
      attributes: { colspan: 6, style: 'text-align: center;' }
    })));
    return;
  }

  data.forEach(renderLeadRow);
}

/**
 * สร้างแถวในตารางสำหรับแต่ละ Lead
 */
function renderLeadRow(lead) {
  const tr = el('tr', { attributes: { 'data-id': lead.id } });

  // สร้าง Dropdown สำหรับ Status
  const statusSelect = el('select', { className: 'form-control' });
  leadStatuses.forEach(status => {
    const option = el('option', { textContent: status, attributes: { value: status } });
    if (status === lead.status) {
      option.selected = true;
    }
    statusSelect.append(option);
  });
  
  // เพิ่ม event listener ให้ dropdown
  statusSelect.addEventListener('change', async (e) => {
    const newStatus = e.target.value;
    const { error } = await updateLead(lead.id, { status: newStatus });
    if (error) {
      toast(`อัปเดตสถานะไม่สำเร็จ: ${error.message}`, 4000, 'error');
      // คืนค่าเดิมถ้าอัปเดตไม่สำเร็จ
      e.target.value = lead.status;
    } else {
      toast('อัปเดตสถานะสำเร็จ', 2000, 'success');
    }
  });

  // สร้าง Cells
  const dateCell = el('td', { textContent: new Date(lead.created_at).toLocaleDateString('th-TH') });
  const nameCell = el('td', { textContent: lead.name });
  const phoneCell = el('td', { textContent: lead.phone });
  const propertyCell = el('td', {});
  const noteCell = el('td', { textContent: lead.note || '-' });
  const statusCell = el('td', {});

  // ถ้ามีข้อมูล property ที่ join มา ให้สร้างเป็นลิงก์
  if (lead.properties) {
    const propLink = el('a', {
      textContent: lead.properties.title,
      attributes: { href: `/property-detail.html?slug=${lead.properties.slug}`, target: '_blank' }
    });
    propertyCell.append(propLink);
  } else {
    propertyCell.textContent = 'N/A';
  }

  statusCell.append(statusSelect);
  tr.append(dateCell, nameCell, phoneCell, propertyCell, noteCell, statusCell);
  tableBody.append(tr);
}

// --- Main execution ---
document.addEventListener('DOMContentLoaded', async () => {
  await protectPage(); // ** สำคัญ: ป้องกันหน้านี้ **
  setupNav();
  signOutIfAny();
  loadLeads();
});