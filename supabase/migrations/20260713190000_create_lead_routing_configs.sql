CREATE TABLE lead_routing_configs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid REFERENCES companies(id) NOT NULL,
  department_id uuid REFERENCES departments(id),
  is_active boolean DEFAULT false,
  agents jsonb DEFAULT '[]'::jsonb,
  last_assigned_index integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE (company_id)
);

ALTER TABLE lead_routing_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lead_routing_configs of their company"
  ON lead_routing_configs FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can insert lead_routing_configs of their company"
  ON lead_routing_configs FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update lead_routing_configs of their company"
  ON lead_routing_configs FOR UPDATE
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));
