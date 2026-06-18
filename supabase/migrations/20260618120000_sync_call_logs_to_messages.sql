-- Criar função para sincronizar call_logs com mensagens no chat com auto-resolução de contatos e instâncias e casting de enums
CREATE OR REPLACE FUNCTION public.handle_call_log_message_sync()
RETURNS TRIGGER AS $$
DECLARE
    v_conversation_id UUID;
    v_message_exists BOOLEAN;
    v_content TEXT;
    v_metadata JSONB;
    v_sender_type TEXT;
    v_status_final BOOLEAN;
    v_calc_duration INTEGER;
    v_phone_suffix TEXT;
BEGIN
    -- 1. Resolver contact_id caso esteja nulo, buscando pelo peer_number (sufixo de 8 dígitos)
    IF NEW.contact_id IS NULL AND NEW.peer_number IS NOT NULL THEN
        v_phone_suffix := right(regexp_replace(NEW.peer_number, '\D', '', 'g'), 8);
        IF v_phone_suffix IS NOT NULL AND v_phone_suffix <> '' THEN
            SELECT id INTO NEW.contact_id FROM public.contacts
            WHERE company_id = NEW.company_id
              AND regexp_replace(phone, '\D', '', 'g') LIKE '%' || v_phone_suffix
            LIMIT 1;
        END IF;
    END IF;

    -- 2. Resolver whatsapp_instance_id caso esteja nulo, buscando uma instância conectada da empresa
    IF NEW.whatsapp_instance_id IS NULL THEN
        SELECT id INTO NEW.whatsapp_instance_id FROM public.whatsapp_instances
        WHERE company_id = NEW.company_id
        ORDER BY status = 'connected' DESC, created_at ASC
        LIMIT 1;
    END IF;

    -- Determina se o status é final para criar a mensagem
    v_status_final := NEW.status IN ('ENDED', 'NOT_ANSWERED', 'REJECTED', 'FAILED', 'DISCONNECTED');
    
    IF NOT v_status_final THEN
        RETURN NEW;
    END IF;

    -- Calcula a duração se houver datas de início e fim
    v_calc_duration := COALESCE(
        NEW.duration_seconds, 
        CASE 
            WHEN NEW.ended_at IS NOT NULL AND NEW.started_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::INTEGER 
            ELSE NULL 
        END
    );

    -- Verifica se já existe mensagem para esta chamada
    SELECT EXISTS (
        SELECT 1 FROM public.messages 
        WHERE metadata->>'wavoip_call_id' = NEW.wavoip_call_id
    ) INTO v_message_exists;

    IF v_message_exists THEN
        -- Se já existir a mensagem, atualiza a duração se ela foi alterada ou calculada
        IF NEW.status = 'ENDED' AND v_calc_duration IS NOT NULL THEN
            UPDATE public.messages
            SET metadata = jsonb_set(metadata::jsonb, '{duration}', to_jsonb(v_calc_duration))
            WHERE metadata->>'wavoip_call_id' = NEW.wavoip_call_id;
        END IF;
        RETURN NEW;
    END IF;

    -- Busca a conversa mais recente para o contato e instância da chamada
    IF NEW.contact_id IS NOT NULL AND NEW.whatsapp_instance_id IS NOT NULL THEN
        SELECT id FROM public.conversations
        WHERE contact_id = NEW.contact_id 
          AND whatsapp_instance_id = NEW.whatsapp_instance_id
        ORDER BY last_message_at DESC
        LIMIT 1
        INTO v_conversation_id;

        -- Se não encontrar conversa, cria uma
        IF v_conversation_id IS NULL THEN
            INSERT INTO public.conversations (
                company_id,
                whatsapp_instance_id,
                contact_id,
                channel,
                status,
                last_message_at
            ) VALUES (
                NEW.company_id,
                NEW.whatsapp_instance_id,
                NEW.contact_id,
                'whatsapp',
                'waiting',
                now()
            ) RETURNING id INTO v_conversation_id;
        END IF;
    END IF;

    -- Se ainda assim for nulo, aborta
    IF v_conversation_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Define o remetente e conteúdo
    IF NEW.direction = 'INCOMING' THEN
        v_sender_type := 'contact';
        IF NEW.status = 'ENDED' THEN
            v_content := 'Ligação de voz';
            v_metadata := json_build_object(
                'type', 'call',
                'direction', 'incoming',
                'status', 'completed',
                'wavoip_call_id', NEW.wavoip_call_id,
                'duration', v_calc_duration
            );
        ELSE
            v_content := 'Ligação de voz perdida';
            v_metadata := json_build_object(
                'type', 'call',
                'direction', 'incoming',
                'status', 'missed',
                'wavoip_call_id', NEW.wavoip_call_id
            );
        END IF;
    ELSE
        v_sender_type := 'agent';
        IF NEW.status = 'ENDED' THEN
            v_content := 'Ligação de voz';
            v_metadata := json_build_object(
                'type', 'call',
                'direction', 'outgoing',
                'status', 'completed',
                'wavoip_call_id', NEW.wavoip_call_id,
                'duration', v_calc_duration
            );
        ELSE
            v_content := 'Ligação de voz não atendida';
            v_metadata := json_build_object(
                'type', 'call',
                'direction', 'outgoing',
                'status', 'missed',
                'wavoip_call_id', NEW.wavoip_call_id
            );
        END IF;
    END IF;

    -- Insere a mensagem com cast explícito para os Enums message_sender e media_type
    INSERT INTO public.messages (
        conversation_id,
        sender_type,
        is_internal,
        media_type,
        content,
        metadata,
        created_at
    ) VALUES (
        v_conversation_id,
        v_sender_type::public.message_sender,
        FALSE,
        'text'::public.media_type,
        v_content,
        v_metadata,
        COALESCE(NEW.ended_at, NEW.started_at, now())
    );

    -- Atualiza o last_message_at da conversa
    UPDATE public.conversations
    SET last_message_at = now()
    WHERE id = v_conversation_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar a trigger
DROP TRIGGER IF EXISTS trigger_sync_call_log_to_messages ON public.call_logs;
CREATE TRIGGER trigger_sync_call_log_to_messages
BEFORE INSERT OR UPDATE ON public.call_logs
FOR EACH ROW
EXECUTE FUNCTION public.handle_call_log_message_sync();
