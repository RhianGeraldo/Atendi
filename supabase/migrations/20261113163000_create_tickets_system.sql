-- =====================================================================
-- Migration: Sistema de Tickets / Helpdesk (Interno e Externo)
-- Multi-empresa (company_id) e Multi-unidade (unit_id)
-- =====================================================================

-- 1. TABELA PRINCIPAL DE TICKETS
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    
    -- Unidade responsável pelo atendimento/resolução
    unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
    
    -- Unidade de origem do solicitante (para chamados internos entre filiais/matriz)
    origin_unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
    
    -- Departamento responsável (TI, RH, Suporte, Financeiro, etc.)
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    
    -- Número sequencial amigável do ticket
    ticket_number BIGSERIAL,
    
    -- Escopo: 'internal' (colaboradores/setores) ou 'external' (clientes/fornecedores)
    scope TEXT NOT NULL DEFAULT 'internal' CHECK (scope IN ('internal', 'external')),
    
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'pending', 'resolved', 'closed', 'cancelled')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    
    -- Solicitante: Usuário interno OU Contato externo
    requester_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    requester_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    
    -- Atendente/Técnico responsável
    assigned_to_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    
    -- Vínculo com conversa do WhatsApp/Instagram (se gerado a partir de um chat)
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    
    -- Tags/Etiquetas para categorização
    tags TEXT[] NOT NULL DEFAULT '{}'::text[],
    
    -- SLA e Marcos Temporais
    sla_response_due_at TIMESTAMPTZ,
    sla_resolution_due_at TIMESTAMPTZ,
    first_responded_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. TABELA DE MENSAGENS E NOTAS DO TICKET
CREATE TABLE IF NOT EXISTS public.ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    
    -- Autor da mensagem
    sender_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    sender_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    
    -- Flag para nota interna (visível apenas para equipe interna / atendentes)
    is_internal_note BOOLEAN NOT NULL DEFAULT false,
    
    content TEXT NOT NULL,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. TABELA DE HISTÓRICO E AUDITORIA DO TICKET
