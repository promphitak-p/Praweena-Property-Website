import { supabase } from '../utils/supabaseClient.js';

const PROPERTY_ID = window.currentPropertyId || new URLSearchParams(location.search).get('id');

function iconOfType(t='') {
  const m = t.toLowerCase();
  if (m.includes('hospital') || m.includes('clinic') || m.includes('pharmacy')) return '🏥';
  if (m.includes('school') || m.includes('university') || m.includes('college') || m.includes('kindergarten')) return '🏫';
  if (m.includes('supermarket') || m.includes('convenience') || m.includes('mall') || m.includes('department')) return '🛒';
  if (m.includes('government') || m.includes('police') || m.includes('post_office')) return '🏛️';
  return '📍';
}
function colorOfType(t='') {
  const m = t.toLowerCase();
  if (m.includes('hospital') || m.includes('clinic') || m.includes('pharmacy')) return { stroke:'#7e22ce', fill:'#c4b5fd' };
  if (m.includes('school') || m.includes('university') || m.includes('college') || m.includes('kindergarten')) return { stroke:'#1d4ed8', fill:'#93c5fd' };
  if (m.includes('supermarket') || m.includes('convenience') || m.includes('mall') || m.includes('department')) return { stroke:'#065f46', fill:'#34d399' };
  if (m.includes('government') || m.includes('police') || m.includes('post_office')) return { stroke:'#0369a1', fill:'#67e8f9' };
  return { stroke:'#16a34a', fill:'#4ade80' };
}
const isAllowed = (t='')=>{
  const m = t.toLowerCase();
  return (
    m.includes('hospital') || m.includes('clinic') || m.includes('pharmacy') ||
    m.includes('school') || m.includes('university') || m.includes('college') || m.includes('kindergarten') ||
    m.includes('supermarket') || m.includes('convenience') || m.includes('mall') || m.includes('department') ||
    m.includes('government') || m.includes('police') || m.includes('post_office')
  );
};
const R = 6371;
const rad = d=>d*Math.PI/180;
const haversineKm = (a,b,c,d)=>{
  const dLat = rad(c-a), dLon = rad(d-b);
  const A = Math.sin(dLat/2)**2 + Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(A), Math.sqrt(1-A));
};

