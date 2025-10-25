# Praweena Property — Patch (Map + Search + Admin)

วางทับโปรเจกต์เดิมตามโครงสร้างไฟล์นี้ได้เลย

## ไฟล์ที่เพิ่ม/แก้
- assets/css/pp-theme.css
- js/init-supabase.js
- js/map.js
- js/search.js
- auth.html
- dashboard.html
- js/admin-auth.js
- js/dashboard.js
- js/uploader.js

## การเชื่อมต่อ Supabase
เพิ่มสคริปต์ global (ตัวอย่างใน auth.html/dashboard.html):
```
<script>
  window.SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
  window.SUPABASE_ANON_KEY = "YOUR-ANON-KEY";
</script>
<script src="https://unpkg.com/@supabase/supabase-js@2.45.4/dist/umd/supabase.js" defer></script>
<script src="/js/init-supabase.js" defer></script>
```

## วิธีใช้ (สรุป)
1) ใส่ค่า SUPABASE_URL/ANON_KEY ในทุกหน้า
2) เพิ่ม bucket storage `property-images` และ policies (read + admin write)
3) เพิ่มอีเมล admin ในตาราง `admin_emails` และสร้างผู้ใช้ใน Auth
4) เปิด /auth.html → เข้าสู่ระบบ → /dashboard.html
5) เพิ่มทรัพย์/อัปเดตราคา/สลับเผยแพร่/อัปโหลดรูป
6) หน้า property-detail.html ใส่:
```
<link rel="stylesheet" href="/assets/css/pp-theme.css">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" defer></script>
<div id="map" hidden></div>
<div id="no-geo" class="notice" hidden>ยังไม่มีพิกัดสำหรับบ้านหลังนี้</div>
<script src="/js/map.js" defer></script>
```
7) หน้า index.html ใส่ฟอร์มค้นหา + results แล้วโหลด `/js/search.js`
