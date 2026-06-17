-- Migration to add wavoip_token to whatsapp_instances table

ALTER TABLE public.whatsapp_instances
ADD COLUMN IF NOT EXISTS wavoip_token TEXT;
