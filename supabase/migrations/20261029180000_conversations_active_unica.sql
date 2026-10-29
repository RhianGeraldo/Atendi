-- Garante que um contato nunca tenha mais de uma conversa aberta (waiting ou active)
-- na mesma instância WhatsApp ao mesmo tempo, prevenindo duplicação por webhooks simultâneos.
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_active_contact_instance
  ON public.conversations (contact_id, whatsapp_instance_id)
  WHERE status IN ('waiting', 'active') 
    AND whatsapp_instance_id IS NOT NULL 
    AND started_at >= '2026-10-29T18:00:00Z';
