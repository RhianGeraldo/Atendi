import { handleEvogoWebhook } from './src/lib/server/evogo-webhook';
import * as fs from 'fs';

const envFile = fs.readFileSync('/home/rhiangeraldo/Desenvolvimentos/Atendi/.env', 'utf8');
const envUrlMatch = envFile.match(/VITE_SUPABASE_URL=['"]?([^'"\n]+)['"]?/);
const envKeyMatch = envFile.match(/SERVICE_ROLE=['"]?([^'"\n]+)['"]?/);

process.env.SUPABASE_URL = envUrlMatch[1];
process.env.SUPABASE_SERVICE_ROLE_KEY = envKeyMatch[1];

const req = new Request('http://localhost:5173/api/evogo/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    event: 'messages.upsert',
    instance: '8fac659e-c7a6-4ce9-8ec7-e1c4d4d1a279',
    data: {
      message: {
        key: { remoteJid: '554491529987@s.whatsapp.net', id: 'TEST12345', fromMe: false },
        message: { conversation: 'TEST LOCAL WEBHOOK 2' },
        messageTimestamp: Date.now() / 1000
      }
    }
  })
});

async function run() {
  console.log("Sending fake webhook directly to handleEvogoWebhook function...");
  try {
    const res = await handleEvogoWebhook(req);
    console.log("Response:", res.status);
  } catch (e) {
    console.error(e);
  }
}
run();
