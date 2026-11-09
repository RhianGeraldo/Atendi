-- =====================================================================
-- Migration: Sistema de Campanhas de Disparos em Massa (Mass Broadcast)
-- Módulo completo para envios segmentados e importados com proteção anti-ban
-- =====================================================================

-- 1. TABELA PRINCIPAL DE CAMPANHAS
CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled', 'failed')),
    audience_type TEXT NOT NULL CHECK (audience_type IN ('segment', 'import')),
    audience_filters JSONB DEFAULT '{}'::jsonb,
    message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'audio', 'document')),
    content TEXT NOT NULL,
    media_url TEXT,
    media_name TEXT,
    whatsapp_instance_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
    settings JSONB NOT NULL DEFAULT '{
        "min_delay_seconds": 25,
        "max_delay_seconds": 55,
        "batch_size": 20,
        "batch_cooldown_seconds": 180,
        "allowed_start_time": "08:00",
        "allowed_end_time": "20:00",
        "allowed_days": [1, 2, 3, 4, 5, 6]
    }'::jsonb,
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    stats JSONB NOT NULL DEFAULT '{
        "total": 0,
        "pending": 0,
        "sent": 0,
        "failed": 0,
        "delivered": 0,
        "read": 0,
        "replied": 0
    }'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. TABELA DE DESTINATÁRIOS / FILA DA CAMPANHA
CREATE TABLE IF NOT EXISTS public.campaign_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    phone TEXT NOT NULL,
    name TEXT,
    custom_variables JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'delivered', 'read', 'replied', 'failed', 'cancelled')),
    whatsapp_instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    rendered_content TEXT,
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    replied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. ÍNDICES DE ALTA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_campaigns_company_status 
    ON public.campaigns (company_id, status);

CREATE INDEX IF NOT EXISTS idx_campaigns_queue_scan 
    ON public.campaigns (status, scheduled_at) 
    WHERE status IN ('scheduled', 'running');

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_queue 
    ON public.campaign_recipients (campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_phone 
    ON public.campaign_recipients (phone, company_id);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_conv 
    ON public.campaign_recipients (conversation_id);

-- 4. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

-- Políticas para Campanhas
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'campaigns' AND policyname = 'Users can view campaigns in their company'
    ) THEN
        CREATE POLICY "Users can view campaigns in their company"
            ON public.campaigns
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
        SELECT 1 FROM pg_policies WHERE tablename = 'campaigns' AND policyname = 'Users can create/update campaigns in their company'
    ) THEN
        CREATE POLICY "Users can create/update campaigns in their company"
            ON public.campaigns
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
        SELECT 1 FROM pg_policies WHERE tablename = 'campaigns' AND policyname = 'Service role full access on campaigns'
    ) THEN
        CREATE POLICY "Service role full access on campaigns"
            ON public.campaigns
            FOR ALL
            USING (auth.role() = 'service_role')
            WITH CHECK (auth.role() = 'service_role');
    END IF;
END $$;

-- Políticas para Destinatários
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'campaign_recipients' AND policyname = 'Users can view campaign recipients in their company'
    ) THEN
        CREATE POLICY "Users can view campaign recipients in their company"
            ON public.campaign_recipients
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
        SELECT 1 FROM pg_policies WHERE tablename = 'campaign_recipients' AND policyname = 'Service role full access on campaign_recipients'
    ) THEN
        CREATE POLICY "Service role full access on campaign_recipients"
            ON public.campaign_recipients
            FOR ALL
            USING (auth.role() = 'service_role')
            WITH CHECK (auth.role() = 'service_role');
    END IF;
END $$;

-- 5. FUNÇÃO PARA RECALCULAR ESTATÍSTICAS DA CAMPANHA
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
BEGIN
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

    -- O total de disparos enviados com sucesso inclui quem já respondeu, leu ou recebeu
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

    -- Se estava rodando e não há mais pendentes nem em processamento, conclui
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

    RETURN v_stats;
END;
$$;

