-- =========================================================================
-- Migration: Adicionar suporte a anexos (imagens, PDFs e documentos) em tickets
-- =========================================================================

-- Adiciona coluna attachments na tabela tickets (até 5 arquivos salvos em formato JSONB)
ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
