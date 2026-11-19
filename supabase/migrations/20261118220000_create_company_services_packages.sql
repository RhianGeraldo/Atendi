-- Migration: Create company_services_packages for AI Sales Catalog with Strategic Roles (Intermediate, Upsell, Downsell, Cross-sell)
CREATE TABLE IF NOT EXISTS public.company_services_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE, -- NULL = válida para toda a rede
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'combo', -- 'combo', 'single_area', 'addon'
  category TEXT NOT NULL DEFAULT 'laser', -- 'laser', 'clareamento', 'facial', 'corporal'
  strategic_role TEXT NOT NULL DEFAULT 'intermediate', -- 'intermediate', 'upsell', 'downsell', 'cross_sell'
  areas TEXT[] NOT NULL DEFAULT '{}', -- ex: ['Virilha Completa', 'Perianal', 'Axilas']
  sessions_count INT NOT NULL DEFAULT 10,
  anchor_price NUMERIC(10,2), -- Preço original de tabela (âncora)
  cash_price NUMERIC(10,2), -- Preço promocional à vista
  installments_count INT DEFAULT 12,
  installment_value NUMERIC(10,2),
  installment_text TEXT, -- ex: '12x de R$ 54,90'
  payment_methods TEXT[] DEFAULT ARRAY['recorrente', 'cartao', 'pix'],
  bonus_gift TEXT, -- Benefício ou brinde (ex: 'Ganha 10 sessões de Axilas')
  sales_pitch TEXT, -- Orientação / gatilho comercial para a IA
  is_active BOOLEAN NOT NULL DEFAULT true,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Índices para buscas rápidas da IA e da UI
CREATE INDEX IF NOT EXISTS idx_services_company ON public.company_services_packages(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_services_strategic ON public.company_services_packages(company_id, strategic_role, is_active);
CREATE INDEX IF NOT EXISTS idx_services_areas ON public.company_services_packages USING GIN(areas);

-- RLS
ALTER TABLE public.company_services_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view services for their company" ON public.company_services_packages;
CREATE POLICY "Users can view services for their company" ON public.company_services_packages
  FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can manage services for their company" ON public.company_services_packages;
CREATE POLICY "Users can manage services for their company" ON public.company_services_packages
  FOR ALL
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

GRANT ALL ON public.company_services_packages TO authenticated;
GRANT ALL ON public.company_services_packages TO service_role;
