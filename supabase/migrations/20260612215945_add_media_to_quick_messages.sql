alter table public.quick_messages
add column if not exists media_url text,
add column if not exists media_type text;
