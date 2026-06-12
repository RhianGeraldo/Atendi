-- Adicionar coluna metadata para guardar informações como anúncios de WhatsApp (externalAdReply)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
