-- Restore Admin/Staff write access to properties table
-- This is necessary because previous RLS fixes may have wiped out the CRUD policies.

-- 1. Ensure helper function exists
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

-- 2. Add Policy for Admin CRUD (Create, Read, Update, Delete)
drop policy if exists "properties_crud_staff" on public.properties;

create policy "properties_crud_staff" on public.properties
for all
using ( public.is_admin() )
with check ( public.is_admin() );

-- 3. Ensure public can still read published properties
drop policy if exists "properties_select_published" on public.properties;

create policy "properties_select_published" on public.properties
for select
using ( published = true );

-- 4. Enable RLS (just in case)
alter table public.properties enable row level security;
