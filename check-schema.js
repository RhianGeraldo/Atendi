import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, v] = line.split('=');
  if (k && v) acc[k.trim()] = v.trim().replace(/^"|"$/g, '');
  return acc;
}, {});
const supabase = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });

async function run() {
  const { data: cols } = await supabase.from('conversation_sessions').select('*').limit(1);
  console.log("conversation_sessions columns:", cols ? Object.keys(cols[0] || {}) : "no table");
  
  const { data: hist } = await supabase.from('conversations').select('*').limit(1);
  console.log("conversations columns:", hist ? Object.keys(hist[0] || {}) : "no table");
}
run();
