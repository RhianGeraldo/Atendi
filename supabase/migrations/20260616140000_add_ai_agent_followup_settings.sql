-- Add follow-up settings to ai_agents
ALTER TABLE public.ai_agents 
  ADD COLUMN IF NOT EXISTS allow_followup BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_interval_minutes INT DEFAULT 15,
  ADD COLUMN IF NOT EXISTS followup_max_attempts INT DEFAULT 2,
  ADD COLUMN IF NOT EXISTS prompt_followup TEXT;
