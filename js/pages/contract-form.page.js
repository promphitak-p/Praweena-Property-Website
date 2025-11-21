// js/pages/contract-form.page.js
import { setupMobileNav } from '../ui/mobileNav.js';
import { protectPage } from '../auth/guard.js';
import { signOutIfAny } from '../auth/auth.js';
import { setupNav } from '../utils/config.js';
import { formatPrice } from '../utils/format.js';
import { toast } from '../ui/toast.js';
import { getLeadById } from '../services/leadsService.js';

const $ = (sel) => document.querySelector(sel);
const getEl = (id) => document.getElementById(id) || null;

// ---------------- helper ----------------
function fillIfHas(id, value) {
  const el = getEl(id);
  if (!el) return;
  el.value = value ?? '';
}

function getValue(id) {
  const el = getEl(id);
  return el ? el.value.trim() : '';
}

// ---------------- load lead from Supabase ----------------
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

  try {
    const lead = await getLeadById(leadId);

    if (!lead) {
      if (infoLine) infoLine.textContent = `ไม่พบข้อมูลลูกค้า (ID: ${leadId})`;
      return;
    }

    // NOTE: ปรับชื่อฟิลด์ให้ตรงกับตาราง leads ของกุ้ง
    // ตัวอย่าง: full_name, phone, email, id_card, address, property_title, property_price, property_address
    fillIfHas('client_name', lead.full_name || lead.name || '');
    fillIfHas('client_phone', lead.phone || '');
    fillIfHas('client_email', lead.email || '');
    fillIfHas('client_idcard', lead.id_card || '');
    fillIfHas('client_address', lead.address || '');

    // ข้อมูลบ้าน (ถ้าเก็บใน leads ด้วย)
    fillIfHas('property_title', lead.property_title || '');
    fillIfHas(
      'property_price',
      lead.property_price ? Number(lead.property_price) : ''
    );
    fillIfHas('property_address', lead.property_address || '');

    if (infoLine) {
      infoLine.textContent = `เชื่อมกับลูกค้า: ${lead.full_name || lead.name || '-'} (ID: ${leadId})`;
    }
  } catch (err) {
    console.error(err);
    if (infoLine) {
      infoLine.textContent = 'โหลดข้อมูลลูกค้าไม่สำเร็จ';
    }
    toast('โหลดข้อมูลลูกค้าไม่สำเร็จ', 3000, 'error');
  }
}

// ---------------- PDF generator ----------------
function generateContractPdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    toast('ไม่พบ jsPDF ในหน้านี้', 3000, 'error');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // เก็บค่า
  const clientName = getValue('client_name');
  const clientIdCard = getValue('client_idcard');
  const clientPhone = getValue('client_phone');
  const clientEmail = getValue('client_email');
  const clientAddress = getValue('client_address');

  const propertyTitle = getValue('property_title');
  const propertyPrice = getValue('property_price');
  const propertyAddress = getValue('property_address');

  const contractDate = getValue('contract_date');
  const contractPlace = getValue('contract_place');
  const depositAmount = getValue('deposit_amount');
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

  // SECTION 1: Buyer info
  addSectionTitle('1. Buyer Information');
  addLine('Full Name', clientName);
  addLine('ID Card No.', clientIdCard);
  addLine('Phone', clientPhone);
  addLine('Email', clientEmail);
  doc.text('Address:', 16, y);
  y += 5;
  doc.text(clientAddress || '-', 20, y, { maxWidth: 175 });
  y += 10;

  // SECTION 2: Property info
  addSectionTitle('2. Property Information');
  addLine('Project / House', propertyTitle);
  addLine('Price (THB)', propertyPrice ? formatPrice(Number(propertyPrice)) : '-');
  doc.text('Property Address:', 16, y);
  y += 5;
  doc.text(propertyAddress || '-', 20, y, { maxWidth: 175 });
  y += 10;

  // SECTION 3: Contract details
  addSectionTitle('3. Contract Details');
  addLine('Contract Date', contractDate);
  addLine('Contract Place', contractPlace);
  addLine('Deposit Amount (THB)', depositAmount ? formatPrice(Number(depositAmount)) : '-');
  addLine('Expected Transfer Date', transferDate);
  doc.text('Special Terms / Notes:', 16, y);
  y += 5;
  doc.text(contractTerms || '-', 20, y, { maxWidth: 175 });
  y += 15;

  // SECTION 4: Signature area
  addSectionTitle('4. Signatures');

  const sigY = y + 5;
  doc.line(30, sigY, 90, sigY);
  doc.text('Buyer Signature', 60, sigY + 5, { align: 'center' });

  doc.line(120, sigY, 180, sigY);
  doc.text('Seller / Authorized Person', 150, sigY + 5, { align: 'center' });

  // ชื่อไฟล์
  const safeName = clientName || 'contract';
  const safeProp = propertyTitle || 'property';
  const fileName = `contract-${safeName.replace(/\s+/g, '_')}-${safeProp.replace(/\s+/g, '_')}.pdf`;

  doc.save(fileName);
}

// ---------------- init ----------------
document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();
  setupNav();
  setupMobileNav();
  await signOutIfAny();

  await loadLeadFromUrl();

  const btnPdf = getEl('btn-generate-contract');
  if (btnPdf) {
    btnPdf.addEventListener('click', () => {
      generateContractPdf();
    });
  }

  const btnBack = getEl('btn-back-to-leads');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      window.location.href = '/leads.html';
    });
  }
});
