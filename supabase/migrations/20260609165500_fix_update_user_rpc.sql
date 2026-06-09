CREATE OR REPLACE FUNCTION public.update_user_profile_admin(
  p_user_id UUID,
  p_role TEXT DEFAULT NULL,
  p_has_matriz_access BOOLEAN DEFAULT NULL,
  p_company_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Atualizar os dados usando cast explícito de string para o enum app_role
  UPDATE profiles
  SET 
    role = COALESCE(p_role::app_role, role),
    has_matriz_access = COALESCE(p_has_matriz_access, has_matriz_access),
    company_id = COALESCE(p_company_id, company_id)
  WHERE id = p_user_id;
END;
$$;
