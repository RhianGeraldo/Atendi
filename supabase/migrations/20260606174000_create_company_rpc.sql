CREATE OR REPLACE FUNCTION public.create_new_company(company_name TEXT, company_slug TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER -- Bypasses RLS
SET search_path = public
AS $$
DECLARE
  new_company_id UUID;
BEGIN
  -- Insert the new company
  INSERT INTO public.companies (name, slug)
  VALUES (company_name, company_slug)
  RETURNING id INTO new_company_id;

  -- Update the user's profile to be admin of this company
  UPDATE public.profiles
  SET company_id = new_company_id, role = 'admin_company'
  WHERE id = auth.uid();

  RETURN new_company_id;
END;
$$;
