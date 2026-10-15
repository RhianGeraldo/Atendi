-- Todoo: "Indicações & Metas" vira "Cadastros & Metas"
--
-- Regras:
-- - Cada cadastro de contato tem origem: prospecção ativa ou indicação.
--   Indicação exige o nome da cliente que indicou.
-- - Sem voucher e sem recompensa da indicadora (colunas removidas).
-- - O status do cadastro vem do lead do Quadro Comercial (lead_id), não de
--   uma cópia na própria tabela.
-- - Meta de cadastros por consultora, diária ou mensal (todoo_goals.contacts_period).
-- - Cadastro feito pela RPC todoo_register_contacts: contato + cadastro + lead
--   numa única transação, com telefone normalizado e sem duplicar a mesma pessoa.

SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- =====================================================================
-- 1. Campanhas: tipo "prospecting" e campanha automática de indicação sem voucher
-- =====================================================================
ALTER TABLE public.todoo_campaigns DROP CONSTRAINT IF EXISTS todoo_campaigns_type_check;
ALTER TABLE public.todoo_campaigns ADD CONSTRAINT todoo_campaigns_type_check CHECK (type IN (
  'retention_saldo',
  'upsell_zones',
  'reactivation',
  'mgm_referral',
  'prospecting',
  'quote_followup',
  'birthday',
  'custom'
));

UPDATE public.todoo_campaigns
SET title = 'Indicações',
    description = 'Contatos indicados por clientes, cadastrados pela equipe.',
    message_template = 'Olá {primeiro_nome}! Tudo bem? Aqui é a {consultora}. A {indicadora} indicou você para conhecer a clínica. Posso te contar como funciona e já reservar um horário de avaliação?',
    offer_details = NULL,
    updated_at = now()
WHERE type = 'mgm_referral'
  AND title = 'Desafio 3 Amigas (Leads Indicados)';

-- =====================================================================
-- 2. Cadastros (todoo_referrals)
-- =====================================================================
ALTER TABLE public.todoo_referrals
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'indicacao',
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.todoo_leads(id) ON DELETE SET NULL;

ALTER TABLE public.todoo_referrals ALTER COLUMN referrer_name DROP NOT NULL;

ALTER TABLE public.todoo_referrals DROP CONSTRAINT IF EXISTS todoo_referrals_origin_check;
ALTER TABLE public.todoo_referrals ADD CONSTRAINT todoo_referrals_origin_check CHECK (
  origin IN ('prospeccao', 'indicacao')
  AND (origin <> 'indicacao' OR NULLIF(btrim(referrer_name), '') IS NOT NULL)
);

-- Liga os cadastros antigos ao lead criado junto com eles
UPDATE public.todoo_referrals r
SET lead_id = (
  SELECT l.id FROM public.todoo_leads l
  JOIN public.todoo_campaigns c ON c.id = l.campaign_id
  WHERE l.company_id = r.company_id
    AND l.contact_id = r.referred_contact_id
    AND c.type = 'mgm_referral'
  ORDER BY abs(extract(epoch FROM l.created_at - r.created_at))
  LIMIT 1
)
WHERE r.lead_id IS NULL AND r.referred_contact_id IS NOT NULL;

ALTER TABLE public.todoo_referrals
  DROP COLUMN IF EXISTS voucher_code,
  DROP COLUMN IF EXISTS voucher_value,
  DROP COLUMN IF EXISTS reward_status,
  DROP COLUMN IF EXISTS reward_details,
  DROP COLUMN IF EXISTS status;

DROP INDEX IF EXISTS public.idx_todoo_referrals_status;
CREATE INDEX IF NOT EXISTS idx_todoo_referrals_lead ON public.todoo_referrals (lead_id);
CREATE INDEX IF NOT EXISTS idx_todoo_referrals_company_created ON public.todoo_referrals (company_id, created_at DESC);

-- Contatos criados pelo Todoo antigo usavam uma origem fora da lista da empresa
UPDATE public.contacts c
SET source = 'Indicação',
    source_details = r.referrer_name
