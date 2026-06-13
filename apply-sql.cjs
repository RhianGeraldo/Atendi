const { Client } = require('pg');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, v] = line.split('=');
  if (k && v) acc[k.trim()] = v.trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const connString = env.VITE_SUPABASE_URL 
  ? env.VITE_SUPABASE_URL.replace('https://', 'postgres://postgres:' + env.SUPABASE_DB_PASSWORD + '@db.') + '.supabase.co:5432/postgres'
  : env.DATABASE_URL;

const client = new Client({ connectionString: connString });

async function run() {
  await client.connect();
  const sql = fs.readFileSync('supabase/migrations/20260613000000_refactor_ticket_sessions.sql', 'utf-8');
  try {
    await client.query(sql);
    console.log("Migration applied successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await client.end();
  }
}
run();
