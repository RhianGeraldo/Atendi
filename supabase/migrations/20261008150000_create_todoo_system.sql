-- Migration: Sistema Meu Todoo (CRM de Execução Comercial Diária)
-- Modelo operacional baseado nos manuais de Todoo e Estética/Laser

-- 1. Tabela de Campanhas / Ações Comerciais do Todoo
CREATE TABLE IF NOT EXISTS public.todoo_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'custom' CHECK (type IN (
        'retention_saldo',   -- Saldo <= 3 Sessões (Manutenção Anual)
        'upsell_zones',      -- Zonas em Aberto / Multi-regiões
        'reactivation',      -- Reativação de Inativos (> 45/60 dias)
        'mgm_referral',      -- Desafio 3 Amigas (Member-Get-Member)
        'quote_followup',    -- Follow-up Orçamentos D+1, D+3, D+6
        'birthday',          -- Aniversariantes do Mês
        'custom'             -- Personalizada
    )),
    source_type TEXT NOT NULL DEFAULT 'internal_crm' CHECK (source_type IN (
        'internal_crm',      -- Puxado dos atendimentos / CRM do Atendi
        'erp_import',        -- Importado de planilha CSV/Excel do ERP
        'manual'             -- Inserido manualmente
    )),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'draft',
        'active',
        'paused',
        'completed',
        'archived'
    )),
    message_template TEXT,
    offer_details TEXT,
    sla_hours INTEGER NOT NULL DEFAULT 24,
    redistribute_on_sla_breach BOOLEAN NOT NULL DEFAULT true,
    distribution_mode TEXT NOT NULL DEFAULT 'round_robin' CHECK (distribution_mode IN (
        'round_robin',       -- Rodízio equilibrado entre consultoras
        'last_agent',        -- Atendente que fez o último contato
        'fixed_user'         -- Consultora específica
    )),
    target_count INTEGER DEFAULT 0,
    target_revenue NUMERIC DEFAULT 0,
    start_date TIMESTAMPTZ DEFAULT now(),
    end_date TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para campanhas
CREATE INDEX IF NOT EXISTS idx_todoo_campaigns_company ON public.todoo_campaigns(company_id);
CREATE INDEX IF NOT EXISTS idx_todoo_campaigns_status ON public.todoo_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_todoo_campaigns_unit ON public.todoo_campaigns(unit_id);

-- 2. Tabela de Leads / Fila de Execução do Todoo
CREATE TABLE IF NOT EXISTS public.todoo_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.todoo_campaigns(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    contact_name TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    assigned_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ DEFAULT now(),
    sla_deadline TIMESTAMPTZ,
    sla_breached BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',           -- Aguardando contato
        'contacted',         -- Mensagem enviada / Em negociação
        'scheduled',         -- Agendou avaliação ou sessão
        'quoted',            -- Enviou orçamento / proposta
        'won',               -- Fechou contrato
        'lost',              -- Sem interesse / recusou
        'callback'           -- Pediu para retornar mais tarde
    )),
    custom_fields JSONB DEFAULT '{}'::jsonb, -- Saldo de sessões, zonas em aberto, última sessão do ERP
    first_contact_at TIMESTAMPTZ,
    last_interaction_at TIMESTAMPTZ,
    outcome_type TEXT,
    outcome_notes TEXT,
    outcome_value NUMERIC DEFAULT 0,
    callback_scheduled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para leads da fila do Todoo
CREATE INDEX IF NOT EXISTS idx_todoo_leads_campaign ON public.todoo_leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_todoo_leads_company ON public.todoo_leads(company_id);
CREATE INDEX IF NOT EXISTS idx_todoo_leads_assigned ON public.todoo_leads(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_todoo_leads_status ON public.todoo_leads(status);
CREATE INDEX IF NOT EXISTS idx_todoo_leads_sla_deadline ON public.todoo_leads(sla_deadline);
CREATE INDEX IF NOT EXISTS idx_todoo_leads_contact ON public.todoo_leads(contact_id);

-- 3. Tabela de Histórico de Ações & Auditoria
CREATE TABLE IF NOT EXISTS public.todoo_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.todoo_leads(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.todoo_campaigns(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL, -- 'assigned', 'redistributed_sla', 'whatsapp_sent', 'status_changed', 'callback_scheduled', 'outcome_registered'
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_todoo_events_lead ON public.todoo_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_todoo_events_campaign ON public.todoo_events(campaign_id);

-- 4. Habilitar RLS (Row Level Security)
ALTER TABLE public.todoo_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todoo_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todoo_events ENABLE ROW LEVEL SECURITY;

-- Políticas para todoo_campaigns
CREATE POLICY "todoo_campaigns_select_company" ON public.todoo_campaigns
    FOR SELECT USING (
        company_id = public.current_company_id() 
        OR public.has_matriz_access()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "todoo_campaigns_insert_company" ON public.todoo_campaigns
    FOR INSERT WITH CHECK (
        company_id = public.current_company_id()
        OR public.has_matriz_access()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "todoo_campaigns_update_company" ON public.todoo_campaigns
    FOR UPDATE USING (
        company_id = public.current_company_id()
        OR public.has_matriz_access()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "todoo_campaigns_delete_company" ON public.todoo_campaigns
    FOR DELETE USING (
        company_id = public.current_company_id()
        OR public.has_matriz_access()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

-- Políticas para todoo_leads
CREATE POLICY "todoo_leads_select_company" ON public.todoo_leads
    FOR SELECT USING (
        company_id = public.current_company_id()
        OR public.has_matriz_access()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "todoo_leads_insert_company" ON public.todoo_leads
    FOR INSERT WITH CHECK (
        company_id = public.current_company_id()
        OR public.has_matriz_access()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "todoo_leads_update_company" ON public.todoo_leads
    FOR UPDATE USING (
        company_id = public.current_company_id()
        OR public.has_matriz_access()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "todoo_leads_delete_company" ON public.todoo_leads
    FOR DELETE USING (
        company_id = public.current_company_id()
        OR public.has_matriz_access()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

-- Políticas para todoo_events
CREATE POLICY "todoo_events_select_company" ON public.todoo_events
    FOR SELECT USING (
        company_id = public.current_company_id()
        OR public.has_matriz_access()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "todoo_events_insert_company" ON public.todoo_events
    FOR INSERT WITH CHECK (
        company_id = public.current_company_id()
        OR public.has_matriz_access()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );
