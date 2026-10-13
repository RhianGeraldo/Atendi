-- Migration: Add SLA configuration to pipeline_stages and stage tracking to opportunities

-- 1. Colunas de configuração de SLA em pipeline_stages
ALTER TABLE public.pipeline_stages 
ADD COLUMN IF NOT EXISTS sla_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS sla_minutes INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS sla_warning_pct INTEGER NOT NULL DEFAULT 75;

-- 2. Coluna para registrar o momento exato em que a oportunidade entrou na etapa atual
ALTER TABLE public.opportunities 
ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 3. Atualizar oportunidades existentes para que stage_entered_at receba created_at caso seja null
UPDATE public.opportunities 
SET stage_entered_at = created_at 
WHERE stage_entered_at IS NULL;

-- 4. Função e trigger para resetar stage_entered_at automaticamente na troca de etapa
CREATE OR REPLACE FUNCTION public.update_opportunity_stage_entered_at()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.stage_entered_at IS NULL THEN
      NEW.stage_entered_at = now();
    END IF;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (NEW.stage_id IS DISTINCT FROM OLD.stage_id) THEN
      NEW.stage_entered_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_opportunity_stage_entered_at ON public.opportunities;
CREATE TRIGGER trigger_update_opportunity_stage_entered_at
  BEFORE INSERT OR UPDATE OF stage_id ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_opportunity_stage_entered_at();
