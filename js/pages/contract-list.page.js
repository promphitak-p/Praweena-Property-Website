// js/pages/contracts-list.page.js
import { setupMobileNav } from '../ui/mobileNav.js';
import { protectPage } from '../auth/auth.js';
import { setupNav } from '../utils/config.js';
import { listContracts, deleteContract } from '../services/contractsService.js';
import { toast } from '../ui/toast.js';

setupMobileNav();
setupNav();
protectPage();

const $ = (s)=>document.querySelector(s);
const grid = $('#contracts-grid');
const searchInput = $('#contract-search');
const filterType = $('#contract-filter-type');

let contracts = [];

const fmt = (n)=> Number(n||0).toLocaleString('th-TH');
const pick = (obj, keys, fallback='')=>{
  for (const k of keys) if (obj && obj[k]!=null && obj[k] !== '') return obj[k];
  return fallback;
};

(async function init(){
  try{
    contracts = await listContracts();
    render();
  }catch(err){
    console.error(err);
    toast('โหลดสัญญาไม่สำเร็จ');
  }
})();

searchInput.addEventListener('input', render);
filterType.addEventListener('change', render);

function render(){
  const q = searchInput.value.trim().toLowerCase();
  const t = filterType.value;

  const list = contracts.filter(c=>{
    if (t && c.contract_type !== t) return false;

    const leadName = pick(c, ['lead_name'], pick(c.leads, ['full_name','name'], ''));
    const leadPhone = pick(c, ['lead_phone'], pick(c.leads, ['phone'], ''));
    const propName = pick(c, ['property_name'], pick(c.properties, ['title','name'], ''));
    const date = c.contract_date || '';
    const note = c.note || '';

    const hay = `${leadName} ${leadPhone} ${propName} ${date} ${note}`.toLowerCase();
    return !q || hay.includes(q);
  });

  grid.innerHTML = '';
  if (!list.length){
    grid.innerHTML = `<div class="text-muted">ยังไม่มีสัญญาในระบบ</div>`;
    return;
  }

  list.forEach(c=>{
    const leadName = pick(c, ['lead_name'], pick(c.leads, ['full_name','name'], '-'));
    const leadPhone = pick(c, ['lead_phone'], pick(c.leads, ['phone'], ''));
    const propName = pick(c, ['property_name'], pick(c.properties, ['title','name'], '-'));
    const price = pick(c, ['property_price'], pick(c.properties, ['price'], 0));
    const dep = c.deposit_amount ?? 0;
    const paid = c.paid_amount ?? 0;
    const remain = c.remain_amount ?? 0;

    const typeLabel =
      c.contract_type === 'sale' ? 'สัญญาซื้อขาย' :
      c.contract_type === 'lease' ? 'สัญญาเช่า' : 'สัญญาจอง';

    const card = document.createElement('div');
    card.className = 'contract-card';
    card.innerHTML = `
      <div class="pill">${typeLabel}</div>
      <div class="contract-title">${propName}</div>
      <div class="contract-meta">
        ลูกค้า: <strong>${leadName}</strong>${leadPhone?` • ${leadPhone}`:''}<br>
        วันที่: ${c.contract_date || '-'}<br>
        ราคา: ${fmt(price)}฿
      </div>
      <div class="contract-meta">
        มัดจำ: ${fmt(dep)}฿ • ชำระแล้ว: ${fmt(paid)}฿<br>
        คงเหลือ: <strong>${fmt(remain)}฿</strong>
      </div>
      <div class="contract-actions">
        <a class="btn btn-secondary" href="/contract-form.html?id=${c.id}">เปิด/แก้ไข</a>
        <button class="btn btn-secondary" data-del="${c.id}">ลบ</button>
      </div>
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll('[data-del]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.del;
      if (!confirm('ลบสัญญานี้ออกจากระบบ?')) return;
      try{
        await deleteContract(id);
        contracts = contracts.filter(x=>x.id!==id);
        render();
        toast('ลบแล้ว');
      }catch(err){
        console.error(err);
        toast('ลบไม่สำเร็จ');
      }
    });
  });
}
