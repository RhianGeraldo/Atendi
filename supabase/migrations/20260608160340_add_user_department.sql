-- Adicionar department_id em profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

-- Atualizar handle_new_user para lidar com department_id
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company_id UUID := NULL;
  v_department_id UUID := NULL;
BEGIN
  -- company_id (usado nos links de convite ou criação manual)
  IF (NEW.raw_user_meta_data->>'company_id') IS NOT NULL THEN
    v_company_id := (NEW.raw_user_meta_data->>'company_id')::UUID;
  END IF;

  -- department_id (opcional no momento do cadastro)
  IF (NEW.raw_user_meta_data->>'department_id') IS NOT NULL THEN
    v_department_id := (NEW.raw_user_meta_data->>'department_id')::UUID;
  END IF;

  INSERT INTO public.profiles (id, name, email, role, company_id, department_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.email,
    'agent',
    v_company_id,
    v_department_id
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;
