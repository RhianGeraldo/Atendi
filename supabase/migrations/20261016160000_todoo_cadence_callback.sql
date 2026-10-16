-- Todoo: retorno combinado (status callback) pausa a cadência
-- O status do card passa para o primeiro status "Pausa a cadência" (Em conversa).

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
    -- (retorno combinado pausa a cadência até a data marcada)
    IF v_status_changed AND NOT v_card_changed AND NEW.status IN ('scheduled', 'won', 'lost', 'callback') THEN
      SELECT id INTO NEW.card_status_id FROM public.todoo_card_statuses
      WHERE company_id = NEW.company_id
        AND behavior = CASE NEW.status WHEN 'callback' THEN 'paused' ELSE NEW.status END
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
