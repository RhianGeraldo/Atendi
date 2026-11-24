-- =========================================================================
-- Migration: Otimizações Críticas de Performance (Disk I/O e CPU)
-- Instância: Supabase Small (2GB RAM / 2 vCPUs)
-- =========================================================================

-- 1. CORREÇÃO DE REPLICA IDENTITY EM CONVERSATIONS
-- Reduz gravação maciça no WAL gerada a cada nova mensagem/update de status.
-- MANTEMOS messages com FULL para garantir que filtros realtime com conversation_id
-- continuem recebendo UPDATE e DELETE sem risco de falha na recepção de mensagens.
ALTER TABLE public.conversations REPLICA IDENTITY DEFAULT;

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
  ON public.scheduled_messages (status, scheduled_at) 
  WHERE status = 'pending';

-- 5. RPC AGREGADA PARA CONTAGEM DAS ABAS DE CONVERSAS (Substitui fetchAllPages)
CREATE OR REPLACE FUNCTION public.get_conversation_tab_counts(
  p_company_id UUID,
  p_unit_id UUID DEFAULT NULL,
  p_instance_id UUID DEFAULT NULL,
  p_department_id UUID DEFAULT NULL,
  p_agent_id TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_is_admin BOOLEAN := false;
  v_is_manager BOOLEAN := false;
  v_user_dept UUID := NULL;
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin')
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT COALESCE(public.is_super_admin() OR p_company_id = public.current_company_id(), false) THEN
    RAISE EXCEPTION 'Acesso não autorizado para esta empresa' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT (role = 'admin_company' OR role = 'super_admin'), (role = 'manager'), department_id
    INTO v_is_admin, v_is_manager, v_user_dept
    FROM public.profiles
    WHERE id = p_user_id;
  ELSE
    v_is_admin := true;
  END IF;

  WITH counts AS (
    SELECT 
      CASE 
        WHEN c.channel::text = 'whatsapp_group'
             OR c.remote_id LIKE '%@g.us%'
             OR ct.phone LIKE '%@g.us%'
             OR ct.phone LIKE '120363%'
             OR (ct.phone LIKE '%-%' AND length(ct.phone) > 18) THEN 'groups'
        ELSE c.status::TEXT
      END AS status_group,
      COUNT(*)::INT AS total,
      COALESCE(SUM(c.unread_count), 0)::INT AS unread
    FROM public.conversations c
    JOIN public.contacts ct ON ct.id = c.contact_id
    WHERE c.company_id = p_company_id
      AND ct.is_blocked IS NOT TRUE
      AND (p_unit_id IS NULL OR c.unit_id = p_unit_id)
      AND (p_instance_id IS NULL OR c.whatsapp_instance_id = p_instance_id)
      AND (p_department_id IS NULL OR c.department_id = p_department_id)
      AND (
        p_agent_id IS NULL 
        OR (p_agent_id = 'unassigned' AND c.assigned_agent_id IS NULL)
        OR (p_agent_id <> 'unassigned' AND c.assigned_agent_id::text = p_agent_id)
      )
      AND (
        p_search IS NULL 
        OR p_search = ''
        OR ct.name ILIKE ('%' || p_search || '%')
        OR ct.phone ILIKE ('%' || p_search || '%')
        OR ct.whatsapp_lid ILIKE ('%' || p_search || '%')
      )
      AND (
        v_is_admin
        OR (
          (c.status = 'waiting' AND (c.department_id IS NULL OR c.department_id = v_user_dept OR c.assigned_agent_id = p_user_id))
          OR (c.status = 'active' AND (c.assigned_agent_id = p_user_id OR (v_is_manager AND c.department_id = v_user_dept) OR (c.assigned_agent_id IS NULL AND (c.department_id = v_user_dept OR c.department_id IS NULL))))
          OR (c.status = 'resolved' AND (c.assigned_agent_id = p_user_id OR (v_is_manager AND c.department_id = v_user_dept)))
          OR (c.channel::text = 'whatsapp_group' OR c.remote_id LIKE '%@g.us%' OR ct.phone LIKE '%@g.us%')
        )
      )
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'waiting', jsonb_build_object(
      'total', COALESCE((SELECT total FROM counts WHERE status_group = 'waiting'), 0),
      'unread', COALESCE((SELECT unread FROM counts WHERE status_group = 'waiting'), 0)
    ),
    'active', jsonb_build_object(
      'total', COALESCE((SELECT total FROM counts WHERE status_group = 'active'), 0),
      'unread', COALESCE((SELECT unread FROM counts WHERE status_group = 'active'), 0)
    ),
    'resolved', jsonb_build_object(
      'total', COALESCE((SELECT total FROM counts WHERE status_group = 'resolved'), 0),
      'unread', COALESCE((SELECT unread FROM counts WHERE status_group = 'resolved'), 0)
    ),
    'groups', jsonb_build_object(
      'total', COALESCE((SELECT total FROM counts WHERE status_group = 'groups'), 0),
      'unread', COALESCE((SELECT unread FROM counts WHERE status_group = 'groups'), 0)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversation_tab_counts(UUID, UUID, UUID, UUID, TEXT, TEXT, UUID) TO authenticated, service_role;
