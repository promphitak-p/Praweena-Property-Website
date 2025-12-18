-- Enable RLS for contracts table and allow Admin access

-- 1. Enable RLS
alter table public.contracts enable row level security;

-- 2. Drop existing policies to be safe
drop policy if exists "contracts_crud_staff" on public.contracts;
drop policy if exists "contracts_select_staff" on public.contracts;

-- 3. Create Policy for Admin/Staff to manage contracts
-- Requires public.is_admin() function (created in previous scripts)

create policy "contracts_crud_staff" on public.contracts
for all
using ( public.is_admin() )
with check ( public.is_admin() );

-- Note: We assume only admins/staff can see contracts. 
-- If customers need to see their own contracts, we would add a separate policy.