CREATE TABLE IF NOT EXISTS public.ticket_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_tickets_company_id ON public.tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_tickets_unit_id ON public.tickets(unit_id);
CREATE INDEX IF NOT EXISTS idx_tickets_department_id ON public.tickets(department_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_scope ON public.tickets(scope);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON public.tickets(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_requester_user ON public.tickets(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_requester_contact ON public.tickets(requester_contact_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON public.ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket_id ON public.ticket_history(ticket_id);

-- 5. TRIGGER PARA ATUALIZAR updated_at AUTOMATICAMENTE
CREATE OR REPLACE FUNCTION public.handle_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_tickets_updated_at ON public.tickets;
CREATE TRIGGER trigger_tickets_updated_at
    BEFORE UPDATE ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_tickets_updated_at();

-- 6. TRIGGER PARA REGISTRAR HISTÓRICO DE MUDANÇA DE STATUS / ATRIBUIÇÃO
CREATE OR REPLACE FUNCTION public.handle_ticket_audit_log()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.ticket_history (ticket_id, user_id, action, metadata)
        VALUES (
            NEW.id,
            COALESCE(NEW.requester_user_id, auth.uid()),
            'created',
            jsonb_build_object('scope', NEW.scope, 'status', NEW.status, 'priority', NEW.priority)
        );
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            INSERT INTO public.ticket_history (ticket_id, user_id, action, metadata)
            VALUES (
                NEW.id,
                auth.uid(),
                'status_changed',
                jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
            );
        END IF;

        IF OLD.assigned_to_user_id IS DISTINCT FROM NEW.assigned_to_user_id THEN
            INSERT INTO public.ticket_history (ticket_id, user_id, action, metadata)
            VALUES (
                NEW.id,
                auth.uid(),
                'assignee_changed',
                jsonb_build_object('old_assignee', OLD.assigned_to_user_id, 'new_assignee', NEW.assigned_to_user_id)
            );
        END IF;

        IF OLD.priority IS DISTINCT FROM NEW.priority THEN
            INSERT INTO public.ticket_history (ticket_id, user_id, action, metadata)
            VALUES (
                NEW.id,
                auth.uid(),
                'priority_changed',
                jsonb_build_object('old_priority', OLD.priority, 'new_priority', NEW.priority)
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ticket_audit_log ON public.tickets;
CREATE TRIGGER trigger_ticket_audit_log
    AFTER INSERT OR UPDATE ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_ticket_audit_log();

-- 7. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_history ENABLE ROW LEVEL SECURITY;

-- Políticas para TICKETS
CREATE POLICY "Tickets visíveis por usuários da mesma empresa"
ON public.tickets FOR SELECT
TO authenticated
USING (
    company_id = public.current_company_id()
    AND (
        public.current_role() = 'super_admin'
        OR public.current_role() = 'admin_company'
        OR public.user_in_unit(unit_id)
        OR (origin_unit_id IS NOT NULL AND public.user_in_unit(origin_unit_id))
        OR requester_user_id = auth.uid()
        OR assigned_to_user_id = auth.uid()
    )
);

CREATE POLICY "Inserção de tickets na mesma empresa"
ON public.tickets FOR INSERT
TO authenticated
WITH CHECK (
    company_id = public.current_company_id()
);

CREATE POLICY "Atualização de tickets na mesma empresa"
ON public.tickets FOR UPDATE
TO authenticated
USING (
    company_id = public.current_company_id()
    AND (
        public.current_role() = 'super_admin'
        OR public.current_role() = 'admin_company'
        OR public.user_in_unit(unit_id)
        OR assigned_to_user_id = auth.uid()
        OR requester_user_id = auth.uid()
    )
);

CREATE POLICY "Exclusão de tickets restrita a administradores"
ON public.tickets FOR DELETE
TO authenticated
USING (
    company_id = public.current_company_id()
    AND (
        public.current_role() = 'super_admin'
        OR public.current_role() = 'admin_company'
    )
);

-- Políticas para TICKET_MESSAGES
CREATE POLICY "Mensagens visíveis por membros autorizados do ticket"
ON public.ticket_messages FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE t.id = ticket_messages.ticket_id
          AND t.company_id = public.current_company_id()
          AND (
              public.current_role() = 'super_admin'
              OR public.current_role() = 'admin_company'
              OR public.user_in_unit(t.unit_id)
              OR t.assigned_to_user_id = auth.uid()
              OR (
                  -- Se for o solicitante comum, ele não pode ver notas internas
                  t.requester_user_id = auth.uid() 
                  AND (ticket_messages.is_internal_note = false OR public.user_in_unit(t.unit_id))
              )
          )
    )
);

CREATE POLICY "Inserção de mensagens em tickets da empresa"
ON public.ticket_messages FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE t.id = ticket_messages.ticket_id
          AND t.company_id = public.current_company_id()
    )
);

-- Políticas para TICKET_HISTORY
CREATE POLICY "Histórico visível por membros do ticket"
ON public.ticket_history FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE t.id = ticket_history.ticket_id
          AND t.company_id = public.current_company_id()
    )
);

CREATE POLICY "Inserção de histórico de tickets"
ON public.ticket_history FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE t.id = ticket_history.ticket_id
          AND t.company_id = public.current_company_id()
    )
);

-- 8. GRANTS DE PERMISSÃO PARA OS ROLES SUPABASE
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_messages TO authenticated;
GRANT ALL ON public.ticket_messages TO service_role;

GRANT SELECT, INSERT ON public.ticket_history TO authenticated;
GRANT ALL ON public.ticket_history TO service_role;

GRANT USAGE, SELECT ON SEQUENCE public.tickets_ticket_number_seq TO authenticated, service_role;

-- 9. REALTIME (Adicionar tabelas à publicação se existir)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
        ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
