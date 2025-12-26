-- Create Articles Table
create table if not exists articles (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  slug text, -- for url friendly (optional)
  excerpt text, -- short summary
  content text, -- html content
  cover_image text,
  category text default 'General',
  is_published boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table articles enable row level security;

-- Policies
-- 1. Public can view published articles
create policy "Public can view published articles"
  on articles for select
  using ( is_published = true );

-- 2. Authenticated users (Admin) can view all
create policy "Admins can view all articles"
  on articles for select
  using ( auth.role() = 'authenticated' );

-- 3. Authenticated users can insert/update/delete
create policy "Admins can insert articles"
  on articles for insert
  with check ( auth.role() = 'authenticated' );

create policy "Admins can update articles"
  on articles for update
  using ( auth.role() = 'authenticated' );

create policy "Admins can delete articles"
  on articles for delete
  using ( auth.role() = 'authenticated' );

-- Storage bucket for article images (layout similar to properties)
insert into storage.buckets (id, name, public)
values ('article-images', 'article-images', true)
on conflict (id) do nothing;

create policy "Public Access to Article Images"
  on storage.objects for select
  using ( bucket_id = 'article-images' );

create policy "Auth Upload Article Images"
  on storage.objects for insert
  with check ( bucket_id = 'article-images' and auth.role() = 'authenticated' );
