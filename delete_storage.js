import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read .env manually
const env = fs.readFileSync('.env', 'utf-8');
const envVars = {};
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
  }
});

const supabaseUrl = envVars.SUPABASE_URL;
const supabaseKey = envVars.SERVICE_ROLE || envVars.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanStorage() {
  console.log("Fetching buckets...");
  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  
  if (bucketError) {
    console.error("Error fetching buckets:", bucketError);
    return;
  }

  if (!buckets || buckets.length === 0) {
    console.log("No buckets found via API either!");
    return;
  }

  console.log(`Found ${buckets.length} buckets: ${buckets.map(b => b.name).join(', ')}`);

  for (const bucket of buckets) {
    console.log(`\nFetching files in bucket: ${bucket.name}`);
    const { data: files, error: listError } = await supabase.storage.from(bucket.name).list();
    
    if (listError) {
      console.error(`Error listing files in ${bucket.name}:`, listError);
      continue;
    }

    if (!files || files.length === 0) {
      console.log(`Bucket ${bucket.name} is empty.`);
      continue;
    }

    console.log(`Found ${files.length} files in ${bucket.name}. Deleting...`);
    // Delete in chunks of 100
    for (let i = 0; i < files.length; i += 100) {
      const chunk = files.slice(i, i + 100).map(f => f.name);
      const { error: deleteError } = await supabase.storage.from(bucket.name).remove(chunk);
      if (deleteError) {
        console.error(`Error deleting chunk in ${bucket.name}:`, deleteError);
      } else {
        console.log(`Deleted chunk of ${chunk.length} files from ${bucket.name}`);
      }
    }
    
    // Now delete the bucket itself if it's empty
    const { error: deleteBucketError } = await supabase.storage.deleteBucket(bucket.name);
    if (deleteBucketError) {
        console.error(`Error deleting bucket ${bucket.name}:`, deleteBucketError);
    } else {
        console.log(`Successfully deleted bucket ${bucket.name}`);
    }
  }
}

cleanStorage();