FROM public.todoo_referrals r
WHERE r.referred_contact_id = c.id
  AND c.source = 'Indicado por Cliente';

-- =====================================================================
-- 3. Metas: período da meta de cadastros
-- =====================================================================
ALTER TABLE public.todoo_goals
  ADD COLUMN IF NOT EXISTS contacts_period TEXT NOT NULL DEFAULT 'monthly';

ALTER TABLE public.todoo_goals DROP CONSTRAINT IF EXISTS todoo_goals_contacts_period_check;
ALTER TABLE public.todoo_goals ADD CONSTRAINT todoo_goals_contacts_period_check
  CHECK (contacts_period IN ('daily', 'monthly'));

-- =====================================================================
-- 4. RPC de cadastro
-- =====================================================================
-- p_contacts: [{ "name": "...", "phone": "...", "service": "..." }]
-- Retorno: { "created": n, "duplicates": [{ "name", "phone" }] }
CREATE OR REPLACE FUNCTION public.todoo_register_contacts(
  p_company_id UUID,
  p_origin TEXT,
  p_referrer_name TEXT,
  p_captured_by UUID,
  p_unit_id UUID,
  p_contacts JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_referrer TEXT := NULLIF(btrim(COALESCE(p_referrer_name, '')), '');
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

  IF p_origin = 'indicacao' AND v_referrer IS NULL THEN
    RAISE EXCEPTION 'Informe o nome da cliente que indicou';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_captured_by AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'Usuário que captou não pertence à empresa';
  END IF;

  -- Unidade: a informada (se o usuário tiver acesso) > unidade única de quem captou > Rede
  IF v_unit IS NOT NULL AND NOT public.can_access_company_unit(p_company_id, v_unit) THEN
    RAISE EXCEPTION 'Sem acesso à unidade selecionada' USING ERRCODE = '42501';
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

    -- Normaliza para 55 + DDD + número e monta as variantes com/sem 55 e com/sem o 9
    v_phone := CASE WHEN length(v_digits) IN (10, 11) THEN '55' || v_digits ELSE v_digits END;
    v_variants := ARRAY[v_phone, substr(v_phone, 3)];
    IF length(v_phone) = 13 THEN
      v_variants := v_variants || ARRAY[substr(v_phone, 1, 4) || substr(v_phone, 6)];
      v_variants := v_variants || ARRAY[substr(v_phone, 3, 2) || substr(v_phone, 6)];
    ELSIF length(v_phone) = 12 THEN
      v_variants := v_variants || ARRAY[substr(v_phone, 1, 4) || '9' || substr(v_phone, 5)];
      v_variants := v_variants || ARRAY[substr(v_phone, 3, 2) || '9' || substr(v_phone, 5)];
    END IF;

    v_contact := NULL;
    SELECT id, merged_into_id INTO v_contact, v_merged
    FROM public.contacts
    WHERE company_id = p_company_id
      AND phone = ANY (v_variants)
    ORDER BY (merged_into_id IS NULL) DESC, created_at
    LIMIT 1;

    IF v_merged IS NOT NULL THEN
      v_contact := v_merged;
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
        'servico', v_service
      ))
    )
    RETURNING id INTO v_lead;

    INSERT INTO public.todoo_referrals (
      company_id, unit_id, origin, referrer_name, referred_contact_id, referred_name,
      referred_phone, interested_service, captured_by_user_id, lead_id
    ) VALUES (
      p_company_id, v_unit, p_origin, CASE WHEN p_origin = 'indicacao' THEN v_referrer END,
      v_contact, v_name, v_phone, v_service, p_captured_by, v_lead
    );

    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'duplicates', v_duplicates);
END;
$$;

REVOKE ALL ON FUNCTION public.todoo_register_contacts(UUID, TEXT, TEXT, UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.todoo_register_contacts(UUID, TEXT, TEXT, UUID, UUID, JSONB) TO authenticated;
