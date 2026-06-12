import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://qmkqjkzrsszzytrmdxzc.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFta3Fqa3pyc3N6enl0cm1keHpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDc1MDE5MiwiZXhwIjoyMDk2MzI2MTkyfQ.q_LA_GZ9wFMND2hysQT2g7Ihu5bLzK7K23-tzZ2PyyA";
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.storage.createBucket('media', {
    public: true,
    fileSizeLimit: 52428800, // 50MB
  });
  console.log("Create Bucket:", data, error);
}
run();
