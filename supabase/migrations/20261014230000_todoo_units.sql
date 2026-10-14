-- Todoo ligado às unidades
--
-- Regras:
-- - Leads, indicações e eventos: mesma regra de unidade/Rede das conversas
--   (unidade -> vinculados; sem unidade -> admin_company ou acesso Matriz/Rede).
--   O responsável pelo lead / quem captou a indicação sempre vê o registro.
-- - Campanhas: sem unidade = campanha geral da empresa (todos leem e cada um
--   trabalha só os próprios leads); com unidade = só aquela unidade.
--   Editar/excluir: admin_company, ou gerente nas campanhas da própria unidade.
-- - Metas: leitura pela empresa; escrita por admin_company ou gerente de uma
--   unidade do usuário da meta.
-- - Remove os "OR has_matriz_access()" que não checavam a empresa.

-- =====================================================================
-- 1. Backfill de unidade
-- =====================================================================
UPDATE public.todoo_leads l
SET unit_id = ct.unit_id
FROM public.contacts ct
WHERE ct.id = l.contact_id
  AND l.unit_id IS NULL
  AND ct.unit_id IS NOT NULL;

UPDATE public.todoo_referrals r
SET unit_id = COALESCE(
  (SELECT unit_id FROM public.contacts WHERE id = r.referred_contact_id),
  (SELECT unit_id FROM public.contacts WHERE id = r.referrer_contact_id)
)
WHERE r.unit_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_todoo_leads_company_unit ON public.todoo_leads (company_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_todoo_referrals_company_unit ON public.todoo_referrals (company_id, unit_id);

-- =====================================================================
-- 2. Remove políticas antigas
-- =====================================================================
DROP POLICY IF EXISTS "todoo_campaigns_select_company" ON public.todoo_campaigns;
DROP POLICY IF EXISTS "todoo_campaigns_insert_company" ON public.todoo_campaigns;
DROP POLICY IF EXISTS "todoo_campaigns_update_company" ON public.todoo_campaigns;
DROP POLICY IF EXISTS "todoo_campaigns_delete_company" ON public.todoo_campaigns;
DROP POLICY IF EXISTS "todoo_leads_select_company" ON public.todoo_leads;
DROP POLICY IF EXISTS "todoo_leads_insert_company" ON public.todoo_leads;
DROP POLICY IF EXISTS "todoo_leads_update_company" ON public.todoo_leads;
DROP POLICY IF EXISTS "todoo_leads_delete_company" ON public.todoo_leads;
DROP POLICY IF EXISTS "todoo_events_select_company" ON public.todoo_events;
DROP POLICY IF EXISTS "todoo_events_insert_company" ON public.todoo_events;
DROP POLICY IF EXISTS "todoo_referrals_select" ON public.todoo_referrals;
DROP POLICY IF EXISTS "todoo_referrals_insert" ON public.todoo_referrals;
DROP POLICY IF EXISTS "todoo_referrals_update" ON public.todoo_referrals;
DROP POLICY IF EXISTS "todoo_referrals_delete" ON public.todoo_referrals;
DROP POLICY IF EXISTS "todoo_goals_select" ON public.todoo_goals;
DROP POLICY IF EXISTS "todoo_goals_insert" ON public.todoo_goals;
DROP POLICY IF EXISTS "todoo_goals_update" ON public.todoo_goals;
DROP POLICY IF EXISTS "todoo_goals_delete" ON public.todoo_goals;

-- =====================================================================
-- 3. Campanhas
-- =====================================================================
CREATE POLICY "todoo_campaigns_select" ON public.todoo_campaigns FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (unit_id IS NULL OR unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[]))
    )
  );

CREATE POLICY "todoo_campaigns_insert" ON public.todoo_campaigns FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (unit_id IS NULL OR unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[]))
    )
  );

CREATE POLICY "todoo_campaigns_update" ON public.todoo_campaigns FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        (SELECT public.current_role()) = 'admin_company'
        OR ((SELECT public.current_role()) = 'manager' AND unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[]))
      )
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        (SELECT public.current_role()) = 'admin_company'
        OR ((SELECT public.current_role()) = 'manager' AND unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[]))
      )
    )
  );

CREATE POLICY "todoo_campaigns_delete" ON public.todoo_campaigns FOR DELETE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        (SELECT public.current_role()) = 'admin_company'
        OR ((SELECT public.current_role()) = 'manager' AND unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[]))
      )
    )
  );

