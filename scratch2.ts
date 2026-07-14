import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SERVICE_ROLE || '';
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const tables = ['departments', 'units', 'profiles']
  for (const table of tables) {
    const { data } = await supabase.from(table).select('*').limit(1)
    if (data && data.length > 0) {
      console.log(`Table ${table} keys:`, Object.keys(data[0]))
    } else {
      console.log(`Table ${table} is empty`)
    }
  }
}
test()
