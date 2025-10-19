-- Enable necessary extensions
create extension if not exists "pgcrypto" with schema "extensions";
create extension if not exists "uuid-ossp" with schema "extensions";

-- Profiles table to store user-specific data
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user','staff','admin')),
  display_name text,
  phone text,
  created_at timestamptz default now()
);

-- Properties table
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  price numeric(12, 2),
  size_text text,
  beds int,
  baths int,
  parking int,
  address text,
  district text,
  province text,
  features jsonb default '{}'::jsonb,
  cover_url text,
  gallery jsonb default '[]'::jsonb,
  published boolean default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Leads table
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete set null,
  name text not null,
  phone text not null,
  note text,
  status text default 'new' check (status in ('new','contacted','qualified','won','lost')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_properties_slug on public.properties(slug);
create index if not exists idx_properties_published on public.properties(published);
create index if not exists idx_leads_property on public.leads(property_id);

-- Function to update `updated_at` timestamp automatically
create or replace function public.handle_property_update()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to call the function on update
create trigger on_property_update
  before update on public.properties
  for each row execute procedure public.handle_property_update();