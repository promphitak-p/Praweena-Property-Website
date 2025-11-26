import { el } from '../ui/dom.js';
function PMT(rate, nper, pv) {
  const i = rate/12;
  return (pv*i) / (1 - Math.pow(1+i, -nper));
}
export function mountPayCalc(target, { price=0 }) {
  if (!target) return;
  const wrap = el('div',{
    className:'card',
    style:'padding:1rem;border-radius:12px;border:1px solid #eee;display:flex;flex-direction:column;gap:1rem;'
  });
  const heading = el('h3',{textContent:'คำนวณเงินกู้เบื้องต้น',style:'margin:0;font-size:1.05rem;font-weight:700;color:#1f2937;'});
  const inputDown = el('input',{className:'form-control',style:'margin:0 0 1rem 0;',attributes:{type:'number',placeholder:'เงินดาวน์ (บาท)'}});
  const inputRate = el('input',{className:'form-control',style:'margin:0 0 1rem 0;',attributes:{type:'number',placeholder:'ดอกเบี้ยต่อปี (%)', step:'0.01', value:'5.75'}});
  const inputYears= el('input',{className:'form-control',style:'margin:0 0 1rem 0;',attributes:{type:'number',placeholder:'ระยะเวลากู้ (ปี)', value:'30'}});
  const result = el('div',{style:'margin-top:.25rem;color:#111827;'});
  const btn = el('button',{className:'btn',style:'margin-top:0;margin-bottom:1rem;',textContent:'คำนวณค่างวด'});
  btn.onclick = ()=>{
    const down = +inputDown.value||0;
    const loan = Math.max((+price||0)-down, 0);
    const pmt = PMT((+inputRate.value||0)/100, (+inputYears.value||0)*12, loan);
    result.textContent = `ผ่อนประมาณ ${Math.round(pmt).toLocaleString()} บาท/เดือน (กู้ ${loan.toLocaleString()} บ.)`;
  };
  wrap.append(
    heading,
    el('div',{textContent:`ราคาบ้าน: ${(+price||0).toLocaleString()} บ.`}),
    inputDown, inputRate, inputYears, btn, result
  );
  target.innerHTML=''; target.append(wrap);
}
