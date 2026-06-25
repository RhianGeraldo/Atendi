-- ============================================================
-- FIX: Permitir que o super_admin execute as funções RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.link_user_to_company(p_email TEXT, p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_admin_company UUID;
  v_is_super_admin BOOLEAN;
BEGIN
  -- Verifica se é super admin
  SELECT (role = 'super_admin') INTO v_is_super_admin 
  FROM public.profiles 
  WHERE id = auth.uid();

  IF v_is_super_admin IS NULL OR NOT v_is_super_admin THEN
    -- Se não for super admin, verifica se é Admin da Sede da empresa destino
    SELECT company_id INTO v_admin_company 
    FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin_company';

    IF v_admin_company IS NULL OR v_admin_company != p_company_id THEN
      RAISE EXCEPTION 'Apenas administradores podem vincular usuários.';
    END IF;
  END IF;

  -- 2. Encontra o perfil pelo email
  SELECT id INTO v_user_id FROM public.profiles WHERE email = p_email;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado. Ele precisa criar a conta primeiro.';
  END IF;

  -- 3. Atualiza o perfil para pertencer à empresa
  UPDATE public.profiles
  SET company_id = p_company_id
  WHERE id = v_user_id AND (company_id IS NULL OR company_id = p_company_id);

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION set_user_matriz_access(p_user_id UUID, p_has_access BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super_admin BOOLEAN;
BEGIN
  -- Verifica se é super admin
  SELECT (role = 'super_admin') INTO v_is_super_admin 
  FROM public.profiles 
  WHERE id = auth.uid();

  -- Verify if the caller is an admin_company or super_admin
  IF (v_is_super_admin IS TRUE) OR EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'admin_company'
  ) THEN
    -- Update the target user
    UPDATE profiles 
    SET has_matriz_access = p_has_access 
    WHERE id = p_user_id;
  ELSE
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem alterar este campo.';
  END IF;
END;
$$;
