-- Todoo: proteções do cadastro de contatos e das notificações
--
-- todoo_register_contacts (mesma assinatura de 20261015120001_todoo_referrer_contact.sql):
-- - Trava por empresa: duplo clique ou duas consultoras cadastrando o mesmo telefone
--   criavam dois contatos/leads/cadastros (a meta contava em dobro).
-- - Indicadora de uma unidade que o usuário não acessa: o nome e o telefone salvos não
--   são mais copiados para o cadastro/lead (antes, digitar um telefone revelava o nome).
-- - Unidade de quem captou só é usada se o usuário tiver acesso a ela.
--
-- notifications: sem INSERT para usuários. Só o servidor (service role) cria notificações
-- (routing.ts, transfer-notifications.ts); antes qualquer usuário podia criar notificação
-- com título e link arbitrários para qualquer pessoa da empresa, exibida em tempo real.
--
-- Índices nas chaves estrangeiras do Todoo (tabelas pequenas; nada em contacts).

SET lock_timeout = '3s';
SET statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.todoo_register_contacts(
  p_company_id UUID,
  p_origin TEXT,
  p_referrer_name TEXT,
  p_captured_by UUID,
  p_unit_id UUID,
  p_contacts JSONB,
  p_referrer_contact_id UUID DEFAULT NULL,
  p_referrer_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_referrer TEXT := NULLIF(btrim(COALESCE(p_referrer_name, '')), '');
  v_referrer_id UUID;
  v_referrer_phone TEXT;
  v_referrer_unit UUID;
  v_unit UUID := p_unit_id;
  v_campaign UUID;
  v_item JSONB;
  v_name TEXT;
  v_service TEXT;
  v_digits TEXT;
  v_phone TEXT;
  v_variants TEXT[];
  v_contact UUID;
  v_merged UUID;
  v_lead UUID;
  v_created INT := 0;
  v_duplicates JSONB := '[]'::jsonb;
  v_source_details TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.is_super_admin() OR p_company_id = public.current_company_id()) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa' USING ERRCODE = '42501';
  END IF;

  -- Um cadastro por empresa por vez: sem isso, duplo clique ou duas consultoras com o
  -- mesmo telefone passavam juntos pela checagem de duplicidade (e criavam a ação contínua em dobro)
  PERFORM pg_advisory_xact_lock(hashtext('todoo_register:' || p_company_id::text));

  IF p_origin NOT IN ('prospeccao', 'indicacao') THEN
    RAISE EXCEPTION 'Origem inválida: %', p_origin;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_captured_by AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'Usuário que captou não pertence à empresa';
  END IF;

  IF v_unit IS NOT NULL AND NOT public.can_access_company_unit(p_company_id, v_unit) THEN
    RAISE EXCEPTION 'Sem acesso à unidade selecionada' USING ERRCODE = '42501';
  END IF;

  -- Indicadora: contato escolhido na base ou nome + WhatsApp (acha pelo telefone ou cria)
  IF p_origin = 'indicacao' THEN
    IF p_referrer_contact_id IS NOT NULL THEN
      SELECT COALESCE(merged_into_id, id) INTO v_referrer_id
      FROM public.contacts
      WHERE id = p_referrer_contact_id AND company_id = p_company_id;

      IF v_referrer_id IS NULL THEN
        RAISE EXCEPTION 'Cliente indicadora não encontrada nesta empresa';
      END IF;
    ELSE
      v_digits := regexp_replace(COALESCE(p_referrer_phone, ''), '\D', '', 'g');
      IF v_referrer IS NULL OR length(v_digits) < 10 THEN
        RAISE EXCEPTION 'Informe o nome e o WhatsApp com DDD da cliente que indicou';
      END IF;

      v_variants := public.todoo_phone_variants(v_digits);
      SELECT COALESCE(merged_into_id, id) INTO v_referrer_id
      FROM public.contacts
      WHERE company_id = p_company_id
        AND phone = ANY (v_variants)
      ORDER BY (merged_into_id IS NULL) DESC, created_at
      LIMIT 1;

      IF v_referrer_id IS NULL THEN
        INSERT INTO public.contacts (company_id, unit_id, name, phone, created_by)
        VALUES (p_company_id, v_unit, v_referrer, v_variants[1], v_uid)
        RETURNING id INTO v_referrer_id;
      END IF;
    END IF;

    SELECT NULLIF(btrim(COALESCE(name, '')), ''), phone, unit_id
    INTO v_referrer, v_referrer_phone, v_referrer_unit
    FROM public.contacts
    WHERE id = v_referrer_id;

    -- Contato de uma unidade que o usuário não acessa: usa o que foi digitado, sem revelar
    -- o nome e o telefone salvos
    IF v_referrer_unit IS NOT NULL AND NOT public.can_access_company_unit(p_company_id, v_referrer_unit) THEN
      v_referrer := NULLIF(btrim(COALESCE(p_referrer_name, '')), '');
      v_referrer_phone := CASE WHEN length(v_digits) >= 10 THEN v_variants[1] END;
      v_referrer_unit := NULL;
    END IF;

    v_referrer := COALESCE(v_referrer, NULLIF(btrim(COALESCE(p_referrer_name, '')), ''), v_referrer_phone, 'Cliente');
  END IF;

  -- Unidade: a informada > unidade da indicadora > unidade única de quem captou > Rede
  IF v_unit IS NULL AND v_referrer_unit IS NOT NULL
     AND public.can_access_company_unit(p_company_id, v_referrer_unit) THEN
    v_unit := v_referrer_unit;
  END IF;

  IF v_unit IS NULL THEN
    SELECT CASE WHEN count(*) = 1 THEN (array_agg(unit_id))[1] END
    INTO v_unit
    FROM public.user_units
    WHERE user_id = p_captured_by;

    IF v_unit IS NOT NULL AND NOT public.can_access_company_unit(p_company_id, v_unit) THEN
      v_unit := NULL;
    END IF;
  END IF;

  -- Campanha contínua da origem (geral da empresa)
  SELECT id INTO v_campaign
  FROM public.todoo_campaigns
  WHERE company_id = p_company_id
    AND type = CASE p_origin WHEN 'indicacao' THEN 'mgm_referral' ELSE 'prospecting' END
    AND status = 'active'
    AND unit_id IS NULL
  ORDER BY created_at
  LIMIT 1;

  IF v_campaign IS NULL THEN
    INSERT INTO public.todoo_campaigns (
      company_id, title, description, type, source_type, status, sla_hours,
      distribution_mode, message_template, created_by
    ) VALUES (
      p_company_id,
      CASE p_origin WHEN 'indicacao' THEN 'Indicações' ELSE 'Prospecção Ativa' END,
      CASE p_origin
        WHEN 'indicacao' THEN 'Contatos indicados por clientes, cadastrados pela equipe.'
        ELSE 'Contatos captados em prospecção ativa pela equipe.'
      END,
      CASE p_origin WHEN 'indicacao' THEN 'mgm_referral' ELSE 'prospecting' END,
      'manual', 'active', 24, 'fixed_user',
      CASE p_origin
        WHEN 'indicacao' THEN 'Olá {primeiro_nome}! Tudo bem? Aqui é a {consultora}. A {indicadora} indicou você para conhecer a clínica. Posso te contar como funciona e já reservar um horário de avaliação?'
        ELSE 'Olá {primeiro_nome}! Tudo bem? Aqui é a {consultora}, da clínica. Posso te contar como funcionam nossos tratamentos e reservar um horário de avaliação?'
      END,
      v_uid
    )
    RETURNING id INTO v_campaign;
  END IF;

  v_source_details := CASE WHEN p_origin = 'indicacao' THEN v_referrer END;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_contacts, '[]'::jsonb))
  LOOP
    v_name := NULLIF(btrim(COALESCE(v_item->>'name', '')), '');
    v_service := NULLIF(btrim(COALESCE(v_item->>'service', '')), '');
    v_digits := regexp_replace(COALESCE(v_item->>'phone', ''), '\D', '', 'g');

    IF v_name IS NULL OR length(v_digits) < 10 THEN
      RAISE EXCEPTION 'Contato inválido: informe nome e WhatsApp com DDD (%)', COALESCE(v_name, v_item->>'phone');
    END IF;

    v_variants := public.todoo_phone_variants(v_digits);
    v_phone := v_variants[1];

    v_contact := NULL;
    v_merged := NULL;
    SELECT id, merged_into_id INTO v_contact, v_merged
    FROM public.contacts
    WHERE company_id = p_company_id
      AND phone = ANY (v_variants)
    ORDER BY (merged_into_id IS NULL) DESC, created_at
    LIMIT 1;

    IF v_merged IS NOT NULL THEN
      v_contact := v_merged;
    END IF;

    IF v_referrer_id IS NOT NULL AND v_contact = v_referrer_id THEN
      RAISE EXCEPTION 'A cliente que indicou não pode ser indicada por ela mesma (%)', v_name;
    END IF;

    -- Mesma pessoa já cadastrada no Todoo: não conta de novo
    IF EXISTS (
      SELECT 1 FROM public.todoo_referrals
      WHERE company_id = p_company_id
        AND (
          (v_contact IS NOT NULL AND referred_contact_id = v_contact)
          OR referred_phone = ANY (v_variants)
        )
    ) THEN
      v_duplicates := v_duplicates || jsonb_build_object('name', v_name, 'phone', v_phone);
      CONTINUE;
    END IF;

    IF v_contact IS NULL THEN
      INSERT INTO public.contacts (company_id, unit_id, name, phone, source, source_details, created_by)
      VALUES (
        p_company_id, v_unit, v_name, v_phone,
        CASE p_origin WHEN 'indicacao' THEN 'Indicação' ELSE 'Prospecção Ativa' END,
        v_source_details, v_uid
      )
      RETURNING id INTO v_contact;
    END IF;

    INSERT INTO public.todoo_leads (
      campaign_id, company_id, unit_id, contact_id, contact_name, contact_phone,
      assigned_user_id, assigned_at, sla_deadline, status, custom_fields
    ) VALUES (
      v_campaign, p_company_id, v_unit, v_contact, v_name, v_phone,
      p_captured_by, now(), now() + interval '24 hours', 'pending',
      jsonb_strip_nulls(jsonb_build_object(
        'origem', CASE p_origin WHEN 'indicacao' THEN 'Indicação' ELSE 'Prospecção Ativa' END,
        'indicadora', v_referrer,
        'indicadora_id', v_referrer_id,
        'servico', v_service
      ))
    )
    RETURNING id INTO v_lead;

    INSERT INTO public.todoo_referrals (
      company_id, unit_id, origin, referrer_name, referrer_contact_id, referrer_phone,
      referred_contact_id, referred_name, referred_phone, interested_service,
      captured_by_user_id, lead_id
    ) VALUES (
      p_company_id, v_unit, p_origin, CASE WHEN p_origin = 'indicacao' THEN v_referrer END,
      v_referrer_id, v_referrer_phone,
      v_contact, v_name, v_phone, v_service, p_captured_by, v_lead
    );

    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'created', v_created,
    'duplicates', v_duplicates,
    'referrer_contact_id', v_referrer_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.todoo_register_contacts(UUID, TEXT, TEXT, UUID, UUID, JSONB, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.todoo_register_contacts(UUID, TEXT, TEXT, UUID, UUID, JSONB, UUID, TEXT) TO authenticated;

DROP POLICY IF EXISTS "Users can insert notifications" ON public.notifications;

CREATE INDEX IF NOT EXISTS idx_todoo_referrals_referred_contact ON public.todoo_referrals (referred_contact_id);
CREATE INDEX IF NOT EXISTS idx_todoo_referrals_referrer_contact ON public.todoo_referrals (referrer_contact_id);
CREATE INDEX IF NOT EXISTS idx_todoo_leads_stage ON public.todoo_leads (stage_id);
CREATE INDEX IF NOT EXISTS idx_todoo_leads_card_status ON public.todoo_leads (card_status_id);
