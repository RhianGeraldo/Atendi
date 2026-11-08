-- Adiciona o valor 'sticker' ao tipo enum public.media_type
ALTER TYPE public.media_type ADD VALUE IF NOT EXISTS 'sticker';

-- Criação da tabela company_stickers para armazenar o catálogo de figurinhas corporativas
CREATE TABLE IF NOT EXISTS public.company_stickers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Figurinha',
    url TEXT NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    order_index INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_company_stickers_company_id ON public.company_stickers(company_id);

-- Habilita RLS
ALTER TABLE public.company_stickers ENABLE ROW LEVEL SECURITY;

-- Leitura: Usuários da empresa ou super_admin
CREATE POLICY "company_stickers_select_policy"
ON public.company_stickers
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND (
            profiles.role = 'super_admin'
            OR profiles.company_id = company_stickers.company_id
        )
    )
);

-- Inserção: Exclusiva para super_admin
CREATE POLICY "company_stickers_insert_policy"
ON public.company_stickers
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
);

-- Atualização: Exclusiva para super_admin
CREATE POLICY "company_stickers_update_policy"
ON public.company_stickers
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
);

-- Exclusão: Exclusiva para super_admin
CREATE POLICY "company_stickers_delete_policy"
ON public.company_stickers
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
);
