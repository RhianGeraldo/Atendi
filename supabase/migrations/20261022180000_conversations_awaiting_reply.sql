-- Atendimento: conversas abertas em que o cliente está esperando resposta
--
-- A tela de conversas carrega 20 por página, da última mensagem mais recente para a mais
-- antiga, e só calculava o SLA do que já tinha carregado. Quem espera resposta fica parado
-- e desce na lista: o filtro "Estourados" e a ordem "quem espera mais primeiro" não viam
-- essas conversas. Esta função devolve todas elas para a tela (e o MCP) carregarem junto
-- da primeira página. O cálculo do SLA continua no app (lib/sla.ts).
--
-- Só cria função (nenhuma tabela é alterada). Usa idx_messages_conversation_id_created_at.

SET lock_timeout = '3s';
SET statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.conversations_awaiting_reply(
  p_company_id UUID,
  p_unit_id UUID DEFAULT NULL
)
RETURNS TABLE (conversation_id UUID, last_contact_message_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Servidor (MCP, service_role) ou alguém da empresa
  -- COALESCE: sem perfil, current_company_id() é NULL e a comparação não pode liberar
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT COALESCE(public.is_super_admin() OR p_company_id = public.current_company_id(), false) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.id, last.created_at
  FROM public.conversations c
  JOIN public.contacts ct ON ct.id = c.contact_id
  CROSS JOIN LATERAL (
    -- Última mensagem que conta para o SLA (mesma regra de SLA_SENDER_TYPES)
    SELECT m.sender_type, m.created_at
    FROM public.messages m
    WHERE m.conversation_id = c.id
      AND m.is_internal = false
      AND m.sender_type IN ('contact', 'agent')
    ORDER BY m.created_at DESC
    LIMIT 1
  ) last
  WHERE ct.company_id = p_company_id
    AND ct.is_blocked IS NOT TRUE
    AND c.status IN ('waiting', 'active')
    AND (p_unit_id IS NULL OR c.unit_id = p_unit_id)
    AND last.sender_type = 'contact';
END;
$$;

REVOKE ALL ON FUNCTION public.conversations_awaiting_reply(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conversations_awaiting_reply(UUID, UUID) TO authenticated, service_role;
