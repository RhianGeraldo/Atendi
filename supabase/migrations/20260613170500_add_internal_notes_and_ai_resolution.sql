ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS allow_resolution BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS resolution_reason_id UUID REFERENCES public.resolution_reasons(id) ON DELETE SET NULL;
