-- ============================================================
-- FIX: Garantir que admin_company pode inserir whatsapp_instances
-- ============================================================

DROP POLICY IF EXISTS "whatsapp_instances manage" ON public.whatsapp_instances;

CREATE POLICY "whatsapp_instances manage" ON public.whatsapp_instances FOR ALL TO authenticated
  USING (
    (company_id = public.current_company_id() AND public.current_role()::text = 'admin_company')
    OR public.is_super_admin()
  )
  WITH CHECK (
    (company_id = public.current_company_id() AND public.current_role()::text = 'admin_company')
    OR public.is_super_admin()
  );
