-- =====================================================================
-- Migration: Create Scheduled Messages System (Agendamento de Mensagens)
-- Permite que usuários humanos e agentes de IA agendem mensagens futuras.
-- Suporta também cadência de follow-up (D+1, D+3, D+7, D+15, D+30).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.scheduled_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    creator_type TEXT NOT NULL CHECK (creator_type IN ('user', 'agent', 'system')),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ai_agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    media_type TEXT,
    media_url TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
    sent_at TIMESTAMPTZ,
    cancel_reason TEXT,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance and high-speed cron processing
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_pending 
    ON public.scheduled_messages (status, scheduled_at) 
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_conv 
    ON public.scheduled_messages (conversation_id, status);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_company 
    ON public.scheduled_messages (company_id);

-- Enable RLS
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

-- Policies for Authenticated Users
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'scheduled_messages' AND policyname = 'Users can view scheduled messages in their company'
    ) THEN
        CREATE POLICY "Users can view scheduled messages in their company"
            ON public.scheduled_messages
            FOR SELECT
            TO authenticated
            USING (
                company_id IN (
                    SELECT company_id FROM public.profiles WHERE id = auth.uid()
                )
            );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'scheduled_messages' AND policyname = 'Users can create scheduled messages in their company'
    ) THEN
        CREATE POLICY "Users can create scheduled messages in their company"
            ON public.scheduled_messages
            FOR INSERT
            TO authenticated
            WITH CHECK (
                company_id IN (
                    SELECT company_id FROM public.profiles WHERE id = auth.uid()
                )
            );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'scheduled_messages' AND policyname = 'Users can update/cancel scheduled messages in their company'
    ) THEN
        CREATE POLICY "Users can update/cancel scheduled messages in their company"
            ON public.scheduled_messages
            FOR UPDATE
            TO authenticated
            USING (
                company_id IN (
                    SELECT company_id FROM public.profiles WHERE id = auth.uid()
                )
            );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'scheduled_messages' AND policyname = 'Service role full access on scheduled_messages'
    ) THEN
        CREATE POLICY "Service role full access on scheduled_messages"
            ON public.scheduled_messages
            FOR ALL
            USING (auth.role() = 'service_role')
            WITH CHECK (auth.role() = 'service_role');
    END IF;
END $$;
