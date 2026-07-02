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
  const accountId = '17841456577281351';
  
  const { data: instance, error: instErr } = await supabase
    .from('whatsapp_instances')
    .select('id, instance_name, oficial_phone_number_id, oficial_access_token')
    .eq('oficial_phone_number_id', accountId)
    .single();
    
  if (instErr) {
    console.error("Instance fetch error:", instErr);
    return;
  }
  
  console.log("Instance:", instance.instance_name);
  console.log("Token starts with:", instance.oficial_access_token?.substring(0, 20));
  
  const { data: convs, error: convErr } = await supabase
    .from('conversations')
    .select('id, contact_id, remote_id, contacts(name, whatsapp_lid)')
    .eq('whatsapp_instance_id', instance.id)
    .order('last_message_at', { ascending: false })
    .limit(1);
    
  if (convErr) {
    console.error("Conversations fetch error:", convErr);
    return;
  }
  
  console.log("Latest conversation:");
  console.dir(convs, { depth: null });
}
check();
