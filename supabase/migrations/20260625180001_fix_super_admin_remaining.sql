-- ============================================================
-- FIX PART 3: Garantir que o super_admin ignore o current_company_id() 
-- nas tabelas onde a checagem estava barrando a leitura
-- ============================================================

-- ---- PROFILES (Leitura) ----
DROP POLICY IF EXISTS "profiles self read" ON public.profiles;
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR company_id = public.current_company_id() OR public.is_super_admin());

-- ---- CONTACTS ----
DROP POLICY IF EXISTS "contacts unit" ON public.contacts;
CREATE POLICY "contacts unit" ON public.contacts FOR ALL TO authenticated
  USING (
    (company_id = public.current_company_id() AND (
      (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
      OR 
      (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
    ))
    OR public.is_super_admin()
  )
  WITH CHECK (
    (company_id = public.current_company_id() AND (
      (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
      OR 
      (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
    ))
    OR public.is_super_admin()
  );

-- ---- QUICK MESSAGES ----
DROP POLICY IF EXISTS "Users can view quick_messages of their company" ON public.quick_messages;
CREATE POLICY "Users can view quick_messages of their company" ON public.quick_messages FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Users can insert quick_messages to their company" ON public.quick_messages;
CREATE POLICY "Users can insert quick_messages to their company" ON public.quick_messages FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Users can update quick_messages of their company" ON public.quick_messages;
CREATE POLICY "Users can update quick_messages of their company" ON public.quick_messages FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Users can delete quick_messages of their company" ON public.quick_messages;
CREATE POLICY "Users can delete quick_messages of their company" ON public.quick_messages FOR DELETE TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());

-- ---- QUICK MESSAGE FOLDERS ----
DROP POLICY IF EXISTS "Users can view quick_message_folders of their company" ON public.quick_message_folders;
CREATE POLICY "Users can view quick_message_folders of their company" ON public.quick_message_folders FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Users can insert quick_message_folders to their company" ON public.quick_message_folders;
CREATE POLICY "Users can insert quick_message_folders to their company" ON public.quick_message_folders FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Users can update quick_message_folders of their company" ON public.quick_message_folders;
CREATE POLICY "Users can update quick_message_folders of their company" ON public.quick_message_folders FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Users can delete quick_message_folders of their company" ON public.quick_message_folders;
CREATE POLICY "Users can delete quick_message_folders of their company" ON public.quick_message_folders FOR DELETE TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());

-- ---- CALL LOGS ----
DROP POLICY IF EXISTS "call_logs read" ON public.call_logs;
CREATE POLICY "call_logs read" ON public.call_logs FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "call_logs insert" ON public.call_logs;
CREATE POLICY "call_logs insert" ON public.call_logs FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "call_logs update" ON public.call_logs;
CREATE POLICY "call_logs update" ON public.call_logs FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());

-- ---- OPPORTUNITIES (READ/MANAGE) ----
-- Opportunity policies have unit_id logic, let's fix them just in case
DROP POLICY IF EXISTS "opps unit" ON public.opportunities;
CREATE POLICY "opps unit" ON public.opportunities FOR ALL TO authenticated
  USING (unit_id IS NULL OR public.user_in_unit(unit_id) OR public.is_super_admin()) 
  WITH CHECK (unit_id IS NULL OR public.user_in_unit(unit_id) OR public.is_super_admin());

-- ---- TASKS (READ/MANAGE) ----
DROP POLICY IF EXISTS "tasks unit" ON public.tasks;
CREATE POLICY "tasks unit" ON public.tasks FOR ALL TO authenticated
  USING (unit_id IS NULL OR public.user_in_unit(unit_id) OR public.is_super_admin()) 
  WITH CHECK (unit_id IS NULL OR public.user_in_unit(unit_id) OR public.is_super_admin());

-- ---- CONVERSATIONS ----
DROP POLICY IF EXISTS "conversations unit" ON public.conversations;
CREATE POLICY "conversations unit" ON public.conversations FOR ALL TO authenticated
  USING (unit_id IS NULL OR public.user_in_unit(unit_id) OR public.is_super_admin())
  WITH CHECK (unit_id IS NULL OR public.user_in_unit(unit_id) OR public.is_super_admin());

-- ---- MESSAGES ----
DROP POLICY IF EXISTS "messages via conv" ON public.messages;
CREATE POLICY "messages via conv" ON public.messages FOR ALL TO authenticated
  USING (
    EXISTS(SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (c.unit_id IS NULL OR public.user_in_unit(c.unit_id)))
    OR public.is_super_admin()
  )
  WITH CHECK (
    EXISTS(SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (c.unit_id IS NULL OR public.user_in_unit(c.unit_id)))
    OR public.is_super_admin()
  );
