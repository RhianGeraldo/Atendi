-- Todoo: regras de produto (Fase 5 do plano de correções)
--
-- 1. Redistribuição por SLA (a opção existia na ação, mas nada a usava):
--    lead ainda em "A contatar", card ativo, ação ativa com a opção ligada e prazo do
--    1º contato vencido passa, uma única vez, para outra participante da ação com acesso à
--    unidade do lead (a que tem menos leads abertos na ação). O prazo recomeça com o SLA da
--    ação e a nova dona recebe uma notificação.
--    - Só vale para prazos que vencerem depois de ligar (todoo_campaigns.redistribute_since).
--    - Indicações e Prospecção Ativa (ações automáticas do cadastro) ficam desligadas:
--      o lead é de quem captou. A coluna passa a vir desligada por padrão.
-- 2. Ação pausada ou concluída: a cadência não corre (sem volta da quarentena, sem atraso,
--    sem redistribuição). O Quadro e o Meu Dia deixam de mostrar os leads dela.
-- 3. Quarentena: volta para "A contatar" só quem esgotou as tentativas (card ativo).
--    Quem ficou "Sem interesse" fica em Sem sucesso até alguém mover (ações próprias).
-- 4. Gincana: 1º contato atrasado vale -2 (era -5).

SET lock_timeout = '3s';
SET statement_timeout = '30s';

-- =====================================================================
-- 1. Colunas
-- =====================================================================
ALTER TABLE public.todoo_campaigns
  ADD COLUMN IF NOT EXISTS redistribute_since TIMESTAMPTZ;

ALTER TABLE public.todoo_campaigns
  ALTER COLUMN redistribute_on_sla_breach SET DEFAULT false;

ALTER TABLE public.todoo_leads
  ADD COLUMN IF NOT EXISTS redistributed_at TIMESTAMPTZ;

-- Ações automáticas do cadastro: o lead é de quem captou
UPDATE public.todoo_campaigns
SET redistribute_on_sla_breach = false, redistribute_since = NULL
WHERE type IN ('mgm_referral', 'prospecting') AND redistribute_on_sla_breach;

-- Demais ações já marcadas: valem a partir de agora (prazos já vencidos não mudam de dona)
UPDATE public.todoo_campaigns
SET redistribute_since = now()
WHERE redistribute_on_sla_breach AND redistribute_since IS NULL;

-- Ligou a opção: guarda quando (o front também envia; isto cobre qualquer caminho)
CREATE OR REPLACE FUNCTION public.todoo_campaigns_redistribute_since()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.redistribute_on_sla_breach
     AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.redistribute_on_sla_breach, false)) THEN
    NEW.redistribute_since := now();
  ELSIF NOT NEW.redistribute_on_sla_breach THEN
    NEW.redistribute_since := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS todoo_campaigns_redistribute_since ON public.todoo_campaigns;
CREATE TRIGGER todoo_campaigns_redistribute_since
  BEFORE INSERT OR UPDATE OF redistribute_on_sla_breach ON public.todoo_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.todoo_campaigns_redistribute_since();

-- =====================================================================
-- 2. Redistribuição
-- =====================================================================
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

REVOKE ALL ON FUNCTION public.todoo_redistribute_breached(UUID) FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- 3. Cadência: só ações ativas; quarentena só para quem esgotou as tentativas
-- =====================================================================
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
    AND l.next_action_at < now();
  GET DIAGNOSTICS v_breached = ROW_COUNT;

  RETURN jsonb_build_object('recycled', v_recycled, 'redistributed', v_redistributed, 'breached', v_breached);
END;
$$;

CREATE OR REPLACE FUNCTION public.todoo_refresh_cadence_all()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_result JSONB;
  v_recycled INT := 0;
  v_redistributed INT := 0;
  v_breached INT := 0;
  v_companies INT := 0;
BEGIN
  FOR v_company IN SELECT DISTINCT company_id FROM public.todoo_stages LOOP
    v_result := public.todoo_run_cadence(v_company);
    v_recycled := v_recycled + (v_result->>'recycled')::INT;
    v_redistributed := v_redistributed + (v_result->>'redistributed')::INT;
    v_breached := v_breached + (v_result->>'breached')::INT;
    v_companies := v_companies + 1;
  END LOOP;
  RETURN jsonb_build_object('companies', v_companies, 'recycled', v_recycled,
                            'redistributed', v_redistributed, 'breached', v_breached);
END;
$$;

REVOKE ALL ON FUNCTION public.todoo_run_cadence(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.todoo_refresh_cadence_all() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.todoo_refresh_cadence_all() TO service_role;

-- =====================================================================
-- 4. Gincana: 1º contato atrasado vale -2
-- =====================================================================
CREATE OR REPLACE FUNCTION public.todoo_ranking(
  p_company_id UUID,
  p_unit_id UUID DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  user_id UUID,
  user_name TEXT,
  user_avatar TEXT,
  assigned BIGINT,
  contacted BIGINT,
  scheduled BIGINT,
  quoted BIGINT,
  won BIGINT,
  revenue NUMERIC,
  sla_on_time BIGINT,
  sla_late BIGINT,
  points BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH agg AS (
    SELECT
      f.assigned_user_id AS uid,
      count(*) AS assigned,
      count(*) FILTER (WHERE f.contacted) AS contacted,
      count(*) FILTER (WHERE f.scheduled) AS scheduled,
      count(*) FILTER (WHERE f.quoted) AS quoted,
      count(*) FILTER (WHERE f.won) AS won,
      COALESCE(sum(f.revenue), 0) AS revenue,
      count(*) FILTER (WHERE f.sla_state = 'on_time') AS sla_on_time,
      count(*) FILTER (WHERE f.sla_state = 'late') AS sla_late
    FROM public.todoo_lead_facts(p_company_id, p_unit_id, p_from, p_to) f
    WHERE f.assigned_user_id IS NOT NULL
    GROUP BY f.assigned_user_id
  )
  SELECT
    a.uid, COALESCE(p.name, 'Consultora'), p.avatar_url,
    a.assigned, a.contacted, a.scheduled, a.quoted, a.won, a.revenue, a.sla_on_time, a.sla_late,
    GREATEST(0, a.won * 10 + a.scheduled * 5 + a.quoted * 2 + a.sla_on_time * 2 - a.sla_late * 2)
  FROM agg a
  JOIN public.profiles p ON p.id = a.uid
  ORDER BY 12 DESC, a.revenue DESC;
$$;
