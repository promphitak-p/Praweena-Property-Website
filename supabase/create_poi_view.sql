-- Create table if it doesn't exist
create table if not exists public.property_poi (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete cascade,
  name text not null,
  type text,
  lat double precision,
  lng double precision,
  distance_km double precision,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.property_poi enable row level security;

-- Create View for public access
-- Note: Logic in JS code uses property_poi_public
drop view if exists public.property_poi_public;
create or replace view public.property_poi_public as
select id, property_id, name, type, lat, lng, distance_km
from public.property_poi;

-- Policies for property_poi table

-- 1. Public can SELECT (read)
drop policy if exists "property_poi_select_public" on public.property_poi;
create policy "property_poi_select_public" on public.property_poi for select using (true);

-- 2. Authenticated users (staff/admin) can INSERT
drop policy if exists "property_poi_insert_auth" on public.property_poi;
create policy "property_poi_insert_auth" on public.property_poi for insert with check (auth.role() = 'authenticated');

-- 3. Authenticated users (staff/admin) can DELETE
drop policy if exists "property_poi_delete_auth" on public.property_poi;
create policy "property_poi_delete_auth" on public.property_poi for delete using (auth.role() = 'authenticated');

-- 4. Authenticated users (staff/admin) can UPDATE
drop policy if exists "property_poi_update_auth" on public.property_poi;
create policy "property_poi_update_auth" on public.property_poi for update using (auth.role() = 'authenticated');
