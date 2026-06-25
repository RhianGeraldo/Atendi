-- ============================================================
-- Cria a função de remover usuário da empresa
-- ============================================================

CREATE OR REPLACE FUNCTION public.remove_user_from_company(p_user_id UUID)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
DECLARE
  v_is_super_admin BOOLEAN;
  v_caller_company UUID;
  v_target_company UUID;
BEGIN
  -- Verifica se é super admin
  SELECT (role = 'super_admin') INTO v_is_super_admin FROM public.profiles WHERE id = auth.uid();
  
  -- Pega a empresa do chamador (se for admin)
  SELECT company_id INTO v_caller_company FROM public.profiles WHERE id = auth.uid() AND role = 'admin_company';

  -- Pega a empresa do alvo
  SELECT company_id INTO v_target_company FROM public.profiles WHERE id = p_user_id;

  IF (v_is_super_admin IS NULL OR NOT v_is_super_admin) AND (v_caller_company IS NULL OR v_caller_company != v_target_company) THEN
    RAISE EXCEPTION 'Sem permissão para remover este usuário.';
  END IF;

  -- Remove o usuário da empresa e reseta permissões
  UPDATE public.profiles
  SET company_id = NULL, role = 'agent', has_matriz_access = false, department_id = NULL
  WHERE id = p_user_id;

  -- Remove de todas as unidades
  DELETE FROM public.user_units WHERE user_id = p_user_id;
  
  -- Remove de departamentos associados
  DELETE FROM public.user_departments WHERE user_id = p_user_id;
END;
$$;
