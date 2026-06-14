ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS prompt_handoff TEXT;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS prompt_resolution TEXT;
