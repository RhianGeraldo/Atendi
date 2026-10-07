-- Migration: Criação da estrutura de Chat Interno da Equipe Multiunidades
-- Suporte a canais globais da empresa, canais específicos por unidade e mensagens diretas (1:1)

-- 1. Canais / Conversas Internas
CREATE TABLE IF NOT EXISTS public.internal_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE, -- NULL se for canal geral de todas as unidades
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    name TEXT, -- NULL para DMs 1:1
    description TEXT,
    type TEXT NOT NULL DEFAULT 'group' CHECK (type IN ('direct', 'group')),
    scope TEXT NOT NULL DEFAULT 'unit' CHECK (scope IN ('company', 'unit', 'custom', 'direct')),
    avatar_url TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    last_message_preview TEXT,
    last_message_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_internal_channels_company ON public.internal_channels(company_id);
CREATE INDEX IF NOT EXISTS idx_internal_channels_unit ON public.internal_channels(unit_id);
CREATE INDEX IF NOT EXISTS idx_internal_channels_last_msg ON public.internal_channels(last_message_at DESC);

-- 2. Membros do Canal
CREATE TABLE IF NOT EXISTS public.internal_channel_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES public.internal_channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    last_read_at TIMESTAMPTZ DEFAULT now(),
    unread_count INT DEFAULT 0,
    is_muted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_channel_user UNIQUE(channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_internal_channel_members_user ON public.internal_channel_members(user_id);
CREATE INDEX IF NOT EXISTS idx_internal_channel_members_channel ON public.internal_channel_members(channel_id);

-- 3. Mensagens do Chat Interno
CREATE TABLE IF NOT EXISTS public.internal_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES public.internal_channels(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT,
    media_type TEXT CHECK (media_type IN ('text', 'image', 'audio', 'video', 'document')),
    media_url TEXT,
    file_name TEXT,
    file_size INT,
    reply_to_id UUID REFERENCES public.internal_messages(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_edited BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_messages_channel_created ON public.internal_messages(channel_id, created_at DESC);

-- 4. Função e Trigger para atualizar último preview do canal
CREATE OR REPLACE FUNCTION public.handle_internal_message_created()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.internal_channels
    SET 
        last_message_preview = COALESCE(
            CASE 
                WHEN NEW.media_type = 'image' THEN '📷 Foto'
                WHEN NEW.media_type = 'audio' THEN '🎵 Áudio'
                WHEN NEW.media_type = 'video' THEN '🎥 Vídeo'
                WHEN NEW.media_type = 'document' THEN '📄 Documento'
                ELSE NEW.content
            END, ''
        ),
        last_message_at = NEW.created_at,
        updated_at = NEW.created_at
    WHERE id = NEW.channel_id;

    -- Incrementa contador de não lidas para os outros membros do canal
    UPDATE public.internal_channel_members
    SET unread_count = unread_count + 1
    WHERE channel_id = NEW.channel_id AND user_id != NEW.sender_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_internal_message_created ON public.internal_messages;
CREATE TRIGGER trg_internal_message_created
AFTER INSERT ON public.internal_messages
FOR EACH ROW EXECUTE FUNCTION public.handle_internal_message_created();

-- 5. Row Level Security (RLS)
ALTER TABLE public.internal_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_messages ENABLE ROW LEVEL SECURITY;

-- Helper functions com SECURITY DEFINER para quebrar a recursão entre tabelas
CREATE OR REPLACE FUNCTION public.is_internal_channel_member(p_channel_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.internal_channel_members 
    WHERE channel_id = p_channel_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.get_internal_channel_company_id(p_channel_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT company_id 
  FROM public.internal_channels 
  WHERE id = p_channel_id;
$$;

-- Drop de policies antigas se existirem
DROP POLICY IF EXISTS "internal_channels_select_policy" ON public.internal_channels;
DROP POLICY IF EXISTS "internal_channels_insert_policy" ON public.internal_channels;
DROP POLICY IF EXISTS "internal_channels_update_policy" ON public.internal_channels;
DROP POLICY IF EXISTS "internal_channel_members_select_policy" ON public.internal_channel_members;
DROP POLICY IF EXISTS "internal_channel_members_manage_policy" ON public.internal_channel_members;
DROP POLICY IF EXISTS "internal_messages_select_policy" ON public.internal_messages;
DROP POLICY IF EXISTS "internal_messages_insert_policy" ON public.internal_messages;

-- Políticas de canais:
CREATE POLICY "internal_channels_select_policy" ON public.internal_channels
FOR SELECT TO authenticated
USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (
        scope = 'company'
        OR created_by = auth.uid()
        OR (
            unit_id IS NOT NULL 
            AND (
                EXISTS (SELECT 1 FROM public.user_units WHERE user_id = auth.uid() AND unit_id = internal_channels.unit_id)
                OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role IN ('super_admin', 'admin_company') OR has_matriz_access = true))
            )
        )
        OR public.is_internal_channel_member(id, auth.uid())
    )
);

CREATE POLICY "internal_channels_insert_policy" ON public.internal_channels
FOR INSERT TO authenticated
WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "internal_channels_update_policy" ON public.internal_channels
FOR UPDATE TO authenticated
USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
);

-- Políticas de membros:
CREATE POLICY "internal_channel_members_select_policy" ON public.internal_channel_members
FOR SELECT TO authenticated
USING (
    public.get_internal_channel_company_id(channel_id) IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
);

CREATE POLICY "internal_channel_members_manage_policy" ON public.internal_channel_members
FOR ALL TO authenticated
USING (
    public.get_internal_channel_company_id(channel_id) IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
)
WITH CHECK (
    public.get_internal_channel_company_id(channel_id) IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
);

-- Políticas de mensagens:
CREATE POLICY "internal_messages_select_policy" ON public.internal_messages
FOR SELECT TO authenticated
USING (
    public.get_internal_channel_company_id(channel_id) IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
);

CREATE POLICY "internal_messages_insert_policy" ON public.internal_messages
FOR INSERT TO authenticated
WITH CHECK (
    sender_id = auth.uid()
    AND public.get_internal_channel_company_id(channel_id) IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
);

-- 6. Adição das tabelas à publicação realtime do Supabase (ignora erro se já estiver)
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_channels;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_channel_members;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_messages;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;
