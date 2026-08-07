import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/home/rhiangeraldo/Desenvolvimentos/Atendi/.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const ids = ['3A32D3646396E45DEEF7', '3AFDE70EA0D34AAD6CCA'];
  
  for (const id of ids) {
    const { data, error } = await supabase.from('messages').select('id, metadata').eq('remote_msg_id', id).single();
    if (error) {
      console.log(`Error finding ${id}:`, error.message);
      continue;
    }
    
    if (data) {
      const meta = data.metadata || {};
      meta.is_ptv = true;
      
      const { error: updErr } = await supabase.from('messages').update({
        media_type: 'video',
        metadata: meta
      }).eq('id', data.id);
      
      if (updErr) {
        console.log(`Error updating ${id}:`, updErr.message);
      } else {
        console.log(`Updated ${id} successfully!`);
      }
    }
  }
}
run();
