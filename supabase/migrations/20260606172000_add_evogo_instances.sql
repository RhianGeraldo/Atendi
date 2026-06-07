-- ============ EVOGO CONFIG IN COMPANIES ============
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS evogo_host TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS evogo_global_token TEXT;

-- ============ WHATSAPP INSTANCES ============
CREATE TABLE public.whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- Nome amigável visual no sistema
  instance_name TEXT NOT NULL UNIQUE, -- Nome técnico no EvoGo slug(company)-[slug(unit)]-slug(name)
  evogo_api_key TEXT NOT NULL DEFAULT gen_random_uuid()::text, -- Token individual
  status TEXT NOT NULL DEFAULT 'disconnected',
  webhook_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_instances TO authenticated;
GRANT ALL ON public.whatsapp_instances TO service_role;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

-- ============ RLS FOR WHATSAPP INSTANCES ============
-- Read: User can see instances if they belong to their company
CREATE POLICY "whatsapp_instances read" ON public.whatsapp_instances FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

-- Manage (Insert, Update, Delete): Only admins or managers (company level) can manage instances
-- For simplicity in MVP, admins can manage everything in their company.
CREATE POLICY "whatsapp_instances manage" ON public.whatsapp_instances FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.current_role() = 'admin_company')
  WITH CHECK (company_id = public.current_company_id() AND public.current_role() = 'admin_company');
