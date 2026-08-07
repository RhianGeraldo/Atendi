-- Migration: Create company_roles and add permission fields to profiles

CREATE TABLE IF NOT EXISTS public.company_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  base_role public.app_role NOT NULL DEFAULT 'agent',
  allowed_menus TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_roles TO authenticated;
GRANT ALL ON public.company_roles TO service_role;

ALTER TABLE public.company_roles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for company_roles
DROP POLICY IF EXISTS "Users can read roles from their company or global" ON public.company_roles;
CREATE POLICY "Users can read roles from their company or global" ON public.company_roles
  FOR SELECT USING (
    company_id IS NULL OR company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage company roles" ON public.company_roles;
CREATE POLICY "Admins can manage company roles" ON public.company_roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND (role = 'admin_company' OR role = 'super_admin')
    )
  );

-- Add custom_role_id and allowed_menus to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_role_id UUID REFERENCES public.company_roles(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allowed_menus TEXT[] DEFAULT NULL;
