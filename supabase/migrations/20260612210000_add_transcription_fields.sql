-- Add AI settings to companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS transcription_provider TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS transcription_api_key TEXT;

-- Add transcription field to messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS transcription TEXT;
