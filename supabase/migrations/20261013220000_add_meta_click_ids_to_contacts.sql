-- Identificadores de clique/navegador da Meta capturados pelo CRM (site/formulários)
-- Enviados sem hash para a Meta Conversions API (user_data.fbc / user_data.fbp)
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS meta_fbc TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS meta_fbp TEXT;

NOTIFY pgrst, 'reload schema';
