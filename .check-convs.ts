import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env', 'utf8')
  .split('\n')
  .reduce((acc, line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      acc[match[1].trim()] = val;
    }
    return acc;
  }, {} as any);

const supabase = createClient(env['VITE_SUPABASE_URL'], env['VITE_SUPABASE_SERVICE_ROLE_KEY']);

async function check() {
  const { data: convs, error } = await supabase
    .from('conversations')
    .select('id, whatsapp_instance_id, contact_id, remote_id, channel, whatsapp_instances(instance_name), contacts(name, whatsapp_lid)')
    .eq('channel', 'instagram')
    .order('last_message_at', { ascending: false })
    .limit(10);
    
  if (error) {
    console.error(error);
    return;
  }
  
  console.log("Recent Instagram Conversations:");
  convs.forEach(c => {
    console.log(`- Instance: ${c.whatsapp_instances?.instance_name}`);
    console.log(`  Contact Name: ${c.contacts?.name}`);
    console.log(`  Remote ID (conv): ${c.remote_id}`);
    console.log(`  Contact whatsapp_lid: ${c.contacts?.whatsapp_lid}`);
  });
}
check();
