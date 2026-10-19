-- Todoo: Quadro Comercial como cadência de prospecção
--
-- Colunas (todoo_stages) = passos da cadência, um funil por empresa:
--   start   -> A contatar (prazo da 1ª tentativa = SLA da ação comercial)
--   attempt -> 1ª, 2ª, 3ª, 4ª tentativa (wait_minutes = tempo até a próxima)
--   failed  -> Sem sucesso (wait_minutes = quarentena; depois volta para A contatar)
-- Status do card (todoo_card_statuses), configuráveis, com comportamento:
--   active (cadência segue) | paused (respondeu) | scheduled | won | lost
-- O comportamento mantém todoo_leads.status, usado pelo Meu Dia, métricas e Gincana.
-- A consultora move os cards; só a volta da quarentena é automática
-- (todoo_refresh_cadence, chamada ao abrir o Quadro e o Meu Dia).

SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- =====================================================================
-- 1. Etapas: novos tipos e tempo até a próxima etapa
-- =====================================================================
DROP TRIGGER IF EXISTS todoo_leads_sync_stage ON public.todoo_leads;
DROP FUNCTION IF EXISTS public.todoo_leads_sync_stage();

ALTER TABLE public.todoo_stages DROP CONSTRAINT IF EXISTS todoo_stages_kind_check;
DELETE FROM public.todoo_stages WHERE kind NOT IN ('start', 'attempt', 'failed');
ALTER TABLE public.todoo_stages
  ADD CONSTRAINT todoo_stages_kind_check CHECK (kind IN ('start', 'attempt', 'failed')),
  ADD COLUMN IF NOT EXISTS wait_minutes INT CHECK (wait_minutes IS NULL OR wait_minutes > 0);

-- =====================================================================
-- 2. Status dos cards
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.todoo_card_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  color TEXT NOT NULL DEFAULT '#64748b',
  behavior TEXT NOT NULL CHECK (behavior IN ('active', 'paused', 'scheduled', 'won', 'lost')),
  position INT NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS todoo_card_statuses_company_idx ON public.todoo_card_statuses (company_id, position);

ALTER TABLE public.todoo_card_statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS todoo_card_statuses_select ON public.todoo_card_statuses;
CREATE POLICY todoo_card_statuses_select ON public.todoo_card_statuses
  FOR SELECT USING (
    (SELECT public.is_super_admin()) OR company_id = (SELECT public.current_company_id())
  );

