ALTER TABLE whatsapp_instances DROP CONSTRAINT IF EXISTS valid_provider;
ALTER TABLE whatsapp_instances ADD CONSTRAINT valid_provider CHECK (provider::text = ANY (ARRAY['evogo'::character varying, 'oficial'::character varying, 'stevo'::character varying, 'instagram'::character varying, 'messenger'::character varying]::text[]));
