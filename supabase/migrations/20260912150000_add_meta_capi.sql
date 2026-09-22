-- Migration: Adicionar suporte à Meta Conversions API (CAPI) para eventos de conversão e CTWA
-- Data: 2026-09-12

-- 1. Configurações da Meta CAPI na tabela companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS meta_capi_settings JSONB DEFAULT '{"enabled": false, "pixel_id": "", "access_token": "", "test_event_code": "", "track_ctwa_leads": true, "track_stage_moves": true, "track_won_purchases": true}'::jsonb;

-- 2. Evento padrão da Meta para cada etapa do funil (Lead, Schedule, Purchase, etc)
ALTER TABLE public.pipeline_stages
  ADD COLUMN IF NOT EXISTS meta_event_name TEXT DEFAULT NULL;

-- 3. Tabela de logs e auditoria de envios de eventos CAPI
CREATE TABLE IF NOT EXISTS public.meta_capi_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  event_id TEXT,
  ctwa_clid TEXT,
  value NUMERIC,
  currency TEXT DEFAULT 'BRL',
  status TEXT NOT NULL, -- 'success', 'error', 'skipped'
  test_code TEXT,
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meta_capi_logs_company_id_idx ON public.meta_capi_logs(company_id);
CREATE INDEX IF NOT EXISTS meta_capi_logs_contact_id_idx ON public.meta_capi_logs(contact_id);
CREATE INDEX IF NOT EXISTS meta_capi_logs_created_at_idx ON public.meta_capi_logs(created_at DESC);

ALTER TABLE public.meta_capi_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view meta_capi_logs in their company" ON public.meta_capi_logs
  FOR SELECT USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Allow insert meta_capi_logs" ON public.meta_capi_logs
  FOR INSERT WITH CHECK (true);
