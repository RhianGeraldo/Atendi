const fs = require('fs');
let content = fs.readFileSync('src/lib/api/chat.functions.ts', 'utf8');

content = content.replace(
  /select\("instance_name, evogo_api_key, stevo_api_key, provider, companies\(evogo_host, stevo_host\)"\)/g,
  'select("instance_name, evogo_api_key, stevo_api_key, provider, custom_host, companies(evogo_host, stevo_host)")'
);

content = content.replace(
  /select\("id, instance_name, evogo_api_key, stevo_api_key, provider, companies\(evogo_host, stevo_host\)"\)/g,
  'select("id, instance_name, evogo_api_key, stevo_api_key, provider, custom_host, companies(evogo_host, stevo_host)")'
);

content = content.replace(
  /host = instance\.provider === 'stevo' \? instance\.companies\?\.stevo_host : instance\.companies\?\.evogo_host;/g,
  "host = instance.custom_host || (instance.provider === 'stevo' ? instance.companies?.stevo_host : instance.companies?.evogo_host);"
);

content = content.replace(
  /host = companyInstance\.provider === 'stevo' \? companyInstance\.companies\?\.stevo_host : companyInstance\.companies\?\.evogo_host;/g,
  "host = companyInstance.custom_host || (companyInstance.provider === 'stevo' ? companyInstance.companies?.stevo_host : companyInstance.companies?.evogo_host);"
);

fs.writeFileSync('src/lib/api/chat.functions.ts', content);
