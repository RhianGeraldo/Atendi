CREATE OR REPLACE FUNCTION public.can_read_contact(c_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.conversations 
    WHERE contact_id = c_id AND (unit_id IS NULL OR public.user_in_unit(unit_id))
  )
$$;

DROP POLICY IF EXISTS "contacts unit" ON public.contacts;

CREATE POLICY "contacts unit" ON public.contacts FOR ALL TO authenticated
  USING (
    (company_id = public.current_company_id() AND (
      public.current_role() = 'admin_company' 
      OR public.has_matriz_access()
      OR (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
      OR public.can_read_contact(id)
    ))
    OR public.is_super_admin()
  )
  WITH CHECK (
    (company_id = public.current_company_id() AND (
      public.current_role() = 'admin_company' 
      OR public.has_matriz_access()
      OR (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
      OR public.can_read_contact(id)
    ))
    OR public.is_super_admin()
  );
