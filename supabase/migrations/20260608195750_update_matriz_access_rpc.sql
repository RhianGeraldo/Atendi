CREATE OR REPLACE FUNCTION set_user_matriz_access(p_user_id UUID, p_has_access BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify if the caller is an admin_company
  IF EXISTS (
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
