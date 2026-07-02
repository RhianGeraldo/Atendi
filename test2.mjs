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
  const selectString = "id, channel, status, last_message_at, started_at, tags, unread_count, last_message_preview, department_id, assigned_agent_id, unit_id, whatsapp_instance_id, current_session_id, ai_active, ai_agent_id, contact:contacts!inner(id,name,phone,email,tags,instagram_username,whatsapp_lid,instagram_id,company_id,contact_labels(labels(id,name,color))), department:departments(name), assigned_agent:profiles!conversations_assigned_agent_id_fkey(name), ai_agent:ai_agents(name), unit:units(name,color,custom_variables), whatsapp_instance:whatsapp_instances(name)";
  
  const { data, error } = await supabase
    .from('conversations')
    .select(selectString)
    .eq('status', 'waiting')
    .ilike('contact.name', '%Rhian%')
    .order('started_at', { ascending: false });
  console.log(JSON.stringify(data, null, 2));
  console.log("Error:", error);
}
run();
