import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('remote_msg_id', 'A57955B8B4A9D9F698535107DAA76453');
  console.log('Error:', error);
  console.log('Data:', JSON.stringify(data, null, 2));
}
check();
