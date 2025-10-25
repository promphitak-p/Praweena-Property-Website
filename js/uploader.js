document.addEventListener('DOMContentLoaded', () => {
  const sb = window.getSupabase();
  const file = document.getElementById('file');
  const btn = document.getElementById('btn-upload');
  const box = document.getElementById('upload-result');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!file.files[0]) return alert('เลือกรูปก่อน');
    const f = file.files[0];
    const path = `covers/${Date.now()}-${f.name}`;
    const { error } = await sb.storage.from('property-images').upload(path, f, { upsert: true });
    if (error) return alert(error.message);
    const { data } = sb.storage.from('property-images').getPublicUrl(path);
    box.hidden = false;
    box.textContent = `อัปโหลดแล้ว: ${data.publicUrl}`;
  });
});
