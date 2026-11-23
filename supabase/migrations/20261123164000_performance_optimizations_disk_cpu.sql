-- =========================================================================
-- Migration: Otimizações Críticas de Performance (Disk I/O e CPU)
-- Instância: Supabase Small (2GB RAM / 2 vCPUs)
-- =========================================================================

-- 1. CORREÇÃO DE REPLICA IDENTITY (Reduz gravação excessiva de WAL)
-- Ambas as tabelas têm PRIMARY KEY (id), portanto devem usar DEFAULT.
ALTER TABLE public.conversations REPLICA IDENTITY DEFAULT;
ALTER TABLE public.messages REPLICA IDENTITY DEFAULT;

-- 2. ÍNDICES COMPOSTOS PARA LISTAGEM DE CONVERSAS (Index-Only Scans)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_company_status_last_msg 
  ON public.conversations (company_id, status, last_message_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_company_unit_status_last_msg 
  ON public.conversations (company_id, unit_id, status, last_message_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_company_assigned_status
  ON public.conversations (company_id, assigned_agent_id, status, last_message_at DESC);

-- 3. ÍNDICES COMPOSTOS PARA MENSAGENS E SLA
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conv_sla 
  ON public.messages (conversation_id, is_internal, sender_type, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_sender_created 
  ON public.messages (sender_type, created_at DESC);

-- 4. ÍNDICES PARCIAIS PARA PROCESSOS DE BACKGROUND E CRONS
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_cleanup 
  ON public.call_logs (status, started_at) 
  WHERE status IN ('ACTIVE', 'RINGING');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scheduled_messages_pending_queue 
  ON public.scheduled_messages (status, scheduled_for) 
  WHERE status = 'pending';

-- 5. RPC AGREGADA PARA CONTAGEM DAS ABAS DE CONVERSAS (Substitui fetchAllPages)
CREATE OR REPLACE FUNCTION public.get_conversation_tab_counts(
  p_company_id UUID,
  p_unit_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT COALESCE(public.is_super_admin() OR p_company_id = public.current_company_id(), false) THEN
    RAISE EXCEPTION 'Acesso não autorizado para esta empresa' USING ERRCODE = '42501';
  END IF;

  WITH counts AS (
    SELECT 
      c.status,
      COUNT(*)::INT AS total,
      COALESCE(SUM(c.unread_count), 0)::INT AS unread
    FROM public.conversations c
    JOIN public.contacts ct ON ct.id = c.contact_id
    WHERE c.company_id = p_company_id
      AND ct.is_blocked IS NOT TRUE
      AND (p_unit_id IS NULL OR c.unit_id = p_unit_id)
    GROUP BY c.status
  )
  SELECT jsonb_build_object(
    'waiting', jsonb_build_object(
      'total', COALESCE((SELECT total FROM counts WHERE status = 'waiting'), 0),
      'unread', COALESCE((SELECT unread FROM counts WHERE status = 'unread'), 0)
    ),
    'active', jsonb_build_object(
      'total', COALESCE((SELECT total FROM counts WHERE status = 'active'), 0),
      'unread', COALESCE((SELECT unread FROM counts WHERE status = 'active'), 0)
    ),
    'resolved', jsonb_build_object(
      'total', COALESCE((SELECT total FROM counts WHERE status = 'resolved'), 0),
      'unread', COALESCE((SELECT unread FROM counts WHERE status = 'resolved'), 0)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversation_tab_counts(UUID, UUID) TO authenticated, service_role;
