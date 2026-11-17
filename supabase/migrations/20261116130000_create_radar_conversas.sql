-- =====================================================================
-- Migration: Radar de Conversas (Detecção de Churn, Incidentes e Riscos)
-- Permite rastrear conversas críticas e gerar tickets automáticos (Origem: Radar)
-- =====================================================================

-- 1. Adiciona coluna de origem na tabela tickets para diferenciar: manual, ai_agent e radar
ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'ai_agent', 'radar'));

-- Atualiza tickets que possuem tag 'aberto-por-ia' para origin = 'ai_agent'
UPDATE public.tickets 
SET origin = 'ai_agent' 
WHERE 'aberto-por-ia' = ANY(tags) AND origin = 'manual';

-- 2. Adiciona colunas de radar na tabela conversations para visualização ágil
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS radar_status TEXT CHECK (radar_status IN ('active', 'resolved', 'dismissed')),
ADD COLUMN IF NOT EXISTS radar_last_alert_at TIMESTAMPTZ;

-- 3. Cria a tabela principal de alertas do radar
CREATE TABLE IF NOT EXISTS public.conversation_radar_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
    
    category TEXT NOT NULL CHECK (category IN ('churn', 'critical_issue', 'legal_risk', 'severe_dissatisfaction', 'billing')),
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    
    trigger_message TEXT NOT NULL,
    ai_summary TEXT NOT NULL,
    suggested_action TEXT,
    
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'ticket_created', 'dismissed', 'resolved')),
    
    ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
    resolved_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de alta performance
CREATE INDEX IF NOT EXISTS idx_radar_alerts_company_status ON public.conversation_radar_alerts(company_id, status);
CREATE INDEX IF NOT EXISTS idx_radar_alerts_conversation ON public.conversation_radar_alerts(conversation_id);
CREATE INDEX IF NOT EXISTS idx_radar_alerts_category ON public.conversation_radar_alerts(category);
CREATE INDEX IF NOT EXISTS idx_radar_alerts_created_at ON public.conversation_radar_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_origin ON public.tickets(origin);
CREATE INDEX IF NOT EXISTS idx_conversations_radar_status ON public.conversations(radar_status) WHERE radar_status = 'active';

-- Habilitar RLS
ALTER TABLE public.conversation_radar_alerts ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Radar alerts visíveis por membros da empresa"
ON public.conversation_radar_alerts FOR SELECT
TO authenticated
USING (
    company_id = public.current_company_id()
    AND (
        public.current_role() = 'super_admin'
        OR public.current_role() = 'admin_company'
        OR unit_id IS NULL
        OR public.user_in_unit(unit_id)
    )
);

CREATE POLICY "Inserção de radar alerts na mesma empresa"
ON public.conversation_radar_alerts FOR INSERT
TO authenticated
WITH CHECK (
    company_id = public.current_company_id()
);

CREATE POLICY "Atualização de radar alerts na mesma empresa"
ON public.conversation_radar_alerts FOR UPDATE
TO authenticated
USING (
    company_id = public.current_company_id()
    AND (
        public.current_role() = 'super_admin'
        OR public.current_role() = 'admin_company'
        OR unit_id IS NULL
        OR public.user_in_unit(unit_id)
    )
);

CREATE POLICY "Service role tem acesso total a conversation_radar_alerts"
ON public.conversation_radar_alerts FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Permissões de tabela
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_radar_alerts TO authenticated;
GRANT ALL ON public.conversation_radar_alerts TO service_role;

-- Publicar no realtime se a publicação existir
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_radar_alerts;
    END IF;
END $$;
