const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, v] = line.split('=');
  if (k && v) acc[k.trim()] = v.trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });

async function run() {
  const { data, error } = await supabase.rpc('get_triggers');
  // Since we don't have get_triggers, let's query using postgres view. Wait, Supabase js doesn't allow raw queries.
}
run();
