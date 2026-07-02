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
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .select('id, instance_name, oficial_phone_number_id, oficial_access_token')
    .eq('provider', 'instagram');
    
  if (error) {
    console.error(error);
    return;
  }
  
  data.forEach(d => {
    console.log(`Name: ${d.instance_name}`);
    console.log(`Phone/IG ID: ${d.oficial_phone_number_id}`);
    console.log(`Token prefix: ${d.oficial_access_token ? d.oficial_access_token.substring(0, 15) : 'null'}`);
    console.log(`Is Direct (IGA): ${d.oficial_access_token?.startsWith('IGA')}`);
    console.log('---');
  });
}
check();
