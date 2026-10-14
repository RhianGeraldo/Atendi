-- Contatos na Rede/unidade + políticas de escopo otimizadas
--
-- 1. Backfill de contacts.unit_id para contatos que ficaram sem unidade antes
--    da herança automática pela instância:
--    a) com conversas apenas em unidades -> unidade da conversa mais recente
--    b) sem conversa, criados por usuário (não admin) de uma única unidade
--       -> unidade desse usuário
--    Permanecem na Rede (unit_id nulo): contatos com conversa da Rede,
--    mesclados e os sem vínculo.
-- 2. Helpers de escopo avaliados UMA vez por consulta (padrão "(select fn())"),
--    em vez de várias chamadas de função por linha.
-- 3. Políticas de contacts, conversations, messages, opportunities (+ notas e
--    respostas de etapa) e tasks reescritas com os helpers. Mesma regra:
--    unidade -> vinculados à unidade (admin_company: todas as da empresa);
--    Rede (unit_id nulo) -> admin_company ou acesso Matriz/Rede.
--    contacts: acesso Matriz/Rede não libera mais todos os contatos; conversa da
--    Rede não libera mais o contato para todos.

-- =====================================================================
-- 1a. Contatos com conversas só em unidades
-- =====================================================================
WITH alvo AS (
  SELECT DISTINCT ON (ct.id) ct.id, cv.unit_id
  FROM public.contacts ct
  JOIN public.conversations cv ON cv.contact_id = ct.id
  WHERE ct.unit_id IS NULL
    AND ct.merged_into_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.conversations r
      WHERE r.contact_id = ct.id AND r.unit_id IS NULL
    )
  ORDER BY ct.id, cv.last_message_at DESC NULLS LAST
)
UPDATE public.contacts c
SET unit_id = alvo.unit_id
FROM alvo
WHERE c.id = alvo.id
  AND alvo.unit_id IS NOT NULL;

-- =====================================================================
-- 1b. Contatos sem conversa, criados por usuário de uma única unidade
-- =====================================================================
WITH alvo AS (
  SELECT ct.id, MIN(uu.unit_id::text)::uuid AS unit_id
  FROM public.contacts ct
  JOIN public.profiles p ON p.id = ct.created_by
  JOIN public.user_units uu ON uu.user_id = p.id
  JOIN public.units u ON u.id = uu.unit_id AND u.company_id = ct.company_id
  WHERE ct.unit_id IS NULL
    AND ct.merged_into_id IS NULL
    AND p.role NOT IN ('admin_company', 'super_admin')
    AND NOT EXISTS (SELECT 1 FROM public.conversations cv WHERE cv.contact_id = ct.id)
  GROUP BY ct.id
  HAVING COUNT(DISTINCT uu.unit_id) = 1
)
UPDATE public.contacts c
SET unit_id = alvo.unit_id
FROM alvo
WHERE c.id = alvo.id;

-- =====================================================================
-- 2. Helpers de escopo do usuário logado
-- =====================================================================
-- Acesso à Rede (registros sem unidade) da própria empresa
CREATE OR REPLACE FUNCTION public.auth_has_rede_access()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT p.role IN ('admin_company', 'super_admin') OR COALESCE(p.has_matriz_access, false)
     FROM public.profiles p WHERE p.id = auth.uid()),
    false
  )
$$;

-- Unidades da empresa do usuário que ele pode ver (admin_company: todas)
CREATE OR REPLACE FUNCTION public.auth_unit_ids()
RETURNS UUID[] LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(u.id), '{}'::uuid[])
  FROM public.profiles p
  JOIN public.units u ON u.company_id = p.company_id
  WHERE p.id = auth.uid()
    AND (
      p.role IN ('admin_company', 'super_admin')
      OR EXISTS (SELECT 1 FROM public.user_units uu WHERE uu.user_id = p.id AND uu.unit_id = u.id)
    )
$$;

-- Contatos que o usuário enxerga por terem conversa no escopo dele
CREATE OR REPLACE FUNCTION public.auth_conversation_contact_ids()
RETURNS SETOF UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT c.contact_id
  FROM public.conversations c
  WHERE c.company_id = public.current_company_id()
    AND (
      (c.unit_id IS NULL AND public.auth_has_rede_access())
      OR c.unit_id = ANY (public.auth_unit_ids())
    )
$$;

GRANT EXECUTE ON FUNCTION public.auth_has_rede_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_unit_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_conversation_contact_ids() TO authenticated;

-- Versões por linha (usadas fora das políticas) seguem a mesma regra
CREATE OR REPLACE FUNCTION public.can_read_contact(c_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.conversations c
    WHERE c.contact_id = c_id
      AND public.can_access_company_unit(c.company_id, c.unit_id)
  )
$$;

-- =====================================================================
-- 3. Políticas
-- =====================================================================

-- contacts
DROP POLICY IF EXISTS "contacts unit" ON public.contacts;
CREATE POLICY "contacts unit" ON public.contacts FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        (unit_id IS NULL AND (SELECT public.auth_has_rede_access()))
        OR unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
        OR created_by = (SELECT auth.uid())
        OR id IN (SELECT public.auth_conversation_contact_ids())
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
        OR created_by = (SELECT auth.uid())
        OR id IN (SELECT public.auth_conversation_contact_ids())
      )
    )
  );

-- conversations
DROP POLICY IF EXISTS "conversations unit" ON public.conversations;
CREATE POLICY "conversations unit" ON public.conversations FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        (unit_id IS NULL AND (SELECT public.auth_has_rede_access()))
        OR unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
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
      )
    )
  );

-- messages (herda da conversa)
DROP POLICY IF EXISTS "messages via conv" ON public.messages;
CREATE POLICY "messages via conv" ON public.messages FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.company_id = (SELECT public.current_company_id())
        AND (
          (c.unit_id IS NULL AND (SELECT public.auth_has_rede_access()))
          OR c.unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
        )
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.company_id = (SELECT public.current_company_id())
        AND (
          (c.unit_id IS NULL AND (SELECT public.auth_has_rede_access()))
          OR c.unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
        )
    )
  );

-- opportunities
DROP POLICY IF EXISTS "opps unit" ON public.opportunities;
CREATE POLICY "opps unit" ON public.opportunities FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        (unit_id IS NULL AND (SELECT public.auth_has_rede_access()))
        OR unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
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
      )
    )
  );

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

-- tasks (+ o responsável sempre vê a própria tarefa)
DROP POLICY IF EXISTS "tasks unit" ON public.tasks;
CREATE POLICY "tasks unit" ON public.tasks FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        (unit_id IS NULL AND (SELECT public.auth_has_rede_access()))
        OR unit_id = ANY ((SELECT public.auth_unit_ids())::uuid[])
        OR assigned_to = (SELECT auth.uid())
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
        OR assigned_to = (SELECT auth.uid())
      )
    )
  );
