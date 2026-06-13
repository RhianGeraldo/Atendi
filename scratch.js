import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('messages')
    .select('metadata')
    .not('metadata', 'is', null)
    .neq('metadata', '{}')
    .limit(5);
  
  if (error) console.error(error);
  console.log(JSON.stringify(data, null, 2));
}
check();
