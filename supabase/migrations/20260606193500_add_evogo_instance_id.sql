-- Adiciona a coluna para armazenar o ID gerado pela EvoGo na criação da instância
ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS evogo_instance_id UUID;
