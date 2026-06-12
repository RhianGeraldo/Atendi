const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:Erriesse2025!@db.qmkqjkzrsszzytrmdxzc.supabase.co:5432/postgres"
  });
  await client.connect();
  const sql = `
    SELECT count(*) FROM conversation_sessions;
  `;
  try {
    const res = await client.query(sql);
    console.log("Total conversation_sessions in db:", res.rows[0].count);

    const sql2 = `
      SELECT created_at FROM conversation_sessions ORDER BY created_at DESC LIMIT 5;
    `;
    const res2 = await client.query(sql2);
    console.log("Most recent sessions:", res2.rows);

  } catch(e) {
    console.error("error:", e);
  } finally {
    await client.end();
  }
}
run();
