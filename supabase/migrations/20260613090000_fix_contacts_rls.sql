-- Fix contacts RLS so agents can see contacts with no unit (null unit_id)
-- This is necessary so agents can see incoming WhatsApp contacts before they are assigned to a unit.

DROP POLICY IF EXISTS "contacts unit" ON public.contacts;

CREATE POLICY "contacts unit" ON public.contacts FOR ALL TO authenticated
  USING (
    company_id = public.current_company_id() AND (
      unit_id IS NULL 
      OR 
      public.user_in_unit(unit_id)
    )
  )
  WITH CHECK (
    company_id = public.current_company_id() AND (
      unit_id IS NULL 
      OR 
      public.user_in_unit(unit_id)
    )
  );
