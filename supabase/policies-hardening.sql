-- policies-hardening.sql
-- รวบรวม policy สำหรับตารางที่โค้ดฝั่งเว็บเรียกใช้งาน เพื่อปิดสิทธิ์กว้างเกินไป
-- สมมติฐานคอลัมน์มาตรฐาน:
--   - ทุกตารางที่ผูกกับทรัพย์สินมีคอลัมน์ property_id อ้างอิง public.properties(id)
--   - ตารางส่วนใหญ่มีคอลัมน์ created_by อ้างอิง auth.users(id); ถ้าไม่มี ให้ปรับ policy ให้ตรง schema จริง
--   - มีฟังก์ชัน public.is_admin() (security definer) ใช้เช็กบทบาท admin/staff
-- ใช้รันใน Supabase SQL Editor ก่อนเปิดระบบสาธารณะ

-- 0) ฟังก์ชัน is_admin (สำรอง ถ้ายังไม่มี)
create or replace function public.is_admin()
returns boolean
set search_path = public, pg_temp
language sql
security definer
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'staff')
  );
$$;

-- 1) ลบ policy เดิมทั้งหมดสำหรับตารางที่ใช้ (ลดปัญหา policy ซ้ำ/ทับกัน)
do $$
declare
  tbl text;
  pol record;
  tbls text[] := array[
    'profiles',
    'properties',
    'leads',
    'renovation_todo_categories',
    'renovation_todos',
    'renovation_todo_templates',
    'renovation_books',
    'property_specs',
    'property_poi',
    'property_contractors',
    'contractors',
    'articles',
    'article-images',
    'contracts',
    'admin_emails',
    'contractor_payment_schedules',
    'todo_purchase_items'
  ];
begin
  foreach tbl in array tbls loop
    -- ถ้าตารางไม่มีอยู่ ให้ข้าม
    if to_regclass(format('public.%I', tbl)) is null then
      continue;
    end if;
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = tbl
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, tbl);
    end loop;
    execute format('alter table public.%I enable row level security', tbl);
  end loop;
end $$;

-- 2) PROFILES
create policy "profiles_select_own"
  on public.profiles
  for select
  using (auth.uid() = id or public.is_admin());

create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

-- 3) PROPERTIES
create policy "properties_select_published"
  on public.properties
  for select
  using (published = true);

create policy "properties_admin_all"
  on public.properties
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- 4) LEADS
create policy "leads_insert_anyone"
  on public.leads
  for insert
  with check (true);

create policy "leads_admin_all"
  on public.leads
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Helper condition สำหรับตารางที่อิง property_id
-- ใช้ใน USING และ WITH CHECK เพื่ออนุญาตเจ้าของทรัพย์สิน (created_by) หรือแอดมิน
-- หมายเหตุ: ถ้า schema จริงใช้ชื่อคอลัมน์อื่น ให้แก้เงื่อนไขนี้
-- (auth.uid() = created_by) ครอบกรณีที่มีคอลัมน์นี้โดยตรง

-- 5) สร้าง policy แบบ dynamic ให้เหมาะกับคอลัมน์ที่มีจริง (หลีกเลี่ยง error ถ้าบางตารางไม่มี created_by/property_id)
do $$
declare
  tbl text;
  has_prop boolean;
  has_creator boolean;
  prop_has_creator boolean;
  cond text;
  t_tables text[] := array[
    'renovation_todo_categories',
    'renovation_todos',
    'renovation_books',
    'property_specs',
    'property_poi',
    'property_contractors',
    'contractors',
    'articles',
    'article-images',
    'contracts',
    'contractor_payment_schedules',
    'todo_purchase_items'
  ];
begin
  foreach tbl in array t_tables loop
    if to_regclass(format('public.%I', tbl)) is null then
      continue;
    end if;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = tbl and column_name = 'property_id'
    ) into has_prop;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = tbl and column_name = 'created_by'
    ) into has_creator;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'properties' and column_name = 'created_by'
    ) into prop_has_creator;

    cond := 'public.is_admin()';
    if has_creator then
      cond := cond || ' or auth.uid() = created_by';
    end if;
    if has_prop and prop_has_creator then
      cond := cond || ' or (property_id is not null and exists (select 1 from public.properties p where p.id = property_id and p.created_by = auth.uid()))';
    end if;

    execute format('create policy %I on public.%I for select using (%s)', tbl || '_select_owner_or_admin', tbl, cond);
    execute format('create policy %I on public.%I for all using (%s) with check (%s)', tbl || '_cud_owner_or_admin', tbl, cond, cond);
  end loop;
end $$;

-- Templates: จำกัด admin เท่านั้น (ปรับถ้าต้องการแชร์ให้ user)
create policy "rtodo_templates_admin_all"
  on public.renovation_todo_templates
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- 6) ADMIN EMAILS (เฉพาะ admin)
create policy "admin_emails_admin_only"
  on public.admin_emails
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- หมายเหตุ:
-- - ถ้าบางตารางไม่มีคอลัมน์ created_by/property_id ให้ปรับ USING/WITH CHECK ให้ตรงโครงสร้าง
-- - สำหรับการเปิดอ่านสาธารณะ ให้สร้าง VIEW แยก (เช่น property_poi_public) แล้วทำ policy เฉพาะ view นั้นแทน table ดิบ
-- - อย่าลืม revoke rights อื่น ๆ ถ้ามีการ grant กว้าง
