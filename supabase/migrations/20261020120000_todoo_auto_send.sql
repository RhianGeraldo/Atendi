-- Todoo: envio automático da cadência
--
-- Cada unidade liga o seu envio automático com um número de WhatsApp só para isso. Cada
-- etapa de tentativa tem variações de mensagem (sorteadas no envio, podendo valer para
-- todas as ações ou para uma só). Os cards vencidos entram numa fila por unidade, que sai
-- um contato por vez no intervalo, no horário e nos dias configurados.
--
-- - todoo_auto_units: configuração por unidade (desligada até alguém ligar).
-- - todoo_auto_messages: variações por etapa.
-- - todoo_auto_queue: fila e histórico dos envios (um por card, etapa e rodada).
-- - todoo_auto_enqueue / todoo_auto_claim / todoo_auto_complete: chamados pelo servidor.
--
-- Envio automático não conta como trabalho da consultora: com o flag de sessão
-- todoo.auto, as triggers não marcam first_attempt_at, first_contact_at, responded_at nem
-- last_interaction_at, e o histórico grava automated = true (fora do ranking e do prazo).
--
-- Tabelas novas; nas existentes só todoo_lead_history ganha uma coluna com default
-- constante (sem reescrita da tabela).

SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- =====================================================================
-- 1. Flag de sessão do envio automático
-- =====================================================================
CREATE OR REPLACE FUNCTION public.todoo_is_auto()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(current_setting('todoo.auto', true), '') = 'on';
$$;

ALTER TABLE public.todoo_lead_history
  ADD COLUMN IF NOT EXISTS automated BOOLEAN NOT NULL DEFAULT false;

-- =====================================================================
-- 2. Tabelas
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.todoo_auto_units (
  unit_id UUID PRIMARY KEY REFERENCES public.units(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  -- Número de WhatsApp só do envio automático (da própria unidade)
  instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  -- Intervalo entre um contato e o próximo: sorteado entre o mínimo e o máximo
  interval_min_seconds INT NOT NULL DEFAULT 120 CHECK (interval_min_seconds >= 30),
  interval_max_seconds INT NOT NULL DEFAULT 180,
  -- Horário de Brasília em que pode enviar e dias da semana (0 = domingo)
  window_start TIME NOT NULL DEFAULT '08:00',
  window_end TIME NOT NULL DEFAULT '19:00',
  weekdays SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  daily_limit INT CHECK (daily_limit IS NULL OR daily_limit > 0),
  next_send_at TIMESTAMPTZ,
  enabled_at TIMESTAMPTZ,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (interval_max_seconds >= interval_min_seconds),
  CHECK (window_end > window_start)
);

CREATE INDEX IF NOT EXISTS todoo_auto_units_company_idx ON public.todoo_auto_units (company_id);

CREATE TABLE IF NOT EXISTS public.todoo_auto_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.todoo_stages(id) ON DELETE CASCADE,
  -- Vazio: vale para todas as ações. Com ação: só para ela (e tem preferência no sorteio)
  campaign_id UUID REFERENCES public.todoo_campaigns(id) ON DELETE CASCADE,
  content TEXT,
  media_type TEXT CHECK (media_type IN ('image', 'video', 'audio', 'document')),
  media_url TEXT,
  media_name TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (NULLIF(btrim(content), '') IS NOT NULL OR media_url IS NOT NULL),
  CHECK ((media_type IS NULL) = (media_url IS NULL))
);

CREATE INDEX IF NOT EXISTS todoo_auto_messages_stage_idx ON public.todoo_auto_messages (stage_id) WHERE active;
CREATE INDEX IF NOT EXISTS todoo_auto_messages_company_idx ON public.todoo_auto_messages (company_id);

CREATE TABLE IF NOT EXISTS public.todoo_auto_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.todoo_leads(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES public.todoo_stages(id) ON DELETE SET NULL,
  to_stage_id UUID NOT NULL REFERENCES public.todoo_stages(id) ON DELETE CASCADE,
  round INT NOT NULL DEFAULT 1,
  -- pending: na fila | sending: saindo | sent | skipped (não precisava) | canceled (card
  -- mudou antes) | failed (erro depois de 3 tentativas)
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'skipped', 'canceled', 'failed')),
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INT NOT NULL DEFAULT 0,
  message_id UUID REFERENCES public.todoo_auto_messages(id) ON DELETE SET NULL,
  content_sent TEXT,
  instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

-- Um envio por card, etapa e rodada (pulado ou cancelado pode voltar à fila)
CREATE UNIQUE INDEX IF NOT EXISTS todoo_auto_queue_once_idx
  ON public.todoo_auto_queue (lead_id, to_stage_id, round)
  WHERE status IN ('pending', 'sending', 'sent', 'failed');
