-- ============================================================
-- FIX: Atualizar a função user_in_unit para incluir o super_admin
-- ============================================================

CREATE OR REPLACE FUNCTION public.user_in_unit(_unit UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_units WHERE user_id = auth.uid() AND unit_id = _unit)
      OR public.current_role() = 'admin_company'
      OR public.has_matriz_access()
      OR public.is_super_admin()
$$;

-- E também vamos garantir que a função current_role() não quebre para usuários sem company
-- (embora no caso do super admin ele tenha um profile válido, é bom garantir)
