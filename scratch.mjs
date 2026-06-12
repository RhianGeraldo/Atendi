import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/rhiangeraldo/Desenvolvimentos/Atendi/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStatus() {
  const { data: company } = await supabase.from('companies').select('*').limit(1).single();
  const { data: instance } = await supabase.from('whatsapp_instances').select('*').eq('company_id', company.id).limit(1).single();
  
  const host = company.evogo_host;
  const token = company.evogo_global_token;
  const instanceToken = instance.evogo_api_key;
  
  console.log('Host:', host);
  
  try {
    const res1 = await fetch(`${host}/instance/status`, {
      headers: { 'apikey': instanceToken }
    });
    console.log('/instance/status response:', await res1.text());
  } catch(e) { console.error(e) }
  
  try {
    const res2 = await fetch(`${host}/instance/connectionState/${instance.instance_name}`, {
      headers: { 'apikey': instanceToken }
    });
    console.log('/instance/connectionState response:', await res2.text());
  } catch(e) { console.error(e) }
  
  try {
    const res3 = await fetch(`${host}/instance/fetchInstances`, {
      headers: { 'apikey': token }
    });
    const all = await res3.json();
    console.log('/instance/fetchInstances response length:', all?.length || all?.data?.length || 0);
    const instList = all?.data || all || [];
    const thisInst = instList.find(i => i.token === instanceToken || i.instance?.apikey === instanceToken || i.instance?.instanceName === instance.instance_name);
    console.log('Instance in fetchInstances:', JSON.stringify(thisInst, null, 2));
  } catch(e) { console.error(e) }
}

checkStatus();
