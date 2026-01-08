-- contractor_payment_schedules table: งวดจ่ายให้ช่าง
create table if not exists public.contractor_payment_schedules (
  id uuid primary key default gen_random_uuid(),
  property_id bigint not null references public.properties(id) on delete cascade,
  property_contractor_id uuid references public.property_contractors(id) on delete set null,
  contractor_id uuid references public.contractors(id) on delete set null,
  title text not null,
  amount numeric(12,2) not null default 0,
  due_date date,
  status text not null default 'pending' check (status in ('pending','paid','overdue','deferred')),
  paid_at timestamptz,
  note text,
  attachment_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at trigger
create or replace function public.handle_cps_updated_at()
returns trigger
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_cps_updated_at on public.contractor_payment_schedules;
create trigger trg_cps_updated_at
before update on public.contractor_payment_schedules
for each row execute procedure public.handle_cps_updated_at();

-- Indexes
create index if not exists idx_cps_property on public.contractor_payment_schedules(property_id);
create index if not exists idx_cps_contractor on public.contractor_payment_schedules(contractor_id);
create index if not exists idx_cps_due on public.contractor_payment_schedules(due_date);

-- RLS
alter table public.contractor_payment_schedules enable row level security;

create policy "cps_select_owner_or_admin"
  on public.contractor_payment_schedules
  for select
  using (
    public.is_admin()
    or auth.uid() = created_by
  );

create policy "cps_cud_owner_or_admin"
  on public.contractor_payment_schedules
  for all
  using (
    public.is_admin()
    or auth.uid() = created_by
  )
  with check (
    public.is_admin()
    or auth.uid() = created_by
  );

-- เสริมคอลัมน์ลาย/รหัสกระเบื้องใน property_specs (ใช้ในฟอร์มสเปก)
alter table if exists public.property_specs
  add column if not exists tile_pattern text;
