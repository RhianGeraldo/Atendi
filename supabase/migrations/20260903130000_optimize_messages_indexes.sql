-- Optimization for messages query: replaces sequential scans with fast index scans
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at ON public.messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_conversations_id_unit_id ON public.conversations (id, unit_id);
