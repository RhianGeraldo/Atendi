-- Migration: Pilar 4 - Gestão, Avisos & Moderação da Diretoria
-- Suporte a mensagens fixadas (Pin), canais de comunicados/avisos da diretoria (somente-leitura) e moderação

-- 1. Novas colunas em internal_messages para mensagens fixadas
ALTER TABLE public.internal_messages 
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;

ALTER TABLE public.internal_messages 
ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

ALTER TABLE public.internal_messages 
ADD COLUMN IF NOT EXISTS pinned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_internal_messages_pinned 
ON public.internal_messages(channel_id, is_pinned) 
WHERE is_pinned = true;

-- 2. Novas colunas em internal_channels para canal de avisos da matriz/diretoria
ALTER TABLE public.internal_channels 
ADD COLUMN IF NOT EXISTS is_announcement BOOLEAN DEFAULT false;

-- 3. Atualizar permissões RLS para permitir UPDATE em mensagens (edição, exclusão e fixação)
DROP POLICY IF EXISTS "Users and managers can update messages" ON public.internal_messages;

CREATE POLICY "Users and managers can update messages"
ON public.internal_messages FOR UPDATE
USING (
    sender_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role IN ('admin_company', 'super_admin', 'manager')
    ) OR
    EXISTS (
        SELECT 1 FROM public.internal_channel_members m
        WHERE m.channel_id = internal_messages.channel_id
        AND m.user_id = auth.uid()
        AND m.role = 'admin'
    )
);