DROP POLICY IF EXISTS todoo_card_statuses_write ON public.todoo_card_statuses;
CREATE POLICY todoo_card_statuses_write ON public.todoo_card_statuses
  FOR ALL USING (
    (SELECT public.is_super_admin())
    OR (company_id = (SELECT public.current_company_id()) AND (SELECT public.current_role()) = 'admin_company')
  ) WITH CHECK (
    (SELECT public.is_super_admin())
    OR (company_id = (SELECT public.current_company_id()) AND (SELECT public.current_role()) = 'admin_company')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.todoo_card_statuses TO authenticated;

-- =====================================================================
-- 3. Leads: etapa, entrada na etapa, próxima ação e status do card
-- =====================================================================
ALTER TABLE public.todoo_leads
  ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS card_status_id UUID REFERENCES public.todoo_card_statuses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS todoo_leads_cadence_idx ON public.todoo_leads (company_id, next_action_at);

-- =====================================================================
-- 4. Funil padrão da empresa (etapas + status), criado uma vez
-- =====================================================================
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
      (p_company_id, 'Sem Sucesso',  '#ef4444', 'failed',  5, 45 * 1440);
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

SELECT public.todoo_ensure_pipeline(id) FROM public.companies;

-- =====================================================================
-- 5. Leads existentes entram na cadência (antes do gatilho existir)
-- =====================================================================
WITH st AS (
  SELECT company_id,
    (array_agg(id ORDER BY position) FILTER (WHERE kind = 'start'))[1] AS start_id,
    (array_agg(id ORDER BY position) FILTER (WHERE kind = 'attempt'))[1] AS first_attempt_id,
    (array_agg(wait_minutes ORDER BY position) FILTER (WHERE kind = 'attempt'))[1] AS first_attempt_wait,
    (array_agg(id ORDER BY position) FILTER (WHERE kind = 'failed'))[1] AS failed_id,
    (array_agg(wait_minutes ORDER BY position) FILTER (WHERE kind = 'failed'))[1] AS failed_wait
  FROM public.todoo_stages GROUP BY company_id
),
cs AS (
  SELECT company_id, behavior, (array_agg(id ORDER BY is_default DESC, position))[1] AS id
  FROM public.todoo_card_statuses GROUP BY company_id, behavior
)
UPDATE public.todoo_leads l
SET stage_id = CASE
      WHEN l.status = 'pending' THEN st.start_id
      WHEN l.status = 'lost' THEN st.failed_id
      ELSE st.first_attempt_id
    END,
    stage_entered_at = COALESCE(l.last_interaction_at, l.assigned_at, l.created_at),
    next_action_at = CASE
      WHEN l.status = 'pending' THEN l.sla_deadline
      WHEN l.status = 'lost' THEN COALESCE(l.last_interaction_at, l.updated_at) + make_interval(mins => st.failed_wait)
      ELSE COALESCE(l.last_interaction_at, l.assigned_at, l.created_at) + make_interval(mins => st.first_attempt_wait)
    END,
    card_status_id = (
      SELECT cs.id FROM cs
      WHERE cs.company_id = l.company_id
        AND cs.behavior = CASE l.status
          WHEN 'pending' THEN 'active'
          WHEN 'scheduled' THEN 'scheduled'
          WHEN 'won' THEN 'won'
          WHEN 'lost' THEN 'lost'
          ELSE 'paused'
        END
    )
FROM st
WHERE st.company_id = l.company_id
  AND l.stage_id IS NULL; -- só leads ainda fora da cadência (reexecução não refaz o SLA)

-- =====================================================================
-- 6. Gatilho da cadência
-- =====================================================================
CREATE OR REPLACE FUNCTION public.todoo_leads_cadence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind TEXT;
  v_wait INT;
  v_behavior TEXT;
  v_stage_changed BOOLEAN := false;
  v_card_changed BOOLEAN := false;
  v_status_changed BOOLEAN := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage_id IS NULL THEN
      SELECT id INTO NEW.stage_id FROM public.todoo_stages
      WHERE company_id = NEW.company_id ORDER BY (kind = 'start') DESC, position LIMIT 1;
    END IF;
    IF NEW.card_status_id IS NULL THEN
      SELECT id INTO NEW.card_status_id FROM public.todoo_card_statuses
      WHERE company_id = NEW.company_id AND behavior = 'active' ORDER BY is_default DESC, position LIMIT 1;
    END IF;
    NEW.stage_entered_at := COALESCE(NEW.stage_entered_at, now());
    v_stage_changed := true;
  ELSE
    v_stage_changed := NEW.stage_id IS DISTINCT FROM OLD.stage_id;
    v_card_changed := NEW.card_status_id IS DISTINCT FROM OLD.card_status_id;
    v_status_changed := NEW.status IS DISTINCT FROM OLD.status;

    -- Status mudou fora do Quadro (desfecho, Meu Dia): acompanha o status do card
    IF v_status_changed AND NOT v_card_changed AND NEW.status IN ('scheduled', 'won', 'lost') THEN
      SELECT id INTO NEW.card_status_id FROM public.todoo_card_statuses
      WHERE company_id = NEW.company_id AND behavior = NEW.status
      ORDER BY is_default DESC, position LIMIT 1;
      v_card_changed := NEW.card_status_id IS DISTINCT FROM OLD.card_status_id;
    END IF;
  END IF;

  SELECT behavior INTO v_behavior FROM public.todoo_card_statuses WHERE id = NEW.card_status_id;

  -- Sem interesse: vai para Sem sucesso (quarentena)
  IF v_card_changed AND v_behavior = 'lost' THEN
    SELECT id INTO NEW.stage_id FROM public.todoo_stages
    WHERE company_id = NEW.company_id AND kind = 'failed' ORDER BY position LIMIT 1;
    v_stage_changed := v_stage_changed OR NEW.stage_id IS DISTINCT FROM OLD.stage_id;
  END IF;

  SELECT kind, wait_minutes INTO v_kind, v_wait FROM public.todoo_stages WHERE id = NEW.stage_id;

  IF v_stage_changed THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.stage_entered_at := now();
    END IF;

    IF v_kind = 'start' THEN
      -- Nova rodada (ou lead novo): prazo da 1ª tentativa = SLA da ação comercial
      IF TG_OP = 'UPDATE' OR NEW.sla_deadline IS NULL THEN
        NEW.sla_deadline := now() + make_interval(hours => COALESCE(
          (SELECT sla_hours FROM public.todoo_campaigns WHERE id = NEW.campaign_id), 24));
        NEW.sla_breached := false;
      END IF;
      NEW.next_action_at := NEW.sla_deadline;
    ELSE
      NEW.next_action_at := CASE WHEN v_wait IS NULL THEN NULL
                                 ELSE NEW.stage_entered_at + make_interval(mins => v_wait) END;
    END IF;

    -- Tentativa feita: conta como trabalho do dia
    IF TG_OP = 'UPDATE' AND v_kind = 'attempt' THEN
      NEW.last_interaction_at := now();
      NEW.first_contact_at := COALESCE(NEW.first_contact_at, now());
    END IF;
  END IF;

  -- Status do lead segue o comportamento do status do card (quando não veio explícito)
  IF (v_card_changed OR v_stage_changed) AND NOT v_status_changed AND v_behavior IS NOT NULL THEN
    NEW.status := CASE v_behavior
      WHEN 'active' THEN CASE WHEN v_kind = 'start' THEN 'pending' ELSE 'contacted' END
      WHEN 'paused' THEN CASE WHEN NEW.status IN ('contacted', 'quoted', 'callback') THEN NEW.status ELSE 'contacted' END
      ELSE v_behavior
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS todoo_leads_cadence ON public.todoo_leads;
CREATE TRIGGER todoo_leads_cadence
  BEFORE INSERT OR UPDATE OF stage_id, card_status_id, status ON public.todoo_leads
  FOR EACH ROW EXECUTE FUNCTION public.todoo_leads_cadence();

-- =====================================================================
-- 7. Rotina da cadência: quarentena vencida volta para A contatar
--    e tentativa vencida marca sla_breached (Métricas e Gincana)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.todoo_refresh_cadence(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start UUID;
  v_default UUID;
  v_recycled INT := 0;
  v_breached INT := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_super_admin() OR p_company_id = public.current_company_id()) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa' USING ERRCODE = '42501';
  END IF;

  PERFORM public.todoo_ensure_pipeline(p_company_id);

  SELECT id INTO v_start FROM public.todoo_stages
  WHERE company_id = p_company_id ORDER BY (kind = 'start') DESC, position LIMIT 1;
  SELECT id INTO v_default FROM public.todoo_card_statuses
  WHERE company_id = p_company_id AND behavior = 'active' ORDER BY is_default DESC, position LIMIT 1;

  WITH recycled AS (
    UPDATE public.todoo_leads l
    SET stage_id = v_start,
        card_status_id = v_default,
        status = 'pending',
        outcome_type = NULL,
        callback_scheduled_at = NULL,
        updated_at = now()
    FROM public.todoo_stages s
    WHERE l.company_id = p_company_id
      AND s.id = l.stage_id
      AND s.kind = 'failed'
      AND l.next_action_at IS NOT NULL
      AND l.next_action_at <= now()
    RETURNING l.id, l.campaign_id, l.company_id
  ), ev AS (
    INSERT INTO public.todoo_events (lead_id, campaign_id, company_id, event_type, notes)
    SELECT id, campaign_id, company_id, 'cadence_restarted', 'Quarentena de Sem sucesso terminou: voltou para A contatar'
    FROM recycled
    RETURNING 1
  )
  SELECT count(*) INTO v_recycled FROM ev;

  UPDATE public.todoo_leads l
  SET sla_breached = true
  FROM public.todoo_card_statuses cs
  WHERE l.company_id = p_company_id
    AND cs.id = l.card_status_id
    AND cs.behavior = 'active'
    AND NOT l.sla_breached
    AND l.next_action_at IS NOT NULL
    AND l.next_action_at < now();
  GET DIAGNOSTICS v_breached = ROW_COUNT;

  RETURN jsonb_build_object('recycled', v_recycled, 'breached', v_breached);
END;
$$;

REVOKE ALL ON FUNCTION public.todoo_ensure_pipeline(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.todoo_refresh_cadence(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.todoo_refresh_cadence(UUID) TO authenticated;
