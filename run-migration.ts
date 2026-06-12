import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envFile = fs.readFileSync('/home/rhiangeraldo/Desenvolvimentos/Atendi/.env', 'utf8');
const envUrlMatch = envFile.match(/VITE_SUPABASE_URL=['"]?([^'"\n]+)['"]?/);
const envKeyMatch = envFile.match(/SERVICE_ROLE=['"]?([^'"\n]+)['"]?/);

const supabaseAdmin = createClient(envUrlMatch![1], envKeyMatch![1]);

async function main() {
  const sql = fs.readFileSync('/home/rhiangeraldo/Desenvolvimentos/Atendi/supabase/migrations/20260610000000_add_conversation_sessions.sql', 'utf8');
  
  const { data, error } = await supabaseAdmin.rpc('exec_sql', { sql_query: sql });
  
  if (error) {
    console.log("RPC failed, trying direct table creation...");
    
    // Try creating table directly
    const { error: e1 } = await supabaseAdmin.from('conversation_sessions').select('id').limit(1);
    if (e1 && e1.code === 'PGRST205') {
      console.log("Table does not exist yet. Please run the migration in Supabase Dashboard SQL Editor.");
      console.log("URL: https://supabase.com/dashboard/project/qmkqjkzrsszzytrmdxzc/sql/new");
    } else if (!e1) {
      console.log("Table already exists!");
    } else {
      console.log("Table check error:", e1);
    }
  } else {
    console.log("Migration applied successfully!");
  }
}

main();
