-- Update user_in_unit to grant access if user has matriz access
CREATE OR REPLACE FUNCTION public.user_in_unit(_unit UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_units WHERE user_id = auth.uid() AND unit_id = _unit)
      OR public.current_role() = 'admin_company'
      OR public.has_matriz_access()
$$;

-- Update contacts RLS to respect unit_id and matriz access
DROP POLICY IF EXISTS "contacts company" ON public.contacts;

CREATE POLICY "contacts unit" ON public.contacts FOR ALL TO authenticated
  USING (
    company_id = public.current_company_id() AND (
      (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
      OR 
      (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
    )
  )
  WITH CHECK (
    company_id = public.current_company_id() AND (
      (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
      OR 
      (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
    )
  );
