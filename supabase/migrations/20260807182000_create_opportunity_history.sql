CREATE TABLE IF NOT EXISTS public.opportunity_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.opportunity_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "opportunity_history_select" ON public.opportunity_history;
CREATE POLICY "opportunity_history_select" ON public.opportunity_history FOR SELECT USING (true);

DROP POLICY IF EXISTS "opportunity_history_insert" ON public.opportunity_history;
CREATE POLICY "opportunity_history_insert" ON public.opportunity_history FOR INSERT WITH CHECK (true);
