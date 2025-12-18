-- =============================================================================
-- แก้ไข Supabase RLS Policies - ลบ Infinite Recursion
-- =============================================================================
-- วิธีใช้: Copy ทั้งหมดแล้ว Paste ใน Supabase Dashboard > SQL Editor > Run
-- =============================================================================

-- ลบ policies เดิมที่มีปัญหา
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "properties_read_published" on public.properties;
drop policy if exists "properties_read_staff" on public.properties;
drop policy if exists "properties_crud_staff" on public.properties;
drop policy if exists "leads_insert_public" on public.leads;
drop policy if exists "leads_crud_staff" on public.leads;

-- =============================================================================
-- PROFILES TABLE - ลบ recursion ออก
-- =============================================================================

-- Users สามารถอ่าน profile ของตัวเองได้เท่านั้น
create policy "profiles_select_own"
  on public.profiles
  for select
  using (auth.uid() = id);

-- Users สามารถแก้ไข profile ของตัวเองได้
create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Note: Admin จัดการ profiles ผ่าน service_role key (bypass RLS)

-- =============================================================================
-- PROPERTIES TABLE - สำหรับ Public Property Listing
-- =============================================================================

-- ทุกคน (รวม anonymous) สามารถดู properties ที่ published = true
create policy "properties_select_published"
  on public.properties
  for select
  using (published = true);

-- Note: Staff/Admin สามารถจัดการ properties ผ่าน service_role key
-- หรือถ้าต้องการให้ login ได้ ต้องใช้ custom claims (ดูวิธีที่ 1)

-- =============================================================================
-- LEADS TABLE - Public สามารถสร้าง Lead Form ได้
-- =============================================================================

-- ทุกคนสามารถสร้าง lead (submit contact form)
create policy "leads_insert_anyone"
  on public.leads
  for insert
  with check (true);

-- Note: Admin อ่าน/จัดการ leads ผ่าน service_role key

-- =============================================================================
-- เสร็จสิ้น! 
-- =============================================================================
-- ทดสอบด้วยคำสั่ง:
-- SELECT * FROM properties WHERE published = true;
-- =============================================================================
