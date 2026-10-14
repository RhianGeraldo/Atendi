-- Escopo "Rede" explícito para conversas
--
-- Antes: conversa com unit_id NULL era visível para qualquer usuário autenticado
-- (de qualquer empresa), pois a política era "unit_id IS NULL OR user_in_unit(unit_id)".
-- Agora: toda conversa pertence a uma empresa (company_id). Quando unit_id é NULL,
-- a conversa é da REDE dessa empresa e só aparece para admin_company ou para
-- quem tem acesso à Matriz/Rede (has_matriz_access).
--
-- has_matriz_access passa a significar SOMENTE acesso à Rede; ver todas as
-- unidades é exclusividade do admin_company (e do super_admin).

-- 1. Coluna company_id em conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

UPDATE public.conversations c
SET company_id = ct.company_id
FROM public.contacts ct
WHERE ct.id = c.contact_id
  AND c.company_id IS NULL;

-- Fallback pela instância (caso algum contato esteja sem empresa)
UPDATE public.conversations c
SET company_id = wi.company_id
FROM public.whatsapp_instances wi
WHERE wi.id = c.whatsapp_instance_id
  AND c.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_company_unit
  ON public.conversations (company_id, unit_id);

-- 2. Trigger: preenche company_id em toda conversa nova (webhooks, disparos, copilot, front)
CREATE OR REPLACE FUNCTION public.set_conversation_company_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.contact_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.contacts WHERE id = NEW.contact_id;
  END IF;
  IF NEW.company_id IS NULL AND NEW.whatsapp_instance_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.whatsapp_instances WHERE id = NEW.whatsapp_instance_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_conversation_company_id ON public.conversations;
CREATE TRIGGER trg_set_conversation_company_id
BEFORE INSERT ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.set_conversation_company_id();

-- 3. user_in_unit: acesso à Matriz/Rede não libera mais todas as unidades
CREATE OR REPLACE FUNCTION public.user_in_unit(_unit UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_units WHERE user_id = auth.uid() AND unit_id = _unit)
      OR public.current_role() = 'admin_company'
      OR public.is_super_admin()
$$;

-- 4. Visibilidade de uma conversa pelo usuário logado
CREATE OR REPLACE FUNCTION public.can_access_conversation_scope(_company UUID, _unit UUID)
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

GRANT EXECUTE ON FUNCTION public.can_access_conversation_scope(UUID, UUID) TO authenticated;

-- 5. RLS de conversations
DROP POLICY IF EXISTS "conversations unit" ON public.conversations;
CREATE POLICY "conversations unit" ON public.conversations FOR ALL TO authenticated
  USING (public.can_access_conversation_scope(company_id, unit_id))
  WITH CHECK (public.can_access_conversation_scope(company_id, unit_id));

-- 6. RLS de messages (herda da conversa)
DROP POLICY IF EXISTS "messages via conv" ON public.messages;
CREATE POLICY "messages via conv" ON public.messages FOR ALL TO authenticated
  USING (
    EXISTS(
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND public.can_access_conversation_scope(c.company_id, c.unit_id)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND public.can_access_conversation_scope(c.company_id, c.unit_id)
    )
  );
