ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS ai_settings JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.companies DROP COLUMN IF EXISTS transcription_provider;
ALTER TABLE public.companies DROP COLUMN IF EXISTS transcription_api_key;
