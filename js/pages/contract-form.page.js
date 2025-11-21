// js/pages/contract-form.page.js
import { setupMobileNav } from '../ui/mobileNav.js';
import { protectPage } from '../auth/guard.js';
import { signOutIfAny } from '../auth/auth.js';
import { setupNav } from '../utils/config.js';
import { formatPrice } from '../utils/format.js';
import { toast } from '../ui/toast.js';
import { getLeadById } from '../services/leadsService.js';
import {
  getContractByLeadId,
  upsertContractForLead
} from '../services/contractsService.js';

const $ = (sel) => document.querySelector(sel);
const getEl = (id) => document.getElementById(id) || null;

let currentLeadId = null;
let currentPropertyId = null;

// ------------- helpers -------------
function fillIfHas(id, value) {
  const el = getEl(id);
  if (!el) return;
  el.value = value ?? '';
}

function getValue(id) {
  const el = getEl(id);
  return el ? el.value.trim() : '';
}

function getNumberOrNull(id) {
  const raw = getValue(id);
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

// ------------- โหลด Lead + Contract จาก URL -------------
async function loadLeadFromUrl() {
  const infoLine = $('#contract-lead-info');
  const params = new URLSearchParams(window.location.search);
  const leadId = params.get('lead_id');

  if (!leadId) {
    if (infoLine) {
      infoLine.textContent = 'ไม่มี lead_id ใน URL (ควรเปิดหน้านี้จากหน้าผู้สนใจ)';
    }
    return;
  }

  currentLeadId = leadId;

  try {
    const lead = await getLeadById(leadId);

    if (!lead) {
      if (infoLine) infoLine.textContent = `ไม่พบข้อมูลลูกค้า (ID: ${leadId})`;
      return;
    }

    // ให้ currentPropertyId เอาจาก lead ถ้ามี
    currentPropertyId = lead.property_id || null;

    // ปรับชื่อ field ให้ตรงกับ schema ของกุ้ง
    fillIfHas('client_name', lead.full_name || lead.name || '');
    fillIfHas('client_phone', lead.phone || '');
    fillIfHas('client_email', lead.email || '');
    fillIfHas('client_idcard', lead.id_card || '');
    fillIfHas('client_address', lead.address || '');

    fillIfHas('property_title', lead.property_title || '');
    fillIfHas(
      'property_price',
      lead.property_price ? Number(lead.property_price) : ''
    );
    fillIfHas('property_address', lead.property_address || '');

    if (infoLine) {
      infoLine.textContent = `เชื่อมกับลูกค้า: ${lead.full_name || lead.name || '-'} (ID: ${leadId})`;
    }

    // โหลด contract เดิม (ถ้ามี) ทับค่าเพิ่ม
    await loadContractForLead(leadId);
  } catch (err) {
    console.error(err);
    if (infoLine) {
      infoLine.textContent = 'โหลดข้อมูลลูกค้าไม่สำเร็จ';
    }
    toast('โหลดข้อมูลลูกค้าไม่สำเร็จ', 3000, 'error');
  }
}

async function loadContractForLead(leadId) {
  try {
    const contract = await getContractByLeadId(leadId);
    if (!contract) return;

    // เติมข้อมูลจาก contracts ทับลงฟอร์ม
    fillIfHas('client_name', contract.client_name);
    fillIfHas('client_idcard', contract.client_idcard);
    fillIfHas('client_phone', contract.client_phone);
    fillIfHas('client_email', contract.client_email);
    fillIfHas('client_address', contract.client_address);

    fillIfHas('property_title', contract.property_title);
    fillIfHas(
      'property_price',
      contract.property_price != null ? Number(contract.property_price) : ''
    );
    fillIfHas('property_address', contract.property_address);

    // date เป็น YYYY-MM-DD อยู่แล้ว
    fillIfHas('contract_date', contract.contract_date);
    fillIfHas('contract_place', contract.contract_place);
    fillIfHas(
      'deposit_amount',
      contract.deposit_amount != null ? Number(contract.deposit_amount) : ''
    );
    fillIfHas('transfer_date', contract.transfer_date);
    fillIfHas('contract_terms', contract.contract_terms);

    const infoLine = $('#contract-lead-info');
    if (infoLine) {
      infoLine.textContent += ' • พบสัญญาที่บันทึกไว้แล้ว (โหลดข้อมูลขึ้นให้แล้ว)';
    }
  } catch (err) {
    console.error(err);
    toast('โหลดข้อมูลสัญญาไม่สำเร็จ', 3000, 'error');
  }
}

// ------------- เก็บ payload สำหรับบันทึก -------------
function collectContractPayload() {
  if (!currentLeadId) return null;

  return {
    lead_id: currentLeadId,
    property_id: currentPropertyId,

    client_name: getValue('client_name'),
    client_idcard: getValue('client_idcard'),
    client_phone: getValue('client_phone'),
    client_email: getValue('client_email'),
    client_address: getValue('client_address'),

    property_title: getValue('property_title'),
    property_price: getNumberOrNull('property_price'),
    property_address: getValue('property_address'),

    contract_date: getValue('contract_date') || null,
    contract_place: getValue('contract_place'),
    deposit_amount: getNumberOrNull('deposit_amount'),
    transfer_date: getValue('transfer_date') || null,
    contract_terms: getValue('contract_terms')
  };
}

// ------------- บันทึกสัญญาลง Supabase -------------
async function saveContractOnly() {
  if (!currentLeadId) {
    toast('ไม่พบ lead_id สำหรับบันทึกสัญญา', 3000, 'error');
    return false;
  }

  const payload = collectContractPayload();
  if (!payload) return false;

  try {
    await upsertContractForLead(payload);
    toast('บันทึกข้อมูลสัญญาเรียบร้อย', 2200, 'success');
    return true;
  } catch (err) {
    console.error(err);
    toast('บันทึกข้อมูลสัญญาไม่สำเร็จ', 3000, 'error');
    return false;
  }
}

// ------------- PDF generator -------------
function generateContractPdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    toast('ไม่พบ jsPDF ในหน้านี้', 3000, 'error');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // ค่าในฟอร์ม
  const clientName = getValue('client_name');
  const clientIdCard = getValue('client_idcard');
  const clientPhone = getValue('client_phone');
  const clientEmail = getValue('client_email');
  const clientAddress = getValue('client_address');

  const propertyTitle = getValue('property_title');
  const propertyPriceNum = getNumberOrNull('property_price');

  const propertyAddress = getValue('property_address');

  const contractDate = getValue('contract_date');
  const contractPlace = getValue('contract_place');
  const depositAmountNum = getNumberOrNull('deposit_amount');
  const transferDate = getValue('transfer_date');
  const contractTerms = getValue('contract_terms');

  // หัวกระดาษ
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Reservation / Deposit Agreement', 105, 18, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'This document is a preliminary agreement for property reservation between Buyer and Seller.',
    105,
    26,
    { align: 'center', maxWidth: 180 }
  );

  let y = 36;

  const addSectionTitle = (text) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(text, 14, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
  };

  const addLine = (label, value) => {
    const line = `${label}: ${value || '-'}`;
    doc.text(line, 16, y, { maxWidth: 180 });
    y += 6;
  };

  // 1) Buyer
  addSectionTitle('1. Buyer Information');
  addLine('Full Name', clientName);
  addLine('ID Card No.', clientIdCard);
  addLine('Phone', clientPhone);
  addLine('Email', clientEmail);
  doc.text('Address:', 16, y);
  y += 5;
  doc.text(clientAddress || '-', 20, y, { maxWidth: 175 });
  y += 10;

  // 2) Property
  addSectionTitle('2. Property Information');
  addLine('Project / House', propertyTitle);
  addLine(
    'Price (THB)',
    propertyPriceNum != null ? formatPrice(propertyPriceNum) : '-'
  );
  doc.text('Property Address:', 16, y);
  y += 5;
  doc.text(propertyAddress || '-', 20, y, { maxWidth: 175 });
  y += 10;

  // 3) Contract
  addSectionTitle('3. Contract Details');
  addLine('Contract Date', contractDate);
  addLine('Contract Place', contractPlace);
  addLine(
    'Deposit Amount (THB)',
    depositAmountNum != null ? formatPrice(depositAmountNum) : '-'
  );
  addLine('Expected Transfer Date', transferDate);
  doc.text('Special Terms / Notes:', 16, y);
  y += 5;
  doc.text(contractTerms || '-', 20, y, { maxWidth: 175 });
  y += 15;

  // 4) Signatures
  addSectionTitle('4. Signatures');

  const sigY = y + 5;
  doc.line(30, sigY, 90, sigY);
  doc.text('Buyer Signature', 60, sigY + 5, { align: 'center' });

  doc.line(120, sigY, 180, sigY);
  doc.text('Seller / Authorized Person', 150, sigY + 5, { align: 'center' });

  const safeName = clientName || 'contract';
  const safeProp = propertyTitle || 'property';
  const fileName = `contract-${safeName.replace(/\s+/g, '_')}-${safeProp.replace(
    /\s+/g,
    '_'
  )}.pdf`;

  doc.save(fileName);
}

// ------------- init -------------
document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();
  setupNav();
  setupMobileNav();
  await signOutIfAny();

  await loadLeadFromUrl();

  const btnPdf = getEl('btn-generate-contract');
  if (btnPdf) {
    btnPdf.addEventListener('click', async () => {
      // บันทึกลง Supabase ก่อน แล้วค่อยออก PDF
      const ok = await saveContractOnly();
      if (ok) {
        generateContractPdf();
      }
    });
  }

  const btnBack = getEl('btn-back-to-leads');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      window.location.href = '/leads.html';
    });
  }
});
