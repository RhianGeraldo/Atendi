const { createClient } = require('@supabase/supabase-js');
const url = "https://qmkqjkzrsszzytrmdxzc.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFta3Fqa3pyc3N6enl0cm1keHpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDc1MDE5MiwiZXhwIjoyMDk2MzI2MTkyfQ.q_LA_GZ9wFMND2hysQT2g7Ihu5bLzK7K23-tzZ2PyyA";
const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase
    .from("conversation_sessions")
    .select(`
      id,
      assigned_agent:profiles!conversation_sessions_assigned_agent_id_fkey (
        name
      )
    `)
    .limit(1);
    
  console.log("Error:", error);
}
run();
