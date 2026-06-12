const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:Erriesse2025!@db.qmkqjkzrsszzytrmdxzc.supabase.co:5432/postgres"
  });
  await client.connect();
  const sql = `
    ALTER TABLE public.conversation_sessions
    DROP CONSTRAINT conversation_sessions_assigned_agent_id_fkey,
    ADD CONSTRAINT conversation_sessions_assigned_agent_id_fkey
    FOREIGN KEY (assigned_agent_id)
    REFERENCES public.profiles(id)
    ON DELETE SET NULL;
    
    NOTIFY pgrst, 'reload schema';
  `;
  try {
    await client.query(sql);
    console.log("Foreign key updated and schema reloaded successfully.");
  } catch(e) {
    console.error("error:", e);
  } finally {
    await client.end();
  }
}
run();
