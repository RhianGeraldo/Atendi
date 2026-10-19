-- Todoo: proteções da cadência
-- - A volta automática da quarentena (Sem sucesso → A contatar) só vale para card ativo
--   ou perdido. Antes, um lead que ficou em Sem sucesso e depois virou "Comprou",
--   "Agendado" ou "Em conversa" voltava para A contatar com status pending e
--   outcome_type NULL: a venda sumia das métricas e da Gincana.
-- - todoo_ensure_pipeline trava por empresa: dois acessos simultâneos numa empresa nova
--   criavam as etapas e os status em dobro.
-- Só substitui funções: sem DDL de tabela e sem update em massa.

SET lock_timeout = '3s';
SET statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.todoo_ensure_pipeline(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Uma criação por empresa por vez (solto ao fim da transação)
  PERFORM pg_advisory_xact_lock(hashtext('todoo_pipeline:' || p_company_id::text));

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

REVOKE ALL ON FUNCTION public.todoo_ensure_pipeline(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.todoo_refresh_cadence(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.todoo_refresh_cadence(UUID) TO authenticated;
