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

  let r = await fetch(`${host}/instance/connect`, {
    method: 'POST',
    headers: { apikey: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscribe: ["ALL"], webhookUrl: 'https://atendiai.vercel.app/api/evogo/webhook' })
  });
  console.log("POST /instance/connect:", r.status, await r.text().catch(()=>''));
}
run();
