// js/pages/contract-form.page.js
import { setupMobileNav } from '../ui/mobileNav.js';
import { toast } from '../ui/toast.js';
import { protectPage } from '../auth/auth.js';
import { setupNav } from '../utils/config.js';
// import { supabase } from '../utils/supabaseClient.js'; // ยังไม่ได้ใช้ ตัดทิ้งได้

import { upsertContract, getContractById } from '../services/contractsService.js';
import { listLeads } from '../services/leadsService.js';
import { listAll as listAllProperties } from '../services/propertiesService.js';

setupMobileNav();
setupNav();
protectPage(); // ไม่ login = เด้งออก

// ---------- Helpers ----------
const $ = (sel) => document.querySelector(sel);
const fmt = (n) => Number(n || 0).toLocaleString('th-TH');
const todayStr = () => new Date().toISOString().slice(0, 10);

function pick(obj, keys, fallback = '') {
  for (const k of keys) if (obj && obj[k] != null && obj[k] !== '') return obj[k];
  return fallback;
}

// ✅ normalize ให้มั่นใจว่าออกมาเป็น array เสมอ
function toArray(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.data)) return res.data;
  if (res && Array.isArray(res.data?.data)) return res.data.data;
  return [];
}

// ---------- Elements ----------
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

const saveBtn = $('#save-contract-btn');
const previewBtn = $('#preview-contract-btn');

const previewModal = $('#contract-preview-modal');
const previewClose = $('#preview-close');
const previewBox = $('#contract-preview');
const printBtn = $('#print-btn');

let leadsCache = [];
let propertiesCache = [];

// ---------- Load initial data ----------
(async function init() {
  try {
    if (contract_date) contract_date.value = todayStr();

    // 1) Leads cache for autocomplete
    const leadsRes = await listLeads();
    leadsCache = toArray(leadsRes);

    // 2) Properties dropdown
    const propsRes = await listAllProperties();
    propertiesCache = toArray(propsRes);

    renderProperties(propertiesCache);

    // 3) If edit mode (?id=xxx)
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    if (id) await loadContract(id);

  } catch (err) {
    console.error(err);
    toast('โหลดข้อมูลไม่สำเร็จ');
  }
})();

function renderProperties(list) {
  if (!property_id) return;

  property_id.innerHTML = `<option value="">-- เลือกบ้าน --</option>`;

  if (!Array.isArray(list) || list.length === 0) {
    // ถ้าไม่มีบ้านเลย ให้กันพัง + ช่วยดีบัก
    console.warn('properties list is empty or not array:', list);
    return;
  }

  list.forEach(p => {
    const id = p.id;
    const title = pick(p, ['title', 'name', 'project_name', 'slug'], 'บ้าน');
    const price = pick(p, ['price', 'sell_price'], '');
    const addr = pick(p, ['address', 'full_address', 'location'], '');

    const opt = document.createElement('option');
    opt.value = String(id); // ✅ ทำให้เป็น string เสมอ
    opt.textContent = `${title}${price ? ` • ${fmt(price)}฿` : ''}`;
    opt.dataset.title = title;
    opt.dataset.price = price;
    opt.dataset.address = addr;

    property_id.appendChild(opt);
  });
}

async function loadContract(id) {
  const c = await getContractById(id);
  contract_id.value = c.id;

  // lead
  lead_id.value = c.lead_id || '';
  const lead = c.leads || leadsCache.find(x => x.id === c.lead_id);
  if (lead) fillLead(lead);

  // property
  property_id.value = c.property_id != null ? String(c.property_id) : '';
  const prop = c.properties || propertiesCache.find(x => String(x.id) === String(c.property_id));
  if (prop) fillProperty(prop);

  // contract fields
  contract_date.value = c.contract_date || todayStr();
  contract_type.value = c.contract_type || 'reservation';

  deposit_amount.value = c.deposit_amount ?? 0;
  paid_amount.value = c.paid_amount ?? 0;
  remain_amount.value = c.remain_amount ?? 0;

  transfer_date.value = c.transfer_date || '';
  contract_note.value = c.note || '';
}

// ---------- Autocomplete Leads ----------
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
    const email = pick(l, ['email'], '');
    const div = document.createElement('div');
    div.className = 'ac-item';
    div.innerHTML = `
      <div><strong>${name}</strong></div>
      <small>${phone}${email ? ` • ${email}` : ''}</small>
    `;
    div.addEventListener('click', () => {
      fillLead(l);
      leadSearch.value = name;
      closeAc();
    });
    leadAc.appendChild(div);
  });
  leadAc.classList.add('open');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.ac-wrap')) closeAc();
});

function closeAc() {
  leadAc?.classList.remove('open');
}

function fillLead(l) {
  lead_id.value = l.id || '';
  lead_name.value = pick(l, ['full_name', 'name']);
  lead_phone.value = pick(l, ['phone', 'tel']);
  lead_email.value = pick(l, ['email']);
  lead_idcard.value = pick(l, ['id_card', 'idcard', 'citizen_id']);
  lead_address.value = pick(l, ['address', 'full_address', 'home_address']);
}

// ---------- Property selection ----------
property_id?.addEventListener('change', () => {
  const id = property_id.value;
  if (!id) return;

  const p = propertiesCache.find(x => String(x.id) === String(id));
  if (p) fillProperty(p);
});

function fillProperty(p) {
  property_name.value = pick(p, ['title', 'name', 'project_name']);
  property_price.value = pick(p, ['price', 'sell_price'], 0);
  property_address.value = pick(p, ['address', 'full_address', 'location']);
  calcRemain();
}

