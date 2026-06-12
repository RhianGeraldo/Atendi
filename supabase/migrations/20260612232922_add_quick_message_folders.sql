create table if not exists public.quick_message_folders (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS
alter table public.quick_message_folders enable row level security;

create policy "Users can view quick_message_folders of their company"
on public.quick_message_folders for select
using (
  company_id = (select company_id from public.profiles where id = auth.uid())
);

create policy "Users can insert quick_message_folders to their company"
on public.quick_message_folders for insert
with check (
  company_id = (select company_id from public.profiles where id = auth.uid())
);

create policy "Users can update quick_message_folders of their company"
on public.quick_message_folders for update
using (
  company_id = (select company_id from public.profiles where id = auth.uid())
);

create policy "Users can delete quick_message_folders of their company"
on public.quick_message_folders for delete
using (
  company_id = (select company_id from public.profiles where id = auth.uid())
);

-- Alter quick_messages table
alter table public.quick_messages
add column if not exists name text default '',
add column if not exists folder_id uuid references public.quick_message_folders(id) on delete set null;
