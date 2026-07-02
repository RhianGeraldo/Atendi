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
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('oficial_access_token')
    .eq('provider', 'messenger')
    .ilike('name', '%Erriesse%')
    .single();

  if (!instance) {
    console.log("Instance not found");
    return;
  }

  const token = instance.oficial_access_token;
  
  console.log("Testing with fields=name,profile_pic");
  let res = await fetch(`https://graph.facebook.com/v20.0/${psid}?fields=name,profile_pic&access_token=${token}`);
  console.log("Status:", res.status);
  console.log("Response:", await res.text());

  console.log("\nTesting with fields=first_name,last_name,profile_pic");
  let res2 = await fetch(`https://graph.facebook.com/v20.0/${psid}?fields=first_name,last_name,profile_pic&access_token=${token}`);
  console.log("Status:", res2.status);
  console.log("Response:", await res2.text());
}
run();