-- 6. RPC DE CONSULTA DE SEGMENTAÇÃO DE CONTATOS (ALTA PERFORMANCE)
CREATE OR REPLACE FUNCTION public.get_campaign_audience_contacts(
    p_company_id UUID,
    p_filters JSONB DEFAULT '{}'::jsonb,
    p_limit INT DEFAULT NULL,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    phone TEXT,
    email TEXT,
    unit_id UUID,
    tags TEXT[],
    last_interaction TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inactivity_days INT;
    v_tags TEXT[];
    v_excluded_tags TEXT[];
    v_unit_ids UUID[];
    v_only_without_open_conversations BOOLEAN;
    v_inactivity_cutoff TIMESTAMPTZ;
BEGIN
    IF (p_filters->>'inactivity_days') IS NOT NULL 
       AND (p_filters->>'inactivity_days') <> '' 
       AND (p_filters->>'inactivity_days') ~ '^[0-9]+$' THEN
        v_inactivity_days := (p_filters->>'inactivity_days')::INT;
    END IF;

    IF jsonb_typeof(p_filters->'tags') = 'array' AND jsonb_array_length(p_filters->'tags') > 0 THEN
        SELECT array_agg(value::text) INTO v_tags FROM jsonb_array_elements_text(p_filters->'tags');
    END IF;

    IF jsonb_typeof(p_filters->'excluded_tags') = 'array' AND jsonb_array_length(p_filters->'excluded_tags') > 0 THEN
        SELECT array_agg(value::text) INTO v_excluded_tags FROM jsonb_array_elements_text(p_filters->'excluded_tags');
    END IF;

    IF jsonb_typeof(p_filters->'unit_ids') = 'array' AND jsonb_array_length(p_filters->'unit_ids') > 0 THEN
        SELECT array_agg(value::uuid) INTO v_unit_ids FROM jsonb_array_elements_text(p_filters->'unit_ids');
    END IF;
    v_only_without_open_conversations := COALESCE((p_filters->>'only_without_open_conversations')::BOOLEAN, false);

    IF v_inactivity_days IS NOT NULL AND v_inactivity_days > 0 THEN
        v_inactivity_cutoff := now() - (v_inactivity_days || ' days')::INTERVAL;
    END IF;

    RETURN QUERY
    WITH latest_convs AS (
        SELECT 
            c.contact_id,
            max(c.last_message_at) AS max_last_message_at,
            bool_or(c.status IN ('active', 'waiting')) AS has_open_conv
        FROM public.conversations c
        GROUP BY c.contact_id
    )
    SELECT 
        ct.id,
        ct.name,
        ct.phone,
        ct.email,
        ct.unit_id,
        ct.tags,
        COALESCE(lc.max_last_message_at, ct.created_at) AS last_interaction,
        ct.created_at
    FROM public.contacts ct
    LEFT JOIN latest_convs lc ON lc.contact_id = ct.id
    WHERE ct.company_id = p_company_id
      AND ct.is_blocked = false
      AND ct.merged_into_id IS NULL
      AND ct.phone IS NOT NULL
      AND trim(ct.phone) <> ''
      AND (v_unit_ids IS NULL OR ct.unit_id = ANY(v_unit_ids))
      AND (v_tags IS NULL OR ct.tags && v_tags)
      AND (v_excluded_tags IS NULL OR NOT (ct.tags && v_excluded_tags))
      AND (
          v_inactivity_cutoff IS NULL 
          OR COALESCE(lc.max_last_message_at, ct.created_at) <= v_inactivity_cutoff
      )
      AND (
          NOT v_only_without_open_conversations 
          OR COALESCE(lc.has_open_conv, false) = false
      )
    ORDER BY COALESCE(lc.max_last_message_at, ct.created_at) ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- 7. RPC DE CONTAGEM RÁPIDA DE AUDIÊNCIA
CREATE OR REPLACE FUNCTION public.count_campaign_audience_contacts(
    p_company_id UUID,
    p_filters JSONB DEFAULT '{}'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inactivity_days INT;
    v_tags TEXT[];
    v_excluded_tags TEXT[];
    v_unit_ids UUID[];
    v_only_without_open_conversations BOOLEAN;
    v_inactivity_cutoff TIMESTAMPTZ;
    v_count BIGINT;
BEGIN
    IF (p_filters->>'inactivity_days') IS NOT NULL 
       AND (p_filters->>'inactivity_days') <> '' 
       AND (p_filters->>'inactivity_days') ~ '^[0-9]+$' THEN
        v_inactivity_days := (p_filters->>'inactivity_days')::INT;
    END IF;

    IF jsonb_typeof(p_filters->'tags') = 'array' AND jsonb_array_length(p_filters->'tags') > 0 THEN
        SELECT array_agg(value::text) INTO v_tags FROM jsonb_array_elements_text(p_filters->'tags');
    END IF;

    IF jsonb_typeof(p_filters->'excluded_tags') = 'array' AND jsonb_array_length(p_filters->'excluded_tags') > 0 THEN
        SELECT array_agg(value::text) INTO v_excluded_tags FROM jsonb_array_elements_text(p_filters->'excluded_tags');
    END IF;

    IF jsonb_typeof(p_filters->'unit_ids') = 'array' AND jsonb_array_length(p_filters->'unit_ids') > 0 THEN
        SELECT array_agg(value::uuid) INTO v_unit_ids FROM jsonb_array_elements_text(p_filters->'unit_ids');
    END IF;
    v_only_without_open_conversations := COALESCE((p_filters->>'only_without_open_conversations')::BOOLEAN, false);

    IF v_inactivity_days IS NOT NULL AND v_inactivity_days > 0 THEN
        v_inactivity_cutoff := now() - (v_inactivity_days || ' days')::INTERVAL;
    END IF;

    WITH latest_convs AS (
        SELECT 
            c.contact_id,
            max(c.last_message_at) AS max_last_message_at,
            bool_or(c.status IN ('active', 'waiting')) AS has_open_conv
        FROM public.conversations c
        GROUP BY c.contact_id
    )
    SELECT count(*) INTO v_count
    FROM public.contacts ct
    LEFT JOIN latest_convs lc ON lc.contact_id = ct.id
    WHERE ct.company_id = p_company_id
      AND ct.is_blocked = false
      AND ct.merged_into_id IS NULL
      AND ct.phone IS NOT NULL
      AND trim(ct.phone) <> ''
      AND (v_unit_ids IS NULL OR ct.unit_id = ANY(v_unit_ids))
      AND (v_tags IS NULL OR ct.tags && v_tags)
      AND (v_excluded_tags IS NULL OR NOT (ct.tags && v_excluded_tags))
      AND (
          v_inactivity_cutoff IS NULL 
          OR COALESCE(lc.max_last_message_at, ct.created_at) <= v_inactivity_cutoff
      )
      AND (
          NOT v_only_without_open_conversations 
          OR COALESCE(lc.has_open_conv, false) = false
      );

    RETURN COALESCE(v_count, 0);
END;
$$;
