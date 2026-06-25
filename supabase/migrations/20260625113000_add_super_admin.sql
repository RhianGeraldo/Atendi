-- ============ SUPER ADMIN ROLE ============
-- Adiciona o papel super_admin ao enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- ============ HELPER: verificar se é super_admin ============
-- Usa role::text para evitar "unsafe use of new enum value" na mesma transação
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role::text = 'super_admin'
  );
END;
$$;

-- ============ RPC: listar todas as empresas (super_admin apenas) ============
CREATE OR REPLACE FUNCTION public.get_all_companies()
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ,
  unit_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super_admin pode listar empresas.';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.slug,
    c.logo_url,
    c.created_at,
    COUNT(u.id)::BIGINT AS unit_count
  FROM public.companies c
  LEFT JOIN public.units u ON u.company_id = c.id
  GROUP BY c.id, c.name, c.slug, c.logo_url, c.created_at
  ORDER BY c.created_at DESC;
END;
$$;

-- ============ RPC: listar unidades de qualquer empresa (super_admin apenas) ============
CREATE OR REPLACE FUNCTION public.get_company_units(_company_id UUID)
RETURNS TABLE (
  id UUID,
  company_id UUID,
  name TEXT,
  slug TEXT,
  color TEXT,
  active BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super_admin pode listar unidades desta forma.';
  END IF;

  RETURN QUERY
  SELECT u.id, u.company_id, u.name, u.slug, u.color, u.active, u.created_at
  FROM public.units u
  WHERE u.company_id = _company_id
  ORDER BY u.created_at ASC;
END;
$$;

-- ============ RPC: criar empresa e unidade inicial (super_admin apenas) ============
CREATE OR REPLACE FUNCTION public.super_create_company(
  p_name TEXT,
  p_slug TEXT,
  p_first_unit_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_company_id UUID;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super_admin pode criar empresas.';
  END IF;

  INSERT INTO public.companies (name, slug)
  VALUES (p_name, p_slug)
  RETURNING companies.id INTO new_company_id;

  IF p_first_unit_name IS NOT NULL AND p_first_unit_name != '' THEN
    INSERT INTO public.units (company_id, name, slug)
    VALUES (
      new_company_id,
      p_first_unit_name,
      lower(regexp_replace(p_first_unit_name, '[^a-zA-Z0-9]', '', 'g'))
    );
  END IF;

  RETURN new_company_id;
END;
$$;

-- ============ RPC: criar unidade em qualquer empresa (super_admin apenas) ============
CREATE OR REPLACE FUNCTION public.super_create_unit(
  p_company_id UUID,
  p_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_unit_id UUID;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super_admin pode criar unidades desta forma.';
  END IF;

  INSERT INTO public.units (company_id, name, slug)
  VALUES (
    p_company_id,
    p_name,
    lower(regexp_replace(p_name, '[^a-zA-Z0-9]', '', 'g'))
  )
  RETURNING units.id INTO new_unit_id;

  RETURN new_unit_id;
END;
$$;

-- ============ RPC: deletar empresa (super_admin apenas) ============
CREATE OR REPLACE FUNCTION public.super_delete_company(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super_admin pode deletar empresas.';
  END IF;

  DELETE FROM public.companies WHERE id = p_company_id;
END;
$$;

-- ============ RPC: deletar unidade (super_admin apenas) ============
CREATE OR REPLACE FUNCTION public.super_delete_unit(p_unit_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super_admin pode deletar unidades desta forma.';
  END IF;

  DELETE FROM public.units WHERE id = p_unit_id;
END;
$$;

-- ============ GRANTS ============
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_companies() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_units(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_create_company(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_create_unit(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_delete_company(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_delete_unit(UUID) TO authenticated;
