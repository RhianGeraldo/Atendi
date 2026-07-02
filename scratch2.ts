import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
async function run() {
  const q = supabase.from('conversations').select('id, contact:contacts!inner(is_blocked)');
  q.or('is_blocked.eq.false,is_blocked.is.null', { foreignTable: 'contact' });
  q.or('name.ilike.%carl%', { foreignTable: 'contact' });
  console.log(q.url.toString());
}
run();
