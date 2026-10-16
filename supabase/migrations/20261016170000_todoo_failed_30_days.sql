-- Todoo: quarentena do Sem sucesso passa de 45 para 30 dias
-- (4ª tentativa 15 dias + Sem sucesso 30 dias = 45 dias até voltar para A contatar)

SET lock_timeout = '3s';
SET statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.todoo_ensure_pipeline(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.todoo_stages WHERE company_id = p_company_id) THEN
    INSERT INTO public.todoo_stages (company_id, name, color, kind, position, wait_minutes) VALUES
      (p_company_id, 'A Contatar',   '#3b82f6', 'start',   0, NULL),
      (p_company_id, '1ª Tentativa', '#8b5cf6', 'attempt', 1, 48 * 60),
      (p_company_id, '2ª Tentativa', '#0ea5e9', 'attempt', 2, 7 * 1440),
      (p_company_id, '3ª Tentativa', '#f59e0b', 'attempt', 3, 15 * 1440),
      (p_company_id, '4ª Tentativa', '#f97316', 'attempt', 4, 15 * 1440),
      (p_company_id, 'Sem Sucesso',  '#ef4444', 'failed',  5, 30 * 1440);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.todoo_card_statuses WHERE company_id = p_company_id) THEN
    INSERT INTO public.todoo_card_statuses (company_id, name, color, behavior, position, is_default) VALUES
      (p_company_id, 'Sem contato',  '#64748b', 'active',    0, true),
      (p_company_id, 'Em conversa',  '#8b5cf6', 'paused',    1, false),
      (p_company_id, 'Agendado',     '#0ea5e9', 'scheduled', 2, false),
      (p_company_id, 'Comprou',      '#10b981', 'won',       3, false),
      (p_company_id, 'Sem interesse','#ef4444', 'lost',      4, false);
  END IF;
END;
$$;

-- Empresas ainda com o padrão de 45 dias
UPDATE public.todoo_stages
SET wait_minutes = 30 * 1440, updated_at = now()
WHERE kind = 'failed' AND wait_minutes = 45 * 1440;

-- Cards já em Sem sucesso: recalcula a volta
UPDATE public.todoo_leads l
SET next_action_at = l.stage_entered_at + make_interval(mins => s.wait_minutes)
FROM public.todoo_stages s
WHERE s.id = l.stage_id AND s.kind = 'failed' AND s.wait_minutes IS NOT NULL;
