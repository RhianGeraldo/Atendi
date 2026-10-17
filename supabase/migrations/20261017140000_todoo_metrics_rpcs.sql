-- Todoo: indicadores calculados no banco e cadência agendada
--
-- Antes, Gincana, Indicadores e Ações Comerciais traziam todos os leads para o navegador
-- (o PostgREST corta em 1.000 linhas) e pontuavam pelo status atual: quem agendou e depois
-- fechou perdia o agendamento, e o SLA usava sla_breached (qualquer tentativa atrasada).
--
-- - todoo_lead_facts: um fato por lead do período (contatado, agendou alguma vez, enviou
--   orçamento alguma vez, fechou, perdeu, SLA do 1º contato). SECURITY INVOKER: a RLS de
--   empresa e unidade vale como numa consulta normal.
-- - todoo_metrics / todoo_ranking / todoo_campaign_stats: agregações em cima dos fatos.
-- - SLA do 1º contato: saída de "A contatar" no prazo (histórico); sem histórico, o
--   primeiro contato ou resposta contra sla_deadline; sem contato e prazo vencido = atrasado.
-- - Cadência: todoo_run_cadence (sem checagem de usuário, só para o servidor) e
--   todoo_refresh_cadence_all, chamada pelo cron do servidor a cada 15 min.

SET lock_timeout = '3s';
SET statement_timeout = '30s';

-- =====================================================================
-- 1. Fatos por lead
-- =====================================================================
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
    (l.status <> 'pending' OR l.first_attempt_at IS NOT NULL OR l.first_contact_at IS NOT NULL),
    (l.status = 'scheduled' OR l.scheduled_at IS NOT NULL),
    (l.status = 'quoted' OR EXISTS (
      SELECT 1 FROM public.todoo_lead_history h WHERE h.lead_id = l.id AND h.to_status = 'quoted')),
    l.status = 'won',
    l.status = 'lost',
    CASE
      WHEN fe.lead_id IS NOT NULL THEN CASE WHEN COALESCE(fe.late_seconds, 0) > 0 THEN 'late' ELSE 'on_time' END
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
    WHERE h.lead_id = l.id AND h.event = 'stage_changed' AND h.from_stage_kind = 'start'
    ORDER BY h.occurred_at
    LIMIT 1
  ) fe ON true
  WHERE l.company_id = p_company_id
    AND (p_unit_id IS NULL OR l.unit_id = p_unit_id)
    AND (p_from IS NULL OR l.assigned_at >= p_from)
    AND (p_to IS NULL OR l.assigned_at < p_to);
$$;

-- =====================================================================
-- 2. Indicadores
-- =====================================================================
CREATE OR REPLACE FUNCTION public.todoo_metrics(
  p_company_id UUID,
  p_unit_id UUID DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total', count(*),
    'contacted', count(*) FILTER (WHERE f.contacted),
    'scheduled', count(*) FILTER (WHERE f.scheduled),
    'quoted', count(*) FILTER (WHERE f.quoted),
    'won', count(*) FILTER (WHERE f.won),
    'lost', count(*) FILTER (WHERE f.lost),
    'revenue', COALESCE(sum(f.revenue), 0),
    'sla_on_time', count(*) FILTER (WHERE f.sla_state = 'on_time'),
    'sla_late', count(*) FILTER (WHERE f.sla_state = 'late')
  )
  FROM public.todoo_lead_facts(p_company_id, p_unit_id, p_from, p_to) f;
$$;

-- =====================================================================
-- 3. Gincana: pontos por consultora
--    +10 fechou, +5 agendou (alguma vez), +2 orçamento (alguma vez),
--    +2 1º contato no prazo, -5 1º contato atrasado; piso 0 no total da pessoa
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
    GREATEST(0, a.won * 10 + a.scheduled * 5 + a.quoted * 2 + a.sla_on_time * 2 - a.sla_late * 5)
  FROM agg a
  JOIN public.profiles p ON p.id = a.uid
  ORDER BY 12 DESC, a.revenue DESC;
$$;

-- =====================================================================
-- 4. Ações Comerciais: números por ação
-- =====================================================================
CREATE OR REPLACE FUNCTION public.todoo_campaign_stats(
  p_company_id UUID,
  p_unit_id UUID DEFAULT NULL
)
RETURNS TABLE (
  campaign_id UUID,
  total BIGINT,
  worked BIGINT,
  won BIGINT,
  revenue NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT f.campaign_id, count(*), count(*) FILTER (WHERE f.contacted),
         count(*) FILTER (WHERE f.won), COALESCE(sum(f.revenue), 0)
  FROM public.todoo_lead_facts(p_company_id, p_unit_id, NULL, NULL) f
  GROUP BY f.campaign_id;
$$;

REVOKE ALL ON FUNCTION public.todoo_lead_facts(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.todoo_metrics(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.todoo_ranking(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.todoo_campaign_stats(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.todoo_lead_facts(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.todoo_metrics(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.todoo_ranking(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.todoo_campaign_stats(UUID, UUID) TO authenticated;

-- =====================================================================
-- 5. Cadência: rotina interna + execução para todas as empresas (cron do servidor)
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
      -- Só recicla quem esgotou as tentativas (card ativo) ou ficou sem interesse.
      -- Comprou, Agendado e Em conversa ficam onde estão.
      AND NOT EXISTS (
        SELECT 1 FROM public.todoo_card_statuses cs
        WHERE cs.id = l.card_status_id AND cs.behavior NOT IN ('active', 'lost')
      )
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

-- Chamada pelo usuário ao abrir o Quadro e o Meu Dia (cria o funil de uma empresa nova)
CREATE OR REPLACE FUNCTION public.todoo_refresh_cadence(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_super_admin() OR p_company_id = public.current_company_id()) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa' USING ERRCODE = '42501';
  END IF;

  RETURN public.todoo_run_cadence(p_company_id);
END;
$$;

-- Cron do servidor: só empresas que já usam o Todoo (têm funil)
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
  v_breached INT := 0;
  v_companies INT := 0;
BEGIN
  FOR v_company IN SELECT DISTINCT company_id FROM public.todoo_stages LOOP
    v_result := public.todoo_run_cadence(v_company);
    v_recycled := v_recycled + (v_result->>'recycled')::INT;
    v_breached := v_breached + (v_result->>'breached')::INT;
    v_companies := v_companies + 1;
  END LOOP;
  RETURN jsonb_build_object('companies', v_companies, 'recycled', v_recycled, 'breached', v_breached);
END;
$$;

REVOKE ALL ON FUNCTION public.todoo_run_cadence(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.todoo_refresh_cadence_all() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.todoo_refresh_cadence_all() TO service_role;
REVOKE ALL ON FUNCTION public.todoo_refresh_cadence(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.todoo_refresh_cadence(UUID) TO authenticated;
