-- ============ DEPARTMENTS: ADICIONANDO COMPANY_ID E TORNANDO UNIT_ID OPCIONAL ============

-- 1. Adicionando company_id na tabela departments
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- 2. (Segurança) Se já houverem departamentos, vamos preencher o company_id com base no unit_id atual
UPDATE public.departments d
SET company_id = (SELECT company_id FROM public.units u WHERE u.id = d.unit_id)
WHERE d.company_id IS NULL AND d.unit_id IS NOT NULL;

-- 3. Torna o company_id NOT NULL para garantir a integridade
-- ALTER TABLE public.departments ALTER COLUMN company_id SET NOT NULL; 
-- (Vou deixar NULLABLE temporariamente caso dê erro por causa de dados sujos, 
-- mas a nível de app, garantiremos que sempre enviaremos o company_id)

-- 4. Torna o unit_id opcional (NULL = Departamento da Matriz)
ALTER TABLE public.departments ALTER COLUMN unit_id DROP NOT NULL;


-- ============ ATUALIZANDO AS POLÍTICAS (RLS) ============

DROP POLICY IF EXISTS "departments read" ON public.departments;
CREATE POLICY "departments read" ON public.departments FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id() 
    OR EXISTS(SELECT 1 FROM public.units u WHERE u.id = departments.unit_id AND u.company_id = public.current_company_id())
  );

DROP POLICY IF EXISTS "departments manage" ON public.departments;
CREATE POLICY "departments manage" ON public.departments FOR ALL TO authenticated
  USING (
    (company_id = public.current_company_id() OR EXISTS(SELECT 1 FROM public.units u WHERE u.id = departments.unit_id AND u.company_id = public.current_company_id()))
    AND public.current_role() IN ('admin_company','manager')
  )
  WITH CHECK (
    (company_id = public.current_company_id() OR EXISTS(SELECT 1 FROM public.units u WHERE u.id = departments.unit_id AND u.company_id = public.current_company_id()))
    AND public.current_role() IN ('admin_company','manager')
  );


-- ============ ATUALIZANDO A TRIGGER DE USUÁRIOS ============
-- Permitir que o usuário seja criado já atrelado a uma empresa via Link de Convite

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company_id UUID := NULL;
BEGIN
  -- Se o metadata conter company_id, pegamos ele (usado nos links de convite)
  IF (NEW.raw_user_meta_data->>'company_id') IS NOT NULL THEN
    v_company_id := (NEW.raw_user_meta_data->>'company_id')::UUID;
  END IF;

  INSERT INTO public.profiles (id, name, email, role, company_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.email,
    'agent',
    v_company_id
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;
