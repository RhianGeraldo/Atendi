-- 1. Alter conversation_sessions to allow NULL resolved_at
ALTER TABLE conversation_sessions ALTER COLUMN resolved_at DROP NOT NULL;
ALTER TABLE conversation_sessions ALTER COLUMN resolved_at DROP DEFAULT;

-- 2. Add current_session_id to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS current_session_id UUID REFERENCES conversation_sessions(id) ON DELETE SET NULL;

-- 3. Create session_events table
CREATE TABLE IF NOT EXISTS session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'started', 'assigned', 'transferred', 'resolved', 'note_added', 'task_created', 'returned_to_queue'
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_session_events_session_id ON session_events(session_id);

-- Enable RLS
ALTER TABLE session_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for session_events
DROP POLICY IF EXISTS "Users can view session_events for their company" ON session_events;
CREATE POLICY "Users can view session_events for their company"
  ON session_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversation_sessions cs
      JOIN contacts c ON cs.contact_id = c.id
      JOIN profiles p ON p.company_id = c.company_id
      WHERE cs.id = session_events.session_id
        AND p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert session_events" ON session_events;
CREATE POLICY "Users can insert session_events"
  ON session_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversation_sessions cs
      JOIN contacts c ON cs.contact_id = c.id
      JOIN profiles p ON p.company_id = c.company_id
      WHERE cs.id = session_events.session_id
        AND p.id = auth.uid()
    )
  );
