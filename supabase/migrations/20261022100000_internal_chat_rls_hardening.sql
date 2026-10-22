-- Chat interno: RLS igual ao que a tela mostra.
--
-- Antes:
--   * internal_messages: qualquer usuário da empresa lia QUALQUER mensagem pela API,
--     inclusive conversas diretas (DM) de outras pessoas, e postava em qualquer canal.
--   * internal_messages UPDATE: gerente de qualquer empresa editava mensagens de outras.
--   * internal_channel_members FOR ALL: qualquer usuário da empresa entrava em qualquer
--     canal (inclusive DMs alheias), removia pessoas e mudava cargos de admin.
--
-- Depois (mesma visibilidade da lista de canais em use-team-chat):
--   * Ver canal/mensagens: membro, criador, ou grupo da empresa / grupo da unidade da pessoa
--     (todas as unidades para admin/Matriz). DM só para quem está nela.
--   * Enviar: quem vê o canal; em canal de avisos só gestão ou admin do canal.
--   * Membros: cada um mexe na própria linha (ler, silenciar, entrar em grupo visível, sair);
--     criador do canal, admin do canal e gestão adicionam/removem/promovem.
--
-- O MCP (service role) não passa por aqui; as tools aplicam as mesmas regras no código.
-- Remove TODAS as políticas atuais destas tabelas (o histórico de produção pode ter
-- políticas fora do repositório) e recria numa transação só.

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

-- Gestão da empresa (gerente, admin) ou super admin
CREATE OR REPLACE FUNCTION public.is_internal_chat_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role::text IN ('manager', 'admin_company', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_internal_channel(p_channel_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.internal_channels c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = p_channel_id
      AND c.company_id = p.company_id
      AND (
        EXISTS (
          SELECT 1 FROM public.internal_channel_members m
          WHERE m.channel_id = c.id AND m.user_id = auth.uid()
        )
        OR c.created_by = auth.uid()
        OR (
          c.type = 'group'
          AND (
            c.scope = 'company'
            OR (
              c.unit_id IS NOT NULL
              AND (
                p.role::text IN ('super_admin', 'admin_company')
                OR p.has_matriz_access = true
                OR EXISTS (
                  SELECT 1 FROM public.user_units uu
                  WHERE uu.user_id = auth.uid() AND uu.unit_id = c.unit_id
                )
              )
            )
          )
        )
      )
  );
$$;

-- Criador do canal, admin do canal ou gestão da mesma empresa (renomear, membros, moderação)
CREATE OR REPLACE FUNCTION public.can_manage_internal_channel(p_channel_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.internal_channels c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = p_channel_id
      AND c.company_id = p.company_id
      AND (
        c.created_by = auth.uid()
        OR p.role::text IN ('manager', 'admin_company', 'super_admin')
        OR EXISTS (
          SELECT 1 FROM public.internal_channel_members m
          WHERE m.channel_id = c.id AND m.user_id = auth.uid() AND m.role = 'admin'
        )
      )
  );
$$;

-- Canal de avisos: só gestão ou admin do canal envia
CREATE OR REPLACE FUNCTION public.can_post_internal_channel(p_channel_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_access_internal_channel(p_channel_id)
    AND (
      NOT COALESCE((SELECT is_announcement FROM public.internal_channels WHERE id = p_channel_id), false)
      OR public.is_internal_chat_manager()
      OR EXISTS (
        SELECT 1 FROM public.internal_channel_members m
        WHERE m.channel_id = p_channel_id AND m.user_id = auth.uid() AND m.role = 'admin'
      )
    );
$$;

REVOKE ALL ON FUNCTION public.is_internal_chat_manager() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_internal_channel(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_internal_channel(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_post_internal_channel(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_internal_chat_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_internal_channel(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_internal_channel(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_post_internal_channel(UUID) TO authenticated;

-- Remove todas as políticas atuais
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('internal_channels', 'internal_channel_members', 'internal_messages')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ===== internal_channels =====
-- Mesma regra de can_access_internal_channel, mas olhando as colunas da linha: o
-- INSERT ... RETURNING de quem cria o canal precisa ver a linha nova, e uma função STABLE
-- não enxerga linhas criadas no próprio comando.
CREATE POLICY "internal_channels_select" ON public.internal_channels
FOR SELECT TO authenticated
USING (
  company_id = public.current_company_id()
  AND (
    created_by = auth.uid()
    OR public.is_internal_channel_member(id, auth.uid())
    OR (
      type = 'group'
      AND (
        scope = 'company'
        OR (
          unit_id IS NOT NULL
          AND (
            EXISTS (
              SELECT 1 FROM public.profiles p
              WHERE p.id = auth.uid()
                AND (p.role::text IN ('super_admin', 'admin_company') OR p.has_matriz_access = true)
            )
            OR EXISTS (
              SELECT 1 FROM public.user_units uu
              WHERE uu.user_id = auth.uid() AND uu.unit_id = internal_channels.unit_id
            )
          )
        )
      )
    )
  )
);

CREATE POLICY "internal_channels_insert" ON public.internal_channels
FOR INSERT TO authenticated
WITH CHECK (company_id = public.current_company_id() AND created_by = auth.uid());

CREATE POLICY "internal_channels_update" ON public.internal_channels
FOR UPDATE TO authenticated
USING (public.can_manage_internal_channel(id))
WITH CHECK (company_id = public.current_company_id());

-- ===== internal_channel_members =====
-- Ver quem está em cada canal da empresa (a lista de DMs precisa dos dois lados)
CREATE POLICY "internal_channel_members_select" ON public.internal_channel_members
FOR SELECT TO authenticated
USING (public.get_internal_channel_company_id(channel_id) = public.current_company_id());

-- Entrar num grupo que já vê (ex: silenciar sem ser membro) ou adicionar gente (gestão do canal)
CREATE POLICY "internal_channel_members_insert" ON public.internal_channel_members
FOR INSERT TO authenticated
WITH CHECK (
  public.get_internal_channel_company_id(channel_id) = public.current_company_id()
  AND (
    (user_id = auth.uid() AND public.can_access_internal_channel(channel_id))
    OR public.can_manage_internal_channel(channel_id)
  )
);

CREATE POLICY "internal_channel_members_update" ON public.internal_channel_members
FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.can_manage_internal_channel(channel_id))
WITH CHECK (
  public.get_internal_channel_company_id(channel_id) = public.current_company_id()
  AND (
    public.can_manage_internal_channel(channel_id)
    -- Na própria linha (ler, silenciar), sem se promover a admin
    OR (user_id = auth.uid() AND role = 'member')
  )
);

CREATE POLICY "internal_channel_members_delete" ON public.internal_channel_members
FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.can_manage_internal_channel(channel_id));

-- ===== internal_messages =====
CREATE POLICY "internal_messages_select" ON public.internal_messages
FOR SELECT TO authenticated
USING (public.can_access_internal_channel(channel_id));

CREATE POLICY "internal_messages_insert" ON public.internal_messages
FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid() AND public.can_post_internal_channel(channel_id));

-- Editar/apagar a própria; fixar/moderar: gestão ou admin do canal (mesma empresa)
CREATE POLICY "internal_messages_update" ON public.internal_messages
FOR UPDATE TO authenticated
USING (
  (sender_id = auth.uid() AND public.can_access_internal_channel(channel_id))
  OR public.can_manage_internal_channel(channel_id)
)
WITH CHECK (public.can_access_internal_channel(channel_id));

COMMIT;
