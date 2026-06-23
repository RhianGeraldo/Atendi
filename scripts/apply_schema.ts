import fs from 'fs';
import pg from 'pg';

const { Client } = pg;

const NEW_DB_URL = 'postgresql://postgres:Erriesse2025!@db.kcirbzbdahliqcwvjifo.supabase.co:5432/postgres';

async function main() {
  console.log('Reading consolidated schema from supabase/full_schema.sql...');
  const sql = fs.readFileSync('supabase/full_schema.sql', 'utf8');

  console.log('Connecting to new Supabase database...');
  const client = new Client({ connectionString: NEW_DB_URL });
  
  try {
    await client.connect();
    console.log('Connected successfully. Executing consolidated schema SQL...');
    
    // We run it as a single query which handles multi-statement strings
    await client.query(sql);
    
    console.log('consolidated schema applied successfully to the new database!');
  } catch (error) {
    console.error('Error applying schema:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
