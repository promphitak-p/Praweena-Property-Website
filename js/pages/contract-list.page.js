// js/pages/contracts-list.page.js
console.log('Contract Page Script Loading...'); // DEBUG

import { setupMobileNav } from '../ui/mobileNav.js';
import { protectPage } from '../auth/auth.js';
import { setupNav } from '../utils/config.js';
import { listContracts, deleteContract, upsertContract, restoreContract } from '../services/contractsService.js';
import { listLeads } from '../services/leadsService.js';
import { listAll as listAllProperties } from '../services/propertiesService.js';
import { toast } from '../ui/toast.js';

setupMobileNav();
setupNav();
protectPage();

// ---------- Elements ----------
const $ = (s) => document.querySelector(s);
const grid = $('#contracts-grid');
console.log('Grid Element:', grid); // DEBUG
const searchInput = $('#contract-search');
const filterType = $('#contract-filter-type');
const newContractBtn = $('#new-contract-btn');

// Modal Elements
const modal = $('#contract-modal');
const modalClose = $('#modal-close');
const saveBtn = $('#save-contract-btn');

// Form Fields
const leadSearch = $('#lead-search');
const leadAc = $('#lead-ac');
const lead_id = $('#lead_id');
const lead_name = $('#lead_name');
const lead_phone = $('#lead_phone');
const lead_email = $('#lead_email');
const lead_idcard = $('#lead_idcard');
const lead_address = $('#lead_address');

const property_id = $('#property_id');
const property_name = $('#property_name');
const property_price = $('#property_price');
const property_address = $('#property_address');

const contract_id = $('#contract_id');
const contract_date = $('#contract_date');
const contract_type = $('#contract_type');
const deposit_amount = $('#deposit_amount');
const paid_amount = $('#paid_amount');
const remain_amount = $('#remain_amount');
const transfer_date = $('#transfer_date');
const contract_note = $('#contract_note');

// Preview Elements
const previewBtn = $('#preview-contract-btn');
const previewModal = $('#contract-preview-modal');
const previewClose = $('#preview-close');
const previewBox = $('#contract-preview');
const printBtn = $('#print-btn');

// ---------- State ----------
let contracts = [];
let leadsCache = [];
let propertiesCache = [];

const fmt = (n) => Number(n || 0).toLocaleString('th-TH');
const todayStr = () => new Date().toISOString().slice(0, 10);
const pick = (obj, keys, fallback = '') => {
  for (const k of keys) if (obj && obj[k] != null && obj[k] !== '') return obj[k];
  return fallback;
};

// toArray helper
function toArray(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.data)) return res.data;
  if (res && Array.isArray(res.data?.data)) return res.data.data;
  return [];
}

// ---------- Init ----------
(async function init() {
  try {
    const [cRes, lRes, pRes] = await Promise.all([
      listContracts(false), // Default: hide deleted
      listLeads(),
      listAllProperties()
    ]);

    contracts = cRes;
    leadsCache = toArray(lRes);
    propertiesCache = toArray(pRes);

    renderProperties(propertiesCache);
    render();
  } catch (err) {
    console.error(err);
    toast('โหลดข้อมูลไม่สำเร็จ');
  }
})();

// ---------- Events ----------
async function fetchContracts() {
  const isBin = filterType.value === 'bin';
  try {
    contracts = await listContracts(isBin); // Fetch deleted if bin selected
    render();
  } catch (err) {
    console.error(err);
    toast('โหลดข้อมูลไม่สำเร็จ', 0, 'error');
  }
}

searchInput.addEventListener('input', render);
filterType.addEventListener('change', fetchContracts);

newContractBtn.addEventListener('click', () => openModal());
modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

