import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, v] = line.split('=');
  if (k && v) acc[k.trim()] = v.trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });

async function run() {
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('company_id, instance_name, evogo_api_key, evogo_instance_id')
    .eq('instance_name', 'esteticaelaser-aracruz-teste')
    .single();

  if (!instance) {
    console.log("Instance not found");
    return;
  }

  const { data: company } = await supabase
    .from('companies')
    .select('evogo_host, evogo_global_token')
    .eq('id', instance.company_id)
    .single();

  console.log("Host:", company.evogo_host);
  console.log("InstanceName:", instance.instance_name);
  console.log("Token:", instance.evogo_api_key);

  const host = company.evogo_host;
  const token = instance.evogo_api_key;
  const name = instance.instance_name;

  // Let's test Evolution API style /settings/find/:instanceName
  let r = await fetch(`${host}/settings/find/${name}`, { headers: { apikey: token }});
  console.log("Evolution API GET /settings/find:", r.status, await r.text().catch(()=>''));

  // Test EvoGo style /instance/:name/advanced-settings
  let r2 = await fetch(`${host}/instance/${name}/advanced-settings`, { headers: { apikey: token }});
  console.log("EvoGo API GET /instance/:name/advanced-settings:", r2.status, await r2.text().catch(()=>''));
  
  // Test EvoGo API with missing slash? Wait
  let r3 = await fetch(`${host}/settings/find/${name}`, { headers: { apikey: company.evogo_global_token }});
  console.log("Evolution API GET with global token:", r3.status, await r3.text().catch(()=>''));
}
run();
