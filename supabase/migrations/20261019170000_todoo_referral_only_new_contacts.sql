-- Indicação só de quem ainda não é contato, em todos os caminhos (formulário do Todoo e
-- "+ Indicação" do chat).
--
-- todoo_register_contacts_core: o cadastro de sempre (corpo de 20261017130000) com o corte
-- p_existing_before. Indicação de telefone que já era contato antes do corte volta em
-- "existing" e não é cadastrada. Sem permissão para usuários: só as funções abaixo chamam.
--
-- todoo_register_contacts: mesma assinatura de antes (o formulário não muda); corte = agora.
--
-- todoo_register_referral_from_message: "+ Indicação" do chat. O banco lê a mensagem do
-- cartão (empresa, unidade, cliente da conversa, hora e se o telefone está no cartão); o
-- corte é a hora do cartão quando ele tem até 7 dias, senão agora. A tela não manda mais
-- hora nem indicadora: nada disso pode ser forjado chamando a função direto.
--
-- todoo_register_chat_referral (versão da tela que ainda está no ar): continua existindo,
-- mas passa a ignorar p_before (corte = agora) até a tela nova ser publicada.
--
-- Só funções: nenhuma tabela é alterada nem travada.

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

CREATE OR REPLACE FUNCTION public.todoo_register_contacts_core(
  p_company_id UUID,
  p_origin TEXT,
  p_referrer_name TEXT,
  p_captured_by UUID,
  p_unit_id UUID,
  p_contacts JSONB,
  p_referrer_contact_id UUID,
  p_referrer_phone TEXT,
  p_existing_before TIMESTAMPTZ
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
  v_existing JSONB := '[]'::jsonb;
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

    -- Indicação é só de quem ainda não é contato. Quem já existia antes do corte (agora, ou
    -- a hora do cartão recebido no chat) não entra nem conta na meta
    IF p_origin = 'indicacao' AND EXISTS (
      SELECT 1 FROM public.contacts
      WHERE company_id = p_company_id
        AND phone = ANY (v_variants)
        AND created_at < COALESCE(p_existing_before, now())
    ) THEN
      v_existing := v_existing || jsonb_build_object('name', v_name, 'phone', v_phone);
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
    'existing', v_existing,
    'referrer_contact_id', v_referrer_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.todoo_register_contacts_core(UUID, TEXT, TEXT, UUID, UUID, JSONB, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.todoo_register_contacts_core(
    p_company_id, p_origin, p_referrer_name, p_captured_by, p_unit_id, p_contacts,
    p_referrer_contact_id, p_referrer_phone, NULL
  );
$$;

-- Versão da tela que ainda está no ar: corte = agora (a hora mandada pela tela é ignorada)
CREATE OR REPLACE FUNCTION public.todoo_register_chat_referral(
  p_company_id UUID,
  p_referrer_contact_id UUID,
  p_unit_id UUID,
  p_name TEXT,
  p_phone TEXT,
  p_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.todoo_register_contacts(
    p_company_id, 'indicacao', NULL, auth.uid(), p_unit_id,
    jsonb_build_array(jsonb_build_object('name', p_name, 'phone', p_phone, 'service', '')),
    p_referrer_contact_id, NULL
  );
  RETURN v_result || jsonb_build_object(
    'already_contact', jsonb_array_length(COALESCE(v_result->'existing', '[]'::jsonb)) > 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.todoo_register_referral_from_message(
  p_message_id UUID,
  p_name TEXT,
  p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_at TIMESTAMPTZ;
  v_sender_type TEXT;
  v_metadata JSONB;
  v_company UUID;
  v_contact UUID;
  v_unit UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT m.created_at, m.sender_type, m.metadata, cv.company_id, cv.contact_id, cv.unit_id
  INTO v_created_at, v_sender_type, v_metadata, v_company, v_contact, v_unit
  FROM public.messages m
  JOIN public.conversations cv ON cv.id = m.conversation_id
  WHERE m.id = p_message_id;

  -- Mesma resposta para "não existe" e "outra empresa": não revela mensagens alheias
  IF v_company IS NULL OR NOT (public.is_super_admin() OR v_company = public.current_company_id()) THEN
    RAISE EXCEPTION 'Mensagem não encontrada' USING ERRCODE = '42501';
  END IF;

  IF v_unit IS NOT NULL AND NOT public.can_access_company_unit(v_company, v_unit) THEN
    RAISE EXCEPTION 'Sem acesso à conversa' USING ERRCODE = '42501';
  END IF;

  IF v_sender_type <> 'contact' OR v_contact IS NULL THEN
    RAISE EXCEPTION 'Só um contato enviado pela cliente pode virar indicação';
  END IF;

  -- O telefone tem que ser um dos contatos do cartão
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_metadata->'contacts', '[]'::jsonb)) AS card(c)
    WHERE public.todoo_phone_variants(COALESCE(NULLIF(card.c->>'waid', ''), card.c->>'phone'))
          && public.todoo_phone_variants(p_phone)
  ) THEN
    RAISE EXCEPTION 'Este telefone não está no contato enviado';
  END IF;

  -- Cartão de até 7 dias: quem virou contato depois dele ainda é indicação
  RETURN public.todoo_register_contacts_core(
    v_company, 'indicacao', NULL, auth.uid(), v_unit,
    jsonb_build_array(jsonb_build_object('name', p_name, 'phone', p_phone, 'service', '')),
    v_contact, NULL,
    CASE WHEN v_created_at >= now() - interval '7 days' THEN v_created_at ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.todoo_register_referral_from_message(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.todoo_register_referral_from_message(UUID, TEXT, TEXT) TO authenticated;

COMMIT;
