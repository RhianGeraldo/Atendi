-- Garante que use_signature tenha DEFAULT true na tabela profiles
ALTER TABLE public.profiles ALTER COLUMN use_signature SET DEFAULT true;

-- Atualiza perfis existentes que estejam com use_signature nulo
UPDATE public.profiles SET use_signature = true WHERE use_signature IS NULL;

-- Atualiza handle_new_user para explicitar use_signature = true no insert
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

  INSERT INTO public.profiles (id, name, email, role, company_id, department_id, use_signature)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.email,
    'agent',
    v_company_id,
    v_department_id,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    use_signature = COALESCE(public.profiles.use_signature, true);
  
  RETURN NEW;
END;
$$;
