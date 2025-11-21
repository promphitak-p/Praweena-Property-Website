// js/pages/contract-form.page.js
import { setupMobileNav } from '../ui/mobileNav.js';
import { protectPage } from '../auth/guard.js';
import { signOutIfAny } from '../auth/auth.js';
import { setupNav } from '../utils/config.js';
import { toast } from '../ui/toast.js';
import { listAll } from '../services/propertiesService.js';
import { listLeads } from '../services/leadsService.js'; 
import { upsertContract, getContractById } from '../services/contractsService.js';

const $ = (id) => document.getElementById(id);

let leadsCache = [];
let propertiesCache = [];
let currentContract = null;

// ---------- helpers ----------
const val = (id) => {
  const el = $(id);
  return el ? el.value.trim() : '';
};
const num = (id) => {
  const el = $(id);
  if (!el) return null;
  const n = Number(el.value);
  return Number.isFinite(n) ? n : null;
};
const setVal = (id, v) => { const el = $(id); if (el) el.value = v ?? ''; };

// ---------- autocomplete ----------
function renderLeadResults(items) {
  const box = $('lead_results');
  if (!box) return;
  if (!items.length) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  box.innerHTML = items.map(l => `
    <div class="ac-item" data-id="${l.id}">
      <strong>${l.name || '-'}</strong>
      <small>${l.phone || ''} ${l.email ? '• ' + l.email : ''}</small>
    </div>
  `).join('');
  box.style.display = 'block';

  box.querySelectorAll('.ac-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const lead = leadsCache.find(x => String(x.id) === String(id));
      if (!lead) return;
      pickLead(lead);
      box.style.display = 'none';
    });
  });
}

function setupLeadAutocomplete() {
  const input = $('lead_search');
  const box = $('lead_results');
  if (!input || !box) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { renderLeadResults([]); return; }

    const found = leadsCache
      .filter(l =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.phone || '').toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q)
      )
      .slice(0, 20);

    renderLeadResults(found);
  });

  document.addEventListener('click', (e) => {
    if (!box.contains(e.target) && e.target !== input) {
      box.style.display = 'none';
    }
  });
}

function pickLead(lead) {
  setVal('lead_id', lead.id);
  setVal('lead_search', `${lead.name || ''}`.trim());
  setVal('customer_name', lead.name);
  setVal('customer_phone', lead.phone);
  setVal('customer_email', lead.email);
  setVal('customer_idcard', lead.id_card);
  setVal('customer_address', lead.address);
}

// ---------- properties ----------
async function loadProperties() {
  const select = $('property_select');
  if (!select) return;

  const { data, error } = await listAll();
  if (error) throw error;
  propertiesCache = data || [];

  select.innerHTML = '<option value="">— เลือกบ้าน —</option>';
  propertiesCache.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.title || `ID ${p.id}`;
    select.appendChild(opt);
  });

  select.addEventListener('change', () => {
    const id = select.value;
    const p = propertiesCache.find(x => String(x.id) === String(id));
    if (!p) return;

    setVal('property_id', p.id);
    setVal('property_title', p.title);
    setVal('property_address', [p.address,p.district,p.province].filter(Boolean).join(' '));
    setVal('property_price', p.price ?? '');
    recalcRemaining();
  });
}

// ---------- remaining ----------
function recalcRemaining() {
  const price = num('property_price') || 0;
  const dep = num('deposit_amount') || 0;
  setVal('remaining_amount', Math.max(price - dep, 0));
}
function setupRemainingCalc() {
  $('property_price')?.addEventListener('input', recalcRemaining);
  $('deposit_amount')?.addEventListener('input', recalcRemaining);
}

// ---------- collect payload ----------
function collectPayload() {
  const lead_id = val('lead_id') || null;
  const property_id = val('property_id') || null;

  return {
    id: val('contract_id') || undefined,
    lead_id,
    property_id,

    customer_name: val('customer_name') || null,
    customer_phone: val('customer_phone') || null,
    customer_email: val('customer_email') || null,
    customer_idcard: val('customer_idcard') || null,
    customer_address: val('customer_address') || null,

    property_title: val('property_title') || null,
    property_address: val('property_address') || null,
    property_price: num('property_price'),
    deposit_amount: num('deposit_amount'),
    remaining_amount: num('remaining_amount'),

    contract_date: val('contract_date') || null,
    transfer_date: val('transfer_date') || null,
    payment_method: val('payment_method') || null,
    contract_terms: val('contract_terms') || null,
  };
}

// ---------- fill ----------
function fillForm(c) {
  if (!c) return;

  setVal('contract_id', c.id);
  setVal('lead_id', c.lead_id);
  setVal('property_id', c.property_id);

  setVal('customer_name', c.customer_name);
  setVal('customer_phone', c.customer_phone);
  setVal('customer_email', c.customer_email);
  setVal('customer_idcard', c.customer_idcard);
  setVal('customer_address', c.customer_address);

  setVal('property_title', c.property_title);
  setVal('property_address', c.property_address);
  setVal('property_price', c.property_price);
  setVal('deposit_amount', c.deposit_amount);
  setVal('remaining_amount', c.remaining_amount);

  setVal('contract_date', c.contract_date ?? '');
  setVal('transfer_date', c.transfer_date ?? '');
  setVal('payment_method', c.payment_method ?? '');
  setVal('contract_terms', c.contract_terms ?? '');

  // reflect select
  const ps = $('property_select');
  if (ps && c.property_id) ps.value = c.property_id;
}

