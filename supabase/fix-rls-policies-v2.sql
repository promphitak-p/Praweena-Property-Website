-- =============================================================================
-- แก้ไข Supabase RLS Policies - ลบ Infinite Recursion (v2)
-- =============================================================================
-- วิธีใช้: Copy ทั้งหมดแล้ว Paste ใน Supabase Dashboard > SQL Editor > Run
-- =============================================================================

-- ขั้นตอน 1: ลบทุก policy ที่มีอยู่ (ไม่ว่าจะชื่ออะไร)
do $$
declare
  pol record;
begin
  -- ลบ policies ทั้งหมดจาก profiles table
  for pol in 
    select policyname 
    from pg_policies 
    where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', pol.policyname);
  end loop;

  -- ลบ policies ทั้งหมดจาก properties table
  for pol in 
    select policyname 
    from pg_policies 
    where schemaname = 'public' and tablename = 'properties'
  loop
    execute format('drop policy if exists %I on public.properties', pol.policyname);
  end loop;

  -- ลบ policies ทั้งหมดจาก leads table
  for pol in 
    select policyname 
    from pg_policies 
    where schemaname = 'public' and tablename = 'leads'
  loop
    execute format('drop policy if exists %I on public.leads', pol.policyname);
  end loop;
end $$;

-- =============================================================================
-- PROFILES TABLE - สร้าง policies ใหม่ (ไม่มี recursion)
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
