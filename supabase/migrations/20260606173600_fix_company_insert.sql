-- Permitir que usuários autenticados criem empresas
CREATE POLICY "companies insert" ON public.companies FOR INSERT TO authenticated WITH CHECK (true);
