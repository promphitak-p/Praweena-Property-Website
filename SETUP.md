# การตั้งค่าสภาพแวดล้อมสำหรับ Local Development

## วิธีการตั้งค่า Supabase Credentials

โปรเจคนี้ใช้ Supabase เป็น backend มี 2 วิธีในการตั้งค่า credentials:

### วิธีที่ 1: ใช้ .env.local (แนะนำสำหรับ Local Development)

1. **คัดลอกไฟล์ตัวอย่าง:**
   ```bash
   cp .env.local.example .env.local
   ```

2. **แก้ไข .env.local และกรอกค่าจริง:**
   ```
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

3. **หาค่า Supabase credentials:**
   - เข้า [Supabase Dashboard](https://app.supabase.com)
   - เลือก Project ของคุณ
   - ไปที่ **Settings** > **API**
   - คัดลอก:
     - **Project URL** → `SUPABASE_URL`
     - **anon public** key → `SUPABASE_ANON_KEY`

4. **รัน local server:**
   ```bash
   npx http-server . -p 8080
   ```

5. **เปิดเบราว์เซอร์:**
   ```
   http://localhost:8080
   ```

**หมายเหตุ:** ไฟล์ `.env.local` จะไม่ขึ้น Git (อยู่ใน `.gitignore` แล้ว)

---

### วิธีที่ 2: ใช้ localStorage (สำรองถ้าไม่มี .env.local)

ถ้าไม่มีไฟล์ `.env.local`, ระบบจะแสดง modal ให้กรอก credentials หรือคุณสามารถตั้งค่าผ่าน Browser Console:

1. เปิดเบราว์เซอร์ไปที่ http://localhost:8080
2. กด F12 เปิด DevTools → Console
3. รันคำสั่ง:
   ```javascript
   localStorage.setItem('SUPABASE_URL', 'https://your-project-id.supabase.co');
   localStorage.setItem('SUPABASE_ANON_KEY', 'eyJhbG...');
   location.reload();
   ```

---

## การ Deploy ขึ้น Vercel

1. **ตั้งค่า Environment Variables ใน Vercel Dashboard:**
   - เข้า Project Settings > Environment Variables
   - เพิ่ม:
     - `SUPABASE_URL`
     - `SUPABASE_ANON_KEY`

2. **Deploy:**
   ```bash
   vercel
   ```

---

## โครงสร้างไฟล์

```
/api/env.js              # Vercel serverless function (อ่านค่าจาก .env.local)
/js/env-loader.js        # โหลด credentials จาก /api/env.js
/js/local-setup.js       # Fallback: แสดง modal ให้กรอก credentials
/js/config.js            # อ่านค่าจาก window.__SUPABASE หรือ localStorage
.env.local               # ไฟล์เก็บ credentials (ไม่ขึ้น Git)
.env.local.example       # ตัวอย่างไฟล์ .env.local
```

---

## Troubleshooting

### ปัญหา: หน้าเว็บว่างเปล่า / ไม่แสดงข้อมูล

**สาเหตุ:** ไม่มี Supabase credentials

**วิธีแก้:**
1. ตรวจสอบว่ามีไฟล์ `.env.local` หรือไม่
2. หรือตั้งค่าผ่าน localStorage (ดูวิธีที่ 2)

### ปัญหา: Console แสดง "Failed to init Supabase client"

**สาเหตุ:** Credentials ไม่ถูกต้อง

**วิธีแก้:**
1. ตรวจสอบค่าใน `.env.local` ให้ถูกต้อง
2. Restart server
3. Clear browser cache และ reload

### ปัญหา: API endpoint ไม่ทำงาน

**สาเหตุ:** ใช้ http-server ธรรมดา (ไม่รองรับ serverless functions)

**วิธีแก้:**
- สำหรับ local: ใช้ localStorage แทน (วิธีที่ 2)
- หรือใช้ `vercel dev` แทน `http-server`

---

## ความปลอดภัย

⚠️ **อย่า commit ไฟล์เหล่านี้ขึ้น Git:**
- `.env.local`
- ไฟล์ที่มี credentials จริง

✅ **ไฟล์ที่ปลอดภัย:**
- `.env.local.example` (ตัวอย่างเท่านั้น ไม่มีค่าจริง)
- `/api/env.js` (อ่านจาก environment variables)

---

## คำถามที่พบบ่อย

**Q: ทำไมต้องใช้ 2 วิธี?**
A: เพื่อความยืดหยุ่น - วิธีที่ 1 เหมาะกับ production, วิธีที่ 2 ง่ายสำหรับ local testing

**Q: .env.local จะขึ้น Git ไหม?**
A: ไม่ครับ อยู่ใน `.gitignore` แล้ว

**Q: ใช้ Vercel dev แทน http-server ได้ไหม?**
A: ได้ครับ จะทำให้ `/api/env.js` ทำงานได้:

---

## การอัปเดตฐานข้อมูล (Database Migrations)

### 1. Soft Delete Support (18/12/2025)
ฟีเจอร์การลบแบบซ่อน (Soft Delete) ต้องมีการเพิ่มคอลัมน์ในตาราง `contracts`:

```sql
alter table contracts add column deleted_at timestamp with time zone default null;
```

กรุณารันคำสั่งนี้ในหน้า **SQL Editor** ของ Supabase เพื่อให้ฟีเจอร์ทำงานได้อย่างถูกต้อง
