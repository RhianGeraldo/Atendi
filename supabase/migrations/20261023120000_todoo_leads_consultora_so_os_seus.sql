-- Todoo: a consultora (perfil agent) só vê e altera os leads atribuídos a ela.
--
-- Antes, qualquer pessoa com acesso à unidade lia e alterava todos os leads da unidade; só o
-- front filtrava os da consultora. Gerente e admin continuam vendo a unidade (e a rede, se têm
-- acesso). O histórico (todoo_events, todoo_lead_history) consulta todoo_leads nas policies,
-- então segue a mesma regra. Inserção e exclusão não mudam.

SET lock_timeout = '3s';
SET statement_timeout = '15s';

DROP POLICY IF EXISTS "todoo_leads_select" ON public.todoo_leads;
CREATE POLICY "todoo_leads_select" ON public.todoo_leads FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        assigned_user_id = (SELECT auth.uid())
        OR (
          (SELECT public.current_role()) <> 'agent'
          AND (
            (unit_id IS NULL AND (SELECT public.auth_has_rede_access()))
            OR unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "todoo_leads_update" ON public.todoo_leads;
CREATE POLICY "todoo_leads_update" ON public.todoo_leads FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        assigned_user_id = (SELECT auth.uid())
        OR (
          (SELECT public.current_role()) <> 'agent'
          AND (
            (unit_id IS NULL AND (SELECT public.auth_has_rede_access()))
            OR unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
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
        assigned_user_id = (SELECT auth.uid())
        OR (
          (SELECT public.current_role()) <> 'agent'
          AND (
            (unit_id IS NULL AND (SELECT public.auth_has_rede_access()))
            OR unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
          )
        )
      )
    )
  );
