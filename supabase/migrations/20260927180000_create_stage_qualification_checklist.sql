-- Migration: Create stage qualification checklist (Passos / Critérios de Qualificação por Etapa do CRM)
-- Permite aos gestores definir passos/perguntas por etapa (checkbox, select, text) e aos vendedores preencherem diretamente no chat/CRM com avanço automático

-- Adiciona suporte a Meta CAPI em pipeline_stages se não existir
ALTER TABLE public.pipeline_stages ADD COLUMN IF NOT EXISTS meta_event_name TEXT;

CREATE TABLE IF NOT EXISTS public.stage_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  response_type TEXT NOT NULL DEFAULT 'checkbox' CHECK (response_type IN ('checkbox', 'select', 'text')),
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_required BOOLEAN NOT NULL DEFAULT true,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_stage_checklist_stage ON public.stage_checklist_items(stage_id, order_index);
CREATE INDEX IF NOT EXISTS idx_stage_checklist_company ON public.stage_checklist_items(company_id);

ALTER TABLE public.stage_checklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage stage checklist items for their company" ON public.stage_checklist_items;
CREATE POLICY "Users can manage stage checklist items for their company" ON public.stage_checklist_items
  FOR ALL
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

GRANT ALL ON public.stage_checklist_items TO authenticated;
GRANT ALL ON public.stage_checklist_items TO service_role;

-- Tabela de respostas e preenchimento dos passos por oportunidade
CREATE TABLE IF NOT EXISTS public.opportunity_stage_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.stage_checklist_items(id) ON DELETE CASCADE,
  completed BOOLEAN NOT NULL DEFAULT false,
  value TEXT,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE(opportunity_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_opp_answers_opp ON public.opportunity_stage_answers(opportunity_id);

ALTER TABLE public.opportunity_stage_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage opportunity answers via opportunity" ON public.opportunity_stage_answers;
CREATE POLICY "Users can manage opportunity answers via opportunity" ON public.opportunity_stage_answers
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.id = opportunity_stage_answers.opportunity_id
    AND (
      (o.unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
      OR 
      (o.unit_id IS NOT NULL AND public.user_in_unit(o.unit_id))
    )
  ));

GRANT ALL ON public.opportunity_stage_answers TO authenticated;
GRANT ALL ON public.opportunity_stage_answers TO service_role;
