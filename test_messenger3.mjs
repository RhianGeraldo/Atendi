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
  const psid = "5436278529791194"; // From screenshot
  const companyId = "cb6be555-e9ce-40d7-bb9d-956fcbcf09df"; // Teste Meta

  const { data: instances, error } = await supabase
    .from('whatsapp_instances')
    .select('id, name, provider, oficial_access_token')
    .eq('company_id', companyId)
    .eq('provider', 'messenger');

  if (!instances || instances.length === 0) {
    console.log("No messenger instances found for company Teste Meta");
    return;
  }

  for (const instance of instances) {
    console.log(`\n--- Testing Instance: ${instance.name} ---`);
    const token = instance.oficial_access_token;
    
    if (!token) {
      console.log("No token found for this instance.");
      continue;
    }

    console.log("Testing with fields=name,profile_pic");
    let res = await fetch(`https://graph.facebook.com/v20.0/${psid}?fields=name,profile_pic&access_token=${token}`);
    console.log("Status:", res.status);
    console.log("Response:", await res.text());
  }
}
run();
