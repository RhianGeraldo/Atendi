-- Adiciona a coluna de cor à tabela de unidades
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#6366f1';
