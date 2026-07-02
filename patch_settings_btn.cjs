const fs = require('fs');
let content = fs.readFileSync('src/routes/_authenticated/settings.tsx', 'utf8');

content = content.replace(
  /disabled=\{\!instanceName \|\| createInstance\.isPending \|\| \(instanceProvider === 'evogo' && \!company\?\.evogo_host\) \|\| \(instanceProvider === 'stevo' && \!company\?\.stevo_host\)\}/,
  "disabled={!instanceName || createInstance.isPending || (instanceProvider === 'evogo' && !company?.evogo_host && !customHost) || (instanceProvider === 'stevo' && !company?.stevo_host && !customHost)}"
);

fs.writeFileSync('src/routes/_authenticated/settings.tsx', content);
