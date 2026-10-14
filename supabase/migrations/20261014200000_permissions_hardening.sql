-- Endurecimento de permissões
--
-- 1. profiles: usuário comum não pode mais alterar o próprio cargo, empresa,
--    acesso Matriz/Rede, menus, departamento ou status ativo.
-- 2. update_user_profile_admin: passa a exigir admin da empresa (ou super_admin)
--    e deixa de ser executável por anon.
-- 3. company_roles: mudar o tipo base de um cargo atualiza quem já está nele.
-- 4. user_in_unit: a unidade precisa ser da empresa do usuário.
-- 5. opportunities / tasks: ganham company_id; "sem unidade" vira Rede da empresa.
-- 6. pipeline_stages: remove política permissiva que deixava qualquer membro
--    da unidade criar/editar/excluir etapas.
-- 7. user_can_access_conversation: checagem para o backend (service role).

-- =====================================================================
-- 1. Proteção das colunas privilegiadas de profiles
-- =====================================================================
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_role public.app_role;
  v_actor_company UUID;
  v_base_role public.app_role;
BEGIN
  -- Mantém o cargo nativo coerente com o cargo personalizado
  IF NEW.custom_role_id IS NOT NULL
     AND NEW.role <> 'super_admin'
     AND (TG_OP = 'INSERT' OR NEW.custom_role_id IS DISTINCT FROM OLD.custom_role_id) THEN
    SELECT base_role INTO v_base_role FROM public.company_roles WHERE id = NEW.custom_role_id;
    IF v_base_role IS NOT NULL THEN
      NEW.role := v_base_role;
    END IF;
  END IF;

  -- Backend (service role, triggers de auth) não tem auth.uid(): liberado
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role, company_id INTO v_actor_role, v_actor_company
  FROM public.profiles WHERE id = v_actor;

  IF v_actor_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'super_admin' THEN
      RAISE EXCEPTION 'Sem permissão para criar super administrador.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.has_matriz_access IS DISTINCT FROM OLD.has_matriz_access
     OR NEW.custom_role_id IS DISTINCT FROM OLD.custom_role_id
     OR NEW.allowed_menus IS DISTINCT FROM OLD.allowed_menus
     OR NEW.department_id IS DISTINCT FROM OLD.department_id
     OR NEW.active IS DISTINCT FROM OLD.active THEN

    IF v_actor_role = 'admin_company'
       AND (OLD.company_id = v_actor_company OR OLD.company_id IS NULL)
       AND NEW.company_id = v_actor_company
       AND OLD.role <> 'super_admin'
       AND NEW.role <> 'super_admin' THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Sem permissão para alterar cargo, empresa ou acessos do usuário.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged_columns
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_privileged_columns();

