const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data } = await supabase.from('whatsapp_instances').select('id, provider, oficial_phone_number_id, oficial_waba_id').eq('provider', 'instagram');
  console.log(data);
}
main();
