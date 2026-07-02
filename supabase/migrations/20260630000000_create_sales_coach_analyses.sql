CREATE TABLE public.sales_coach_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  analysis_markdown TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id)
);

ALTER TABLE public.sales_coach_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view analyses from their company" ON public.sales_coach_analyses
  FOR SELECT USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can insert analyses for their company" ON public.sales_coach_analyses
  FOR INSERT WITH CHECK (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can delete analyses for their company" ON public.sales_coach_analyses
  FOR DELETE USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_coach_analyses TO authenticated;
GRANT ALL ON public.sales_coach_analyses TO service_role;
