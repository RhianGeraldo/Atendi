-- Add provider columns to whatsapp_instances
ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'evogo';
ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS oficial_phone_number_id VARCHAR(255);
ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS oficial_access_token TEXT;
ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS oficial_verify_token VARCHAR(255);

-- Se já existirem registros sem provider definido, defina como evogo (o default cobrirá, mas previne nulos se já estava inserido)
UPDATE public.whatsapp_instances SET provider = 'evogo' WHERE provider IS NULL;

-- Constraint para limitar provedores válidos
ALTER TABLE public.whatsapp_instances ADD CONSTRAINT valid_provider CHECK (provider IN ('evogo', 'oficial', 'stevo'));

