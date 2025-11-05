// js/widgets/share.widget.js
import { el } from '../ui/dom.js';

export function renderShareBar(targetEl, { title, url, image }) {
  if (!targetEl) return;
  const boxed = el('div', { className:'share-bar', style:'display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;' });
  const txt = encodeURIComponent(title);
  const u   = encodeURIComponent(url);

  const items = [
    { label:'Facebook', href:`https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${txt}` },
    { label:'LINE',     href:`https://line.me/R/share?text=${txt}%0A${u}` },
    { label:'Messenger',href:`fb-messenger://share?link=${u}` } // จะถูกซ่อนบน desktop ในหน้า property
  ];

  // mobile: ถ้ามี navigator.share ให้ปุ่ม “แชร์ด่วน”
  if (navigator.share) {
    const quick = el('button', { className:'btn', textContent:'📣 แชร์ด่วน' });
    quick.onclick = () => navigator.share({ title, text:title, url }).catch(()=>{});
    boxed.append(quick);
  }

  items.forEach(i => {
    const a = el('a', { attributes:{ href:i.href, target:'_blank', rel:'noopener' }, className:'btn btn-light' , textContent:i.label});
    boxed.append(a);
  });

  targetEl.innerHTML = '';
  targetEl.append(boxed);
}
