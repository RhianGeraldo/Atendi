-- Excluir card do Todoo: só administrador da empresa (ou super admin).
-- Gerente deixa de poder apagar cards das suas unidades. Excluir uma ação comercial
-- continua apagando os cards dela pelo ON DELETE CASCADE de todoo_leads.campaign_id,
-- que não passa pela RLS.
SET lock_timeout = '3s';

DROP POLICY IF EXISTS "todoo_leads_delete" ON public.todoo_leads;

CREATE POLICY "todoo_leads_delete" ON public.todoo_leads FOR DELETE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (SELECT public.current_role()) = 'admin_company'
    )
  );
