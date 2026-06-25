-- ============================================================
-- FIX: Incluir super_admin nas políticas RLS faltantes
-- (whatsapp_instances, pipelines, pipeline_stages, labels, ai_agents, resolution_reasons)
-- ============================================================

-- ---- WHATSAPP_INSTANCES ----
DROP POLICY IF EXISTS "whatsapp_instances read" ON public.whatsapp_instances;
CREATE POLICY "whatsapp_instances read" ON public.whatsapp_instances FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "whatsapp_instances manage" ON public.whatsapp_instances;
CREATE POLICY "whatsapp_instances manage" ON public.whatsapp_instances FOR ALL TO authenticated
  USING (
    (company_id = public.current_company_id() AND public.current_role() = 'admin_company')
    OR public.is_super_admin()
  )
  WITH CHECK (
    (company_id = public.current_company_id() AND public.current_role() = 'admin_company')
    OR public.is_super_admin()
  );

-- ---- PIPELINES ----
DROP POLICY IF EXISTS "pipelines read" ON public.pipelines;
CREATE POLICY "pipelines read" ON public.pipelines FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "pipelines manage" ON public.pipelines;
CREATE POLICY "pipelines manage" ON public.pipelines FOR ALL TO authenticated
  USING (
    (company_id = public.current_company_id() AND public.current_role() IN ('admin_company', 'manager'))
    OR public.is_super_admin()
  )
  WITH CHECK (
    (company_id = public.current_company_id() AND public.current_role() IN ('admin_company', 'manager'))
    OR public.is_super_admin()
  );

-- ---- PIPELINE_STAGES ----
DROP POLICY IF EXISTS "pipeline_stages read" ON public.pipeline_stages;
CREATE POLICY "pipeline_stages read" ON public.pipeline_stages FOR SELECT TO authenticated
  USING (
    EXISTS(SELECT 1 FROM public.pipelines p WHERE p.id = pipeline_stages.pipeline_id AND p.company_id = public.current_company_id())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "pipeline_stages manage" ON public.pipeline_stages;
CREATE POLICY "pipeline_stages manage" ON public.pipeline_stages FOR ALL TO authenticated
  USING (
    (EXISTS(SELECT 1 FROM public.pipelines p WHERE p.id = pipeline_stages.pipeline_id AND p.company_id = public.current_company_id())
     AND public.current_role() IN ('admin_company', 'manager'))
    OR public.is_super_admin()
  )
  WITH CHECK (
    (EXISTS(SELECT 1 FROM public.pipelines p WHERE p.id = pipeline_stages.pipeline_id AND p.company_id = public.current_company_id())
     AND public.current_role() IN ('admin_company', 'manager'))
    OR public.is_super_admin()
  );

-- ---- LABELS ----
DROP POLICY IF EXISTS "labels read" ON public.labels;
CREATE POLICY "labels read" ON public.labels FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "labels manage" ON public.labels;
CREATE POLICY "labels manage" ON public.labels FOR ALL TO authenticated
  USING (
    (company_id = public.current_company_id() AND public.current_role() IN ('admin_company', 'manager'))
    OR public.is_super_admin()
  )
  WITH CHECK (
    (company_id = public.current_company_id() AND public.current_role() IN ('admin_company', 'manager'))
    OR public.is_super_admin()
  );

-- ---- AI_AGENTS ----
DROP POLICY IF EXISTS "ai_agents read" ON public.ai_agents;
CREATE POLICY "ai_agents read" ON public.ai_agents FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "ai_agents manage" ON public.ai_agents;
CREATE POLICY "ai_agents manage" ON public.ai_agents FOR ALL TO authenticated
  USING (
    (company_id = public.current_company_id() AND public.current_role() IN ('admin_company', 'manager'))
    OR public.is_super_admin()
  )
  WITH CHECK (
    (company_id = public.current_company_id() AND public.current_role() IN ('admin_company', 'manager'))
    OR public.is_super_admin()
  );

-- ---- RESOLUTION_REASONS ----
DROP POLICY IF EXISTS "resolution_reasons read" ON public.resolution_reasons;
CREATE POLICY "resolution_reasons read" ON public.resolution_reasons FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "resolution_reasons manage" ON public.resolution_reasons;
CREATE POLICY "resolution_reasons manage" ON public.resolution_reasons FOR ALL TO authenticated
  USING (
    (company_id = public.current_company_id() AND public.current_role() IN ('admin_company', 'manager'))
    OR public.is_super_admin()
  )
  WITH CHECK (
    (company_id = public.current_company_id() AND public.current_role() IN ('admin_company', 'manager'))
    OR public.is_super_admin()
  );
