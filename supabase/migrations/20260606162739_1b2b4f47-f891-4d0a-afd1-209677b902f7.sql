
REVOKE EXECUTE ON FUNCTION public.current_company_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_in_unit(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
