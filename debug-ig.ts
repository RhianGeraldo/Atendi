import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    console.log('Fetching Instagram instance...');
    
    const { data: instances, error } = await supabase
      .from('whatsapp_instances')
      .select('id, name, provider, oficial_phone_number_id, oficial_waba_id, oficial_access_token')
      .eq('provider', 'instagram')
      .order('created_at', { ascending: false })
      .limit(1);
      
    if (error) {
      console.error('Supabase Error:', error);
      return;
    }
    
    if (!instances || instances.length === 0) {
      console.log('No Instagram instance found.');
      return;
    }
    
    const instance = instances[0];
    const token = instance.oficial_access_token;
    
    console.log('--------------------------------------------------');
    console.log(`Testing Instance: ${instance.name}`);
    console.log(`Instagram Account ID (oficial_phone_number_id): ${instance.oficial_phone_number_id}`);
    console.log(`Facebook Page ID (oficial_waba_id): ${instance.oficial_waba_id}`);
    console.log(`Token starts with: ${token ? token.substring(0, 10) + '...' : 'NULL'}`);
    console.log('--------------------------------------------------');
    
    if (!token) {
      console.log('No token to test.');
      return;
    }

    // 1. Test /me/permissions
    console.log('\\n[1] Fetching Token Permissions (/me/permissions)...');
    const permRes = await fetch(`https://graph.facebook.com/v20.0/me/permissions?access_token=${token}`);
    const permData = await permRes.json();
    
    if (permData.error) {
      console.log('ERROR fetching permissions:', permData.error);
    } else if (permData.data) {
      permData.data.forEach((p: any) => {
        console.log(`  - ${p.permission}: ${p.status}`);
      });
    }

    // 2. Test /me endpoint to see what object the token is tied to
    console.log('\\n[2] Fetching /me to see what object this token resolves to...');
    const meRes = await fetch(`https://graph.facebook.com/v20.0/me?access_token=${token}`);
    const meData = await meRes.json();
    console.log('  /me result:', meData);

    // 3. Check if the token has access to the provided Instagram Account ID
    if (instance.oficial_phone_number_id) {
      console.log(`\\n[3] Fetching /${instance.oficial_phone_number_id} (Instagram Account Node)...`);
      const igRes = await fetch(`https://graph.facebook.com/v20.0/${instance.oficial_phone_number_id}?access_token=${token}`);
      const igData = await igRes.json();
      console.log(`  /${instance.oficial_phone_number_id} result:`, igData);
    }
    
    // 4. Check if the token has access to the provided Page ID
    if (instance.oficial_waba_id) {
      console.log(`\\n[4] Fetching /${instance.oficial_waba_id} (Facebook Page Node)...`);
      const pageRes = await fetch(`https://graph.facebook.com/v20.0/${instance.oficial_waba_id}?access_token=${token}`);
      const pageData = await pageRes.json();
      console.log(`  /${instance.oficial_waba_id} result:`, pageData);
    }

  } catch (error) {
    console.error('Script Error:', error);
  }
}

run();
