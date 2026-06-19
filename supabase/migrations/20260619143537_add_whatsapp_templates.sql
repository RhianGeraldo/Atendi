-- Add WABA ID to whatsapp_instances
ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS oficial_waba_id VARCHAR(255);

-- Create whatsapp_templates table
CREATE TABLE public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  whatsapp_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  status TEXT NOT NULL,
  category TEXT NOT NULL,
  components JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(whatsapp_instance_id, name, language)
);

-- Setup permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- Setup RLS
CREATE POLICY "whatsapp_templates read" ON public.whatsapp_templates FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY "whatsapp_templates manage" ON public.whatsapp_templates FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.current_role() = 'admin_company')
  WITH CHECK (company_id = public.current_company_id() AND public.current_role() = 'admin_company');