// ---------- Auto calc remain ----------
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

// ---------- Save contract ----------
saveBtn?.addEventListener('click', async () => {
  try {
    const payload = collectPayload();
    if (!payload.lead_id) return toast('กรุณาเลือกลูกค้าก่อน');
    if (!payload.property_id) return toast('กรุณาเลือกบ้านก่อน');

    const saved = await upsertContract(payload);
    contract_id.value = saved.id;

    toast('บันทึกสัญญาแล้ว ✅');
    history.replaceState(null, '', `/contract-form.html?id=${saved.id}`);

  } catch (err) {
    console.error(err);
    toast('บันทึกไม่สำเร็จ');
  }
});

function collectPayload() {
  return {
    id: contract_id.value || undefined,

    lead_id: lead_id.value || null,
    property_id: property_id.value ? Number(property_id.value) : null, // ✅ bigint id ควรส่งเป็น number

    contract_date: contract_date.value || null,
    contract_type: contract_type.value || 'reservation',

    deposit_amount: Number(deposit_amount.value || 0),
    paid_amount: Number(paid_amount.value || 0),
    remain_amount: Number(remain_amount.value || 0),

    transfer_date: transfer_date.value || null,
    note: contract_note.value || null,

    // snapshot text (กันข้อมูลเปลี่ยนทีหลัง)
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

// ---------- Preview / Export PDF ----------
previewBtn?.addEventListener('click', () => {
  const payload = collectPayload();
  previewBox.innerHTML = renderPreview(payload);
  previewModal.classList.add('open');
});

previewClose?.addEventListener('click', () => previewModal.classList.remove('open'));
previewModal?.addEventListener('click', (e) => {
  if (e.target === previewModal) previewModal.classList.remove('open');
});

printBtn?.addEventListener('click', () => window.print());

function renderPreview(p) {
  const typeLabel =
    p.contract_type === 'sale' ? 'สัญญาซื้อขาย' :
    p.contract_type === 'lease' ? 'สัญญาเช่า' : 'สัญญาจอง';

  return `
    <div class="rbr-header" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:1rem;">
      <div>
        <h2 style="margin:0;">${typeLabel}</h2>
        <div class="text-muted">Praweena Property</div>
      </div>
      <div class="text-muted" style="text-align:right;">
        วันที่ทำสัญญา: <strong>${p.contract_date || '-'}</strong><br>
        เลขที่สัญญา: <strong>${p.id || '(ใหม่)'}</strong>
      </div>
    </div>

    <h3>ข้อมูลลูกค้า</h3>
    <div class="pv-grid">
      <div class="pv-row"><div class="pv-label">ชื่อ</div><div class="pv-value">${p.lead_name || '-'}</div></div>
      <div class="pv-row"><div class="pv-label">เบอร์โทร</div><div class="pv-value">${p.lead_phone || '-'}</div></div>
      <div class="pv-row"><div class="pv-label">อีเมล</div><div class="pv-value">${p.lead_email || '-'}</div></div>
      <div class="pv-row"><div class="pv-label">เลขบัตร</div><div class="pv-value">${p.lead_idcard || '-'}</div></div>
      <div class="pv-row" style="grid-column: span 2;">
        <div class="pv-label">ที่อยู่</div>
        <div class="pv-value">${p.lead_address || '-'}</div>
      </div>
    </div>

    <h3 style="margin-top:1rem;">ข้อมูลบ้าน</h3>
    <div class="pv-grid">
      <div class="pv-row"><div class="pv-label">ชื่อบ้าน</div><div class="pv-value">${p.property_name || '-'}</div></div>
      <div class="pv-row"><div class="pv-label">ราคาขาย</div><div class="pv-value">${fmt(p.property_price)} บาท</div></div>
      <div class="pv-row" style="grid-column: span 2;">
        <div class="pv-label">ที่อยู่บ้าน</div>
        <div class="pv-value">${p.property_address || '-'}</div>
      </div>
    </div>

    <h3 style="margin-top:1rem;">รายการเงิน</h3>
    <div class="pv-grid">
      <div class="pv-row"><div class="pv-label">เงินจอง/มัดจำ</div><div class="pv-value">${fmt(p.deposit_amount)} บาท</div></div>
      <div class="pv-row"><div class="pv-label">ชำระแล้ว</div><div class="pv-value">${fmt(p.paid_amount)} บาท</div></div>
      <div class="pv-row"><div class="pv-label">คงเหลือ</div><div class="pv-value">${fmt(p.remain_amount)} บาท</div></div>
      <div class="pv-row"><div class="pv-label">กำหนดโอน/นัดใหญ่</div><div class="pv-value">${p.transfer_date || '-'}</div></div>
    </div>

    <h3 style="margin-top:1rem;">เงื่อนไขเพิ่มเติม</h3>
    <div style="white-space:pre-wrap;border:1px solid #eee;border-radius:12px;padding:.75rem;min-height:60px;">
      ${p.note || '-'}
    </div>

    <div style="margin-top:1.25rem;display:flex;justify-content:space-between;gap:1rem;">
      <div style="text-align:center;flex:1;">
        ___________________________<br>
        ผู้ซื้อ/ผู้เช่า
      </div>
      <div style="text-align:center;flex:1;">
        ___________________________<br>
        ผู้ขาย/ผู้ให้เช่า
      </div>
    </div>
  `;
}
