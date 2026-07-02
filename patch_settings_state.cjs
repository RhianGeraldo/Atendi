const fs = require('fs');
let content = fs.readFileSync('src/routes/_authenticated/settings.tsx', 'utf8');

content = content.replace(
  /const \[instanceName, setInstanceName\] = useState\(\"\"\);/,
  'const [instanceName, setInstanceName] = useState("");\\n  const [customHost, setCustomHost] = useState("");\\n  const [customApiKey, setCustomApiKey] = useState("");'
);

fs.writeFileSync('src/routes/_authenticated/settings.tsx', content);
