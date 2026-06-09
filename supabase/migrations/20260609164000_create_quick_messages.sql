create table if not exists public.quick_messages (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  shortcut text not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS
alter table public.quick_messages enable row level security;

create policy "Users can view quick_messages of their company"
on public.quick_messages for select
using (
  company_id = (select company_id from public.profiles where id = auth.uid())
);

create policy "Users can insert quick_messages to their company"
on public.quick_messages for insert
with check (
  company_id = (select company_id from public.profiles where id = auth.uid())
);

create policy "Users can update quick_messages of their company"
on public.quick_messages for update
using (
  company_id = (select company_id from public.profiles where id = auth.uid())
);

create policy "Users can delete quick_messages of their company"
on public.quick_messages for delete
using (
  company_id = (select company_id from public.profiles where id = auth.uid())
);
