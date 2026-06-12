import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SERVICE_ROLE);

async function run() {
  const { data } = await supabase
    .from('messages')
    .select('content, metadata')
    .ilike('content', '%http%')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log(JSON.stringify(data, null, 2));
}
run();