(async function init() {
  if (!PROPERTY_ID) return;

  const { data: prop } = await supabase
    .from('properties')
    .select('id, title, lat, latitude, latitute, lng, longitude, long, geo_lat, geo_lng, location_lat, location_lng')
    .eq('id', PROPERTY_ID).single();

  const latHome = parseFloat(prop?.lat ?? prop?.latitude ?? prop?.latitute ?? prop?.geo_lat ?? prop?.location_lat);
  const lngHome = parseFloat(prop?.lng ?? prop?.longitude ?? prop?.long ?? prop?.geo_lng ?? prop?.location_lng);

  const map = L.map('poi-admin-map', { zoomControl:true, attributionControl:false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  const group = L.layerGroup().addTo(map);

  if (Number.isFinite(latHome) && Number.isFinite(lngHome)) {
    L.circleMarker([latHome, lngHome], { radius:7, weight:2, color:'#2563eb', fillColor:'#60a5fa', fillOpacity:.95 })
      .bindTooltip('🏠 ตำแหน่งบ้าน', {direction:'top'}).addTo(group);
    map.setView([latHome, lngHome], 15);
  } else {
    map.setView([13.736, 100.523], 12);
  }

  let addMode = false, clickMarker = null, current = [];
  const addBtn  = document.getElementById('poi-add-btn');
  const formBox = document.getElementById('poi-admin-form');
  const nameEl  = document.getElementById('poi-admin-name');
  const typeEl  = document.getElementById('poi-admin-type');
  const latEl   = document.getElementById('poi-admin-lat');
  const lngEl   = document.getElementById('poi-admin-lng');
  const saveEl  = document.getElementById('poi-admin-save');
  const cancelEl= document.getElementById('poi-admin-cancel');
  const listEl  = document.getElementById('poi-admin-list');

  const draw = () => {
    group.eachLayer(l => { if (l !== map) group.removeLayer(l); });
    // re-add home marker
    if (Number.isFinite(latHome) && Number.isFinite(lngHome)) {
      L.circleMarker([latHome, lngHome], { radius:7, weight:2, color:'#2563eb', fillColor:'#60a5fa', fillOpacity:.95 })
        .bindTooltip('🏠 ตำแหน่งบ้าน', {direction:'top'}).addTo(group);
    }
    const bounds = [];
    if (Number.isFinite(latHome) && Number.isFinite(lngHome)) bounds.push([latHome,lngHome]);

    current.forEach(p=>{
      const style = colorOfType(p.type||'');
      const m = L.circleMarker([p.lat, p.lng], { radius:6, weight:2, color:style.stroke, fillColor:style.fill, fillOpacity:.95 })
        .bindTooltip(`${iconOfType(p.type)} ${p.name}`, {direction:'top'});
      m.addTo(group);
      bounds.push([p.lat, p.lng]);
    });
    if (bounds.length>1) map.fitBounds(bounds, {padding:[16,16], maxZoom:16});
  };

  const load = async ()=>{
    const { data } = await supabase
      .from('property_poi')
      .select('id,name,type,distance_km,lat,lng')
      .eq('property_id', PROPERTY_ID)
      .order('distance_km', { ascending: true })
      .limit(200);
    current = (data||[]).filter(p => isAllowed(p.type));
    listEl.innerHTML = current.map((p,i)=>`
      <li data-i="${i}" style="display:flex; gap:.5rem; align-items:baseline; padding:8px 0; border-bottom:1px solid #eee;">
        <span style="font-size:1.2rem">${iconOfType(p.type)}</span>
        <span style="flex:1 1 auto"><strong>${p.name}</strong> — ${typeof p.distance_km==='number'?p.distance_km.toFixed(2):'-'} กม. <span style="color:#6b7280">(${p.type})</span></span>
        <button class="btn btn-secondary" data-del="${i}" style="padding:.25rem .5rem;">ลบ</button>
      </li>`).join('');
    draw();
  };

  await load();

  addBtn.addEventListener('click', ()=>{
    addMode = true;
    formBox.style.display = '';
  });
  cancelEl.addEventListener('click', ()=>{
    addMode = false;
    formBox.style.display = 'none';
    if (clickMarker) { map.removeLayer(clickMarker); clickMarker = null; }
  });

  map.on('click', (e)=>{
    if (!addMode) return;
    const { lat, lng } = e.latlng;
    latEl.value = lat.toFixed(6);
    lngEl.value = lng.toFixed(6);
    if (clickMarker) map.removeLayer(clickMarker);
    clickMarker = L.circleMarker([lat, lng], { radius:6, color:'#111827', fillColor:'#9CA3AF', fillOpacity:.9, weight:2 })
      .bindTooltip('ตำแหน่งที่เลือก', {direction:'top'}).addTo(group);
  });

  saveEl.addEventListener('click', async (ev)=>{
    ev.preventDefault();
    const name = nameEl.value.trim();
    const type = typeEl.value;
    const plat = parseFloat(latEl.value);
    const plng = parseFloat(lngEl.value);
    if (!name || !Number.isFinite(plat) || !Number.isFinite(plng)) return;

    const dist = (Number.isFinite(latHome) && Number.isFinite(lngHome))
      ? haversineKm(latHome, lngHome, plat, plng) : null;

    const { data, error } = await supabase.from('property_poi')
      .insert([{ property_id: PROPERTY_ID, name, type, lat: plat, lng: plng, distance_km: dist }])
      .select('id,name,type,distance_km,lat,lng').single();
    if (error) { console.error(error); return; }

    // reset form
    addMode = false; formBox.style.display = 'none';
    nameEl.value=''; latEl.value=''; lngEl.value='';
    if (clickMarker) { map.removeLayer(clickMarker); clickMarker=null; }

    // append + re-render (เฉพาะประเภทที่อนุญาต)
    if (isAllowed(data.type)) {
      current.push(data);
      current.sort((a,b)=>(a.distance_km??999)-(b.distance_km??999));
      listEl.insertAdjacentHTML('beforeend', `
        <li style="display:flex; gap:.5rem; align-items:baseline; padding:8px 0; border-bottom:1px solid #eee;">
          <span style="font-size:1.2rem">${iconOfType(data.type)}</span>
          <span style="flex:1 1 auto"><strong>${data.name}</strong> — ${typeof data.distance_km==='number'?data.distance_km.toFixed(2):'-'} กม. <span style="color:#6b7280">(${data.type})</span></span>
          <button class="btn btn-secondary" data-del="${current.length-1}" style="padding:.25rem .5rem;">ลบ</button>
        </li>`);
      draw();
    }
  });

  listEl.addEventListener('click', async (e)=>{
    const idx = e.target.getAttribute('data-del');
    if (idx==null) return;
    const it = current[Number(idx)];
    if (!it) return;
    if (!confirm(`ลบ "${it.name}" ?`)) return;
    const { error } = await supabase.from('property_poi').delete().eq('id', it.id);
    if (error) { console.error(error); return; }
    current.splice(Number(idx),1);
    await load();
  });
})();
