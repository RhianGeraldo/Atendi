import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('whatsapp_instances').select('id, instance_name, oficial_phone_number_id, oficial_waba_id').eq('provider', 'instagram');
  console.log(data);
}
run();
