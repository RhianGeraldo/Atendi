import { readFileSync } from 'fs';
const env = readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, v] = line.split('=');
  if (k && v) acc[k.trim()] = v.trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const host = env.VITE_EVOGO_HOST || 'http://localhost:8080';
const token = env.VITE_EVOGO_TOKEN || '';
const instanceName = 'esteticaelaser-aracruz-comercial';
const apiKey = '54085360-e3d8-4d64-9b21-00bd8ea1a6e3'; // from user's webhook

async function test() {
  console.log("Testing /settings/find...");
  const res = await fetch(`${host}/settings/find/${instanceName}`, {
    headers: { 'apikey': apiKey }
  });
  console.log(res.status, await res.text());
}
test();
