-- 1. Create a secure function to check admin/staff status
-- SECURITY DEFINER allows this function to bypass RLS
create or replace function public.is_admin()
returns boolean
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

-- 2. Update Profiles Policies (Fix Recursion)
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin" on public.profiles
for select using (
  auth.uid() = id or public.is_admin()
);

-- 3. Update Leads Policies
drop policy if exists "leads_crud_staff" on public.leads;
create policy "leads_crud_staff" on public.leads
for all using (
  public.is_admin()
) with check (
  public.is_admin()
);

-- 4. Update Properties Policies (optional but good practice)
drop policy if exists "properties_read_staff" on public.properties;
create policy "properties_read_staff" on public.properties
for select using (
  public.is_admin()
);

drop policy if exists "properties_crud_staff" on public.properties;
create policy "properties_crud_staff" on public.properties
for all using (
  public.is_admin()
) with check (
  public.is_admin()
);
