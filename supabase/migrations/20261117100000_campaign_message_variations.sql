-- =====================================================================
-- Migration: Variações de Mensagens e Teste A/B em Campanhas em Massa
-- Permite múltiplas mensagens (texto, imagem, vídeo, áudio, doc) por campanha
-- e calcula métricas de envio, entrega, leitura e resposta por variação.
-- =====================================================================

-- 1. TABELA DE VARIAÇÕES DE MENSAGENS DA CAMPANHA
CREATE TABLE IF NOT EXISTS public.campaign_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'audio', 'document')),
    content TEXT NOT NULL,
    media_url TEXT,
    media_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    stats JSONB NOT NULL DEFAULT '{
        "total": 0,
        "sent": 0,
        "delivered": 0,
        "read": 0,
        "replied": 0,
        "failed": 0
    }'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. VINCULAR DESTINATÁRIOS À VARIAÇÃO ENVIADA
ALTER TABLE public.campaign_recipients
    ADD COLUMN IF NOT EXISTS campaign_message_id UUID REFERENCES public.campaign_messages(id) ON DELETE SET NULL;

-- 3. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_campaign_messages_campaign
    ON public.campaign_messages (campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_message_id
    ON public.campaign_recipients (campaign_message_id);

-- 4. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.campaign_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'campaign_messages' AND policyname = 'Users can view campaign messages in their company'
    ) THEN
        CREATE POLICY "Users can view campaign messages in their company"
            ON public.campaign_messages
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
        SELECT 1 FROM pg_policies WHERE tablename = 'campaign_messages' AND policyname = 'Users can manage campaign messages in their company'
    ) THEN
        CREATE POLICY "Users can manage campaign messages in their company"
            ON public.campaign_messages
            FOR ALL
            TO authenticated
            USING (
                company_id IN (
                    SELECT company_id FROM public.profiles WHERE id = auth.uid()
                )
            )
            WITH CHECK (
                company_id IN (
                    SELECT company_id FROM public.profiles WHERE id = auth.uid()
                )
            );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'campaign_messages' AND policyname = 'Service role full access on campaign_messages'
    ) THEN
        CREATE POLICY "Service role full access on campaign_messages"
            ON public.campaign_messages
            FOR ALL
            USING (auth.role() = 'service_role')
            WITH CHECK (auth.role() = 'service_role');
    END IF;
END $$;

-- 5. BACKFILL: CRIAR VARIAÇÃO PADRÃO PARA CAMPANHAS EXISTENTES
INSERT INTO public.campaign_messages (
    campaign_id,
    company_id,
    name,
    message_type,
    content,
    media_url,
    media_name,
    stats,
    created_at,
    updated_at
)
SELECT 
    c.id,
    c.company_id,
    'Variação 1',
    c.message_type,
    c.content,
    c.media_url,
    c.media_name,
    c.stats,
    c.created_at,
    c.updated_at
FROM public.campaigns c
WHERE NOT EXISTS (
    SELECT 1 FROM public.campaign_messages cm WHERE cm.campaign_id = c.id
);

-- Atualiza destinatários existentes sem variação vinculada
UPDATE public.campaign_recipients cr
SET campaign_message_id = cm.id
FROM public.campaign_messages cm
WHERE cr.campaign_id = cm.campaign_id
  AND cr.campaign_message_id IS NULL;

-- 6. FUNÇÃO ATUALIZADA PARA RECALCULAR ESTATÍSTICAS DA CAMPANHA E DE SUAS VARIAÇÕES
CREATE OR REPLACE FUNCTION public.recalculate_campaign_stats(p_campaign_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_stats JSONB;
    v_total INT;
    v_pending INT;
    v_processing INT;
    v_sent INT;
    v_delivered INT;
    v_read INT;
    v_replied INT;
    v_failed INT;
    v_current_status TEXT;
    v_total_dispatched INT;
    v_msg RECORD;
    v_msg_stats JSONB;
    v_m_total INT;
    v_m_sent INT;
    v_m_delivered INT;
    v_m_read INT;
    v_m_replied INT;
    v_m_failed INT;
    v_m_dispatched INT;
BEGIN
    -- 1. Métricas Globais da Campanha
    SELECT 
        count(*),
        count(*) FILTER (WHERE status = 'pending'),
        count(*) FILTER (WHERE status = 'processing'),
        count(*) FILTER (WHERE status = 'sent'),
        count(*) FILTER (WHERE status = 'delivered'),
        count(*) FILTER (WHERE status = 'read'),
        count(*) FILTER (WHERE status = 'replied'),
        count(*) FILTER (WHERE status = 'failed')
    INTO 
        v_total,
        v_pending,
        v_processing,
        v_sent,
        v_delivered,
        v_read,
        v_replied,
        v_failed
    FROM public.campaign_recipients
    WHERE campaign_id = p_campaign_id;

    v_total_dispatched := COALESCE(v_sent, 0) + COALESCE(v_delivered, 0) + COALESCE(v_read, 0) + COALESCE(v_replied, 0);

    v_stats := jsonb_build_object(
        'total', COALESCE(v_total, 0),
        'pending', COALESCE(v_pending, 0),
        'processing', COALESCE(v_processing, 0),
        'sent', v_total_dispatched,
        'delivered', COALESCE(v_delivered, 0),
        'read', COALESCE(v_read, 0),
        'replied', COALESCE(v_replied, 0),
        'failed', COALESCE(v_failed, 0)
    );

    SELECT status INTO v_current_status FROM public.campaigns WHERE id = p_campaign_id;

    IF v_current_status = 'running' AND (v_pending + v_processing) = 0 AND v_total > 0 THEN
        UPDATE public.campaigns
        SET stats = v_stats,
            status = 'completed',
            completed_at = now(),
            updated_at = now()
        WHERE id = p_campaign_id;
    ELSE
        UPDATE public.campaigns
        SET stats = v_stats,
            updated_at = now()
        WHERE id = p_campaign_id;
    END IF;

    -- 2. Métricas Individuais por Variação (campaign_messages)
    FOR v_msg IN (SELECT id FROM public.campaign_messages WHERE campaign_id = p_campaign_id) LOOP
        SELECT 
            count(*),
            count(*) FILTER (WHERE status = 'sent'),
            count(*) FILTER (WHERE status = 'delivered'),
            count(*) FILTER (WHERE status = 'read'),
            count(*) FILTER (WHERE status = 'replied'),
            count(*) FILTER (WHERE status = 'failed')
        INTO 
            v_m_total,
            v_m_sent,
            v_m_delivered,
            v_m_read,
            v_m_replied,
            v_m_failed
        FROM public.campaign_recipients
        WHERE campaign_message_id = v_msg.id;

        v_m_dispatched := COALESCE(v_m_sent, 0) + COALESCE(v_m_delivered, 0) + COALESCE(v_m_read, 0) + COALESCE(v_m_replied, 0);

        v_msg_stats := jsonb_build_object(
            'total', COALESCE(v_m_total, 0),
            'sent', v_m_dispatched,
            'delivered', COALESCE(v_m_delivered, 0),
            'read', COALESCE(v_m_read, 0),
            'replied', COALESCE(v_m_replied, 0),
            'failed', COALESCE(v_m_failed, 0)
        );

        UPDATE public.campaign_messages
        SET stats = v_msg_stats,
            updated_at = now()
        WHERE id = v_msg.id;
    END LOOP;

    RETURN v_stats;
END;
$$;
