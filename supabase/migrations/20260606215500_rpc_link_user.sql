CREATE OR REPLACE FUNCTION public.link_user_to_company(p_email TEXT, p_company_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID;
  v_admin_company UUID;
BEGIN
  -- 1. Verifica se quem está chamando é Admin da Sede
  SELECT company_id INTO v_admin_company 
  FROM public.profiles 
  WHERE id = auth.uid() AND role = 'admin_company';

  IF v_admin_company IS NULL OR v_admin_company != p_company_id THEN
    RAISE EXCEPTION 'Apenas administradores podem vincular usuários.';
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
