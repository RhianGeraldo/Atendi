import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing URL or KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sql = `
  ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'evogo';
  ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS oficial_phone_number_id VARCHAR(255);
  ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS oficial_access_token TEXT;
  ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS oficial_verify_token VARCHAR(255);
  UPDATE public.whatsapp_instances SET provider = 'evogo' WHERE provider IS NULL;
  
  -- Drop constraint se existir antes de criar
  ALTER TABLE public.whatsapp_instances DROP CONSTRAINT IF EXISTS valid_provider;
  ALTER TABLE public.whatsapp_instances ADD CONSTRAINT valid_provider CHECK (provider IN ('evogo', 'oficial', 'stevo'));
  `;

  const { error } = await supabase.rpc('exec_sql', { query: sql });
  if (error) {
    console.log("RPC exec_sql failed (maybe it doesn't exist). Trying another way or just printing SQL for user.", error);
  } else {
    console.log("Success.");
  }
}
run();