// Lead Autocomplete
leadSearch?.addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) return closeAc();

  const hits = leadsCache.filter(l => {
    const name = pick(l, ['full_name', 'name'], '').toLowerCase();
    const phone = pick(l, ['phone', 'tel'], '').toLowerCase();
    const email = pick(l, ['email'], '').toLowerCase();
    return name.includes(q) || phone.includes(q) || email.includes(q);
  }).slice(0, 8);

  if (!hits.length) return closeAc();
  leadAc.innerHTML = '';
  hits.forEach(l => {
    const name = pick(l, ['full_name', 'name'], '-');
    const phone = pick(l, ['phone', 'tel'], '');
    const div = document.createElement('div');
    div.className = 'ac-item';
    div.innerHTML = `<div><strong>${name}</strong></div><small>${phone}</small>`;
    div.addEventListener('click', () => {
      fillLead(l);
      leadSearch.value = name;
      closeAc();
    });
    leadAc.appendChild(div);
  });
  leadAc.classList.add('show');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.ac-wrap')) closeAc();
});

function closeAc() { leadAc.classList.remove('show'); }

// Property Select
property_id?.addEventListener('change', () => {
  const id = property_id.value;
  if (!id) return;
  const p = propertiesCache.find(x => String(x.id) === String(id));
  if (p) fillProperty(p);
});

// Calc Remain
[property_price, deposit_amount, paid_amount].forEach(el => {
  el?.addEventListener('input', calcRemain);
});

function calcRemain() {
  const price = Number(property_price.value || 0);
  const dep = Number(deposit_amount.value || 0);
  const paid = Number(paid_amount.value || 0);
  const remain = Math.max(price - dep - paid, 0);
  remain_amount.value = remain;
}

// Save
saveBtn.addEventListener('click', async () => {
  try {
    const payload = collectPayload();
    if (!payload.lead_id) return toast('กรุณาเลือกลูกค้าก่อน');
    if (!payload.property_id) return toast('กรุณาเลือกบ้านก่อน');

    await upsertContract(payload);

    // Refresh list (checking current filter)
    const isBin = filterType.value === 'bin';
    contracts = await listContracts(isBin);
    render();

    toast('บันทึกสัญญาแล้ว ✅');
    closeModal();

  } catch (err) {
    console.error(err);
    toast('บันทึกไม่สำเร็จ');
  }
});

function collectPayload() {
  return {
    id: contract_id.value || undefined,
    lead_id: lead_id.value || null,
    property_id: property_id.value ? Number(property_id.value) : null,
    contract_date: contract_date.value || null,
    contract_type: contract_type.value || 'reservation',
    deposit_amount: Number(deposit_amount.value || 0),
    paid_amount: Number(paid_amount.value || 0),
    remain_amount: Number(remain_amount.value || 0),
    transfer_date: transfer_date.value || null,
    note: contract_note.value || null,
    // Snapshots
    lead_name: lead_name.value || null,
    lead_phone: lead_phone.value || null,
    lead_email: lead_email.value || null,
    lead_address: lead_address.value || null,
    lead_idcard: lead_idcard.value || null,
    property_name: property_name.value || null,
    property_address: property_address.value || null,
    property_price: Number(property_price.value || 0),
  };
}

// ---------- Logic Functions ----------

function openModal(id = null) {
  // Reset Form
  [contract_id, lead_id, leadSearch, lead_name, lead_phone, lead_email, lead_idcard, lead_address,
    property_name, property_price, property_address,
    deposit_amount, paid_amount, remain_amount, transfer_date, contract_note].forEach(el => el.value = '');

  property_id.value = '';
  contract_date.value = todayStr();
  contract_type.value = 'reservation';

  if (id) {
    // Edit Mode
    const c = contracts.find(x => x.id == id);
    if (c) fillForm(c);
  }

  modal.classList.add('open');
}

function closeModal() {
  modal.classList.remove('open');
}

function fillForm(c) {
  contract_id.value = c.id;

  // Fill Lead
  lead_id.value = c.lead_id || '';
  const lead = c.leads || leadsCache.find(x => x.id === c.lead_id);
  if (lead) {
    fillLead(lead);
    leadSearch.value = pick(lead, ['full_name', 'name']);
  } else {
    // Fallback usage of snapshot
    lead_name.value = c.lead_name || '';
    lead_phone.value = c.lead_phone || '';
    leadSearch.value = c.lead_name || '';
  }

  // Fill Property
  property_id.value = c.property_id != null ? String(c.property_id) : '';
  const prop = c.properties || propertiesCache.find(x => String(x.id) === String(c.property_id));
  if (prop) fillProperty(prop);

  // Contract Fields
  contract_date.value = c.contract_date || todayStr();
  contract_type.value = c.contract_type || 'reservation';
  deposit_amount.value = c.deposit_amount ?? 0;
  paid_amount.value = c.paid_amount ?? 0;
  remain_amount.value = c.remain_amount ?? 0;
  transfer_date.value = c.transfer_date || '';
  contract_note.value = c.note || '';
}