-- =====================================================================
-- 2. RPCs de gestão de usuários
-- =====================================================================
CREATE OR REPLACE FUNCTION public.update_user_profile_admin(
  p_user_id uuid,
  p_role text DEFAULT NULL::text,
  p_has_matriz_access boolean DEFAULT NULL::boolean,
  p_company_id uuid DEFAULT NULL::uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor_role public.app_role;
  v_actor_company UUID;
  v_target_company UUID;
BEGIN
  SELECT role, company_id INTO v_actor_role, v_actor_company
  FROM public.profiles WHERE id = auth.uid();

  IF v_actor_role IS DISTINCT FROM 'super_admin' THEN
    SELECT company_id INTO v_target_company FROM public.profiles WHERE id = p_user_id;
    IF v_actor_role IS DISTINCT FROM 'admin_company'
       OR v_target_company IS DISTINCT FROM v_actor_company
       OR (p_company_id IS NOT NULL AND p_company_id <> v_actor_company)
       OR p_role = 'super_admin' THEN
      RAISE EXCEPTION 'Apenas administradores da empresa podem alterar este usuário.' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.profiles
  SET
    role = COALESCE(p_role::public.app_role, role),
    has_matriz_access = COALESCE(p_has_matriz_access, has_matriz_access),
    company_id = COALESCE(p_company_id, company_id)
  WHERE id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_user_profile_admin(uuid, text, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_user_profile_admin(uuid, text, boolean, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.link_user_to_company(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_user_to_company(text, uuid) TO authenticated;

-- =====================================================================
-- 3. Cargo personalizado: tipo base propaga para os usuários
-- =====================================================================
CREATE OR REPLACE FUNCTION public.sync_profiles_from_company_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.base_role IS DISTINCT FROM OLD.base_role THEN
    UPDATE public.profiles
    SET role = NEW.base_role
    WHERE custom_role_id = NEW.id
      AND role <> 'super_admin'
      AND role IS DISTINCT FROM NEW.base_role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profiles_from_company_role ON public.company_roles;
CREATE TRIGGER trg_sync_profiles_from_company_role
AFTER UPDATE OF base_role ON public.company_roles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profiles_from_company_role();

-- =====================================================================
-- 4. user_in_unit restrito à empresa do usuário
-- =====================================================================
CREATE OR REPLACE FUNCTION public.user_in_unit(_unit UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin()
      OR (
        EXISTS(SELECT 1 FROM public.units u WHERE u.id = _unit AND u.company_id = public.current_company_id())
        AND (
          public.current_role() = 'admin_company'
          OR EXISTS(SELECT 1 FROM public.user_units WHERE user_id = auth.uid() AND unit_id = _unit)
        )
      )
$$;

-- Escopo genérico empresa/unidade (unidade ou Rede da empresa)
CREATE OR REPLACE FUNCTION public.can_access_company_unit(_company UUID, _unit UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin()
      OR (
        _company = public.current_company_id()
        AND (
          (_unit IS NOT NULL AND public.user_in_unit(_unit))
          OR
          (_unit IS NULL AND (public.current_role() = 'admin_company' OR COALESCE(public.has_matriz_access(), false)))
        )
      )
$$;

GRANT EXECUTE ON FUNCTION public.can_access_company_unit(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_access_conversation_scope(_company UUID, _unit UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_access_company_unit(_company, _unit)
$$;

-- =====================================================================
-- 5a. opportunities: company_id + Rede
-- =====================================================================
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

UPDATE public.opportunities o
SET company_id = ct.company_id
FROM public.contacts ct
WHERE ct.id = o.contact_id AND o.company_id IS NULL;

UPDATE public.opportunities o
SET company_id = u.company_id
FROM public.units u
WHERE u.id = o.unit_id AND o.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_company_unit ON public.opportunities (company_id, unit_id);

CREATE OR REPLACE FUNCTION public.set_opportunity_company_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.contact_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.contacts WHERE id = NEW.contact_id;
  END IF;
  IF NEW.company_id IS NULL AND NEW.unit_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.units WHERE id = NEW.unit_id;
  END IF;
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.current_company_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_opportunity_company_id ON public.opportunities;
CREATE TRIGGER trg_set_opportunity_company_id
BEFORE INSERT ON public.opportunities
FOR EACH ROW
EXECUTE FUNCTION public.set_opportunity_company_id();

DROP POLICY IF EXISTS "opps unit" ON public.opportunities;
CREATE POLICY "opps unit" ON public.opportunities FOR ALL TO authenticated
  USING (public.can_access_company_unit(company_id, unit_id))
  WITH CHECK (public.can_access_company_unit(company_id, unit_id));

DROP POLICY IF EXISTS "opportunity notes select" ON public.opportunity_notes;
CREATE POLICY "opportunity notes select" ON public.opportunity_notes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.id = opportunity_notes.opportunity_id
      AND public.can_access_company_unit(o.company_id, o.unit_id)
  ));

DROP POLICY IF EXISTS "opportunity notes insert" ON public.opportunity_notes;
CREATE POLICY "opportunity notes insert" ON public.opportunity_notes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.id = opportunity_notes.opportunity_id
        AND public.can_access_company_unit(o.company_id, o.unit_id)
    )
  );

DROP POLICY IF EXISTS "Users can manage opportunity answers via opportunity" ON public.opportunity_stage_answers;
CREATE POLICY "Users can manage opportunity answers via opportunity" ON public.opportunity_stage_answers FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.id = opportunity_stage_answers.opportunity_id
      AND public.can_access_company_unit(o.company_id, o.unit_id)
  ));

-- =====================================================================
-- 5b. tasks: company_id + Rede (+ responsável sempre vê a própria tarefa)
-- =====================================================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

UPDATE public.tasks t SET company_id = ct.company_id
FROM public.contacts ct WHERE ct.id = t.contact_id AND t.company_id IS NULL;

UPDATE public.tasks t SET company_id = o.company_id
FROM public.opportunities o WHERE o.id = t.opportunity_id AND t.company_id IS NULL;

UPDATE public.tasks t SET company_id = u.company_id
FROM public.units u WHERE u.id = t.unit_id AND t.company_id IS NULL;

UPDATE public.tasks t SET company_id = p.company_id
FROM public.profiles p WHERE p.id = t.assigned_to AND t.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_company_unit ON public.tasks (company_id, unit_id);

CREATE OR REPLACE FUNCTION public.set_task_company_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.contact_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.contacts WHERE id = NEW.contact_id;
  END IF;
  IF NEW.company_id IS NULL AND NEW.opportunity_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.opportunities WHERE id = NEW.opportunity_id;
  END IF;
  IF NEW.company_id IS NULL AND NEW.unit_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.units WHERE id = NEW.unit_id;
  END IF;
  IF NEW.company_id IS NULL AND NEW.assigned_to IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.profiles WHERE id = NEW.assigned_to;
  END IF;
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.current_company_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_task_company_id ON public.tasks;
CREATE TRIGGER trg_set_task_company_id
BEFORE INSERT ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_task_company_id();

DROP POLICY IF EXISTS "tasks unit" ON public.tasks;
CREATE POLICY "tasks unit" ON public.tasks FOR ALL TO authenticated
  USING (
    public.can_access_company_unit(company_id, unit_id)
    OR (assigned_to = auth.uid() AND company_id = public.current_company_id())
  )
  WITH CHECK (
    public.can_access_company_unit(company_id, unit_id)
    OR (assigned_to = auth.uid() AND company_id = public.current_company_id())
  );

-- =====================================================================
-- 6. pipeline_stages: leitura pela empresa, escrita só admin/gerente
--    (as políticas "pipeline_stages read" e "pipeline_stages manage" já cobrem)
-- =====================================================================
DROP POLICY IF EXISTS "pipeline unit" ON public.pipeline_stages;

-- =====================================================================
-- 7. Checagem de acesso a conversa para o backend (service role)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.user_can_access_conversation(_user UUID, _conversation UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    JOIN public.profiles p ON p.id = _user
    WHERE c.id = _conversation
      AND COALESCE(p.active, true)
      AND (
        p.role = 'super_admin'
        OR (
          c.company_id = p.company_id
          AND (
            (c.unit_id IS NULL AND (p.role = 'admin_company' OR COALESCE(p.has_matriz_access, false)))
            OR (
              c.unit_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM public.units u WHERE u.id = c.unit_id AND u.company_id = p.company_id)
              AND (
                p.role = 'admin_company'
                OR EXISTS (SELECT 1 FROM public.user_units uu WHERE uu.user_id = _user AND uu.unit_id = c.unit_id)
              )
            )
          )
        )
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.user_can_access_conversation(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_conversation(UUID, UUID) TO service_role;
