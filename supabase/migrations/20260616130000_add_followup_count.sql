-- Add ai_followup_count to conversations
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS ai_followup_count INT DEFAULT 0;
