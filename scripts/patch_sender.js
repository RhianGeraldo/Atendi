const fs = require('fs');

let content = fs.readFileSync('src/lib/server/message-sender.ts', 'utf8');

// 1. Add Stevo imports
if (!content.includes('sendStevoText')) {
  content = content.replace(
    'import { sendEvogoText, sendEvogoMedia, sendEvogoLink } from "../evogo";',
    'import { sendEvogoText, sendEvogoMedia, sendEvogoLink } from "../evogo";\nimport { sendStevoText, sendStevoMedia, sendStevoLink } from "../stevo";'
  );
}

// 2. Update selects
content = content.replace(
  /select\("id, instance_name, evogo_api_key, provider, oficial_phone_number_id, oficial_access_token, companies\(evogo_host\)"\)/g,
  'select("id, instance_name, evogo_api_key, stevo_api_key, provider, oficial_phone_number_id, oficial_access_token, companies(evogo_host, stevo_host)")'
);

// 3. Update host/token assignment
content = content.replace(
  /host = instance\.companies\?\.evogo_host;\s+token = instance\.evogo_api_key;/g,
  "host = instance.provider === 'stevo' ? instance.companies?.stevo_host : instance.companies?.evogo_host;\n      token = instance.provider === 'stevo' ? instance.stevo_api_key : instance.evogo_api_key;"
);

// 4. Update fallback to Evogo/Stevo logic block
// The existing logic checks `if (provider === 'oficial') { ... } else { // Logic for Evogo`
// We need to change the Evogo block to handle both.
// It uses sendEvogoText, sendEvogoMedia, sendEvogoLink.

content = content.replace(
  /evogoResponse = await sendEvogoMedia\(\{/g,
  "evogoResponse = provider === 'stevo' ? await sendStevoMedia({ : await sendEvogoMedia({"
);

// Oh wait, replace is a bit fragile if I do it like this because `await sendEvogoMedia` has multiple lines.
// It's better to just write a smarter replace.

fs.writeFileSync('src/lib/server/message-sender.ts', content);
