-- Todoo: etapas configuráveis do Quadro Comercial
--
-- - Cada empresa define as próprias etapas (nome, cor, ordem).
-- - Toda etapa tem um "kind" que define o comportamento e liga ao status do lead,
--   usado pelo Meu Dia, desfecho, métricas e SLA:
--     pending -> pending | in_progress -> contacted, quoted | scheduled -> scheduled
--     callback -> callback | won -> won | lost -> lost
-- - todoo_leads.stage_id guarda a etapa escolhida; sem etapa (ou etapa de outro kind),
--   o lead aparece na primeira etapa do kind do seu status.
-- - Sem etapas cadastradas, o Quadro usa as 6 etapas padrão.

SET lock_timeout = '3s';
SET statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.todoo_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  color TEXT NOT NULL DEFAULT '#3b82f6',
  kind TEXT NOT NULL CHECK (kind IN ('pending', 'in_progress', 'scheduled', 'callback', 'won', 'lost')),
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS todoo_stages_company_idx ON public.todoo_stages (company_id, position);

ALTER TABLE public.todoo_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS todoo_stages_select ON public.todoo_stages;
CREATE POLICY todoo_stages_select ON public.todoo_stages
  FOR SELECT USING (
    (SELECT public.is_super_admin()) OR company_id = (SELECT public.current_company_id())
  );

DROP POLICY IF EXISTS todoo_stages_write ON public.todoo_stages;
CREATE POLICY todoo_stages_write ON public.todoo_stages
  FOR ALL USING (
    (SELECT public.is_super_admin())
    OR (company_id = (SELECT public.current_company_id()) AND (SELECT public.current_role()) = 'admin_company')
  ) WITH CHECK (
    (SELECT public.is_super_admin())
    OR (company_id = (SELECT public.current_company_id()) AND (SELECT public.current_role()) = 'admin_company')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.todoo_stages TO authenticated;

ALTER TABLE public.todoo_leads
  ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES public.todoo_stages(id) ON DELETE SET NULL;

-- Status mudou para outro kind (Meu Dia, desfecho, banner) sem trocar a etapa:
-- limpa a etapa antiga para o lead ir à etapa padrão do novo status.
CREATE OR REPLACE FUNCTION public.todoo_leads_sync_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_kind TEXT;
  v_status_kind TEXT;
BEGIN
  IF NEW.stage_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  SELECT kind INTO v_kind FROM public.todoo_stages WHERE id = NEW.stage_id;
  v_status_kind := CASE WHEN NEW.status IN ('contacted', 'quoted') THEN 'in_progress' ELSE NEW.status END;

  IF v_kind IS DISTINCT FROM v_status_kind THEN
    NEW.stage_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS todoo_leads_sync_stage ON public.todoo_leads;
CREATE TRIGGER todoo_leads_sync_stage
  BEFORE UPDATE OF status ON public.todoo_leads
  FOR EACH ROW EXECUTE FUNCTION public.todoo_leads_sync_stage();
