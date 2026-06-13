import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qmkqjkzrsszzytrmdxzc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFta3Fqa3pyc3N6enl0cm1keHpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDc1MDE5MiwiZXhwIjoyMDk2MzI2MTkyfQ.q_LA_GZ9wFMND2hysQT2g7Ihu5bLzK7K23-tzZ2PyyA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function closeTickets() {
  const ids = ['9de12f17', 'd90c0eb0'];
  
  const { data: allSessions, error } = await supabase
    .from('conversation_sessions')
    .select('id')
    .is('resolved_at', null);
    
  if (error || !allSessions) {
    console.error(error);
    return;
  }
  
  for (const session of allSessions) {
    if (ids.some(id => session.id.startsWith(id))) {
      const { error: updateError } = await supabase
        .from('conversation_sessions')
        .update({ resolved_at: new Date().toISOString() })
        .eq('id', session.id);
        
      if (updateError) {
        console.error(`Failed to close ${session.id}`, updateError);
      } else {
        console.log(`Closed session ${session.id}`);
      }
    }
  }
}

closeTickets().catch(console.error);
