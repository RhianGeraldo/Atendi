-- =====================================================================
-- Migration: Quadro dos Sonhos (Todoo Dreams)
-- Permite que usuários (vendedoras/consultoras) cadastrem seus sonhos/objetivos
-- com valor financeiro e acompanhem o progresso baseado em comissão e vendas.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.todoo_dreams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    target_value NUMERIC(12, 2) NOT NULL CHECK (target_value > 0),
    commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 5.00 CHECK (commission_rate > 0),
    category TEXT NOT NULL DEFAULT 'outro',
    image_url TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'archived')),
    is_featured BOOLEAN NOT NULL DEFAULT false,
    started_at DATE NOT NULL DEFAULT CURRENT_DATE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_todoo_dreams_company_user ON public.todoo_dreams(company_id, user_id);
CREATE INDEX IF NOT EXISTS idx_todoo_dreams_status ON public.todoo_dreams(status);
CREATE INDEX IF NOT EXISTS idx_todoo_dreams_started_at ON public.todoo_dreams(started_at);

-- RLS
ALTER TABLE public.todoo_dreams ENABLE ROW LEVEL SECURITY;

-- 1. Leitura: O próprio dono do sonho, ou gerentes/admins da empresa/unidade
CREATE POLICY "todoo_dreams_select" ON public.todoo_dreams FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        user_id = (SELECT auth.uid())
        OR (SELECT public.current_role()) IN ('admin_company', 'manager')
      )
    )
  );

-- 2. Inserção: O próprio usuário criando para si, ou admin/gerente
CREATE POLICY "todoo_dreams_insert" ON public.todoo_dreams FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        user_id = (SELECT auth.uid())
        OR (SELECT public.current_role()) IN ('admin_company', 'manager')
      )
    )
  );

-- 3. Atualização: O próprio dono ou admin/gerente
CREATE POLICY "todoo_dreams_update" ON public.todoo_dreams FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        user_id = (SELECT auth.uid())
        OR (SELECT public.current_role()) IN ('admin_company', 'manager')
      )
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        user_id = (SELECT auth.uid())
        OR (SELECT public.current_role()) IN ('admin_company', 'manager')
      )
    )
  );

-- 4. Exclusão: O próprio dono ou admin
CREATE POLICY "todoo_dreams_delete" ON public.todoo_dreams FOR DELETE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (
        user_id = (SELECT auth.uid())
        OR (SELECT public.current_role()) = 'admin_company'
      )
    )
  );

-- Configurações de Comissão definidas pela gerência/administração
CREATE TABLE IF NOT EXISTS public.todoo_dream_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
    commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 5.00 CHECK (commission_rate > 0),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.todoo_dream_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "todoo_dream_settings_select" ON public.todoo_dream_settings FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR company_id = (SELECT public.current_company_id())
  );

CREATE POLICY "todoo_dream_settings_write" ON public.todoo_dream_settings FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (SELECT public.current_role()) IN ('admin_company', 'manager')
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
      company_id = (SELECT public.current_company_id())
      AND (SELECT public.current_role()) IN ('admin_company', 'manager')
    )
  );

