import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envFile = fs.readFileSync('/home/rhiangeraldo/Desenvolvimentos/Atendi/.env', 'utf8');
const envUrlMatch = envFile.match(/VITE_SUPABASE_URL=['"]?([^'"\n]+)['"]?/);
const envKeyMatch = envFile.match(/SERVICE_ROLE=['"]?([^'"\n]+)['"]?/);

const supabaseAdmin = createClient(envUrlMatch[1], envKeyMatch[1]);

async function main() {
  const { data } = await supabaseAdmin.from('conversations').select('*').limit(1);
  console.log("conversations columns:", Object.keys(data?.[0] || {}));
  
  // Check if conversation_sessions or attendance_history table exists
  const tables = ['conversation_sessions', 'attendance_history', 'attendance_logs', 'tickets'];
  for (const t of tables) {
    const { data: d, error } = await supabaseAdmin.from(t).select('*').limit(1);
    if (!error) {
      console.log(`Table ${t} EXISTS, columns:`, Object.keys(d?.[0] || {}));
    } else {
      console.log(`Table ${t}: ${error.code}`);
    }
  }
}

main();
