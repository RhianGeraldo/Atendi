-- Performance optimization for conversations queries, sorting and contact RLS joins
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON public.conversations (contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status_last_message_at ON public.conversations (status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_unit_status ON public.conversations (unit_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_agent_status ON public.conversations (assigned_agent_id, status);
CREATE INDEX IF NOT EXISTS idx_contacts_company_is_blocked ON public.contacts (company_id, is_blocked);
