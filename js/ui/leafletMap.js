// web/js/ui/leafletMap.js
// Lightweight Leaflet helpers + brand controls for Praweena

// --- load Leaflet (CDN) one-time ---
export function ensureLeafletLoaded() {
  if (window.L) return;
  // inject CSS
  if (!document.querySelector('link[data-leaflet]')) {
    const link = document.createElement('link');
    link.dataset.leaflet = '1';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }
  // inject JS (sync if not yet)
  if (!document.querySelector('script[data-leaflet]')) {
    const s = document.createElement('script');
    s.dataset.leaflet = '1';
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    document.head.appendChild(s);
  }
}

/** return { map, marker } */
export function initMap({ el, lat = 13.736, lng = 100.523, zoom = 15 } = {}) {
  ensureLeafletLoaded();
  if (!el) throw new Error('initMap: missing el');

  // create map
  const map = L.map(el, { zoomControl: true, attributionControl: false })
    .setView([lat, lng], zoom);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 20,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  const marker = L.marker([lat, lng]).addTo(map);
  return { map, marker };
}

/** tiny map without controls */
export function createMiniMap(el, center=[13.736,100.523], points=[]) {
  ensureLeafletLoaded();
  const map = L.map(el, { zoomControl:false, attributionControl:false })
    .setView(center, 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

  const group = L.layerGroup().addTo(map);
  if (Array.isArray(center)) {
    L.circleMarker(center,{radius:6,weight:2,color:'#2563eb',fillColor:'#60a5fa',fillOpacity:.9})
      .bindTooltip('ตำแหน่งหลัก',{direction:'top'}).addTo(group);
  }
  const bounds = center ? [center] : [];
  points.forEach(p=>{
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
    L.circleMarker([p.lat,p.lng],{radius:4,weight:1.5,color:'#16a34a',fillColor:'#86efac',fillOpacity:.95})
      .bindTooltip(p.name || 'POI',{direction:'top'}).addTo(group);
    bounds.push([p.lat,p.lng]);
  });

  if (bounds.length>1) map.fitBounds(bounds,{padding:[12,12],maxZoom:16});
  return map;
}

// --- Brand Icons ---
export function brandIcon(opts = {}) {
  return L.icon({
    iconUrl: opts.url || '/assets/img/praweena-pin.png',
    iconSize: [38, 46],
    iconAnchor: [19, 46],
    popupAnchor: [0, -44],
    className: 'praweena-main-pin'
  });
}

// POI icon by type (PNG/SVG per brand later)
export function iconForPoiType(type = '') {
  const basePath = '/assets/img/poi/';
  let file = 'poi-mart.png'; // default

  const t = type.toLowerCase();
  if (t.includes('school') || t.includes('university')) file = 'poi-school.png';
  else if (t.includes('hospital') || t.includes('clinic')) file = 'poi-hospital.png';
  else if (t.includes('gov') || t.includes('police') || t.includes('post')) file = 'poi-gov.png';

  return L.icon({
    iconUrl: `${basePath}${file}`,
    iconSize: [36, 44],
    iconAnchor: [18, 44],
    popupAnchor: [0, -42],
    className: 'praweena-poi-icon'
  });
}


// --- Controls ---
function controlBox(html, className='praweena-ctl') {
  const div = L.DomUtil.create('div', className);
  div.innerHTML = html;
  L.DomEvent.disableClickPropagation(div);
  return div;
}

export function addPrecisionControl(map, { defaultPrecision=6 } = {}) {
  let prec = defaultPrecision;
  const ctl = L.control({ position:'topright' });
  ctl.onAdd = () => {
    return controlBox(`
      <label style="font-size:12px;display:flex;gap:6px;align-items:center">
        ความละเอียด:
        <select id="prec-dd" class="pra-dd">
          <option value="5">5 ตำแหน่ง</option>
          <option value="6" selected>6 ตำแหน่ง</option>
          <option value="7">7 ตำแหน่ง</option>
        </select>
      </label>
    `);
  };
  ctl.addTo(map);

  setTimeout(()=>{
    const sel = map.getContainer().querySelector('#prec-dd');
    if (sel) sel.addEventListener('change', e => { prec = Number(e.target.value)||6; });
  },0);

  return () => prec; // getter
}

export function addCopyButton(map, { precision=()=>6, getLatLng=()=>map.getCenter() } = {}) {
  const ctl = L.control({ position:'topright' });
  ctl.onAdd = () => controlBox(`<button class="pra-btn">Copy พิกัด</button>`);
  ctl.addTo(map);
  setTimeout(()=>{
    const btn = map.getContainer().querySelector('.pra-btn');
    if (!btn) return;
    btn.addEventListener('click', async ()=>{
      const { lat, lng } = getLatLng();
      const txt = `${lat.toFixed(precision())}, ${lng.toFixed(precision())}`;
      await navigator.clipboard.writeText(txt).catch(()=>{});
      toast('คัดลอกแล้ว: ' + txt);
    });
  },0);
}

export function addCopyMenuControl(map, {
  precision=()=>6, getLatLng=()=>map.getCenter(), defaultFormat='label'
} = {}) {
  const ctl = L.control({ position:'topright' });
  ctl.onAdd = () => controlBox(`
    <div style="display:flex;gap:6px;align-items:center">
      <select id="copy-format" class="pra-dd">
        <option value="label"${defaultFormat==='label'?' selected':''}>lat: … , lng: …</option>
        <option value="leaflet"${defaultFormat==='leaflet'?' selected':''}>[lat, lng]</option>
        <option value="geojson"${defaultFormat==='geojson'?' selected':''}>GeoJSON Point</option>
      </select>
      <button class="pra-btn" id="copy-menu-btn">คัดลอก</button>
    </div>
  `);
  ctl.addTo(map);

  setTimeout(()=>{
    const root = map.getContainer();
    const sel = root.querySelector('#copy-format');
    const btn = root.querySelector('#copy-menu-btn');
    if (!btn || !sel) return;

    btn.addEventListener('click', async ()=>{
      const { lat, lng } = getLatLng();
      const p = precision();
      const fmt = sel.value;
      let text = '';
      if (fmt==='leaflet') text = `[${lat.toFixed(p)}, ${lng.toFixed(p)}]`;
      else if (fmt==='geojson') text = JSON.stringify({ type:'Point', coordinates:[+lng.toFixed(p), +lat.toFixed(p)] });
      else text = `lat: ${lat.toFixed(p)}, lng: ${lng.toFixed(p)}`;
      await navigator.clipboard.writeText(text).catch(()=>{});
      toast('คัดลอกแล้ว');
    });
  },0);
}

export function addOpenInGoogleControl(map, { precision=6 } = {}) {
  const ctl = L.control({ position:'topright' });
  ctl.onAdd = () => controlBox(`<button class="pra-btn">Open in Google Maps</button>`);
  ctl.addTo(map);
  setTimeout(()=>{
    const btn = map.getContainer().querySelector('.pra-btn');
    if (!btn) return;
    btn.addEventListener('click', ()=>{
      const { lat, lng } = map.getCenter();
      const p = typeof precision==='function' ? precision() : precision;
      const url = `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(p)},${lng.toFixed(p)}`;
      window.open(url, '_blank', 'noopener');
    });
  },0);
}

export function addPoiLegendControl(map) {
  const ctl = L.control({ position:'bottomright' });
  ctl.onAdd = () => controlBox(`
    <div style="font-size:12px;line-height:1.4">
      <div><img src="/assets/img/poi/poi-hospital.png" width="14" style="vertical-align:middle"> โรงพยาบาล</div>
      <div><img src="/assets/img/poi/poi-school.png" width="14" style="vertical-align:middle"> โรงเรียน</div>
      <div><img src="/assets/img/poi/poi-mart.png" width="14" style="vertical-align:middle"> ห้าง/ซูเปอร์</div>
      <div><img src="/assets/img/poi/poi-gov.png" width="14" style="vertical-align:middle"> ราชการ</div>
    </div>
  `,'praweena-ctl legend');
  ctl.addTo(map);
}

// tiny toast (fallback ถ้าโครงการมี toast.js อยู่จะไม่ใช้ตัวนี้)
function toast(msg){
  if (window.toast) return window.toast(msg, 1600, 'info');
  const n = document.createElement('div');
  n.textContent = msg;
  n.style.cssText = 'position:fixed;z-index:99999;left:50%;transform:translateX(-50%);bottom:16px;background:#111827;color:#fff;padding:8px 12px;border-radius:10px;font-size:12px';
  document.body.appendChild(n);
  setTimeout(()=> n.remove(), 1600);
}

// minimal styles for controls
(function injectCtlCss(){
  if (document.getElementById('praweena-ctl-css')) return;
  const style = document.createElement('style');
  style.id = 'praweena-ctl-css';
  style.textContent = `
    .praweena-ctl {
      background:#fff;border-radius:12px;box-shadow:0 4px 14px rgba(0,0,0,.08);
      padding:8px; margin:6px; font-family:inherit;
    }
    .praweena-ctl .pra-btn{
      padding:6px 10px;border:0;border-radius:10px;background:#f3f4f6;cursor:pointer;font-size:12px;
    }
    .praweena-ctl .pra-btn:hover{ filter:brightness(0.98); }
    .praweena-ctl .pra-dd{
      padding:4px 8px;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;background:#fff;
    }
    .praweena-ctl.legend { padding:10px 12px; }
  `;
  document.head.appendChild(style);
})();
