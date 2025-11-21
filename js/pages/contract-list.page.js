//------------------------------------------------------------
// หน้า "รายการสัญญา"
// - protectPage(): ไม่ login = ไม่เห็น
// - listContracts() จาก Supabase (+ join leads, properties)
// - search auto-complete
// - quick filter 2 ปุ่ม + dropdown สถานะ
// - กดการ์ดแล้วไปแก้ไขที่ contract-form.html
//------------------------------------------------------------
import { protectPage } from '../auth/guard.js';
import { signOutIfAny } from '../auth/auth.js';
import { setupMobileNav } from '../ui/mobileNav.js';
import { setupNav } from '../utils/config.js';
import { listContracts, deleteContract } from '../services/contractsService.js';
import { $, clear } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { formatPrice } from '../utils/format.js';

let contractsAll = [];
let filtered = [];
let activeQuickFilter = 'all'; // 'all' | 'active'
let statusFilter = 'all';
let searchText = '';

// ---------------- helpers ----------------
const getEl = (id) => document.getElementById(id);

function norm(s) {
  return (s || '').toString().toLowerCase().trim();
}

function isActiveStatus(st) {
  return ['draft', 'pending', 'active'].includes(st);
}

function fmtDate(d) {
  if (!d) return '-';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('th-TH', { year:'numeric', month:'short', day:'numeric' });
  } catch {
    return d;
  }
}

function contractBadge(status) {
  const st = status || 'draft';
  const map = {
    draft: { t:'ร่าง', c:'#6b7280' },
    pending: { t:'รอดำเนินการ', c:'#b45309' },
    active: { t:'มีผลแล้ว', c:'#16a34a' },
    closed: { t:'ปิดแล้ว', c:'#0f766e' },
    cancelled: { t:'ยกเลิก', c:'#b91c1c' }
  };
  const m = map[st] || map.draft;
  return `<span class="rb-report-badge" style="background:${m.c};color:#fff;">${m.t}</span>`;
}

