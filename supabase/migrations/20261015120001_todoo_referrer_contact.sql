-- Todoo: cadastro de indicação ligado ao contato da cliente que indicou
--
-- - todoo_register_contacts ganha p_referrer_contact_id e p_referrer_phone.
-- - Indicação exige a indicadora como contato: escolhida na base (p_referrer_contact_id)
--   ou informada com nome + WhatsApp (procura pelo telefone e cria o contato se não existir).
-- - Grava referrer_contact_id/referrer_phone em todoo_referrals e indicadora_id no lead.
-- - Sem unidade escolhida, a indicada herda a unidade da indicadora (se o usuário tiver acesso).
-- - Os parâmetros novos têm DEFAULT, então a chamada antiga (6 parâmetros) segue funcionando.

SET lock_timeout = '3s';
SET statement_timeout = '60s';

DROP FUNCTION IF EXISTS public.todoo_register_contacts(UUID, TEXT, TEXT, UUID, UUID, JSONB);

-- Variantes do telefone: com/sem 55 e com/sem o 9 (mesma regra do cadastro)
CREATE OR REPLACE FUNCTION public.todoo_phone_variants(p_phone TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_digits TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  v_phone TEXT;
  v_variants TEXT[];
BEGIN
  v_phone := CASE WHEN length(v_digits) IN (10, 11) THEN '55' || v_digits ELSE v_digits END;
  v_variants := ARRAY[v_phone, substr(v_phone, 3)];
  IF length(v_phone) = 13 THEN
    v_variants := v_variants || ARRAY[substr(v_phone, 1, 4) || substr(v_phone, 6)];
    v_variants := v_variants || ARRAY[substr(v_phone, 3, 2) || substr(v_phone, 6)];
  ELSIF length(v_phone) = 12 THEN
    v_variants := v_variants || ARRAY[substr(v_phone, 1, 4) || '9' || substr(v_phone, 5)];
    v_variants := v_variants || ARRAY[substr(v_phone, 3, 2) || '9' || substr(v_phone, 5)];
  END IF;
  RETURN v_variants;
END;
$$;

-- p_contacts: [{ "name": "...", "phone": "...", "service": "..." }]
-- Indicação: p_referrer_contact_id (contato da base) OU p_referrer_name + p_referrer_phone.
-- Retorno: { "created": n, "duplicates": [{ "name", "phone" }], "referrer_contact_id": uuid }
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

REVOKE ALL ON FUNCTION public.todoo_phone_variants(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.todoo_phone_variants(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.todoo_register_contacts(UUID, TEXT, TEXT, UUID, UUID, JSONB, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.todoo_register_contacts(UUID, TEXT, TEXT, UUID, UUID, JSONB, UUID, TEXT) TO authenticated;
