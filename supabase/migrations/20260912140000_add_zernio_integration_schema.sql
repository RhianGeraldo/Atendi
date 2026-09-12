-- Migration: Adicionar suporte à integração Zernio (WhatsApp e Instagram)
-- Data: 2026-09-12

-- 1. Credenciais Zernio na tabela companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS zernio_api_key TEXT,
  ADD COLUMN IF NOT EXISTS zernio_base_url TEXT DEFAULT 'https://zernio.com/api',
  ADD COLUMN IF NOT EXISTS zernio_webhook_secret TEXT,
  ADD COLUMN IF NOT EXISTS zernio_signature_secret TEXT;

-- 2. Campos do canal na tabela whatsapp_instances
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS network TEXT,
  ADD COLUMN IF NOT EXISTS zernio_account_id TEXT,
  ADD COLUMN IF NOT EXISTS webhook_base TEXT;

-- Atualizar restrição de provedor para incluir zernio
DO $$
BEGIN
  ALTER TABLE public.whatsapp_instances DROP CONSTRAINT IF EXISTS valid_provider;
  ALTER TABLE public.whatsapp_instances DROP CONSTRAINT IF EXISTS whatsapp_instances_provider_check;
  ALTER TABLE public.whatsapp_instances ADD CONSTRAINT valid_provider
    CHECK (provider IN ('evogo','oficial','stevo','instagram','messenger','facebook','zernio'));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Erro ao ajustar constraint de provider: %', SQLERRM;
END $$;

-- Restrição de network
DO $$
BEGIN
  ALTER TABLE public.whatsapp_instances DROP CONSTRAINT IF EXISTS valid_network;
  ALTER TABLE public.whatsapp_instances ADD CONSTRAINT valid_network
    CHECK (network IS NULL OR network IN ('whatsapp','instagram','messenger'));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Erro ao ajustar constraint de network: %', SQLERRM;
END $$;

-- 3. Identificador de thread e controle de janela na tabela conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS provider_thread_id TEXT,
  ADD COLUMN IF NOT EXISTS window_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS has_window BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.conversations.provider_thread_id IS
  'Identificador da conversa (thread) no provedor Zernio. Obrigatório para despachar mensagens de WhatsApp e Instagram via inbox da Zernio.';

-- Índice parcial único por instância e thread para idempotência
CREATE UNIQUE INDEX IF NOT EXISTS conversations_provider_thread_uk
  ON public.conversations (whatsapp_instance_id, provider_thread_id)
  WHERE provider_thread_id IS NOT NULL;
