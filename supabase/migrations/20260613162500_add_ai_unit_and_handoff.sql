ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS allow_handoff BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS handoff_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;
