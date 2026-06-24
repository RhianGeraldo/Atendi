ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'messenger';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'facebook';

ALTER TABLE whatsapp_instances DROP CONSTRAINT IF EXISTS valid_provider;
ALTER TABLE whatsapp_instances ADD CONSTRAINT valid_provider CHECK (provider::text = ANY (ARRAY['evogo'::character varying, 'oficial'::character varying, 'stevo'::character varying, 'instagram'::character varying, 'messenger'::character varying, 'facebook'::character varying]::text[]));
