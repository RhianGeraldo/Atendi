-- Adicionar flag de acesso à matriz no perfil do usuário
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_matriz_access BOOLEAN NOT NULL DEFAULT false;

-- Criar função para facilitar as RLS
CREATE OR REPLACE FUNCTION public.has_matriz_access()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT has_matriz_access FROM public.profiles WHERE id = auth.uid()
$$;

-- Atualizar RLS de conversas para proteger as conversas da matriz (onde unit_id IS NULL)
DROP POLICY IF EXISTS "conversations unit" ON public.conversations;
CREATE POLICY "conversations unit" ON public.conversations FOR ALL TO authenticated
  USING (
    (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
    OR 
    (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
  )
  WITH CHECK (
    (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
    OR 
    (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
  );

-- Atualizar pipeline stages (que foi mudado para unit_id NULLABLE no primeiro checkpoint)
DROP POLICY IF EXISTS "pipeline unit" ON public.pipeline_stages;
CREATE POLICY "pipeline unit" ON public.pipeline_stages FOR ALL TO authenticated
  USING (
    (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
    OR 
    (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
  )
  WITH CHECK (
    (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
    OR 
    (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
  );

-- Atualizar oportunidades
DROP POLICY IF EXISTS "opps unit" ON public.opportunities;
CREATE POLICY "opps unit" ON public.opportunities FOR ALL TO authenticated
  USING (
    (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
    OR 
    (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
  )
  WITH CHECK (
    (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
    OR 
    (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
  );

-- Atualizar tarefas
DROP POLICY IF EXISTS "tasks unit" ON public.tasks;
CREATE POLICY "tasks unit" ON public.tasks FOR ALL TO authenticated
  USING (
    (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
    OR 
    (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
  )
  WITH CHECK (
    (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
    OR 
    (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
  );
