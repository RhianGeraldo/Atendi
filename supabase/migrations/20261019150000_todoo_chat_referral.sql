-- "+ Indicação" no contato recebido pelo chat: só vale para quem ainda não é contato.
--
-- todoo_phone_is_contact: diz se o telefone já existe na empresa (qualquer unidade, inclusive
-- contato mesclado), sem revelar nome nem unidade. A tela usa para esconder o botão; o RLS
-- de contacts não deixa a atendente ver contatos de outras unidades.
--
-- todoo_register_chat_referral: mesma checagem no salvamento (nem um clique por fora conta
-- quem já é contato) e depois o cadastro normal de todoo_register_contacts.
--
-- Só funções novas: nenhuma tabela é alterada nem travada.

SET lock_timeout = '3s';
SET statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.todoo_phone_is_contact(p_company_id UUID, p_phone TEXT)
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

  IF NOT (public.is_super_admin() OR p_company_id = public.current_company_id()) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa' USING ERRCODE = '42501';
  END IF;

  IF length(v_digits) < 10 THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.contacts
    WHERE company_id = p_company_id
      AND phone = ANY (public.todoo_phone_variants(v_digits))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.todoo_register_chat_referral(
  p_company_id UUID,
  p_referrer_contact_id UUID,
  p_unit_id UUID,
  p_name TEXT,
  p_phone TEXT
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

  IF NOT (public.is_super_admin() OR p_company_id = public.current_company_id()) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa' USING ERRCODE = '42501';
  END IF;

  -- Mesma trava de todoo_register_contacts: dois cliques juntos não passam os dois
  PERFORM pg_advisory_xact_lock(hashtext('todoo_register:' || p_company_id::text));

  IF public.todoo_phone_is_contact(p_company_id, p_phone) THEN
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

REVOKE ALL ON FUNCTION public.todoo_phone_is_contact(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.todoo_phone_is_contact(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.todoo_register_chat_referral(UUID, UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.todoo_register_chat_referral(UUID, UUID, UUID, TEXT, TEXT) TO authenticated;
