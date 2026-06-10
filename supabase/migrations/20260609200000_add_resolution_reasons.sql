-- ============ RESOLUTION REASONS ============
-- Table to store predefined reasons for closing a conversation
CREATE TABLE public.resolution_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  "order" INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resolution_reasons TO authenticated;
GRANT ALL ON public.resolution_reasons TO service_role;
ALTER TABLE public.resolution_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resolution_reasons company" ON public.resolution_reasons FOR ALL TO authenticated
  USING (company_id = public.current_company_id() OR company_id IS NULL)
  WITH CHECK (company_id = public.current_company_id());

-- Insert default reasons (no company_id = global defaults for all companies)
-- These will be seeded as company-specific when the company first uses the feature.
-- For now we use a trigger or the app will insert them.

-- ============ ADD RESOLUTION FIELDS TO CONVERSATIONS ============
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS resolution_reason_id UUID REFERENCES public.resolution_reasons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_observation TEXT;
