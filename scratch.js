import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envPath = '/home/rhiangeraldo/Desenvolvimentos/Atendi/.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?(.*?)"?$/);
  if (match) envVars[match[1]] = match[2];
});

const supabase = createClient(envVars.VITE_SUPABASE_URL, envVars.SERVICE_ROLE);

async function main() {
  const { data: companies } = await supabase.from('companies').select('*');
  const company = companies[0];
  
  const { data: instances } = await supabase.from('whatsapp_instances').select('*').eq('company_id', company.id);
  
  for (const inst of instances) {
    if (!inst.name.toLowerCase().includes('teste') && !inst.name.toLowerCase().includes('disparo')) continue;
    console.log(`\nTesting instance: ${inst.name} (${inst.instance_name})`);
    
    // Test /instance/status
    try {
      const res1 = await fetch(`${company.evogo_host}/instance/status`, { headers: { 'apikey': inst.evogo_api_key } });
      console.log(`[status] ${res1.status}:`, await res1.text());
    } catch(e) {}
    
    // Test /instance/connectionState/:name
    try {
      const res2 = await fetch(`${company.evogo_host}/instance/connectionState/${inst.instance_name}`, { headers: { 'apikey': inst.evogo_api_key } });
      console.log(`[connectionState] ${res2.status}:`, await res2.text());
    } catch(e) {}
  }

  // Test /instance/fetchInstances
  console.log("\n[fetchInstances] fetching...");
  try {
    const res3 = await fetch(`${company.evogo_host}/instance/fetchInstances`, { headers: { 'apikey': company.evogo_global_token } });
    const all = await res3.json();
    console.log(`Total instances fetched: ${all.length || all.data?.length}`);
    const list = all.data || all || [];
    for (const inst of instances) {
      if (!inst.name.toLowerCase().includes('teste') && !inst.name.toLowerCase().includes('disparo')) continue;
      const found = list.find(i => i.token === inst.evogo_api_key || i.instance?.apikey === inst.evogo_api_key || i.instance?.instanceName === inst.instance_name);
      console.log(`Found ${inst.name} in list:`, found ? "YES" : "NO");
      if (found) {
        console.log(`State: ${found.state || found.instance?.state}, Status: ${found.status || found.instance?.status}`);
      }
    }
  } catch(e) {}
}

main();
