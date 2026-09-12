-- Migration: Create mcp_api_keys table for Model Context Protocol (MCP) integration
CREATE TABLE IF NOT EXISTS public.mcp_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE, -- NULL = Matriz / Acesso a Todas as Unidades
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL, -- Exibição segura (ex: atendi_live_a1b2...)
  key_hash TEXT NOT NULL,   -- SHA-256 hash do token secreto
  permissions TEXT[] NOT NULL DEFAULT '{"all"}'::text[],
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_hash ON public.mcp_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_company ON public.mcp_api_keys(company_id, is_active);

ALTER TABLE public.mcp_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view MCP keys for their company" ON public.mcp_api_keys;
CREATE POLICY "Users can view MCP keys for their company" ON public.mcp_api_keys
  FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can manage MCP keys for their company" ON public.mcp_api_keys;
CREATE POLICY "Users can manage MCP keys for their company" ON public.mcp_api_keys
  FOR ALL
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

GRANT ALL ON public.mcp_api_keys TO authenticated;
GRANT ALL ON public.mcp_api_keys TO service_role;
