CREATE TABLE IF NOT EXISTS public.opportunity_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.opportunity_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "opportunity notes select" ON public.opportunity_notes;
CREATE POLICY "opportunity notes select" ON public.opportunity_notes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.id = opportunity_notes.opportunity_id
    AND (
      (o.unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
      OR 
      (o.unit_id IS NOT NULL AND public.user_in_unit(o.unit_id))
    )
  )
);

DROP POLICY IF EXISTS "opportunity notes insert" ON public.opportunity_notes;
CREATE POLICY "opportunity notes insert" ON public.opportunity_notes FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.id = opportunity_notes.opportunity_id
    AND (
      (o.unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
      OR 
      (o.unit_id IS NOT NULL AND public.user_in_unit(o.unit_id))
    )
  )
  AND auth.uid() = user_id
);

DROP POLICY IF EXISTS "opportunity notes update" ON public.opportunity_notes;
CREATE POLICY "opportunity notes update" ON public.opportunity_notes FOR UPDATE USING (
  auth.uid() = user_id
) WITH CHECK (
  auth.uid() = user_id
);

DROP POLICY IF EXISTS "opportunity notes delete" ON public.opportunity_notes;
CREATE POLICY "opportunity notes delete" ON public.opportunity_notes FOR DELETE USING (
  auth.uid() = user_id
);
