const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:Erriesse2025!@db.qmkqjkzrsszzytrmdxzc.supabase.co:5432/postgres"
  });
  await client.connect();
  const sql = `
    SELECT
        tc.constraint_name, 
        tc.table_name, 
        kcu.column_name, 
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
    FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='conversations' AND kcu.column_name='assigned_agent_id';
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
