const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:Erriesse2025!@db.qmkqjkzrsszzytrmdxzc.supabase.co:5432/postgres"
  });
  await client.connect();
  const sql = `
    SELECT id, contact_id, whatsapp_instance_id, assigned_agent_id, department_id 
    FROM conversations 
    WHERE status = 'resolved' 
    LIMIT 1;
  `;
  try {
    const res = await client.query(sql);
    const conv = res.rows[0];
    console.log("Got conv:", conv);

    // Now try to insert it using the same fields
    const insertSql = `
      INSERT INTO conversation_sessions 
      (conversation_id, contact_id, whatsapp_instance_id, started_at, resolved_at, assigned_agent_id, department_id)
      VALUES ($1, $2, $3, now(), now(), $4, $5)
      RETURNING *;
    `;
    const insertRes = await client.query(insertSql, [conv.id, conv.contact_id, conv.whatsapp_instance_id, conv.assigned_agent_id, conv.department_id]);
    console.log("Insert worked!", insertRes.rows[0]);
  } catch(e) {
    console.error("Insert error:", e);
  } finally {
    await client.end();
  }
}
run();
