ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS active_by_default BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS ai_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS ai_agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL;
