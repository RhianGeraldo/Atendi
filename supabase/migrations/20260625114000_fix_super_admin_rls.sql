-- ============================================================
-- FIX: Incluir super_admin nas políticas RLS existentes
-- ============================================================

-- Helper já existe (is_super_admin), mas vamos garantir que
-- as políticas de RLS aceitam tanto admin_company quanto super_admin

-- ---- PROFILES ----
DROP POLICY IF EXISTS "profiles admin manage" ON public.profiles;
CREATE POLICY "profiles admin manage" ON public.profiles FOR ALL TO authenticated
  USING (
    (public.current_role() = 'admin_company' AND company_id = public.current_company_id())
    OR public.is_super_admin()
  )
  WITH CHECK (
    (public.current_role() = 'admin_company' AND company_id = public.current_company_id())
    OR public.is_super_admin()
  );

-- ---- COMPANIES ----
DROP POLICY IF EXISTS "companies read" ON public.companies;
CREATE POLICY "companies read" ON public.companies FOR SELECT TO authenticated
  USING (id = public.current_company_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "companies admin manage" ON public.companies;
CREATE POLICY "companies admin manage" ON public.companies FOR ALL TO authenticated
  USING (
    (id = public.current_company_id() AND public.current_role() = 'admin_company')
    OR public.is_super_admin()
  )
  WITH CHECK (
    (id = public.current_company_id() AND public.current_role() = 'admin_company')
    OR public.is_super_admin()
  );

-- ---- UNITS ----
DROP POLICY IF EXISTS "units read" ON public.units;
CREATE POLICY "units read" ON public.units FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "units admin manage" ON public.units;
CREATE POLICY "units admin manage" ON public.units FOR ALL TO authenticated
  USING (
    (company_id = public.current_company_id() AND public.current_role() = 'admin_company')
    OR public.is_super_admin()
  )
  WITH CHECK (
    (company_id = public.current_company_id() AND public.current_role() = 'admin_company')
    OR public.is_super_admin()
  );

-- ---- DEPARTMENTS ----
DROP POLICY IF EXISTS "departments read" ON public.departments;
CREATE POLICY "departments read" ON public.departments FOR SELECT TO authenticated
  USING (
    EXISTS(SELECT 1 FROM public.units u WHERE u.id = departments.unit_id AND u.company_id = public.current_company_id())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "departments manage" ON public.departments;
CREATE POLICY "departments manage" ON public.departments FOR ALL TO authenticated
  USING (
    (EXISTS(SELECT 1 FROM public.units u WHERE u.id = departments.unit_id AND u.company_id = public.current_company_id())
     AND public.current_role() IN ('admin_company','manager'))
    OR public.is_super_admin()
  )
  WITH CHECK (
    (EXISTS(SELECT 1 FROM public.units u WHERE u.id = departments.unit_id AND u.company_id = public.current_company_id())
     AND public.current_role() IN ('admin_company','manager'))
    OR public.is_super_admin()
  );

-- ---- USER_UNITS ----
DROP POLICY IF EXISTS "user_units read" ON public.user_units;
CREATE POLICY "user_units read" ON public.user_units FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id = user_units.user_id AND p.company_id = public.current_company_id())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "user_units admin manage" ON public.user_units;
CREATE POLICY "user_units admin manage" ON public.user_units FOR ALL TO authenticated
  USING (public.current_role() = 'admin_company' OR public.is_super_admin())
  WITH CHECK (public.current_role() = 'admin_company' OR public.is_super_admin());

-- ---- USER_DEPARTMENTS ----
DROP POLICY IF EXISTS "user_departments read" ON public.user_departments;
CREATE POLICY "user_departments read" ON public.user_departments FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id = user_departments.user_id AND p.company_id = public.current_company_id())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "user_departments admin manage" ON public.user_departments;
CREATE POLICY "user_departments admin manage" ON public.user_departments FOR ALL TO authenticated
  USING (public.current_role() = 'admin_company' OR public.is_super_admin())
  WITH CHECK (public.current_role() = 'admin_company' OR public.is_super_admin());
