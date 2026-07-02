const fs = require('fs');
let content = fs.readFileSync('src/lib/api/chat.functions.ts', 'utf8');

// Update Selects in Edit Message and Delete Message
content = content.replace(
  /select\("instance_name, evogo_api_key, companies\(evogo_host\)"\)/g,
  'select("instance_name, evogo_api_key, stevo_api_key, provider, companies(evogo_host, stevo_host)")'
);

// We need an additional variable 'provider' in edit/delete blocks.
// Let's replace the provider fetching block.
content = content.replace(
  /host = instance\.companies\?\.evogo_host;\s*token = instance\.evogo_api_key;\s*instanceName = instance\.instance_name;/g,
  "host = instance.provider === 'stevo' ? instance.companies?.stevo_host : instance.companies?.evogo_host;\n        token = instance.provider === 'stevo' ? instance.stevo_api_key : instance.evogo_api_key;\n        instanceName = instance.instance_name;\n        provider = instance.provider || 'evogo';"
);

// Wait, the variables `host, token, instanceName;` in edit/delete are defined as `let host, token, instanceName;`. I must also add `provider`.
content = content.replace(
  /let host, token, instanceName;/g,
  'let host, token, instanceName, provider;'
);

// Update Edit Message send request
content = content.replace(
  /await editEvogoMessage\(\{[\s\S]*?message: textToSend,\s*\}\);/,
  \`if (provider === 'stevo') {
        await editStevoMessage({
          host, token, number: conv.contacts.phone, remoteMsgId: msg.remote_msg_id, message: textToSend
        });
      } else {
        await editEvogoMessage({
          host, token, number: conv.contacts.phone, remoteMsgId: msg.remote_msg_id, message: textToSend
        });
      }\`
);

// Update Delete Message send request
content = content.replace(
  /await deleteEvogoMessage\(\{[\s\S]*?remoteMsgId: msg.remote_msg_id,\s*\}\);/,
  \`if (provider === 'stevo') {
        await deleteStevoMessage({
          host, token, number: conv.contacts.phone, remoteMsgId: msg.remote_msg_id
        });
      } else {
        await deleteEvogoMessage({
          host, token, number: conv.contacts.phone, remoteMsgId: msg.remote_msg_id
        });
      }\`
);

fs.writeFileSync('src/lib/api/chat.functions.ts', content);
