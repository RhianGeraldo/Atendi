-- Todoo: ajustes da cadência e do histórico
-- - Status "quoted" (orçamento enviado) pausa a cadência, como o retorno combinado.
-- - Histórico grava quem fez só se a pessoa tiver perfil: um usuário sem perfil
--   não pode fazer a alteração do lead falhar pela chave estrangeira.

SET lock_timeout = '3s';
SET statement_timeout = '30s';

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
    -- (retorno combinado e orçamento enviado pausam a cadência)
    IF v_status_changed AND NOT v_card_changed AND NEW.status IN ('scheduled', 'won', 'lost', 'callback', 'quoted') THEN
      SELECT id INTO NEW.card_status_id FROM public.todoo_card_statuses
      WHERE company_id = NEW.company_id
        AND behavior = CASE WHEN NEW.status IN ('callback', 'quoted') THEN 'paused' ELSE NEW.status END
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
  -- Só quem tem perfil (o histórico nunca pode bloquear a alteração do lead)
  v_actor UUID := (SELECT p.id FROM public.profiles p WHERE p.id = auth.uid());
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