CREATE INDEX IF NOT EXISTS todoo_auto_queue_next_idx
  ON public.todoo_auto_queue (unit_id, scheduled_for, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS todoo_auto_queue_open_lead_idx
  ON public.todoo_auto_queue (lead_id) WHERE status IN ('pending', 'sending');
CREATE INDEX IF NOT EXISTS todoo_auto_queue_unit_sent_idx
  ON public.todoo_auto_queue (unit_id, finished_at) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS todoo_auto_queue_company_idx
  ON public.todoo_auto_queue (company_id, created_at DESC);

-- =====================================================================
-- 3. Acesso: a empresa lê; só administradora configura; a fila só o servidor escreve
-- =====================================================================
ALTER TABLE public.todoo_auto_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todoo_auto_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todoo_auto_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS todoo_auto_units_select ON public.todoo_auto_units;
CREATE POLICY todoo_auto_units_select ON public.todoo_auto_units
  FOR SELECT USING (
    (SELECT public.is_super_admin()) OR company_id = (SELECT public.current_company_id())
  );

DROP POLICY IF EXISTS todoo_auto_units_write ON public.todoo_auto_units;
CREATE POLICY todoo_auto_units_write ON public.todoo_auto_units
  FOR ALL USING (
    (SELECT public.is_super_admin())
    OR (company_id = (SELECT public.current_company_id()) AND (SELECT public.current_role()) = 'admin_company')
  ) WITH CHECK (
    ((SELECT public.is_super_admin())
     OR (company_id = (SELECT public.current_company_id()) AND (SELECT public.current_role()) = 'admin_company'))
    -- Unidade e número da mesma empresa (e o número da própria unidade)
    AND EXISTS (SELECT 1 FROM public.units u WHERE u.id = todoo_auto_units.unit_id AND u.company_id = todoo_auto_units.company_id)
    AND (todoo_auto_units.instance_id IS NULL OR EXISTS (
      SELECT 1 FROM public.whatsapp_instances wi
      WHERE wi.id = todoo_auto_units.instance_id AND wi.company_id = todoo_auto_units.company_id AND wi.unit_id = todoo_auto_units.unit_id))
  );

DROP POLICY IF EXISTS todoo_auto_messages_select ON public.todoo_auto_messages;
CREATE POLICY todoo_auto_messages_select ON public.todoo_auto_messages
  FOR SELECT USING (
    (SELECT public.is_super_admin()) OR company_id = (SELECT public.current_company_id())
  );

DROP POLICY IF EXISTS todoo_auto_messages_write ON public.todoo_auto_messages;
CREATE POLICY todoo_auto_messages_write ON public.todoo_auto_messages
  FOR ALL USING (
    (SELECT public.is_super_admin())
    OR (company_id = (SELECT public.current_company_id()) AND (SELECT public.current_role()) = 'admin_company')
  ) WITH CHECK (
    ((SELECT public.is_super_admin())
     OR (company_id = (SELECT public.current_company_id()) AND (SELECT public.current_role()) = 'admin_company'))
    AND EXISTS (SELECT 1 FROM public.todoo_stages s
                WHERE s.id = todoo_auto_messages.stage_id AND s.company_id = todoo_auto_messages.company_id)
    AND (todoo_auto_messages.campaign_id IS NULL OR EXISTS (
      SELECT 1 FROM public.todoo_campaigns c
      WHERE c.id = todoo_auto_messages.campaign_id AND c.company_id = todoo_auto_messages.company_id))
  );

DROP POLICY IF EXISTS todoo_auto_queue_select ON public.todoo_auto_queue;
CREATE POLICY todoo_auto_queue_select ON public.todoo_auto_queue
  FOR SELECT USING (
    (SELECT public.is_super_admin()) OR company_id = (SELECT public.current_company_id())
  );

REVOKE ALL ON public.todoo_auto_units, public.todoo_auto_messages, public.todoo_auto_queue FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.todoo_auto_units, public.todoo_auto_messages TO authenticated;
REVOKE ALL ON public.todoo_auto_queue FROM authenticated;
GRANT SELECT ON public.todoo_auto_queue TO authenticated;
GRANT ALL ON public.todoo_auto_units, public.todoo_auto_messages, public.todoo_auto_queue TO service_role;

-- =====================================================================
-- 4. Triggers e rotinas existentes: envio automático fora das métricas da consultora
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

    -- Tentativa feita: conta como trabalho do dia (a automática não conta)
    IF TG_OP = 'UPDATE' AND v_kind = 'attempt' AND NOT public.todoo_is_auto() THEN
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

  IF v_new_kind = 'attempt' AND NOT public.todoo_is_auto() AND (TG_OP = 'INSERT' OR NEW.stage_id IS DISTINCT FROM OLD.stage_id) THEN
    NEW.first_attempt_at := COALESCE(NEW.first_attempt_at, now());
  END IF;

  IF v_behavior IN ('paused', 'scheduled', 'won') AND NOT public.todoo_is_auto()
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
      lead_id, company_id, unit_id, campaign_id, origin, event, occurred_at, actor_id, round, automated,
      to_stage_id, to_stage_name, to_stage_kind,
      to_card_status_id, to_card_status_name, to_card_behavior,
      to_status, to_assigned_user_id
    ) VALUES (
      NEW.id, NEW.company_id, NEW.unit_id, NEW.campaign_id, NEW.custom_fields->>'origem', 'created', now(), v_actor,
      NEW.cadence_round, public.todoo_is_auto(),
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
    lead_id, company_id, unit_id, campaign_id, origin, event, occurred_at, actor_id, round, automated,
    from_stage_id, from_stage_name, from_stage_kind,
    to_stage_id, to_stage_name, to_stage_kind,
    from_card_status_id, from_card_status_name, from_card_behavior,
    to_card_status_id, to_card_status_name, to_card_behavior,
    from_status, to_status, from_assigned_user_id, to_assigned_user_id,
    seconds_in_previous_stage, due_at, late_seconds
  ) VALUES (
    NEW.id, NEW.company_id, NEW.unit_id, NEW.campaign_id, NEW.custom_fields->>'origem', v_event, now(), v_actor,
    NEW.cadence_round, public.todoo_is_auto(),
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

CREATE OR REPLACE FUNCTION public.todoo_run_cadence(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start UUID;
  v_default UUID;
  v_recycled INT := 0;
  v_redistributed INT := 0;
  v_breached INT := 0;
BEGIN
  PERFORM public.todoo_ensure_pipeline(p_company_id);
  -- Unidades com envio automático: cards vencidos entram na fila antes de contar atraso
  PERFORM public.todoo_auto_enqueue(p_company_id);

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
      -- Só quem esgotou as tentativas sem resposta (card ativo). "Sem interesse", Comprou,
      -- Agendado e Em conversa ficam onde estão.
      AND NOT EXISTS (
        SELECT 1 FROM public.todoo_card_statuses cs
        WHERE cs.id = l.card_status_id AND cs.behavior <> 'active'
      )
      AND EXISTS (
        SELECT 1 FROM public.todoo_campaigns c WHERE c.id = l.campaign_id AND c.status = 'active'
      )
    RETURNING l.id, l.campaign_id, l.company_id
  ), ev AS (
    INSERT INTO public.todoo_events (lead_id, campaign_id, company_id, event_type, notes)
    SELECT id, campaign_id, company_id, 'cadence_restarted', 'Quarentena de Sem sucesso terminou: voltou para A contatar'
    FROM recycled
    RETURNING 1
  )
  SELECT count(*) INTO v_recycled FROM ev;

  v_redistributed := public.todoo_redistribute_breached(p_company_id);

  UPDATE public.todoo_leads l
  SET sla_breached = true
  FROM public.todoo_card_statuses cs, public.todoo_campaigns c
  WHERE l.company_id = p_company_id
    AND cs.id = l.card_status_id
    AND cs.behavior = 'active'
    AND c.id = l.campaign_id
    AND c.status = 'active'
    AND NOT l.sla_breached
    AND l.next_action_at IS NOT NULL
    AND l.next_action_at < now()
    -- Na fila do envio automático: o atraso não é da consultora
    AND NOT EXISTS (
      SELECT 1 FROM public.todoo_auto_queue q
      WHERE q.lead_id = l.id AND q.status IN ('pending', 'sending')
    );
  GET DIAGNOSTICS v_breached = ROW_COUNT;

  RETURN jsonb_build_object('recycled', v_recycled, 'redistributed', v_redistributed, 'breached', v_breached);
END;
$$;

CREATE OR REPLACE FUNCTION public.todoo_redistribute_breached(p_company_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_new UUID;
  v_count INT := 0;
BEGIN
  FOR r IN
    SELECT l.id, l.campaign_id, l.company_id, l.unit_id, l.assigned_user_id, l.contact_name,
           c.sla_hours, c.title
    FROM public.todoo_leads l
    JOIN public.todoo_campaigns c ON c.id = l.campaign_id
    JOIN public.todoo_stages s ON s.id = l.stage_id
    JOIN public.todoo_card_statuses cs ON cs.id = l.card_status_id
    WHERE l.company_id = p_company_id
      AND c.status = 'active'
      AND c.redistribute_on_sla_breach
      AND c.redistribute_since IS NOT NULL
      AND s.kind = 'start'
      AND cs.behavior = 'active'
      AND l.redistributed_at IS NULL
      AND l.sla_deadline IS NOT NULL
      AND l.sla_deadline < now()
      AND l.sla_deadline >= c.redistribute_since
      -- Na fila do envio automático: a mensagem sai sozinha, não troca de consultora
      AND NOT EXISTS (
        SELECT 1 FROM public.todoo_auto_queue q
        WHERE q.lead_id = l.id AND q.status IN ('pending', 'sending')
      )
    ORDER BY l.sla_deadline
    FOR UPDATE OF l SKIP LOCKED
  LOOP
    -- Participantes da ação (já receberam leads dela), ativas, com acesso à unidade do lead;
    -- vai para quem tem menos leads abertos na ação
    SELECT p.id INTO v_new
    FROM public.profiles p
    WHERE p.company_id = r.company_id
      AND p.active IS NOT FALSE
      AND p.id IS DISTINCT FROM r.assigned_user_id
      AND p.id IN (
        SELECT DISTINCT x.assigned_user_id FROM public.todoo_leads x
        WHERE x.campaign_id = r.campaign_id AND x.assigned_user_id IS NOT NULL
      )
      AND (
        p.role IN ('admin_company', 'super_admin')
        OR (r.unit_id IS NULL AND COALESCE(p.has_matriz_access, false))
        OR (r.unit_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.user_units uu WHERE uu.user_id = p.id AND uu.unit_id = r.unit_id))
      )
    ORDER BY (
      SELECT count(*) FROM public.todoo_leads o
      WHERE o.campaign_id = r.campaign_id AND o.assigned_user_id = p.id
        AND o.status NOT IN ('won', 'lost')
    ), p.name
    LIMIT 1;

    -- Ninguém apto: fica com a dona atual (tenta de novo na próxima rodada)
    CONTINUE WHEN v_new IS NULL;

    UPDATE public.todoo_leads
    SET assigned_user_id = v_new,
        redistributed_at = now(),
        sla_deadline = now() + make_interval(hours => COALESCE(r.sla_hours, 24)),
        next_action_at = now() + make_interval(hours => COALESCE(r.sla_hours, 24)),
        sla_breached = false,
        updated_at = now()
    WHERE id = r.id;

    INSERT INTO public.todoo_events (lead_id, campaign_id, company_id, event_type, notes, metadata)
    VALUES (r.id, r.campaign_id, r.company_id, 'redistributed_sla',
            'Prazo do 1º contato expirou: lead passou para outra consultora',
            jsonb_build_object('from', r.assigned_user_id, 'to', v_new));

    INSERT INTO public.notifications (company_id, user_id, type, title, message, link)
    VALUES (r.company_id, v_new, 'todoo_redistributed', 'Novo lead no Todoo',
            format('%s (ação %s) passou para você porque o prazo do 1º contato expirou.',
                   COALESCE(r.contact_name, 'Um contato'), r.title),
            '/todoo');

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.todoo_lead_facts(
  p_company_id UUID,
  p_unit_id UUID DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  lead_id UUID,
  campaign_id UUID,
  unit_id UUID,
  assigned_user_id UUID,
  status TEXT,
  revenue NUMERIC,
  contacted BOOLEAN,
  scheduled BOOLEAN,
  quoted BOOLEAN,
  won BOOLEAN,
  lost BOOLEAN,
  sla_state TEXT -- on_time | late | open
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.campaign_id,
    l.unit_id,
    l.assigned_user_id,
    l.status,
    CASE WHEN l.status = 'won' THEN COALESCE(l.outcome_value, 0) ELSE 0 END,
    -- Contato feito pela consultora: a mensagem automática também deixa o status em
    -- 'contacted', mas não marca first_attempt_at, first_contact_at nem responded_at
    (l.status NOT IN ('pending', 'contacted') OR l.first_attempt_at IS NOT NULL
     OR l.first_contact_at IS NOT NULL OR l.responded_at IS NOT NULL),
    (l.status = 'scheduled' OR l.scheduled_at IS NOT NULL),
    (l.status = 'quoted' OR EXISTS (
      SELECT 1 FROM public.todoo_lead_history h WHERE h.lead_id = l.id AND h.to_status = 'quoted')),
    l.status = 'won',
    l.status = 'lost',
    CASE
      WHEN fe.lead_id IS NOT NULL THEN CASE WHEN COALESCE(fe.late_seconds, 0) > 0 THEN 'late' ELSE 'on_time' END
      -- 1º contato feito pelo envio automático: fora do prazo da consultora
      WHEN EXISTS (
        SELECT 1 FROM public.todoo_lead_history ha
        WHERE ha.lead_id = l.id AND ha.event = 'stage_changed' AND ha.from_stage_kind = 'start' AND ha.automated
      ) THEN 'open'
      WHEN COALESCE(l.first_contact_at, l.first_attempt_at, l.responded_at) IS NOT NULL THEN
        CASE WHEN l.sla_deadline IS NOT NULL
                  AND COALESCE(l.first_contact_at, l.first_attempt_at, l.responded_at) > l.sla_deadline
             THEN 'late' ELSE 'on_time' END
      WHEN l.sla_deadline IS NOT NULL AND l.sla_deadline < now() THEN 'late'
      ELSE 'open'
    END
  FROM public.todoo_leads l
  LEFT JOIN LATERAL (
    -- Primeira saída de "A contatar": o 1º contato da cadência
    SELECT h.lead_id, h.late_seconds
    FROM public.todoo_lead_history h
    WHERE h.lead_id = l.id AND h.event = 'stage_changed' AND h.from_stage_kind = 'start' AND NOT h.automated
    ORDER BY h.occurred_at
    LIMIT 1
  ) fe ON true
  WHERE l.company_id = p_company_id
    AND (p_unit_id IS NULL OR l.unit_id = p_unit_id)
    AND (p_from IS NULL OR l.assigned_at >= p_from)
    AND (p_to IS NULL OR l.assigned_at < p_to);
$$;

-- =====================================================================
-- 5. Card mudou por fora (consultora moveu, pausou, fechou): tira da fila
-- =====================================================================
CREATE OR REPLACE FUNCTION public.todoo_auto_cancel_stale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A própria baixa do envio automático move o card: não cancela nada
  IF public.todoo_is_auto() THEN
    RETURN NEW;
  END IF;
  UPDATE public.todoo_auto_queue
  SET status = 'canceled', reason = 'O card mudou antes do envio', finished_at = now()
  WHERE lead_id = NEW.id AND status = 'pending';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS todoo_auto_cancel_stale ON public.todoo_leads;
CREATE TRIGGER todoo_auto_cancel_stale
  AFTER UPDATE OF stage_id, card_status_id, status, unit_id ON public.todoo_leads
  FOR EACH ROW
  WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id
        OR OLD.card_status_id IS DISTINCT FROM NEW.card_status_id
        OR OLD.status IS DISTINCT FROM NEW.status
        OR OLD.unit_id IS DISTINCT FROM NEW.unit_id)
  EXECUTE FUNCTION public.todoo_auto_cancel_stale();

-- =====================================================================
-- 6. Fila: cards vencidos das unidades ligadas
-- =====================================================================
-- "A contatar" entra na hora; tentativa entra quando vence a espera dela. Só entra quem
-- tem mensagem cadastrada para a próxima etapa (sem mensagem, o card segue manual).
-- Depois da última tentativa automática, a espera vencida leva o card para Sem sucesso.
CREATE OR REPLACE FUNCTION public.todoo_auto_enqueue(p_company_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queued INT := 0;
  v_failed INT := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.todoo_auto_units
    WHERE company_id = p_company_id AND enabled AND instance_id IS NOT NULL
  ) THEN
    RETURN 0;
  END IF;

  WITH cand AS (
    SELECT l.id AS lead_id, l.company_id, l.unit_id, l.campaign_id, l.stage_id,
           l.cadence_round, n.id AS to_stage_id, n.kind AS to_kind
    FROM public.todoo_leads l
    JOIN public.todoo_auto_units u ON u.unit_id = l.unit_id AND u.enabled AND u.instance_id IS NOT NULL
    JOIN public.todoo_campaigns c ON c.id = l.campaign_id AND c.status = 'active'
    JOIN public.todoo_stages s ON s.id = l.stage_id
    JOIN LATERAL (
      SELECT n.id, n.kind FROM public.todoo_stages n
      WHERE n.company_id = l.company_id AND n.position > s.position
      ORDER BY n.position LIMIT 1
    ) n ON true
    WHERE l.company_id = p_company_id
      AND l.status NOT IN ('won', 'lost')
      AND NOT EXISTS (
        SELECT 1 FROM public.todoo_card_statuses cs
        WHERE cs.id = l.card_status_id AND cs.behavior <> 'active'
      )
      AND (s.kind = 'start'
           OR (s.kind = 'attempt' AND l.next_action_at IS NOT NULL AND l.next_action_at <= now()))
  )
  INSERT INTO public.todoo_auto_queue (company_id, unit_id, lead_id, from_stage_id, to_stage_id, round)
  SELECT cand.company_id, cand.unit_id, cand.lead_id, cand.stage_id, cand.to_stage_id, cand.cadence_round
  FROM cand
  WHERE cand.to_kind = 'attempt'
    AND EXISTS (
      SELECT 1 FROM public.todoo_auto_messages m
      WHERE m.stage_id = cand.to_stage_id AND m.active
        AND (m.campaign_id IS NULL OR m.campaign_id = cand.campaign_id)
    )
  ON CONFLICT (lead_id, to_stage_id, round) WHERE status IN ('pending', 'sending', 'sent', 'failed')
  DO NOTHING;
  GET DIAGNOSTICS v_queued = ROW_COUNT;

  -- Tentativas automáticas esgotadas: a espera da última venceu sem resposta
  PERFORM set_config('todoo.auto', 'on', true);
  WITH moved AS (
    UPDATE public.todoo_leads l
    SET stage_id = x.to_stage_id, updated_at = now()
    FROM (
      SELECT l2.id, n.id AS to_stage_id
      FROM public.todoo_leads l2
      JOIN public.todoo_auto_units u ON u.unit_id = l2.unit_id AND u.enabled AND u.instance_id IS NOT NULL
      JOIN public.todoo_campaigns c ON c.id = l2.campaign_id AND c.status = 'active'
      JOIN public.todoo_stages s ON s.id = l2.stage_id AND s.kind = 'attempt'
      JOIN LATERAL (
        SELECT n.id, n.kind FROM public.todoo_stages n
        WHERE n.company_id = l2.company_id AND n.position > s.position
        ORDER BY n.position LIMIT 1
      ) n ON n.kind = 'failed'
      WHERE l2.company_id = p_company_id
        AND l2.status NOT IN ('won', 'lost')
        AND l2.next_action_at IS NOT NULL
        AND l2.next_action_at <= now()
        AND NOT EXISTS (
          SELECT 1 FROM public.todoo_card_statuses cs
          WHERE cs.id = l2.card_status_id AND cs.behavior <> 'active'
        )
        -- Só quem chegou na etapa atual pelo envio automático
        AND EXISTS (
          SELECT 1 FROM public.todoo_auto_queue q
          WHERE q.lead_id = l2.id AND q.to_stage_id = l2.stage_id
            AND q.round = l2.cadence_round AND q.status = 'sent'
        )
      FOR UPDATE OF l2 SKIP LOCKED
    ) x
    WHERE l.id = x.id
    RETURNING l.id, l.campaign_id, l.company_id
  ), ev AS (
    INSERT INTO public.todoo_events (lead_id, campaign_id, company_id, event_type, notes, metadata)
    SELECT id, campaign_id, company_id, 'cadence_moved',
           'Tentativas automáticas sem resposta: foi para Sem sucesso',
           jsonb_build_object('auto', true)
    FROM moved
    RETURNING 1
  )
  SELECT count(*) INTO v_failed FROM ev;
  PERFORM set_config('todoo.auto', 'off', true);

  RETURN v_queued + v_failed;
END;
$$;

CREATE OR REPLACE FUNCTION public.todoo_auto_enqueue_all()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_total INT := 0;
BEGIN
  FOR v_company IN
    SELECT DISTINCT company_id FROM public.todoo_auto_units WHERE enabled AND instance_id IS NOT NULL
  LOOP
    v_total := v_total + public.todoo_auto_enqueue(v_company);
  END LOOP;
  RETURN v_total;
END;
$$;

-- =====================================================================
-- 7. Próximo envio de cada unidade (um contato por unidade por chamada)
-- =====================================================================
-- Confere de novo o card e a conversa antes de liberar:
-- - card mudou de etapa, pausou, fechou ou trocou de unidade: pula;
-- - a cliente respondeu desde que o card entrou na etapa: pausa o card e pula;
-- - conversa em atendimento agora (ativa ou aguardando, com mensagem nas últimas 12h): adia 2h.
-- Devolve o que o servidor precisa para enviar; a mensagem sai depois, fora desta transação.
CREATE OR REPLACE FUNCTION public.todoo_auto_claim()
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u RECORD;
  q RECORD;
  l RECORD;
  v_msg RECORD;
  v_local TIMESTAMP := now() AT TIME ZONE 'America/Sao_Paulo';
  v_day_start TIMESTAMPTZ := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_contacts UUID[];
  v_paused UUID;
  v_tries INT;
BEGIN
  -- Envio que ficou "saindo" (servidor caiu no meio): não reenvia, para não duplicar
  UPDATE public.todoo_auto_queue
  SET status = 'failed', reason = 'Envio interrompido: confira a conversa', finished_at = now()
  WHERE status = 'sending' AND claimed_at < now() - interval '15 minutes';

  FOR u IN
    SELECT au.*, wi.id AS wi_id
    FROM public.todoo_auto_units au
    JOIN public.whatsapp_instances wi
      ON wi.id = au.instance_id AND wi.company_id = au.company_id AND wi.unit_id = au.unit_id
    WHERE au.enabled
      AND (au.next_send_at IS NULL OR au.next_send_at <= now())
      AND EXTRACT(DOW FROM v_local)::INT = ANY (au.weekdays)
      AND v_local::TIME >= au.window_start
      AND v_local::TIME < au.window_end
    FOR UPDATE OF au SKIP LOCKED
  LOOP
    IF u.daily_limit IS NOT NULL AND (
      SELECT count(*) FROM public.todoo_auto_queue x
      WHERE x.unit_id = u.unit_id
        AND ((x.status = 'sent' AND x.finished_at >= v_day_start) OR x.status = 'sending')
    ) >= u.daily_limit THEN
      CONTINUE;
    END IF;

    v_tries := 0;
    LOOP
      v_tries := v_tries + 1;
      EXIT WHEN v_tries > 25;

      SELECT * INTO q FROM public.todoo_auto_queue x
      WHERE x.unit_id = u.unit_id AND x.status = 'pending' AND x.scheduled_for <= now()
      ORDER BY x.scheduled_for, x.created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED;
      EXIT WHEN NOT FOUND;

      SELECT ld.*, c.status AS campaign_status, c.title AS campaign_title,
             cs.behavior AS card_behavior, p.name AS consultant_name, un.name AS unit_name
      INTO l
      FROM public.todoo_leads ld
      JOIN public.todoo_campaigns c ON c.id = ld.campaign_id
      LEFT JOIN public.todoo_card_statuses cs ON cs.id = ld.card_status_id
      LEFT JOIN public.profiles p ON p.id = ld.assigned_user_id
      LEFT JOIN public.units un ON un.id = ld.unit_id
      WHERE ld.id = q.lead_id
      FOR UPDATE OF ld;

      IF NOT FOUND
         OR l.stage_id IS DISTINCT FROM q.from_stage_id
         OR l.cadence_round <> q.round
         OR l.unit_id IS DISTINCT FROM u.unit_id
         OR l.status IN ('won', 'lost')
         OR l.campaign_status <> 'active'
         OR COALESCE(l.card_behavior, 'active') <> 'active' THEN
        UPDATE public.todoo_auto_queue
        SET status = 'canceled', reason = 'O card mudou antes do envio', finished_at = now()
        WHERE id = q.id;
        CONTINUE;
      END IF;

      -- Contatos com esse telefone (e os mesclados), em qualquer unidade da empresa
      SELECT array_agg(DISTINCT x.id) INTO v_contacts
      FROM (
        SELECT ct.id FROM public.contacts ct
        WHERE ct.company_id = l.company_id
          AND (ct.phone = ANY (public.todoo_phone_variants(l.contact_phone)) OR ct.id = l.contact_id)
        UNION
        SELECT ct.merged_into_id FROM public.contacts ct
        WHERE ct.company_id = l.company_id AND ct.merged_into_id IS NOT NULL
          AND (ct.phone = ANY (public.todoo_phone_variants(l.contact_phone)) OR ct.id = l.contact_id)
      ) x;

      IF v_contacts IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.conversations cv
        JOIN public.messages m ON m.conversation_id = cv.id
        WHERE cv.contact_id = ANY (v_contacts)
          AND m.sender_type = 'contact'
          AND m.created_at > COALESCE(l.stage_entered_at, l.created_at)
      ) THEN
        -- Respondeu: a cadência pausa (status "respondeu" do quadro) e a consultora assume
        SELECT id INTO v_paused FROM public.todoo_card_statuses
        WHERE company_id = l.company_id AND behavior = 'paused'
        ORDER BY is_default DESC, position LIMIT 1;
        UPDATE public.todoo_auto_queue
        SET status = 'skipped', reason = 'A cliente respondeu: cadência pausada', finished_at = now()
        WHERE id = q.id;
        IF v_paused IS NOT NULL THEN
          PERFORM set_config('todoo.auto', 'on', true);
          UPDATE public.todoo_leads SET card_status_id = v_paused, updated_at = now() WHERE id = l.id;
          PERFORM set_config('todoo.auto', 'off', true);
          INSERT INTO public.todoo_events (lead_id, campaign_id, company_id, event_type, notes, metadata)
          VALUES (l.id, l.campaign_id, l.company_id, 'cadence_paused',
                  'A cliente respondeu: envio automático parou', jsonb_build_object('auto', true));
        END IF;
        CONTINUE;
      END IF;

      IF v_contacts IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.conversations cv
        WHERE cv.contact_id = ANY (v_contacts)
          AND cv.status IN ('active', 'waiting')
          AND cv.last_message_at > now() - interval '12 hours'
      ) THEN
        UPDATE public.todoo_auto_queue
        SET scheduled_for = now() + interval '2 hours', reason = 'Conversa em atendimento: adiado'
        WHERE id = q.id;
        CONTINUE;
      END IF;

      -- Sorteia a variação: as da ação têm preferência sobre as gerais
      SELECT m.* INTO v_msg FROM public.todoo_auto_messages m
      WHERE m.stage_id = q.to_stage_id AND m.active
        AND (m.campaign_id = l.campaign_id OR m.campaign_id IS NULL)
      ORDER BY (m.campaign_id IS NULL), random()
      LIMIT 1;

      IF NOT FOUND THEN
        UPDATE public.todoo_auto_queue
        SET status = 'skipped', reason = 'Etapa sem mensagem ativa', finished_at = now()
        WHERE id = q.id;
        CONTINUE;
      END IF;

      UPDATE public.todoo_auto_queue
      SET status = 'sending', claimed_at = now(), attempts = attempts + 1,
          message_id = v_msg.id, instance_id = u.instance_id, reason = NULL
      WHERE id = q.id;

      UPDATE public.todoo_auto_units
      SET next_send_at = now() + make_interval(secs => u.interval_min_seconds
            + floor(random() * (u.interval_max_seconds - u.interval_min_seconds + 1)))
      WHERE unit_id = u.unit_id;

      RETURN NEXT jsonb_build_object(
        'queue_id', q.id,
        'lead_id', l.id,
        'company_id', l.company_id,
        'unit_id', u.unit_id,
        'unit_name', l.unit_name,
        'instance_id', u.instance_id,
        'contact_id', l.contact_id,
        'contact_name', l.contact_name,
        'contact_phone', l.contact_phone,
        'campaign_title', l.campaign_title,
        'consultant_name', l.consultant_name,
        'referrer_name', l.custom_fields->>'indicadora',
        'message_id', v_msg.id,
        'content', v_msg.content,
        'media_type', v_msg.media_type,
        'media_url', v_msg.media_url,
        'media_name', v_msg.media_name
      );
      EXIT;
    END LOOP;
  END LOOP;
