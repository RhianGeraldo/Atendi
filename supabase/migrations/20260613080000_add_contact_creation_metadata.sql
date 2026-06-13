-- Adiciona campos de rastreamento de criação de contato
ALTER TABLE public.contacts
ADD COLUMN created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN source TEXT,
ADD COLUMN source_details TEXT;
