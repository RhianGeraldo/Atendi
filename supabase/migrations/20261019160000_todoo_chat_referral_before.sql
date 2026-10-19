-- "+ Indicação": "já é contato" passa a valer só para quem existia ANTES de o cartão de
-- contato chegar no chat. Se a atendente abre a conversa com a indicada ("Iniciar Conversa")
-- ou ela manda mensagem antes do clique, o contato nasce depois do cartão e a indicação
-- continua valendo (antes ela se perdia de vez).
--
-- Novo parâmetro p_before nas duas funções de 20261019150000_todoo_chat_referral.sql:
-- troca de assinatura, então DROP + CREATE na mesma transação (sem sobrecarga ambígua).
-- Só funções: nenhuma tabela é alterada nem travada.

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

DROP FUNCTION IF EXISTS public.todoo_register_chat_referral(UUID, UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.todoo_phone_is_contact(UUID, TEXT);

CREATE FUNCTION public.todoo_phone_is_contact(
  p_company_id UUID,
  p_phone TEXT,
  p_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  IF p_company_id IS NULL OR NOT (public.is_super_admin() OR p_company_id = public.current_company_id()) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa' USING ERRCODE = '42501';
  END IF;

  IF length(v_digits) < 10 THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.contacts
    WHERE company_id = p_company_id
      AND phone = ANY (public.todoo_phone_variants(v_digits))
      AND (p_before IS NULL OR created_at < p_before)
  );
END;
$$;

CREATE FUNCTION public.todoo_register_chat_referral(
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
BEGIN
  -- todoo_register_contacts confere login e empresa de novo; aqui a checagem vem antes
  -- para não revelar se o telefone existe em outra empresa
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  IF p_company_id IS NULL OR NOT (public.is_super_admin() OR p_company_id = public.current_company_id()) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa' USING ERRCODE = '42501';
  END IF;

  -- Mesma trava de todoo_register_contacts: dois cliques juntos não passam os dois
  PERFORM pg_advisory_xact_lock(hashtext('todoo_register:' || p_company_id::text));

  -- p_before: horário em que o cartão chegou; contato criado depois dele não bloqueia
  IF public.todoo_phone_is_contact(p_company_id, p_phone, p_before) THEN
    RETURN jsonb_build_object('created', 0, 'duplicates', '[]'::jsonb, 'already_contact', true);
  END IF;

  RETURN public.todoo_register_contacts(
    p_company_id,
    'indicacao',
    NULL,
    auth.uid(),
    p_unit_id,
    jsonb_build_array(jsonb_build_object('name', p_name, 'phone', p_phone, 'service', '')),
    p_referrer_contact_id,
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.todoo_phone_is_contact(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.todoo_phone_is_contact(UUID, TEXT, TIMESTAMPTZ) TO authenticated;

REVOKE ALL ON FUNCTION public.todoo_register_chat_referral(UUID, UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.todoo_register_chat_referral(UUID, UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;

COMMIT;
