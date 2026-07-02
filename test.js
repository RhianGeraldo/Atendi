import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('conversations').select('id, channel, status, contact:contacts!inner(id, name, company_id, phone)').eq('status', 'waiting');
  console.log(data);
}
run();
