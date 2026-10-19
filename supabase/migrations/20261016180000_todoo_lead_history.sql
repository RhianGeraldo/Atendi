-- Todoo: histórico das movimentações dos leads (base das métricas da cadência)
--
-- - todoo_lead_history: uma linha por mudança no lead (entrou no funil, mudou de etapa,
--   mudou de status, trocou de consultora, voltou da quarentena), gravada pelo banco,
--   venha a mudança de onde vier. Guarda de -> para com os nomes da época, quem fez,
--   tempo na etapa anterior, prazo da tentativa e atraso, rodada, unidade, ação e origem.
-- - Marcos no lead (cadence_round, first_attempt_at, responded_at, scheduled_at,
--   won_at, lost_at) para painéis rápidos.
-- - Importa os eventos de cadência já gravados e cria o "entrou no funil" dos leads atuais.

SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- =====================================================================
-- 1. Tabela de histórico
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.todoo_lead_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.todoo_leads(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id UUID,
  campaign_id UUID,
  origin TEXT,
  event TEXT NOT NULL CHECK (event IN ('created', 'stage_changed', 'status_changed', 'assigned', 'recycled')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  round INT NOT NULL DEFAULT 1,
  from_stage_id UUID,
  from_stage_name TEXT,
  from_stage_kind TEXT,
  to_stage_id UUID,
  to_stage_name TEXT,
  to_stage_kind TEXT,
  from_card_status_id UUID,
  from_card_status_name TEXT,
  from_card_behavior TEXT,
  to_card_status_id UUID,
  to_card_status_name TEXT,
  to_card_behavior TEXT,
  from_status TEXT,
  to_status TEXT,
  from_assigned_user_id UUID,
  to_assigned_user_id UUID,
  seconds_in_previous_stage INT,
  due_at TIMESTAMPTZ,
  late_seconds INT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS todoo_lead_history_company_idx ON public.todoo_lead_history (company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS todoo_lead_history_lead_idx ON public.todoo_lead_history (lead_id, occurred_at);

ALTER TABLE public.todoo_lead_history ENABLE ROW LEVEL SECURITY;

-- Leitura: quem vê o lead vê o histórico (mesma regra de todoo_events). Escrita só pelo gatilho.
DROP POLICY IF EXISTS todoo_lead_history_select ON public.todoo_lead_history;
CREATE POLICY todoo_lead_history_select ON public.todoo_lead_history
  FOR SELECT USING (
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.todoo_leads l
      WHERE l.id = todoo_lead_history.lead_id
        AND l.company_id = (SELECT public.current_company_id())
        AND (
          (l.unit_id IS NULL AND (SELECT public.auth_has_rede_access()))
          OR l.unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
          OR l.assigned_user_id = (SELECT auth.uid())
        )
    )
  );

GRANT SELECT ON public.todoo_lead_history TO authenticated;

-- =====================================================================
-- 2. Marcos no lead
-- =====================================================================
ALTER TABLE public.todoo_leads
  ADD COLUMN IF NOT EXISTS cadence_round INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS first_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS won_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ;

-- Roda depois do gatilho da cadência (ordem alfabética: cadence < milestones)
CREATE OR REPLACE FUNCTION public.todoo_leads_milestones()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_kind TEXT;
  v_new_kind TEXT;
  v_behavior TEXT;
BEGIN
  SELECT kind INTO v_new_kind FROM public.todoo_stages WHERE id = NEW.stage_id;
  SELECT behavior INTO v_behavior FROM public.todoo_card_statuses WHERE id = NEW.card_status_id;

  IF TG_OP = 'UPDATE' THEN
    SELECT kind INTO v_old_kind FROM public.todoo_stages WHERE id = OLD.stage_id;

    -- Voltou da quarentena: nova rodada da cadência
    IF NEW.stage_id IS DISTINCT FROM OLD.stage_id AND v_old_kind = 'failed' AND v_new_kind = 'start' THEN
      NEW.cadence_round := OLD.cadence_round + 1;
    END IF;
  END IF;

  IF v_new_kind = 'attempt' AND (TG_OP = 'INSERT' OR NEW.stage_id IS DISTINCT FROM OLD.stage_id) THEN
    NEW.first_attempt_at := COALESCE(NEW.first_attempt_at, now());
  END IF;

  IF v_behavior IN ('paused', 'scheduled', 'won')
     AND (TG_OP = 'INSERT' OR NEW.card_status_id IS DISTINCT FROM OLD.card_status_id) THEN
    NEW.responded_at := COALESCE(NEW.responded_at, now());
  END IF;

  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'scheduled' THEN NEW.scheduled_at := now(); END IF;
    IF NEW.status = 'won' THEN NEW.won_at := now(); END IF;
    IF NEW.status = 'lost' THEN NEW.lost_at := now(); END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS todoo_leads_milestones ON public.todoo_leads;
CREATE TRIGGER todoo_leads_milestones
  BEFORE INSERT OR UPDATE OF stage_id, card_status_id, status ON public.todoo_leads
  FOR EACH ROW EXECUTE FUNCTION public.todoo_leads_milestones();

-- =====================================================================
-- 3. Gatilho do histórico (depois da gravação, com os valores finais)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.todoo_leads_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event TEXT;
  v_stage_changed BOOLEAN;
  v_old_stage RECORD;
  v_new_stage RECORD;
  v_old_card RECORD;
  v_new_card RECORD;
  v_due TIMESTAMPTZ;
  v_late INT;
  v_actor UUID := auth.uid();
BEGIN
  SELECT id, name, kind INTO v_new_stage FROM public.todoo_stages WHERE id = NEW.stage_id;
  SELECT id, name, behavior INTO v_new_card FROM public.todoo_card_statuses WHERE id = NEW.card_status_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.todoo_lead_history (
      lead_id, company_id, unit_id, campaign_id, origin, event, occurred_at, actor_id, round,
      to_stage_id, to_stage_name, to_stage_kind,
      to_card_status_id, to_card_status_name, to_card_behavior,
      to_status, to_assigned_user_id
    ) VALUES (
      NEW.id, NEW.company_id, NEW.unit_id, NEW.campaign_id, NEW.custom_fields->>'origem', 'created', now(), v_actor,
      NEW.cadence_round,
      NEW.stage_id, v_new_stage.name, v_new_stage.kind,
      NEW.card_status_id, v_new_card.name, v_new_card.behavior,
      NEW.status, NEW.assigned_user_id
    );
    RETURN NEW;
  END IF;

  v_stage_changed := NEW.stage_id IS DISTINCT FROM OLD.stage_id;
  IF NOT v_stage_changed
     AND NEW.card_status_id IS NOT DISTINCT FROM OLD.card_status_id
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.assigned_user_id IS NOT DISTINCT FROM OLD.assigned_user_id THEN
    RETURN NEW;
  END IF;

  SELECT id, name, kind INTO v_old_stage FROM public.todoo_stages WHERE id = OLD.stage_id;
  SELECT id, name, behavior INTO v_old_card FROM public.todoo_card_statuses WHERE id = OLD.card_status_id;

  IF v_stage_changed AND v_old_stage.kind = 'failed' AND v_new_stage.kind = 'start' THEN
    v_event := 'recycled';
    v_actor := NULL; -- volta automática da quarentena
  ELSIF v_stage_changed THEN
    v_event := 'stage_changed';
  ELSIF NEW.card_status_id IS DISTINCT FROM OLD.card_status_id OR NEW.status IS DISTINCT FROM OLD.status THEN
    v_event := 'status_changed';
  ELSE
    v_event := 'assigned';
  END IF;

  -- Prazo da tentativa que estava valendo e o atraso ao sair da etapa
  IF v_stage_changed AND v_old_stage.kind IN ('start', 'attempt') THEN
    v_due := OLD.next_action_at;
    IF v_due IS NOT NULL AND now() > v_due THEN
      v_late := EXTRACT(EPOCH FROM now() - v_due)::INT;
    ELSIF v_due IS NOT NULL THEN
      v_late := 0;
    END IF;
  END IF;

  INSERT INTO public.todoo_lead_history (
    lead_id, company_id, unit_id, campaign_id, origin, event, occurred_at, actor_id, round,
    from_stage_id, from_stage_name, from_stage_kind,
    to_stage_id, to_stage_name, to_stage_kind,
    from_card_status_id, from_card_status_name, from_card_behavior,
    to_card_status_id, to_card_status_name, to_card_behavior,
    from_status, to_status, from_assigned_user_id, to_assigned_user_id,
    seconds_in_previous_stage, due_at, late_seconds
  ) VALUES (
    NEW.id, NEW.company_id, NEW.unit_id, NEW.campaign_id, NEW.custom_fields->>'origem', v_event, now(), v_actor,
    NEW.cadence_round,
    OLD.stage_id, v_old_stage.name, v_old_stage.kind,
    NEW.stage_id, v_new_stage.name, v_new_stage.kind,
    OLD.card_status_id, v_old_card.name, v_old_card.behavior,
    NEW.card_status_id, v_new_card.name, v_new_card.behavior,
    OLD.status, NEW.status, OLD.assigned_user_id, NEW.assigned_user_id,
    CASE WHEN v_stage_changed AND OLD.stage_entered_at IS NOT NULL
         THEN EXTRACT(EPOCH FROM now() - OLD.stage_entered_at)::INT END,
    v_due, v_late
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS todoo_leads_history ON public.todoo_leads;
CREATE TRIGGER todoo_leads_history
  AFTER INSERT OR UPDATE OF stage_id, card_status_id, status, assigned_user_id ON public.todoo_leads
  FOR EACH ROW EXECUTE FUNCTION public.todoo_leads_history();

-- =====================================================================
-- 4. Histórico e marcos dos leads atuais
-- =====================================================================
-- "Entrou no funil" na data de criação, em A contatar
INSERT INTO public.todoo_lead_history (
  lead_id, company_id, unit_id, campaign_id, origin, event, occurred_at, actor_id, round,
  to_stage_id, to_stage_name, to_stage_kind, to_status, to_assigned_user_id, metadata
)
SELECT l.id, l.company_id, l.unit_id, l.campaign_id, l.custom_fields->>'origem', 'created', l.created_at, NULL, 1,
       s.id, s.name, s.kind, 'pending', l.assigned_user_id, '{"imported": true}'::jsonb
FROM public.todoo_leads l
LEFT JOIN LATERAL (
  SELECT id, name, kind FROM public.todoo_stages
  WHERE company_id = l.company_id ORDER BY (kind = 'start') DESC, position LIMIT 1
) s ON true
WHERE NOT EXISTS (SELECT 1 FROM public.todoo_lead_history h WHERE h.lead_id = l.id);

-- Movimentações de cadência já registradas pela tela
INSERT INTO public.todoo_lead_history (
  lead_id, company_id, unit_id, campaign_id, origin, event, occurred_at, actor_id, round,
  from_stage_id, from_stage_name, from_stage_kind, to_stage_id, to_stage_name, to_stage_kind, metadata
)
SELECT e.lead_id, l.company_id, l.unit_id, l.campaign_id, l.custom_fields->>'origem', 'stage_changed', e.created_at,
       e.user_id, 1,
       fs.id, fs.name, fs.kind, ts.id, ts.name, ts.kind,
       jsonb_build_object('imported', true, 'event_id', e.id)
FROM public.todoo_events e
JOIN public.todoo_leads l ON l.id = e.lead_id
LEFT JOIN public.todoo_stages fs ON fs.id::text = e.metadata->>'from'
LEFT JOIN public.todoo_stages ts ON ts.id::text = e.metadata->>'to'
WHERE e.event_type IN ('cadence_attempt', 'cadence_moved')
  AND NOT EXISTS (SELECT 1 FROM public.todoo_lead_history h
                  WHERE h.lead_id = e.lead_id AND h.metadata->>'event_id' = e.id::text);

-- Trocas de status antigas (Chamei / desfecho)
INSERT INTO public.todoo_lead_history (
  lead_id, company_id, unit_id, campaign_id, origin, event, occurred_at, actor_id, round,
  from_status, to_status, metadata
)
SELECT e.lead_id, l.company_id, l.unit_id, l.campaign_id, l.custom_fields->>'origem', 'status_changed', e.created_at,
       e.user_id, 1, e.metadata->>'from', e.metadata->>'to',
       jsonb_build_object('imported', true, 'event_id', e.id)
FROM public.todoo_events e
JOIN public.todoo_leads l ON l.id = e.lead_id
WHERE e.event_type = 'status_changed' AND e.metadata ? 'to'
  AND NOT EXISTS (SELECT 1 FROM public.todoo_lead_history h
                  WHERE h.lead_id = e.lead_id AND h.metadata->>'event_id' = e.id::text);

-- Marcos a partir do que já se sabe
UPDATE public.todoo_leads l
SET first_attempt_at = COALESCE(l.first_attempt_at, l.first_contact_at, (
      SELECT min(h.occurred_at) FROM public.todoo_lead_history h
      WHERE h.lead_id = l.id AND h.to_stage_kind = 'attempt')),
    scheduled_at = CASE WHEN l.status = 'scheduled' THEN COALESCE(l.scheduled_at, l.updated_at) ELSE l.scheduled_at END,
    won_at = CASE WHEN l.status = 'won' THEN COALESCE(l.won_at, l.completed_at, l.updated_at) ELSE l.won_at END,
    lost_at = CASE WHEN l.status = 'lost' THEN COALESCE(l.lost_at, l.completed_at, l.updated_at) ELSE l.lost_at END,
    responded_at = CASE WHEN cs.behavior IN ('paused', 'scheduled', 'won')
                        THEN COALESCE(l.responded_at, l.last_interaction_at, l.updated_at) ELSE l.responded_at END
FROM public.todoo_card_statuses cs
WHERE cs.id = l.card_status_id;
