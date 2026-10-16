-- Todoo: permissão por aba (Meu Dia, Quadro Comercial, Painel da Equipe, Cadastros & Metas,
-- Ações Comerciais, Gincana & Ranking, Indicadores)
--
-- - As abas ficam na lista de menus do cargo (company_roles.allowed_menus) e nas permissões
--   extras do perfil (profiles.allowed_menus), com o prefixo "todoo:".
-- - Cargo sem nenhuma aba escolhida usa as abas padrão do nível (igual a src/lib/permissions.ts):
--   agente -> Meu Dia e Quadro; gerente e administrador -> todas.
-- - todoo_can('<aba>') responde para o usuário logado; criar, editar e excluir ações
--   comerciais passa a exigir a aba "campaigns".
-- - Cargos atuais recebem as abas padrão; o cargo de nível administrador ganha o Meu Todoo.

SET lock_timeout = '3s';
SET statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.todoo_can(p_tab TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_role_menus TEXT[];
  v_extras TEXT[];
  v_menus TEXT[];
  v_tabs TEXT[];
  v_all_tabs CONSTANT TEXT[] := ARRAY[
    'todoo:my_day', 'todoo:queue', 'todoo:team', 'todoo:referrals',
    'todoo:campaigns', 'todoo:gincana', 'todoo:metrics'
  ];
BEGIN
  SELECT p.role::text, r.allowed_menus, COALESCE(p.allowed_menus, '{}')
  INTO v_role, v_role_menus, v_extras
  FROM public.profiles p
  LEFT JOIN public.company_roles r ON r.id = p.custom_role_id
  WHERE p.id = auth.uid();

  IF v_role IS NULL THEN
    RETURN false;
  END IF;
  IF v_role = 'super_admin' THEN
    RETURN true;
  END IF;

  -- Menus do cargo (ou os padrão do nível, que incluem o Meu Todoo) + extras do perfil
  v_menus := COALESCE(v_role_menus, ARRAY['todoo']) || v_extras;
  IF NOT ('todoo' = ANY (v_menus)) THEN
    RETURN false;
  END IF;

  SELECT array_agg(m) INTO v_tabs FROM unnest(COALESCE(v_role_menus, '{}')) m WHERE m LIKE 'todoo:%';
  IF v_tabs IS NULL THEN
    v_tabs := CASE WHEN v_role IN ('admin_company', 'manager') THEN v_all_tabs
                   ELSE ARRAY['todoo:my_day', 'todoo:queue'] END;
  END IF;

  RETURN ('todoo:' || p_tab) = ANY (v_tabs || v_extras);
END;
$$;

REVOKE ALL ON FUNCTION public.todoo_can(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.todoo_can(TEXT) TO authenticated;

-- Ações comerciais: só quem tem a aba "Ações Comerciais"
DROP POLICY IF EXISTS todoo_campaigns_insert ON public.todoo_campaigns;
CREATE POLICY todoo_campaigns_insert ON public.todoo_campaigns
  FOR INSERT WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (SELECT public.todoo_can('campaigns'))
      AND (unit_id IS NULL OR unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[]))
    )
  );

DROP POLICY IF EXISTS todoo_campaigns_update ON public.todoo_campaigns;
CREATE POLICY todoo_campaigns_update ON public.todoo_campaigns
  FOR UPDATE USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (SELECT public.todoo_can('campaigns'))
      AND (
        (SELECT public.current_role()) = 'admin_company'
        OR unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
      )
    )
  ) WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (SELECT public.todoo_can('campaigns'))
      AND (
        (SELECT public.current_role()) = 'admin_company'
        OR unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
      )
    )
  );

DROP POLICY IF EXISTS todoo_campaigns_delete ON public.todoo_campaigns;
CREATE POLICY todoo_campaigns_delete ON public.todoo_campaigns
  FOR DELETE USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (SELECT public.todoo_can('campaigns'))
      AND (
        (SELECT public.current_role()) = 'admin_company'
        OR unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
      )
    )
  );

-- Cargos atuais: nível administrador ganha o Meu Todoo; todos recebem as abas padrão do nível
UPDATE public.company_roles
SET allowed_menus = array_append(allowed_menus, 'todoo'), updated_at = now()
WHERE base_role = 'admin_company' AND NOT ('todoo' = ANY (allowed_menus));

UPDATE public.company_roles
SET allowed_menus = allowed_menus || CASE
      WHEN base_role IN ('admin_company', 'manager') THEN ARRAY[
        'todoo:my_day', 'todoo:queue', 'todoo:team', 'todoo:referrals',
        'todoo:campaigns', 'todoo:gincana', 'todoo:metrics']
      ELSE ARRAY['todoo:my_day', 'todoo:queue']
    END,
    updated_at = now()
WHERE 'todoo' = ANY (allowed_menus)
  AND NOT EXISTS (SELECT 1 FROM unnest(allowed_menus) m WHERE m LIKE 'todoo:%');
