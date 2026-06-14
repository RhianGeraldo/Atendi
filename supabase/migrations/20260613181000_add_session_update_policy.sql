CREATE POLICY "Users can update conversation sessions"
  ON conversation_sessions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM contacts c
      JOIN companies co ON c.company_id = co.id
      JOIN profiles p ON p.company_id = co.id
      WHERE c.id = conversation_sessions.contact_id
        AND p.id = auth.uid()
    )
  );
