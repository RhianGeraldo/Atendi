import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, status, started_at, last_message_preview, unit_id, whatsapp_instance_id, contact:contacts!inner(name, company_id)')
    .like('contact.name', '%Ana Clara%')
    .order('started_at', { ascending: false })
    .limit(5);
  console.log(JSON.stringify(data, null, 2));
}
run();
