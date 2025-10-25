document.addEventListener('DOMContentLoaded', async () => {
  const sb = window.getSupabase();

  const { data: { session } } = await sb.auth.getSession();
  if (!session) return location.href = '/auth.html';
  const { data: isAdmin } = await sb.rpc('is_admin');
  if (!isAdmin) { await sb.auth.signOut(); return location.href = '/auth.html'; }

  const tabs = document.querySelectorAll('.nav button');
  tabs.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  function switchTab(name){
    document.getElementById('tab-properties').style.display = name === 'properties' ? '' : 'none';
    document.getElementById('tab-leads').style.display = name === 'leads' ? '' : 'none';
    document.getElementById('tab-storage').style.display = name === 'storage' ? '' : 'none';
  }
  switchTab('properties');

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await sb.auth.signOut();
    location.href = '/auth.html';
  });

  const els = {
    list: document.getElementById('p-list'),
    q: document.getElementById('p-q'),
    published: document.getElementById('p-published'),
    refresh: document.getElementById('p-refresh'),
    modal: document.getElementById('modal'),
    form: document.getElementById('prop-form'),
    cancel: document.getElementById('btn-cancel'),
    btnNew: document.getElementById('btn-new'),
    title: document.getElementById('modal-title')
  };

  els.refresh.addEventListener('click', loadProperties);
  els.q.addEventListener('keyup', debounce(loadProperties, 300));
  els.published.addEventListener('change', loadProperties);
  els.btnNew.addEventListener('click', () => openModal());

  async function loadProperties(){
    let q = sb.from('properties')
      .select('id,slug,title,location,price,beds,baths,area,lat,lng,cover,published,updated_at,search_text,desc,description')
      .order('updated_at', { ascending: false })
      .limit(200);

    const kw = els.q.value.trim();
    const pub = els.published.value;
    if (kw) q = q.ilike('search_text', `%${kw.toLowerCase()}%`);
    if (pub) q = q.eq('published', pub === 'true');

    const { data, error } = await q;
    if (error) return els.list.innerHTML = `<div class="notice">Error: ${error.message}</div>`;

    if (!data?.length) {
      els.list.innerHTML = `<div class="notice">ไม่พบทรัพย์</div>`;
      return;
    }

    els.list.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>ชื่อ</th><th>ราคา</th><th>นอน/น้ำ</th><th>ทำเล</th><th>เผยแพร่</th><th>อัปเดต</th><th></th>
          </tr>
        </thead>
        <tbody>
        ${data.map(r => `
          <tr>
            <td>${esc(r.title)}</td>
            <td>฿${Number(r.price||0).toLocaleString()}</td>
            <td>${r.beds ?? '-'} / ${r.baths ?? '-'}</td>
            <td>${esc(r.location ?? '')}</td>
            <td>${r.published ? '✅' : '❌'}</td>
            <td>${r.updated_at ? new Date(r.updated_at).toLocaleString() : ''}</td>
            <td class="actions">
              <button data-act="edit" data-id="${r.id}">แก้ไข</button>
              <button data-act="toggle" data-id="${r.id}" data-pub="${r.published ? '1':'0'}">${r.published ? 'ซ่อน' : 'เผยแพร่'}</button>
              <button data-act="del" data-id="${r.id}" style="color:#b91c1c">ลบ</button>
            </td>
          </tr>
        `).join('')}
        </tbody>
      </table>
    `;

    els.list.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', () => onAction(btn.dataset.act, btn.dataset));
    });
  }

  async function onAction(act, data){
    if (act === 'edit') {
      const { data: row, error } = await sb.from('properties').select('*').eq('id', data.id).maybeSingle();
      if (error) return alert(error.message);
      openModal(row);
    } else if (act === 'toggle') {
      const next = data.pub === '1' ? false : true;
      const { error } = await sb.from('properties').update({ published: next }).eq('id', data.id);
      if (error) return alert(error.message);
      loadProperties();
    } else if (act === 'del') {
      if (!confirm('ยืนยันลบ?')) return;
      const { error } = await sb.from('properties').delete().eq('id', data.id);
      if (error) return alert(error.message);
      loadProperties();
    }
  }

  function openModal(row = null){
    els.title.textContent = row ? 'แก้ไขทรัพย์' : 'เพิ่มทรัพย์';
    els.form.reset();
    els.form.id.value = row?.id || '';
    els.form.title.value = row?.title ?? '';
    els.form.location.value = row?.location ?? '';
    els.form.price.value = row?.price ?? '';
    els.form.beds.value = row?.beds ?? '';
    els.form.baths.value = row?.baths ?? '';
    els.form.area.value = row?.area ?? '';
    els.form.lat.value = row?.lat ?? '';
    els.form.lng.value = row?.lng ?? '';
    els.form.slug.value = row?.slug ?? '';
    els.form.cover.value = row?.cover ?? '';
    els.form.published.checked = !!row?.published;
    if (els.form.desc) els.form.desc.value = row?.desc ?? row?.description ?? '';
    els.modal.style.display = 'flex';
  }
  els.cancel.addEventListener('click', () => els.modal.style.display = 'none');

  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(els.form);
    const payload = {
      title: val(fd.get('title')),
      location: val(fd.get('location')),
      price: num(fd.get('price')),
      beds: int(fd.get('beds')),
      baths: int(fd.get('baths')),
      area: num(fd.get('area')),
      lat: num(fd.get('lat')),
      lng: num(fd.get('lng')),
      slug: val(fd.get('slug')),
      cover: val(fd.get('cover')),
      published: fd.get('published') === 'on'
    };

    try {
      const hasDesc = await columnExists('properties','desc');
      const hasDescription = await columnExists('properties','description');
      if (hasDesc) payload['desc'] = val(fd.get('desc'));
      else if (hasDescription) payload['description'] = val(fd.get('desc'));
    } catch {}

    const id = fd.get('id');
    let resp;
    if (id) resp = await sb.from('properties').update(payload).eq('id', id);
    else     resp = await sb.from('properties').insert(payload);

    if (resp.error) return alert(resp.error.message);
    els.modal.style.display = 'none';
    loadProperties();
  });

  function val(s){ s = (s ?? '').toString().trim(); return s || null; }
  function int(s){ const n = parseInt(s,10); return Number.isFinite(n)?n:null; }
  function num(s){ const n = parseFloat(s);   return Number.isFinite(n)?n:null; }
  function esc(s){ return String(s??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  async function columnExists(table, col){
    // ถ้าไม่มี RPC column_exists ก็ข้าม (return false)
    try {
      const { data, error } = await sb.rpc('column_exists', { p_table: table, p_column: col });
      return !error && data === true;
    } catch { return false; }
  }
  function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

  loadProperties();

  // Leads
  const LBOX = document.getElementById('l-list');
  document.getElementById('l-refresh').addEventListener('click', loadLeads);
  async function loadLeads(){
    const { data, error } = await sb.from('leads')
      .select('id,created_at,name,phone,note,property_id,status')
      .order('created_at',{ascending:false}).limit(200);
    if (error) return LBOX.innerHTML = `<div class="notice">Error: ${error.message}</div>`;
    if (!data?.length) return LBOX.innerHTML = `<div class="notice">ยังไม่มี Leads</div>`;
    LBOX.innerHTML = `
      <table>
        <thead><tr><th>เวลา</th><th>ชื่อ</th><th>โทร</th><th>โน้ต</th><th>ทรัพย์</th><th>สถานะ</th></tr></thead>
        <tbody>
          ${data.map(x=>`
            <tr>
              <td>${new Date(x.created_at).toLocaleString()}</td>
              <td>${esc(x.name)}</td>
              <td>${esc(x.phone)}</td>
              <td>${esc(x.note)}</td>
              <td>${x.property_id ?? ''}</td>
              <td>${esc(x.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
  loadLeads();
});
