import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SERVICE_ROLE || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data } = await supabase
    .from('messages')
    .select('content, metadata')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log(JSON.stringify(data, null, 2));
}
run();
