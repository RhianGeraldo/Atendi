ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Atualizar registros existentes para herdar company_id de suas respectivas unidades
UPDATE public.departments 
SET company_id = (SELECT company_id FROM public.units WHERE id = departments.unit_id) 
WHERE company_id IS NULL AND unit_id IS NOT NULL;

-- Tornar unit_id opcional (pois departamentos globais da Sede não terão unit_id)
ALTER TABLE public.departments ALTER COLUMN unit_id DROP NOT NULL;

-- Se desejar, tornar company_id NOT NULL após garantir que não há dados sem company_id.
-- Descomente se todos os departamentos agora tem company_id
-- ALTER TABLE public.departments ALTER COLUMN company_id SET NOT NULL;

-- Atualizar RLS
DROP POLICY IF EXISTS "departments read" ON public.departments;
DROP POLICY IF EXISTS "departments manage" ON public.departments;

CREATE POLICY "departments read" ON public.departments FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY "departments manage" ON public.departments FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.current_role() IN ('admin_company','manager'))
  WITH CHECK (company_id = public.current_company_id() AND public.current_role() IN ('admin_company','manager'));
