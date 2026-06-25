-- ============================================================
-- FIX: Garantir que o super_admin ignore o current_company_id()
-- na tabela whatsapp_templates
-- ============================================================

DROP POLICY IF EXISTS "whatsapp_templates read" ON public.whatsapp_templates;
CREATE POLICY "whatsapp_templates read" ON public.whatsapp_templates FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "whatsapp_templates manage" ON public.whatsapp_templates;
CREATE POLICY "whatsapp_templates manage" ON public.whatsapp_templates FOR ALL TO authenticated
  USING (
    (company_id = public.current_company_id() AND public.current_role() IN ('admin_company', 'manager'))
    OR public.is_super_admin()
  )
  WITH CHECK (
    (company_id = public.current_company_id() AND public.current_role() IN ('admin_company', 'manager'))
    OR public.is_super_admin()
  );
