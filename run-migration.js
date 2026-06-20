import pg from 'pg';

const { Client } = pg;

// Try pooler port 6543 which forces IPv4 typically
const client = new Client({
  connectionString: 'postgresql://postgres.wzwloyotlwibgfeeetly:Erriesse2025!@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to DB via pooler!');
    
    await client.query(`
      ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS meta_system_user_token TEXT;
    `);
    
    console.log('Migration successful!');

  } catch (error) {
    console.error('Script Error:', error);
  } finally {
    await client.end();
  }
}

run();
