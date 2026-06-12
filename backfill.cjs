const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:Erriesse2025!@db.qmkqjkzrsszzytrmdxzc.supabase.co:5432/postgres"
  });
  await client.connect();
  const sql = `
    INSERT INTO conversation_sessions (conversation_id, contact_id, whatsapp_instance_id, started_at, resolved_at, assigned_agent_id, department_id, resolution_reason_id, resolution_observation)
    SELECT id, contact_id, whatsapp_instance_id, started_at, resolved_at, assigned_agent_id, department_id, resolution_reason_id, resolution_observation
    FROM conversations
    WHERE status = 'resolved' AND resolved_at IS NOT NULL
    ON CONFLICT DO NOTHING;
  `;
  try {
    const res = await client.query(sql);
    console.log("Backfill executed successfully! Rows inserted:", res.rowCount);
  } catch(e) {
    console.error("Backfill error:", e);
  } finally {
    await client.end();
  }
}
run();