-- =====================================================================
-- 4. Leads
-- =====================================================================
CREATE POLICY "todoo_leads_select" ON public.todoo_leads FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        (unit_id IS NULL AND (SELECT public.auth_has_rede_access()))
        OR unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
        OR assigned_user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "todoo_leads_insert" ON public.todoo_leads FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        (unit_id IS NULL AND (SELECT public.auth_has_rede_access()))
        OR unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
        OR assigned_user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "todoo_leads_update" ON public.todoo_leads FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        (unit_id IS NULL AND (SELECT public.auth_has_rede_access()))
        OR unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
        OR assigned_user_id = (SELECT auth.uid())
      )
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        (unit_id IS NULL AND (SELECT public.auth_has_rede_access()))
        OR unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
        OR assigned_user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "todoo_leads_delete" ON public.todoo_leads FOR DELETE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        (SELECT public.current_role()) = 'admin_company'
        OR ((SELECT public.current_role()) = 'manager' AND unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[]))
      )
    )
  );

-- =====================================================================
-- 5. Eventos (herdam do lead)
-- =====================================================================
CREATE POLICY "todoo_events_select" ON public.todoo_events FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.todoo_leads l
      WHERE l.id = todoo_events.lead_id
        AND l.company_id = (SELECT public.current_company_id())
        AND (
          (l.unit_id IS NULL AND (SELECT public.auth_has_rede_access()))
          OR l.unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
          OR l.assigned_user_id = (SELECT auth.uid())
        )
    )
  );

CREATE POLICY "todoo_events_insert" ON public.todoo_events FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.todoo_leads l
      WHERE l.id = todoo_events.lead_id
        AND l.company_id = (SELECT public.current_company_id())
        AND (
          (l.unit_id IS NULL AND (SELECT public.auth_has_rede_access()))
          OR l.unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
          OR l.assigned_user_id = (SELECT auth.uid())
        )
    )
  );

CREATE POLICY "todoo_events_delete" ON public.todoo_events FOR DELETE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        (SELECT public.current_role()) = 'admin_company'
        OR (
          (SELECT public.current_role()) = 'manager'
          AND EXISTS (
            SELECT 1 FROM public.todoo_leads l
            WHERE l.id = todoo_events.lead_id
              AND l.unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
          )
        )
      )
    )
  );

-- =====================================================================
-- 6. Indicações
-- =====================================================================
CREATE POLICY "todoo_referrals_select" ON public.todoo_referrals FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        (unit_id IS NULL AND (SELECT public.auth_has_rede_access()))
        OR unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
        OR captured_by_user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "todoo_referrals_insert" ON public.todoo_referrals FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        (unit_id IS NULL AND (SELECT public.auth_has_rede_access()))
        OR unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
        OR captured_by_user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "todoo_referrals_update" ON public.todoo_referrals FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        (unit_id IS NULL AND (SELECT public.auth_has_rede_access()))
        OR unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
        OR captured_by_user_id = (SELECT auth.uid())
      )
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        (unit_id IS NULL AND (SELECT public.auth_has_rede_access()))
        OR unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
        OR captured_by_user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "todoo_referrals_delete" ON public.todoo_referrals FOR DELETE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        (SELECT public.current_role()) = 'admin_company'
        OR ((SELECT public.current_role()) = 'manager' AND unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[]))
      )
    )
  );

-- =====================================================================
-- 7. Metas
-- =====================================================================
CREATE POLICY "todoo_goals_select" ON public.todoo_goals FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR company_id = (SELECT public.current_company_id())
  );

CREATE POLICY "todoo_goals_write" ON public.todoo_goals FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        (SELECT public.current_role()) = 'admin_company'
        OR (
          (SELECT public.current_role()) = 'manager'
          AND EXISTS (
            SELECT 1 FROM public.user_units uu
            WHERE uu.user_id = todoo_goals.user_id
              AND uu.unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
          )
        )
      )
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        (SELECT public.current_role()) = 'admin_company'
        OR (
          (SELECT public.current_role()) = 'manager'
          AND EXISTS (
            SELECT 1 FROM public.user_units uu
            WHERE uu.user_id = todoo_goals.user_id
              AND uu.unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
          )
        )
      )
    )
  );
