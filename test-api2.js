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

  const { data: company } = await supabase
    .from('companies')
    .select('evogo_host, evogo_global_token')
    .eq('id', instance.company_id)
    .single();

  const host = company.evogo_host;
  const token = instance.evogo_api_key;
  const evogoInstanceId = instance.evogo_instance_id;

  console.log("evogoInstanceId:", evogoInstanceId);

  // Test GET
  let r = await fetch(`${host}/instance/${evogoInstanceId}/advanced-settings`, { headers: { apikey: token }});
  console.log("GET:", r.status, await r.text().catch(()=>''));

  // Test PUT
  let body = { rejectCall: true, readMessages: false, readStatus: false, alwaysOnline: false };
  let r2 = await fetch(`${host}/instance/${evogoInstanceId}/advanced-settings`, {
    method: 'PUT',
    headers: { apikey: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  console.log("PUT:", r2.status, await r2.text().catch(()=>''));
}
run();
