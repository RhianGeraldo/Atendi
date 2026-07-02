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
  const { data: instances } = await supabase
    .from('whatsapp_instances')
    .select('id, name, company_id')
    .ilike('name', '%Waba-Oficial%');

  console.log("Instances:", instances);

  if (instances && instances.length > 0) {
    const instId = instances[0].id;
    const { data: templates } = await supabase
      .from('whatsapp_templates')
      .select('id, name, company_id, whatsapp_instance_id')
      .eq('whatsapp_instance_id', instId);

    console.log("Templates for Waba-Oficial (service_role):", templates);
  }
}
run();
