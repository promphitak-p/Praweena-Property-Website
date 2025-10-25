document.addEventListener('DOMContentLoaded', () => {
  const sb = window.getSupabase();
  if (!sb) return;

  const els = {
    q: document.getElementById('q'),
    min: document.getElementById('minPrice'),
    max: document.getElementById('maxPrice'),
    beds: document.getElementById('beds'),
    box: document.getElementById('results'),
    form: document.getElementById('search-form')
  };

  async function searchAndRender() {
    let query = sb.from('properties')
      .select('id,slug,title,desc,description,location,price,beds,cover')
      .eq('published', true);

    const q = (els.q?.value || '').trim();
    const min = parseInt(els.min?.value || '0', 10);
    const max = parseInt(els.max?.value || '0', 10);
    const beds = els.beds?.value;

    if (q)        query = query.ilike('search_text', `%${q.toLowerCase()}%`);
    if (min)      query = query.gte('price', min);
    if (max)      query = query.lte('price', max);
    if (beds) {
      if (beds === '4+') query = query.gte('beds', 4);
      else query = query.eq('beds', parseInt(beds, 10));
    }

    const { data, error } = await query.order('updated_at', { ascending: false }).limit(60);
    if (error) {
      els.box.innerHTML = `<div class="notice">เกิดข้อผิดพลาด: ${error.message}</div>`;
      return;
    }
    if (!data || data.length === 0) {
      els.box.innerHTML = `<div class="notice">ไม่พบรายการที่ตรงเงื่อนไข</div>`;
      return;
    }

    function escapeHtml(s){
      return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    }

    els.box.innerHTML = data.map(p => {
      const descText = p.description ?? p.desc ?? '';
      return `
      <a class="card" href="/property-detail.html?id=${encodeURIComponent(p.slug || p.id)}">
        <img src="${p.cover || '/assets/placeholder.jpg'}" alt="">
        <div class="card-body">
          <h3>${escapeHtml(p.title || 'ไม่ระบุชื่อ')}</h3>
          <p>${escapeHtml(descText)}</p>
          <div class="meta">฿${Number(p.price||0).toLocaleString()} • ${p.beds ?? '-'} ห้องนอน</div>
        </div>
      </a>`;
    }).join('');
  }

  els.form?.addEventListener('submit', (e) => { e.preventDefault(); searchAndRender(); });
  searchAndRender();
});
