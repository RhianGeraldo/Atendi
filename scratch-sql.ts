import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SERVICE_ROLE || '';
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data, error } = await supabase.rpc('execute_sql', { query: `
    CREATE TABLE IF NOT EXISTS lead_routing_configs (
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
  `})
  console.log('Result:', error || data)
}
test()