// ---------- save ----------
async function saveContract() {
  const payload = collectPayload();

  if (!payload.customer_name) {
    toast('กรุณาเลือกลูกค้าหรือกรอกชื่อลูกค้า', 2500, 'error');
    return;
  }
  if (!payload.property_id) {
    toast('กรุณาเลือกบ้านก่อน', 2500, 'error');
    return;
  }

  const btn = $('btn-save-contract');
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'กำลังบันทึก...';

  try {
    const saved = await upsertContract(payload);
    currentContract = saved;
    setVal('contract_id', saved.id);
    $('contract-status').textContent = 'สถานะ: บันทึกแล้ว';
    toast('บันทึกสัญญาเรียบร้อย 💛', 2000, 'success');
  } catch (e) {
    console.error(e);
    toast('บันทึกไม่สำเร็จ', 2500, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}

// ---------- preview / print ----------
function makePreviewHTML() {
  const p = collectPayload();
  const fmt = (n) => (n ?? 0).toLocaleString('th-TH');

  return `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8"/>
    <title>Contract Preview</title>
    <style>
      body{ font-family: sans-serif; padding:32px; line-height:1.6; color:#111; }
      h1{ text-align:center; margin-bottom:8px; }
      .row{ display:flex; gap:12px; }
      .col{ flex:1; }
      .box{ border:1px solid #ddd; padding:12px 14px; border-radius:8px; margin:10px 0; }
      .muted{ color:#666; font-size:14px; }
      .sign{ margin-top:28px; display:flex; justify-content:space-between; }
    </style>
  </head>
  <body>
    <h1>หนังสือสัญญาจะซื้อจะขาย</h1>
    <p class="muted" style="text-align:center;">
      Praweena Property — แบบฟอร์มสัญญาภายในระบบ
    </p>

    <div class="box">
      <h3>ข้อมูลผู้ซื้อ</h3>
      <div class="row">
        <div class="col"><b>ชื่อ:</b> ${p.customer_name || '-'}</div>
        <div class="col"><b>เบอร์:</b> ${p.customer_phone || '-'}</div>
      </div>
      <div class="row">
        <div class="col"><b>อีเมล:</b> ${p.customer_email || '-'}</div>
        <div class="col"><b>บัตรประชาชน:</b> ${p.customer_idcard || '-'}</div>
      </div>
      <div><b>ที่อยู่:</b> ${p.customer_address || '-'}</div>
    </div>

    <div class="box">
      <h3>ข้อมูลบ้าน</h3>
      <div><b>บ้าน:</b> ${p.property_title || '-'}</div>
      <div><b>ที่อยู่บ้าน:</b> ${p.property_address || '-'}</div>
      <div class="row">
        <div class="col"><b>ราคาขาย:</b> ${fmt(p.property_price)} บาท</div>
        <div class="col"><b>เงินมัดจำ:</b> ${fmt(p.deposit_amount)} บาท</div>
      </div>
      <div><b>คงเหลือ:</b> ${fmt(p.remaining_amount)} บาท</div>
    </div>

    <div class="box">
      <h3>รายละเอียดสัญญา</h3>
      <div><b>วันที่ทำสัญญา:</b> ${p.contract_date || '-'}</div>
      <div><b>วันโอน/นัดหมาย:</b> ${p.transfer_date || '-'}</div>
      <div><b>รูปแบบชำระ:</b> ${p.payment_method || '-'}</div>
      <div style="margin-top:8px"><b>เงื่อนไข / หมายเหตุ:</b><br/>${(p.contract_terms||'-').replace(/\n/g,'<br/>')}</div>
    </div>

    <div class="sign">
      <div>ลงชื่อผู้ซื้อ _____________________</div>
      <div>ลงชื่อผู้ขาย _____________________</div>
    </div>
  </body>
  </html>
  `;
}

function openPreview() {
  const overlay = $('contract-preview-overlay');
  const iframe = $('contract-preview-iframe');
  if (!overlay || !iframe) return;

  iframe.srcdoc = makePreviewHTML();
  overlay.classList.add('open');
}

function closePreview() {
  $('contract-preview-overlay')?.classList.remove('open');
}

function printPreview() {
  const iframe = $('contract-preview-iframe');
  if (!iframe) return;
  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
}

function setupPreviewButtons() {
  $('btn-preview-contract')?.addEventListener('click', openPreview);
  $('btn-close-preview')?.addEventListener('click', closePreview);
  $('btn-print-contract')?.addEventListener('click', printPreview);
  $('contract-preview-overlay')?.addEventListener('click', (e)=>{
    if (e.target.id === 'contract-preview-overlay') closePreview();
  });
}

// ---------- init ----------
document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();
  setupNav();
  setupMobileNav();
  await signOutIfAny();

  // leads cache
  try {
    leadsCache = await listLeads();
  } catch(e){
    console.error(e);
    toast('โหลดลูกค้าไม่สำเร็จ', 2500, 'error');
  }
  setupLeadAutocomplete();

  // properties
  try {
    await loadProperties();
  } catch(e){
    console.error(e);
    toast('โหลดรายการบ้านไม่สำเร็จ', 2500, 'error');
  }

  setupRemainingCalc();
  setupPreviewButtons();

  $('btn-save-contract')?.addEventListener('click', saveContract);

  $('btn-new-contract')?.addEventListener('click', ()=>{
    location.href = '/contract-form.html';
  });

  // load by url ?id=...
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if (id) {
    try {
      const c = await getContractById(id);
      if (c) {
        currentContract = c;
        fillForm(c);
        $('contract-status').textContent = 'สถานะ: โหลดสัญญาแล้ว';
      }
    } catch(e){
      console.error(e);
      toast('โหลดสัญญาไม่สำเร็จ', 2500, 'error');
    }
  }
});
