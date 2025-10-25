document.addEventListener('DOMContentLoaded', async () => {
  const mapEl = document.getElementById('map');
  const noGeo = document.getElementById('no-geo');
  if (!mapEl || !noGeo) return;

  let finalLat = mapEl.dataset?.lat ? parseFloat(mapEl.dataset.lat) : null;
  let finalLng = mapEl.dataset?.lng ? parseFloat(mapEl.dataset.lng) : null;

  if (!finalLat || !finalLng) {
    const params = new URLSearchParams(location.search);
    const pid = params.get('id') || params.get('slug');
    try {
      if (pid) {
        const sb = window.getSupabase();
        if (sb) {
          const { data, error } = await sb
            .from('properties')
            .select('lat,lng')
            .or(`id.eq.${pid},slug.eq.${pid}`)
            .maybeSingle();
          if (!error && data) {
            finalLat = data.lat ?? null;
            finalLng = data.lng ?? null;
          }
        }
      }
    } catch(e) {
      console.error('[map] fetch error', e);
    }
  }

  if (finalLat && finalLng) {
    mapEl.hidden = false;
    const lat = Number(finalLat), lng = Number(finalLng);
    const map = L.map('map').setView([lat, lng], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    L.marker([lat, lng]).addTo(map);
    setTimeout(() => map.invalidateSize(), 200);
  } else {
    noGeo.hidden = false;
  }
});
