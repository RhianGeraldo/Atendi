const fs = require('fs');
let content = fs.readFileSync('src/components/whatsapp/instance-settings-modal.tsx', 'utf8');

// 1. Add states
content = content.replace(
  /const \[webhookUrl, setWebhookUrl\] = useState\(\"\"\);/,
  'const [webhookUrl, setWebhookUrl] = useState("");\n  const [customHost, setCustomHost] = useState("");\n  const [customApiKey, setCustomApiKey] = useState("");'
);

// 2. Hydrate states
content = content.replace(
  /setWebhookUrl\(defaultWebhook\);/,
  'setWebhookUrl(defaultWebhook);\n    setCustomHost(instance.custom_host || "");\n    setCustomApiKey(instance.provider === "stevo" ? (instance.stevo_api_key || "") : (instance.evogo_api_key || ""));'
);

// 3. Pass to SettingsFormContent
content = content.replace(
  /webhookUrl=\{webhookUrl\} setWebhookUrl=\{setWebhookUrl\}/g,
  'webhookUrl={webhookUrl} setWebhookUrl={setWebhookUrl}\n                  customHost={customHost} setCustomHost={setCustomHost}\n                  customApiKey={customApiKey} setCustomApiKey={setCustomApiKey}'
);
content = content.replace(
  /webhookUrl, setWebhookUrl,/,
  'webhookUrl, setWebhookUrl,\n  customHost, setCustomHost,\n  customApiKey, setCustomApiKey,'
);

// 4. Update the logic for client initialization
content = content.replace(
  /const client = new StevoClient\(\{ host: company\.stevo_host, token: company\.stevo_global_token \}\);/,
  'const client = new StevoClient({ host: customHost || company.stevo_host, token: company.stevo_global_token });'
);
content = content.replace(
  /const client = new EvoGoClient\(\{ host: company\.evogo_host, token: company\.evogo_global_token \}\);/,
  'const client = new EvoGoClient({ host: customHost || company.evogo_host, token: company.evogo_global_token });'
);

// 5. Update supabase update payload
content = content.replace(
  /await supabase\.from\("whatsapp_instances"\)\.update\(\{ webhook_url: webhookUrl, wavoip_token: wavoipToken \|\| null \}\)\.eq\("id", instance\.id\);/g,
  'await supabase.from("whatsapp_instances").update({ webhook_url: webhookUrl, wavoip_token: wavoipToken || null, custom_host: customHost || null, ...(instance.provider === "stevo" ? { stevo_api_key: customApiKey } : { evogo_api_key: customApiKey }) }).eq("id", instance.id);'
);

// 6. Update fetchSettings logic
content = content.replace(
  /if \(instance\.provider === 'stevo'\) \{\s*const client = new StevoClient\(\{ host: company\.stevo_host, token: company\.stevo_global_token \}\);/g,
  \`if (instance.provider === 'stevo') {
          const client = new StevoClient({ host: instance.custom_host || company.stevo_host, token: company.stevo_global_token });\`
);

content = content.replace(
  /\} else \{\s*const client = new EvoGoClient\(\{ host: company\.evogo_host, token: company\.evogo_global_token \}\);/g,
  `} else {
          const client = new EvoGoClient({ host: instance.custom_host || company.evogo_host, token: company.evogo_global_token });`
);

// 7. Inject Inputs in SettingsFormContent
const inputs = `
      {!isCloudAPI && (
        <div className="space-y-3 mt-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">Credenciais Customizadas</h4>
          </div>
          <div className="space-y-1 mt-2">
            <label className="text-xs text-muted-foreground">Host Customizado (URL)</label>
            <Input 
              placeholder="Opcional. Substitui o da empresa." 
              value={customHost}
              onChange={(e) => setCustomHost(e.target.value)}
            />
          </div>
          <div className="space-y-1 mt-2">
            <label className="text-xs text-muted-foreground">API Key da Instância</label>
            <Input 
              placeholder="Token exato da instância" 
              value={customApiKey}
              onChange={(e) => setCustomApiKey(e.target.value)}
            />
          </div>
        </div>
      )}
`;
content = content.replace(
  /\{\!isCloudAPI && \(\s*<div className=\"space-y-1 mt-2\">\s*<label className=\"text-xs text-muted-foreground\">Wavoip Token \(Chamadas\)<\/label>/,
  inputs + '\\n      {!isCloudAPI && (\\n        <div className="space-y-1 mt-2">\\n          <label className="text-xs text-muted-foreground">Wavoip Token (Chamadas)</label>'
);

fs.writeFileSync('src/components/whatsapp/instance-settings-modal.tsx', content);