function fillLead(l) {
  lead_id.value = l.id || '';
  lead_name.value = pick(l, ['full_name', 'name']);
  lead_phone.value = pick(l, ['phone', 'tel']);
  lead_email.value = pick(l, ['email']);
  lead_idcard.value = pick(l, ['id_card', 'idcard', 'citizen_id']);
  lead_address.value = pick(l, ['address', 'full_address', 'home_address']);
}

function fillProperty(p) {
  property_name.value = pick(p, ['title', 'name', 'project_name']);
  property_price.value = pick(p, ['price', 'sell_price'], 0);
  property_address.value = pick(p, ['address', 'full_address', 'location']);
  calcRemain();
}

function renderProperties(list) {
  if (!property_id) return;
  property_id.innerHTML = `<option value="">-- เลือกบ้าน --</option>`;
  list.forEach(p => {
    const title = pick(p, ['title', 'name', 'project_name'], 'บ้าน');
    const price = pick(p, ['price', 'sell_price'], 0);
    const opt = document.createElement('option');
    opt.value = String(p.id);
    opt.textContent = `${title} • ${fmt(price)}฿`;
    property_id.appendChild(opt);
  });
}

function render() {
  const q = searchInput.value.trim().toLowerCase();
  const t = filterType.value;
  const isBin = t === 'bin';

  const list = contracts.filter(c => {
    // FIX: Strictly separate Bin vs Active
    if (isBin) {
      if (!c.deleted_at) return false;
    } else {
      if (c.deleted_at) return false;
    }

    if (t && t !== 'bin' && c.contract_type !== t) return false;

    // Search
    const leadName = pick(c, ['lead_name'], pick(c.leads, ['full_name', 'name'], ''));
    const leadPhone = pick(c, ['lead_phone'], pick(c.leads, ['phone'], ''));
    const propName = pick(c, ['property_name'], pick(c.properties, ['title', 'name'], ''));
    const hay = `${leadName} ${leadPhone} ${propName}`.toLowerCase();
    return !q || hay.includes(q);
  });

  grid.innerHTML = '';
  if (!list.length) {
    grid.innerHTML = `<div class="text-muted">${isBin ? 'ไม่มีสัญญาในถังขยะ' : 'ยังไม่มีสัญญาในระบบ'}</div>`;
    return;
  }

  list.forEach(c => {
    const leadName = pick(c, ['lead_name'], pick(c.leads, ['full_name', 'name'], '-'));
    const leadPhone = pick(c, ['lead_phone'], pick(c.leads, ['phone'], ''));
    const propName = pick(c, ['property_name'], pick(c.properties, ['title', 'name'], '-'));
    const price = pick(c, ['property_price'], pick(c.properties, ['price'], 0));
    const dep = c.deposit_amount ?? 0;
    const remain = c.remain_amount ?? 0;

    const typeLabel =
      c.contract_type === 'sale' ? 'สัญญาซื้อขาย' :
        c.contract_type === 'lease' ? 'สัญญาเช่า' : 'สัญญาจอง';

    const card = document.createElement('div');
    card.className = 'contract-card';
    if (isBin) card.style.opacity = '0.75';

    let actionBtns = '';
    if (isBin) {
      actionBtns = `<button class="btn restore-btn" style="background:#22c55e; border-color:#22c55e; color:white;" data-id="${c.id}">♻️ คืนค่า</button>`;
    } else {
      actionBtns = `
        <button class="btn btn-secondary edit-btn" data-id="${c.id}">เปิด/แก้ไข</button>
        <button class="btn btn-secondary del-btn" data-id="${c.id}">ลบ</button>
      `;
    }

    card.innerHTML = `
      <div class="pill">${typeLabel}</div>
      <div class="contract-title">${propName}</div>
      <div class="contract-meta">
        ลูกค้า: <strong>${leadName}</strong>${leadPhone ? ` • ${leadPhone}` : ''}<br>
        วันที่: ${c.contract_date || '-'}<br>
        ราคา: ${fmt(price)}฿
      </div>
      <div class="contract-meta">
        มัดจำ: ${fmt(dep)}฿ • คงเหลือ: <strong>${fmt(remain)}฿</strong>
      </div>
      <div class="contract-actions">
        ${actionBtns}
      </div>
    `;
    grid.appendChild(card);

    if (isBin) {
      const restoreBtn = card.querySelector('.restore-btn');
      if (restoreBtn) {
        restoreBtn.onclick = () => handleRestore(c.id);
      }
    } else {
      // Direct Event Attachment
      const editBtn = card.querySelector('.edit-btn');
      if (editBtn) {
        editBtn.onclick = () => openModal(c.id);
      }
      const delBtn = card.querySelector('.del-btn');
      if (delBtn) {
        delBtn.onclick = () => handleDelete(c.id);
      }
    }
  });
}

