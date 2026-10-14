-- Garante a existência da tabela de logs da Meta CAPI (não havia sido aplicada em produção)
-- Idempotente: pode ser executada mais de uma vez com segurança.

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

DROP POLICY IF EXISTS "Users can view meta_capi_logs in their company" ON public.meta_capi_logs;
CREATE POLICY "Users can view meta_capi_logs in their company" ON public.meta_capi_logs
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR public.is_super_admin()
  );

-- Inserções são feitas apenas pelo servidor (service role, que ignora RLS)

-- Recarrega o cache de schema do PostgREST para a tabela ficar visível imediatamente
NOTIFY pgrst, 'reload schema';
