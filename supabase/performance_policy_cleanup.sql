-- performance_policy_cleanup.sql
-- ลดคำเตือน "Multiple Permissive Policies" โดยล้าง policy ซ้ำซ้อนแล้วสร้างชุดเล็กที่ตรงความต้องการ
-- รันซ้ำได้ (idempotent) ใน Supabase SQL Editor

-- ตาราง log: เปิดอ่านเฉพาะ admin
do $$
declare
  t text;
  pol record;
  tables text[] := array['app_logs', 'event_logs', 'lead_events', 'notify_logs'];
begin
  foreach t in array tables loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;
    for pol in
      select policyname from pg_policies where schemaname='public' and tablename=t
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.is_admin())', t || '_admin_select', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
  end loop;
end $$;

-- contractors: admin หรือเจ้าของบันทึก
do $$
declare
  pol record;
  has_creator boolean;
begin
  if to_regclass('public.contractors') is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='contractors' and column_name='created_by'
    ) into has_creator;
    -- ล้าง policy เดิม
    for pol in
      select policyname from pg_policies where schemaname='public' and tablename='contractors'
    loop
      execute format('drop policy if exists %I on public.contractors', pol.policyname);
    end loop;
    -- สร้างใหม่
    if has_creator then
      create policy contractors_owner_or_admin_select on public.contractors for select using (public.is_admin() or auth.uid() = created_by);
      create policy contractors_owner_or_admin_all on public.contractors for all using (public.is_admin() or auth.uid() = created_by) with check (public.is_admin() or auth.uid() = created_by);
    else
      create policy contractors_admin_only_select on public.contractors for select using (public.is_admin());
      create policy contractors_admin_only_all on public.contractors for all using (public.is_admin()) with check (public.is_admin());
    end if;
  end if;
end $$;

-- contractor_payment_schedules: admin หรือผู้สร้าง
do $$
declare pol record;
begin
  if to_regclass('public.contractor_payment_schedules') is not null then
    for pol in
      select policyname from pg_policies where schemaname='public' and tablename='contractor_payment_schedules'
    loop
      execute format('drop policy if exists %I on public.contractor_payment_schedules', pol.policyname);
    end loop;
    create policy cps_owner_or_admin_select on public.contractor_payment_schedules for select using (public.is_admin() or auth.uid() = created_by);
    create policy cps_owner_or_admin_all on public.contractor_payment_schedules for all using (public.is_admin() or auth.uid() = created_by) with check (public.is_admin() or auth.uid() = created_by);
  end if;
end $$;

-- articles: admin หรือผู้เขียน
do $$
declare
  pol record;
  has_creator boolean;
begin
  if to_regclass('public.articles') is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='articles' and column_name='created_by'
    ) into has_creator;
    for pol in
      select policyname from pg_policies where schemaname='public' and tablename='articles'
    loop
      execute format('drop policy if exists %I on public.articles', pol.policyname);
    end loop;
    if has_creator then
      create policy articles_owner_or_admin_select on public.articles for select using (public.is_admin() or auth.uid() = created_by);
      create policy articles_owner_or_admin_all on public.articles for all using (public.is_admin() or auth.uid() = created_by) with check (public.is_admin() or auth.uid() = created_by);
    else
      create policy articles_admin_only_select on public.articles for select using (public.is_admin());
      create policy articles_admin_only_all on public.articles for all using (public.is_admin()) with check (public.is_admin());
    end if;
  end if;
end $$;

-- leads: เก็บให้ admin เท่านั้น (ถ้าต้องการ public insert ให้เพิ่มเอง)
do $$
declare pol record;
begin
  if to_regclass('public.leads') is not null then
    for pol in
      select policyname from pg_policies where schemaname='public' and tablename='leads'
    loop
      execute format('drop policy if exists %I on public.leads', pol.policyname);
    end loop;
    create policy leads_admin_all on public.leads for all using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;
