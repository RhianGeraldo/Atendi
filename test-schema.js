const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SERVICE_ROLE);
sb.from('whatsapp_instances').select('*').limit(1).then(console.log);
