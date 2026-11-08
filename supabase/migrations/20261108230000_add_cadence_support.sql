-- Migration: Add long-term follow-up cadence columns to conversations and ai_agents
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS cadence_step INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cadence_next_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS allow_cadence BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS prompt_cadence TEXT DEFAULT NULL;

-- Index for high-performance cadence cron scanning
CREATE INDEX IF NOT EXISTS idx_conversations_cadence
  ON public.conversations (status, cadence_step, cadence_next_at)
  WHERE cadence_next_at IS NOT NULL;
