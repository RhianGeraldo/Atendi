import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envVars = fs.readFileSync('.env', 'utf8').split('\n');
const env = {};
envVars.forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let val = match[2];
    if (val.startsWith('"') && val.endsWith('"')) val = val.substring(1, val.length - 1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.substring(1, val.length - 1);
    env[match[1]] = val;
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE);

async function run() {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, channel, status, whatsapp_instance_id, contact:contacts!inner(id, name, company_id, phone, instagram_username)')
    .eq('status', 'waiting')
    .ilike('contact.name', '%Rhian%')
    .order('started_at', { ascending: false });
  console.log(JSON.stringify(data, null, 2));
}
run();