// Delete Modal
const deleteModal = $('#delete-modal');
const confirmDeleteBtn = $('#confirm-delete-btn');
const cancelDeleteBtn = $('#cancel-delete-btn');
let deleteIdTarget = null;

function handleDelete(id) {
  deleteIdTarget = id;
  deleteModal.classList.add('open');
}

// Bind Modal Events
cancelDeleteBtn.addEventListener('click', () => {
  deleteModal.classList.remove('open');
  deleteIdTarget = null;
});

confirmDeleteBtn.addEventListener('click', async () => {
  if (!deleteIdTarget) return;
  deleteModal.classList.remove('open');
  try {
    await deleteContract(deleteIdTarget);
    contracts = contracts.filter(x => x.id != deleteIdTarget);
    render();
    toast('ลบสัญญาเรียบร้อย', 3000, 'success');
  } catch (err) {
    console.error('Delete error:', err);
    toast(`ลบไม่สำเร็จ: ${err.message || 'Unknown error'}`, 0, 'error');
  } finally {
    deleteIdTarget = null;
  }
});

// Restoration Modal
const restoreModal = $('#restore-modal');
const confirmRestoreBtn = $('#confirm-restore-btn');
const cancelRestoreBtn = $('#cancel-restore-btn');
let restoreIdTarget = null;

function handleRestore(id) {
  restoreIdTarget = id;
  restoreModal.classList.add('open');
}

// Bind Restore Modal Events
cancelRestoreBtn.addEventListener('click', () => {
  restoreModal.classList.remove('open');
  restoreIdTarget = null;
});

confirmRestoreBtn.addEventListener('click', async () => {
  if (!restoreIdTarget) return;
  restoreModal.classList.remove('open');

  try {
    await restoreContract(restoreIdTarget);
    toast('คืนค่าสัญญาแล้ว');
    // Refresh
    contracts = await listContracts(true);
    render();
  } catch (err) {
    console.error(err);
    toast('คืนค่าไม่สำเร็จ', 0, 'error');
  } finally {
    restoreIdTarget = null;
  }
});

// Preview Logic
const closePreviewBtn = $('#close-preview-btn');
previewBtn?.addEventListener('click', () => {
  const payload = collectPayload();
  previewBox.innerHTML = renderPreviewHtml(payload);
  previewModal.classList.add('open');
});
previewClose?.addEventListener('click', () => previewModal.classList.remove('open'));
closePreviewBtn?.addEventListener('click', () => previewModal.classList.remove('open'));
previewModal?.addEventListener('click', (e) => {
  if (e.target === previewModal) previewModal.classList.remove('open');
});

printBtn?.addEventListener('click', () => window.print());

