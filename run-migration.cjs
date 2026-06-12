const { Client } = require('pg');
const fs = require('fs');

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:Erriesse2025!@db.qmkqjkzrsszzytrmdxzc.supabase.co:5432/postgres"
  });
  await client.connect();
  const sql = fs.readFileSync('supabase/migrations/20260612210000_add_transcription_fields.sql', 'utf8');
  try {
    await client.query(sql);
    console.log("Migration executed successfully!");
  } catch(e) {
    console.error("Migration error:", e);
  } finally {
    await client.end();
  }
}
run();
