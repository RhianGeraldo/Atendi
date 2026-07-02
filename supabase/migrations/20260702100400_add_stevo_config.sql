-- Add Stevo columns to companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS stevo_host TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS stevo_global_token TEXT;

-- Add Stevo columns to whatsapp_instances
ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS stevo_api_key TEXT DEFAULT gen_random_uuid()::text;
ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS stevo_instance_id UUID;