function renderPreviewHtml(p) {
  // Determine labels based on contract type
  let buyerRole = 'ผู้ซื้อ/ผู้เช่า';
  let sellerRole = 'ผู้ขาย/ผู้ให้เช่า';

  if (p.contract_type === 'sale') {
    buyerRole = 'ผู้ซื้อ';
    sellerRole = 'ผู้ขาย';
  } else if (p.contract_type === 'lease') {
    buyerRole = 'ผู้เช่า';
    sellerRole = 'ผู้ให้เช่า';
  }

  const typeLabel =
    p.contract_type === 'sale' ? 'สัญญาซื้อขาย (Sales Contract)' :
      p.contract_type === 'lease' ? 'สัญญาเช่า (Lease Agreement)' :
        'สัญญาจอง (Reservation Agreement)';

  const dateStr = p.contract_date ? new Date(p.contract_date).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'long', year: 'numeric'
  }) : '-';

  return `
    <div class="contract-paper" style="padding-top: 2rem;">
      <div class="contract-header">
        <div class="co-logo">
          <img src="/assets/img/logo.png" alt="Praweena Property" style="height:50px;">
        </div>
        <div class="co-info">
          <h1>Praweena Property</h1>
          <p>123/45 ถนนสุขุมวิท เขตคลองเตย กรุงเทพมหานคร 10110</p>
          <p>โทร: 02-123-4567 | อีเมล: contact@praweenaproperty.com</p>
        </div>
      </div>

      <div class="contract-title-section">
        <h2>${typeLabel}</h2>
        <div class="contract-no">
          <span>เลขที่สัญญา: <strong>${p.id || 'DRAFT'}</strong></span>
          <span>วันที่: <strong>${dateStr}</strong></span>
        </div>
      </div>

      <div class="contract-body">
        <div class="contract-section">
          <h3>1. ข้อมูลคู่สัญญา (Parties)</h3>
          <table class="contract-table">
            <tr>
              <th width="15%">${buyerRole}:</th>
              <td width="35%"><strong>${p.lead_name || '-'}</strong></td>
              <th width="15%">เบอร์โทร:</th>
              <td width="35%">${p.lead_phone || '-'}</td>
            </tr>
            <tr>
              <th>ที่อยู่:</th>
              <td colspan="3">${p.lead_address || '-'}</td>
            </tr>
          </table>
        </div>

        <div class="contract-section">
          <h3>2. ข้อมูลทรัพย์สิน (Property)</h3>
          <table class="contract-table">
            <tr>
              <th width="15%">ทรัพย์สิน:</th>
              <td colspan="3"><strong>${p.property_name || '-'}</strong></td>
            </tr>
            <tr>
              <th>ที่ตั้ง:</th>
              <td colspan="3">${p.property_address || '-'}</td>
            </tr>
             <tr>
              <th>ราคา:</th>
              <td colspan="3"><strong>${fmt(p.property_price)} บาท</strong></td>
            </tr>
          </table>
        </div>

        <div class="contract-section">
          <h3>3. การชำระเงิน (Payment)</h3>
          <table class="contract-table">
            <tr>
              <th width="20%">เงินจอง/มัดจำ:</th>
              <td width="30%">${fmt(p.deposit_amount)} บาท</td>
              <th width="20%">ชำระแล้ว:</th>
              <td width="30%">${fmt(p.paid_amount)} บาท</td>
            </tr>
            <tr>
              <th>คงเหลือ:</th>
              <td><strong>${fmt(p.remain_amount)} บาท</strong></td>
              <th>กำหนดโอน:</th>
              <td>${p.transfer_date ? new Date(p.transfer_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}</td>
            </tr>
          </table>
        </div>

        <div class="contract-section">
          <h3>4. เงื่อนไขเพิ่มเติม</h3>
          <div class="contract-note">${p.note || 'ไม่มี'}</div>
        </div>
      </div>

      <div class="contract-footer">
        <div class="sign-block">
          <div class="sign-line"></div>
          <div class="sign-name">(<span style="width:200px;display:inline-block"></span>)</div>
          <div class="sign-role">${buyerRole}</div>
        </div>
        <div class="sign-block">
          <div class="sign-line"></div>
          <div class="sign-name">(<span style="width:200px;display:inline-block"></span>)</div>
          <div class="sign-role">${sellerRole}</div>
        </div>
      </div>
    </div>
  `;
}
