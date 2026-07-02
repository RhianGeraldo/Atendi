const fs = require('fs');
let content = fs.readFileSync('src/lib/server/message-sender.ts', 'utf8');

// Update Selects
content = content.replace(
  /select\("id, instance_name, evogo_api_key, stevo_api_key, provider, oficial_phone_number_id, oficial_access_token, companies\(evogo_host, stevo_host\)"\)/g,
  'select("id, instance_name, evogo_api_key, stevo_api_key, provider, custom_host, oficial_phone_number_id, oficial_access_token, companies(evogo_host, stevo_host)")'
);

// Update host resolution logic
content = content.replace(
  /host = instance\.provider === 'stevo' \? instance\.companies\?\.stevo_host : instance\.companies\?\.evogo_host;/g,
  "host = instance.custom_host || (instance.provider === 'stevo' ? instance.companies?.stevo_host : instance.companies?.evogo_host);"
);

fs.writeFileSync('src/lib/server/message-sender.ts', content);
