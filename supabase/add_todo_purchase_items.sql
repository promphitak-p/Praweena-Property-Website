-- ตารางรายการซื้อของต่อ To-Do งานรีโนเวท
create table if not exists public.todo_purchase_items (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references public.renovation_todos(id) on delete cascade,
  property_id bigint not null references public.properties(id) on delete cascade,
  title text not null,
  vendor text,
  quantity numeric(12,2),
  unit text,
  unit_price numeric(12,2),
  status text not null default 'pending' check (status in ('pending','ordered','received','paid','void')),
  due_date date,
  note text,
  attachment_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- trigger updated_at
create or replace function public.handle_tpi_updated_at()
returns trigger
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tpi_updated_at on public.todo_purchase_items;
create trigger trg_tpi_updated_at
before update on public.todo_purchase_items
for each row execute procedure public.handle_tpi_updated_at();

-- indexes
create index if not exists idx_tpi_todo on public.todo_purchase_items(todo_id);
create index if not exists idx_tpi_property on public.todo_purchase_items(property_id);
create index if not exists idx_tpi_status on public.todo_purchase_items(status);
create index if not exists idx_tpi_due on public.todo_purchase_items(due_date);

-- RLS
alter table public.todo_purchase_items enable row level security;

create policy "tpi_select_owner_or_admin"
  on public.todo_purchase_items
  for select
  using (
    public.is_admin()
    or auth.uid() = created_by
  );

create policy "tpi_cud_owner_or_admin"
  on public.todo_purchase_items
  for all
  using (
    public.is_admin()
    or auth.uid() = created_by
  )
  with check (
    public.is_admin()
    or auth.uid() = created_by
  );
