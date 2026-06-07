-- ============ ALTERANDO UNIT_ID PARA OPCIONAL ============
-- Para permitir que a "Sede / Empresa Mãe" tenha seus próprios dados (onde unit_id = null)

-- 1. Contacts: Adiciona unit_id e define RLS
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE;

-- 2. Conversations: Torna unit_id opcional
ALTER TABLE public.conversations ALTER COLUMN unit_id DROP NOT NULL;

-- 3. Pipeline Stages: Torna unit_id opcional
ALTER TABLE public.pipeline_stages ALTER COLUMN unit_id DROP NOT NULL;

-- 4. Opportunities: Torna unit_id opcional
ALTER TABLE public.opportunities ALTER COLUMN unit_id DROP NOT NULL;

-- 5. Tasks: Torna unit_id opcional
ALTER TABLE public.tasks ALTER COLUMN unit_id DROP NOT NULL;

-- ============ ATUALIZANDO AS POLÍTICAS (RLS) ============

-- Para garantir que os dados sem unit_id sejam acessíveis caso o usuário pertença à empresa

-- Contacts
DROP POLICY IF EXISTS "contacts company" ON public.contacts;
CREATE POLICY "contacts company" ON public.contacts FOR ALL TO authenticated
  USING (
    company_id = public.current_company_id() AND
    (unit_id IS NULL OR public.user_in_unit(unit_id))
  )
  WITH CHECK (
    company_id = public.current_company_id() AND
    (unit_id IS NULL OR public.user_in_unit(unit_id))
  );

-- Conversations
DROP POLICY IF EXISTS "conversations unit" ON public.conversations;
CREATE POLICY "conversations unit" ON public.conversations FOR ALL TO authenticated
  USING (unit_id IS NULL OR public.user_in_unit(unit_id))
  WITH CHECK (unit_id IS NULL OR public.user_in_unit(unit_id));

-- Pipeline Stages
DROP POLICY IF EXISTS "pipeline unit" ON public.pipeline_stages;
CREATE POLICY "pipeline unit" ON public.pipeline_stages FOR ALL TO authenticated
  USING (unit_id IS NULL OR public.user_in_unit(unit_id)) 
  WITH CHECK (unit_id IS NULL OR public.user_in_unit(unit_id));

-- Opportunities
DROP POLICY IF EXISTS "opps unit" ON public.opportunities;
CREATE POLICY "opps unit" ON public.opportunities FOR ALL TO authenticated
  USING (unit_id IS NULL OR public.user_in_unit(unit_id)) 
  WITH CHECK (unit_id IS NULL OR public.user_in_unit(unit_id));

-- Tasks
DROP POLICY IF EXISTS "tasks unit" ON public.tasks;
CREATE POLICY "tasks unit" ON public.tasks FOR ALL TO authenticated
  USING (unit_id IS NULL OR public.user_in_unit(unit_id)) 
  WITH CHECK (unit_id IS NULL OR public.user_in_unit(unit_id));

-- Messages
DROP POLICY IF EXISTS "messages via conv" ON public.messages;
CREATE POLICY "messages via conv" ON public.messages FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (c.unit_id IS NULL OR public.user_in_unit(c.unit_id))))
  WITH CHECK (EXISTS(SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (c.unit_id IS NULL OR public.user_in_unit(c.unit_id))));
