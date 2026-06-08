CREATE TABLE IF NOT EXISTS labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  external_id TEXT,
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_labels (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (contact_id, label_id)
);

-- RLS
ALTER TABLE labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage labels for their company" ON labels
  FOR ALL
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can manage contact_labels for their company" ON contact_labels
  FOR ALL
  USING (contact_id IN (
    SELECT id FROM contacts WHERE company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  ));
