import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '/home/rhiangeraldo/Desenvolvimentos/Atendi/.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function main() {
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .ilike('name', '%carl%');
    
  console.log('Contacts:', contact);

  if (contact && contact.length > 0) {
    const { data: convs } = await supabase
      .from('conversations')
      .select('id, status, is_blocked:contacts(is_blocked)')
      .eq('contact_id', contact[0].id);
      
    console.log('Conversations:', convs);
  }
}

main().catch(console.error);
