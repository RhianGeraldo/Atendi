const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:Erriesse2025!@db.qmkqjkzrsszzytrmdxzc.supabase.co:5432/postgres"
  });
  await client.connect();
  const sql = `
    SELECT constraint_name 
    FROM information_schema.key_column_usage 
    WHERE table_name = 'conversation_sessions' AND column_name = 'assigned_agent_id';
  `;
  try {
    const res = await client.query(sql);
    console.log(res.rows);
  } catch(e) {
    console.error("error:", e);
  } finally {
    await client.end();
  }
}
run();
