import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('conversations').select('id, ai_active, ai_agent_id, status').eq('id', 'fffe2c4b-15fb-4398-9554-6ff942d51583').single();
  console.log(data);
}
check();
