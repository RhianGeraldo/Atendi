-- Add allow_tickets and prompt_tickets to ai_agents table
ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS allow_tickets BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS prompt_tickets TEXT;
