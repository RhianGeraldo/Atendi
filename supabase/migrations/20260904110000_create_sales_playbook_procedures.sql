-- Migration: Create sales_playbook_procedures for procedures, explanations, FAQ, scripts and commercial policies
CREATE TABLE IF NOT EXISTS public.sales_playbook_procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'procedure', -- 'procedure', 'faq', 'pricing', 'objection_script', 'policy'
  content TEXT NOT NULL,
  key_points TEXT[] DEFAULT '{}',
  target_audience TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_playbook_company ON public.sales_playbook_procedures(company_id, category, is_active);

ALTER TABLE public.sales_playbook_procedures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view sales playbook for their company" ON public.sales_playbook_procedures;
CREATE POLICY "Users can view sales playbook for their company" ON public.sales_playbook_procedures
  FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can manage sales playbook for their company" ON public.sales_playbook_procedures;
CREATE POLICY "Users can manage sales playbook for their company" ON public.sales_playbook_procedures
  FOR ALL
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

GRANT ALL ON public.sales_playbook_procedures TO authenticated;
GRANT ALL ON public.sales_playbook_procedures TO service_role;
