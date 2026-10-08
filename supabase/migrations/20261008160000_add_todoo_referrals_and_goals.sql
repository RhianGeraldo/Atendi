-- Migration: Módulo de Indicações (Member-Get-Member / Pedir Indique) e Metas de Cadastro de Contatos do Todoo

-- 1. Tabela de Indicações (todoo_referrals)
CREATE TABLE IF NOT EXISTS public.todoo_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
    referrer_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    referrer_name TEXT NOT NULL,
    referrer_phone TEXT,
    referred_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    referred_name TEXT NOT NULL,
    referred_phone TEXT NOT NULL,
    interested_service TEXT,
    voucher_code TEXT,
    voucher_value NUMERIC DEFAULT 150,
    captured_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',      -- Aguardando contato da consultora
        'contacted',    -- Em negociação
        'scheduled',    -- Agendou avaliação/sessão
        'won',          -- Fechou contrato!
        'lost'          -- Sem interesse
    )),
    reward_status TEXT NOT NULL DEFAULT 'pending' CHECK (reward_status IN (
        'pending',      -- Aguardando fechamento da indicada
        'granted',      -- Crédito liberado para a indicadora
        'claimed'       -- Bônus já utilizado/resgatado
    )),
    reward_details TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_todoo_referrals_company ON public.todoo_referrals(company_id);
CREATE INDEX IF NOT EXISTS idx_todoo_referrals_captured_by ON public.todoo_referrals(captured_by_user_id);
CREATE INDEX IF NOT EXISTS idx_todoo_referrals_status ON public.todoo_referrals(status);
CREATE INDEX IF NOT EXISTS idx_todoo_referrals_created_at ON public.todoo_referrals(created_at);

-- 2. Tabela de Metas Individuais de Cadastro e Vendas (todoo_goals)
CREATE TABLE IF NOT EXISTS public.todoo_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    month_year TEXT NOT NULL, -- Ex: '2026-10'
    target_contacts INTEGER NOT NULL DEFAULT 20, -- Meta de cadastros/indicações no mês
    target_conversions INTEGER NOT NULL DEFAULT 5, -- Meta de contratos fechados
    target_revenue NUMERIC NOT NULL DEFAULT 10000, -- Meta de faturamento R$
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_todoo_goals_company_user_month UNIQUE(company_id, user_id, month_year)
);

CREATE INDEX IF NOT EXISTS idx_todoo_goals_company_month ON public.todoo_goals(company_id, month_year);
CREATE INDEX IF NOT EXISTS idx_todoo_goals_user ON public.todoo_goals(user_id);

-- 3. RLS
ALTER TABLE public.todoo_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todoo_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "todoo_referrals_select" ON public.todoo_referrals
    FOR SELECT USING (
        company_id = public.current_company_id() 
        OR public.has_matriz_access()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "todoo_referrals_insert" ON public.todoo_referrals
    FOR INSERT WITH CHECK (
        company_id = public.current_company_id() 
        OR public.has_matriz_access()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "todoo_referrals_update" ON public.todoo_referrals
    FOR UPDATE USING (
        company_id = public.current_company_id() 
        OR public.has_matriz_access()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "todoo_referrals_delete" ON public.todoo_referrals
    FOR DELETE USING (
        company_id = public.current_company_id() 
        OR public.has_matriz_access()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "todoo_goals_select" ON public.todoo_goals
    FOR SELECT USING (
        company_id = public.current_company_id() 
        OR public.has_matriz_access()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "todoo_goals_insert" ON public.todoo_goals
    FOR INSERT WITH CHECK (
        company_id = public.current_company_id() 
        OR public.has_matriz_access()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "todoo_goals_update" ON public.todoo_goals
    FOR UPDATE USING (
        company_id = public.current_company_id() 
        OR public.has_matriz_access()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "todoo_goals_delete" ON public.todoo_goals
    FOR DELETE USING (
        company_id = public.current_company_id() 
        OR public.has_matriz_access()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );
