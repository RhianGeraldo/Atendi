const fs = require('fs');
let content = fs.readFileSync('src/lib/api/chat.functions.ts', 'utf8');

// 1. Add Stevo imports
if (!content.includes('sendStevoText')) {
  content = content.replace(
    'import { sendEvogoText, sendEvogoLink, sendEvogoMedia, sendEvogoReaction, editEvogoMessage, deleteEvogoMessage } from "../evogo";',
    'import { sendEvogoText, sendEvogoLink, sendEvogoMedia, sendEvogoReaction, editEvogoMessage, deleteEvogoMessage } from "../evogo";\nimport { sendStevoText, sendStevoLink, sendStevoMedia, sendStevoReaction, editStevoMessage, deleteStevoMessage } from "../stevo";'
  );
}

// 2. Update selects
content = content.replace(
  /select\(\"id, instance_name, evogo_api_key, provider, companies\(evogo_host\)\"\)/g,
  'select(\"id, instance_name, evogo_api_key, stevo_api_key, provider, companies(evogo_host, stevo_host)\")'
);

// 3. Update host/token assignments
content = content.replace(
  /host = instance\.companies\?\.evogo_host;\s*token = instance\.evogo_api_key;/g,
  "host = instance.provider === 'stevo' ? instance.companies?.stevo_host : instance.companies?.evogo_host;\n        token = instance.provider === 'stevo' ? instance.stevo_api_key : instance.evogo_api_key;"
);

// 4. Update function calls for reactions
content = content.replace(
  /await sendEvogoReaction\(\{/g,
  "provider === 'stevo' ? await sendStevoReaction({ : await sendEvogoReaction({"
);

// Wait, the ternary operator `provider === 'stevo' ? await fn() : await fn()` inside `const res = ...` might be tricky because of missing `}` for ternary.
// Let's use a simpler regex.
content = content.replace(
  /const evogoRes = await sendEvogoReaction\(\{/g,
  "const evogoRes = provider === 'stevo' ? await sendStevoReaction({ : await sendEvogoReaction({"
);

content = content.replace(
  /const response = await editEvogoMessage\(\{/g,
  "const response = provider === 'stevo' ? await editStevoMessage({ : await editEvogoMessage({"
);

content = content.replace(
  /const response = await deleteEvogoMessage\(\{/g,
  "const response = provider === 'stevo' ? await deleteStevoMessage({ : await deleteEvogoMessage({"
);

fs.writeFileSync('src/lib/api/chat.functions.ts', content);