END;
$$;

-- =====================================================================
-- 8. Resultado do envio: avança o card ou devolve à fila
-- =====================================================================
CREATE OR REPLACE FUNCTION public.todoo_auto_complete(
  p_queue_id UUID,
  p_ok BOOLEAN,
  p_error TEXT DEFAULT NULL,
  p_conversation_id UUID DEFAULT NULL,
  p_content TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q RECORD;
  v_stage_name TEXT;
BEGIN
  SELECT * INTO q FROM public.todoo_auto_queue WHERE id = p_queue_id AND status = 'sending' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT p_ok THEN
    -- Até 3 tentativas, de 15 em 15 minutos; depois fica para a consultora
    UPDATE public.todoo_auto_queue
    SET status = CASE WHEN q.attempts >= 3 THEN 'failed' ELSE 'pending' END,
        scheduled_for = now() + interval '15 minutes',
        reason = left(COALESCE(p_error, 'Erro no envio'), 500),
        finished_at = CASE WHEN q.attempts >= 3 THEN now() END
    WHERE id = q.id;
    RETURN;
  END IF;

  UPDATE public.todoo_auto_queue
  SET status = 'sent', finished_at = now(), conversation_id = p_conversation_id,
      content_sent = p_content, reason = NULL
  WHERE id = q.id;

  SELECT name INTO v_stage_name FROM public.todoo_stages WHERE id = q.to_stage_id;

  -- Mesmo caminho do "Registrar tentativa", marcado como automático
  PERFORM set_config('todoo.auto', 'on', true);
  UPDATE public.todoo_leads
  SET stage_id = q.to_stage_id, updated_at = now()
  WHERE id = q.lead_id AND stage_id IS NOT DISTINCT FROM q.from_stage_id;
  PERFORM set_config('todoo.auto', 'off', true);

  INSERT INTO public.todoo_events (lead_id, campaign_id, company_id, event_type, notes, metadata)
  SELECT l.id, l.campaign_id, l.company_id, 'cadence_attempt',
         format('Mensagem automática: %s', COALESCE(v_stage_name, 'tentativa')),
         jsonb_build_object('auto', true, 'queue_id', q.id, 'from', q.from_stage_id,
                            'to', q.to_stage_id, 'conversation_id', p_conversation_id)
  FROM public.todoo_leads l WHERE l.id = q.lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.todoo_auto_enqueue(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.todoo_auto_enqueue_all() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.todoo_auto_claim() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.todoo_auto_complete(UUID, BOOLEAN, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.todoo_auto_cancel_stale() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.todoo_auto_enqueue_all() TO service_role;
GRANT EXECUTE ON FUNCTION public.todoo_auto_claim() TO service_role;
GRANT EXECUTE ON FUNCTION public.todoo_auto_complete(UUID, BOOLEAN, TEXT, UUID, TEXT) TO service_role;
