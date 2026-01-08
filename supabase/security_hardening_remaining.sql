-- security_hardening_remaining.sql
-- แก้รายงาน Security ตามที่เหลือ: set search_path ในฟังก์ชัน และปิด RLS ที่กว้างเกินไปในตาราง log
-- รันใน Supabase SQL Editor ได้หลายครั้ง (idempotent)

-- 1) บังคับ search_path = public, pg_temp ให้ฟังก์ชันที่แจ้งเตือน (จับ signature อัตโนมัติ)
do $$
declare
  fn regprocedure;
  fnames text[] := array[
    'admin_add_email',
    'admin_remove_email',
    'auth_role',
    'get_my_role',
    'normalize_email',
    'set_completed_at',
    'set_contracts_updated_at',
    'set_current_timestamp_updated_at',
    'set_timestamp',
    'set_updated_at',
    'update_updated_at_column'
  ];
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(fnames)
  loop
    execute format('alter function %s set search_path = public, pg_temp', fn);
  end loop;
end $$;

-- 2) RLS: ตาราง log ที่ policy เป็น TRUE ให้เหลือเฉพาะ admin/staff
-- หมายเหตุ: ถ้าตารางไม่มี RLS ให้เปิดก่อน, ถ้าคอลัมน์ไม่ตรง ใช้เงื่อนไข is_admin() อย่างเดียว
do $$
declare
  table_name text;
  pol record;
  t_logs text[] := array['app_logs', 'event_logs', 'lead_events', 'leads', 'notify_logs'];
begin
  foreach table_name in array t_logs loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', table_name);
    for pol in
      select policyname from pg_policies where schemaname='public' and tablename=table_name
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, table_name);
    end loop;
    execute format($f$
      create policy %I on public.%I
      for select using (public.is_admin())
    $f$, table_name || '_admin_select', table_name);
    execute format($f$
      create policy %I on public.%I
      for all using (public.is_admin()) with check (public.is_admin())
    $f$, table_name || '_admin_all', table_name);
  end loop;
end $$;

-- 3) เปิด Leaked Password Protection / MFA ให้ทำใน Settings ของ Supabase (ไม่สามารถสั่ง SQL)
--   - ไปที่ Auth Settings > Passwords: เปิด "Block sign-ins with leaked passwords"
--   - ตั้ง MFA Options ตามความต้องการ
