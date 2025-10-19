-- Enable Row Level Security (RLS) for all tables
alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.leads enable row level security;

-- POLICIES FOR `profiles` TABLE
-- Users can see their own profile or if they are staff/admin
create policy "profiles_select_self_or_admin" on public.profiles
for select using (
  auth.uid() = id or
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff', 'admin'))
);
-- Users can update their own profile
create policy "profiles_update_self" on public.profiles
for update using (auth.uid() = id) with check (auth.uid() = id);


-- POLICIES FOR `properties` TABLE
-- Anyone can view published properties
create policy "properties_read_published" on public.properties
for select using (published = true);
-- Authenticated staff/admins can view all properties (published or not)
create policy "properties_read_staff" on public.properties
for select using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff', 'admin'))
);
-- Staff/admins can create, update, and delete properties
create policy "properties_crud_staff" on public.properties
for all using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff', 'admin'))
) with check (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff', 'admin'))
);


-- POLICIES FOR `leads` TABLE
-- Anyone can create a lead (e.g., from the public property detail page)
create policy "leads_insert_public" on public.leads
for insert with check (true);
-- Staff/admins can see and manage all leads
create policy "leads_crud_staff" on public.leads
for all using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff', 'admin'))
) with check (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff', 'admin'))
);