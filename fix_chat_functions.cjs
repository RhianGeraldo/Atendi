const fs = require('fs');
let content = fs.readFileSync('src/lib/api/chat.functions.ts', 'utf8');

content = content.replace(
  /provider === 'stevo' \? await sendStevoReaction\(\{ : await sendEvogoReaction\(\{/g,
  "if (provider === 'stevo') {\n          await sendStevoReaction({\n            host, token, number: phone, remoteMsgId: remote_msg_id, emoji\n          });\n        } else {\n          await sendEvogoReaction({\n"
);

content = content.replace(
  /const response = provider === 'stevo' \? await editStevoMessage\(\{ : await editEvogoMessage\(\{/g,
  "let response;\n        if (provider === 'stevo') {\n          response = await editStevoMessage({\n            host, token, number: phone, remoteMsgId: remote_msg_id, message: new_content\n          });\n        } else {\n          response = await editEvogoMessage({\n"
);

content = content.replace(
  /const response = provider === 'stevo' \? await deleteStevoMessage\(\{ : await deleteEvogoMessage\(\{/g,
  "let response;\n        if (provider === 'stevo') {\n          response = await deleteStevoMessage({\n            host, token, number: phone, remoteMsgId: remote_msg_id\n          });\n        } else {\n          response = await deleteEvogoMessage({\n"
);

fs.writeFileSync('src/lib/api/chat.functions.ts', content);
