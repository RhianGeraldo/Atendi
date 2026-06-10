-- Create conversation_sessions table to track attendance history
-- Each time a conversation is resolved, a session record is created
CREATE TABLE IF NOT EXISTS conversation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  whatsapp_instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  resolution_reason_id UUID REFERENCES resolution_reasons(id) ON DELETE SET NULL,
  resolution_observation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by contact
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_contact_id ON conversation_sessions(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_conversation_id ON conversation_sessions(conversation_id);

-- Enable RLS
ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies matching conversations table
CREATE POLICY "Users can view conversation sessions for their company"
  ON conversation_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM contacts c
      JOIN companies co ON c.company_id = co.id
      JOIN profiles p ON p.company_id = co.id
      WHERE c.id = conversation_sessions.contact_id
        AND p.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert conversation sessions"
  ON conversation_sessions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts c
      JOIN companies co ON c.company_id = co.id
      JOIN profiles p ON p.company_id = co.id
      WHERE c.id = conversation_sessions.contact_id
        AND p.id = auth.uid()
    )
  );