// ---------------- render ----------------
function renderCards(list) {
  const box = getEl('contracts-list');
  const empty = getEl('contracts-empty');
  if (!box) return;

  clear(box);

  if (!list.length) {
    empty && (empty.style.display = 'block');
    return;
  }
  empty && (empty.style.display = 'none');

  list.forEach((c) => {
    const lead = c.lead || {};
    const prop = c.property || {};

    const card = document.createElement('div');
    card.className = 'rb-property-card';

    const price = Number(c.price || prop.price || 0);
    const deposit = Number(c.deposit || 0);
    const balance = Number(c.balance || (price - deposit) || 0);

    card.innerHTML = `
      <div class="rb-property-card-header">
        <div>
          <h3 style="margin:0;font-size:1.05rem;">
            ${c.contract_no || `สัญญา #${c.id || '-'}`} 
            ${contractBadge(c.status)}
          </h3>
          <p style="margin:.15rem 0 0 0;color:#4b5563;">
            ลูกค้า: ${lead.full_name || lead.name || '-'} 
            ${lead.phone ? `• ${lead.phone}` : ''}
          </p>
        </div>

        <div style="text-align:right;min-width:140px;">
          <div style="font-weight:700;color:#b45309;">${formatPrice(price)}</div>
          <div style="font-size:.8rem;color:#6b7280;">
            วันที่: ${fmtDate(c.contract_date || c.created_at)}
          </div>
        </div>
      </div>

      <p style="margin:.35rem 0 0 0;font-size:.9rem;color:#6b7280;">
        บ้าน: ${prop.title || '-'} 
        ${prop.address ? `• ${prop.address} ${prop.district || ''} ${prop.province || ''}` : ''}
      </p>

      <div style="margin-top:.5rem;display:flex;gap:.5rem;flex-wrap:wrap;">
        <div class="rb-report-badge" style="background:rgba(0,0,0,.04);color:#111827;">
          มัดจำ: ${formatPrice(deposit)}
        </div>
        <div class="rb-report-badge" style="background:rgba(0,0,0,.04);color:#111827;">
          คงเหลือ: ${formatPrice(balance)}
        </div>
      </div>

      <div class="rb-property-card-footer" style="margin-top:.75rem;">
        <a class="btn btn-sm btn-primary" href="/contract-form.html?contract_id=${encodeURIComponent(c.id)}">
          เปิดแก้ไข
        </a>
        <button class="btn btn-sm btn-secondary rb-contract-delete-btn" data-id="${c.id}">
          ลบ
        </button>
      </div>
    `;

    box.appendChild(card);
  });

  // bind delete
  box.querySelectorAll('.rb-contract-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (!id) return;
      if (!confirm('ต้องการลบสัญญานี้หรือไม่?')) return;
      try {
        await deleteContract(id);
        toast('ลบสัญญาแล้ว', 2000, 'success');
        await reload();
      } catch (err) {
        console.error(err);
        toast('ลบไม่สำเร็จ', 2500, 'error');
      }
    });
  });
}

// ---------------- filter/search ----------------
function applyFilters() {
  const q = norm(searchText);

  filtered = contractsAll.filter((c) => {
    const lead = c.lead || {};
    const prop = c.property || {};

    const textBlob = [
      c.contract_no,
      lead.full_name, lead.name, lead.phone, lead.email,
      prop.title, prop.address, prop.district, prop.province
    ].map(norm).join(' ');

    const okSearch = !q || textBlob.includes(q);

    // quick filter
    const okQuick =
      activeQuickFilter === 'all'
        ? true
        : isActiveStatus(c.status);

    // status dropdown
    const okStatus =
      statusFilter === 'all'
        ? true
        : (c.status === statusFilter);

    return okSearch && okQuick && okStatus;
  });

  renderCards(filtered);
  renderSuggestions();
}

// auto-complete suggestions
function renderSuggestions() {
  const sugBox = getEl('contracts-search-suggestions');
  if (!sugBox) return;

  clear(sugBox);
  if (!searchText.trim()) {
    sugBox.style.display = 'none';
    return;
  }

  const q = norm(searchText);
  const items = contractsAll
    .map((c) => {
      const lead = c.lead || {};
      const prop = c.property || {};
      return {
        id: c.id,
        label: `${c.contract_no || `สัญญา #${c.id}`} • ${lead.full_name || lead.name || '-'} • ${prop.title || '-'}`,
        blob: norm(`${c.contract_no} ${lead.full_name} ${lead.name} ${lead.phone} ${prop.title}`)
      };
    })
    .filter((x) => x.blob.includes(q))
    .slice(0, 8);

  if (!items.length) {
    sugBox.style.display = 'none';
    return;
  }

  sugBox.style.display = 'block';
  items.forEach((it) => {
    const div = document.createElement('div');
    div.className = 'rb-search-suggestion';
    div.textContent = it.label;
    div.addEventListener('click', () => {
      window.location.href = `/contract-form.html?contract_id=${encodeURIComponent(it.id)}`;
    });
    sugBox.appendChild(div);
  });
}

// ---------------- events ----------------
function setupSearch() {
  const input = getEl('contracts-search-input');
  if (!input) return;

  input.addEventListener('input', (e) => {
    searchText = e.target.value || '';
    applyFilters();
  });

  // click outside -> hide
  document.addEventListener('click', (e) => {
    const sugBox = getEl('contracts-search-suggestions');
    if (!sugBox || e.target === input || sugBox.contains(e.target)) return;
    sugBox.style.display = 'none';
  });
}

function setupFilters() {
  const btnAll = getEl('filter-all');
  const btnActive = getEl('filter-active');
  const statusSel = getEl('contracts-status-filter');

  btnAll?.addEventListener('click', () => {
    activeQuickFilter = 'all';
    btnAll.classList.add('is-active');
    btnActive.classList.remove('is-active');
    applyFilters();
  });

  btnActive?.addEventListener('click', () => {
    activeQuickFilter = 'active';
    btnActive.classList.add('is-active');
    btnAll.classList.remove('is-active');
    applyFilters();
  });

  statusSel?.addEventListener('change', () => {
    statusFilter = statusSel.value || 'all';
    applyFilters();
  });
}

// scroll top
function setupScrollTop() {
  const scrollBtn = getEl('scroll-to-top');
  const header = document.querySelector('.page-contract-list .page-header');

  const onScroll = () => {
    if (header) {
      if (window.scrollY > 10) header.classList.add('is-scrolled');
      else header.classList.remove('is-scrolled');
    }
    if (scrollBtn) {
      if (window.scrollY > 300) scrollBtn.classList.add('show');
      else scrollBtn.classList.remove('show');
    }
  };

  window.addEventListener('scroll', onScroll);
  onScroll();

  scrollBtn?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ---------------- load ----------------
async function reload() {
  const box = getEl('contracts-list');
  if (box) {
    box.innerHTML = `<div style="grid-column:1/-1;color:#6b7280;">กำลังโหลดสัญญา...</div>`;
  }

  const { data, error } = await listContracts();
  if (error) throw error;

  contractsAll = (data || []);
  applyFilters();
}

document.addEventListener('DOMContentLoaded', async () => {
  await protectPage();
  setupNav();
  setupMobileNav();
  await signOutIfAny();

  setupSearch();
  setupFilters();
  setupScrollTop();

  try {
    await reload();
  } catch (err) {
    console.error(err);
    toast('โหลดรายการสัญญาไม่สำเร็จ', 3000, 'error');
  }
});
