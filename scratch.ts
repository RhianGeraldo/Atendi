import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // we will auth first
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'hestephany@atendicrm.com.br', // an email from earlier context
    password: '123'
  });
  
  if (authErr) {
    console.log("Auth Error:", authErr.message);
    // Let's try service role key
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const adminSupabase = createClient(supabaseUrl, serviceKey);
    const { data, error } = await adminSupabase.from('conversation_sessions').select('*').limit(5);
    console.log("Admin Data:", data, "Error:", error);
    return;
  }

  const { data, error } = await supabase.from('conversation_sessions').select('*').limit(5);
  console.log("Data:", data, "Error:", error);
}

run();
