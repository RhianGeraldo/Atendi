const fs = require('fs');
let content = fs.readFileSync('src/routes/_authenticated/settings.tsx', 'utf8');

// 1. Add states for custom host and manual api key
content = content.replace(
  /const \[instanceName, setInstanceName\] = useState\(\"\"\);/,
  'const [instanceName, setInstanceName] = useState("");\n  const [customHost, setCustomHost] = useState("");\n  const [customApiKey, setCustomApiKey] = useState("");'
);

// 2. Add inputs in the modal UI (around line 1202)
const customInputs = `
            {(instanceProvider === 'evogo' || instanceProvider === 'stevo') && (
              <>
                <div className="space-y-2 text-left mt-4">
                  <label className="text-sm font-medium">Host da API (URL)</label>
                  <Input 
                    placeholder="Deixe em branco para usar o Host Global" 
                    value={customHost}
                    onChange={(e) => setCustomHost(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">Opcional. Preencha se esta instância usar um servidor diferente da empresa.</p>
                </div>
                <div className="space-y-2 text-left">
                  <label className="text-sm font-medium">API Key da Instância</label>
                  <Input 
                    placeholder="Se preenchido, apenas conectará a instância" 
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">Opcional no EvoGo. Obrigatório no Stevo se não for gerar via API.</p>
                </div>
              </>
            )}
`;
content = content.replace(
  /\{(instanceProvider === 'oficial' \|\| instanceProvider === 'instagram' \|\| instanceProvider === 'messenger'\) && \(/,
  customInputs + '\n            {(instanceProvider === \'oficial\' || instanceProvider === \'instagram\' || instanceProvider === \'messenger\') && ('
);

// 3. Update the mutationFn parameters
content = content.replace(
  /mutationFn: async \(payload: \{ name: string, provider: string, numberId\?: string, wabaId\?: string, accessToken\?: string, verifyToken\?: string \}\) => \{/,
  'mutationFn: async (payload: { name: string, provider: string, numberId?: string, wabaId?: string, accessToken?: string, verifyToken?: string, customHost?: string, customApiKey?: string }) => {'
);
content = content.replace(
  /const \{ name, provider, numberId, wabaId, accessToken, verifyToken \} = payload;/,
  'const { name, provider, numberId, wabaId, accessToken, verifyToken, customHost, customApiKey } = payload;'
);

// 4. Update the provider === 'stevo' error check to only throw if NOT providing custom
content = content.replace(
  /if \(provider === 'stevo' && \(\!company\?\.stevo_host \|\| \!company\?\.stevo_global_token\)\) \{\s*throw new Error\('Configure Host e Token primeiro\.'\);\s*\}/,
  \`if (provider === 'stevo' && (!company?.stevo_host || !company?.stevo_global_token) && !customHost) {
        throw new Error('Configure Host Global ou preencha o Host customizado da instância.');
      }
      if (provider === 'stevo' && !customApiKey && !company?.stevo_global_token) {
        throw new Error('O Stevo requer uma API Key informada ou o Token Global configurado.');
      }\`
);

// 5. Inject customHost into the DB insertion
content = content.replace(
  /webhook_url: defaultWebhookUrl/,
  'webhook_url: defaultWebhookUrl,\n        custom_host: customHost || null'
);

// 6. Inject customApiKey into the DB insertion if evogo/stevo
content = content.replace(
  /oficial_verify_token: finalVerifyToken,/,
  'oficial_verify_token: finalVerifyToken,\n        ...(customApiKey && provider === "evogo" ? { evogo_api_key: customApiKey } : {}),\n        ...(customApiKey && provider === "stevo" ? { stevo_api_key: customApiKey } : {}),'
);

// 7. Update createInstance to handle manual API key logic
content = content.replace(
  /const client = new StevoClient\(\{ host: company\.stevo_host, token: company\.stevo_global_token \}\);\s*try \{\s*const stevoRes: any = await client\.createInstance\(technicalName, data\.stevo_api_key\);\s*const stevoId = stevoRes\?\.data\?\.id \|\| stevoRes\?\.id;\s*if \(stevoId\) \{/,
  \`const hostToUse = data.custom_host || company.stevo_host;
        const client = new StevoClient({ host: hostToUse, token: company.stevo_global_token });
        try {
          let stevoId = null;
          let apiKeyToUse = data.stevo_api_key;
          
          if (customApiKey) {
            // Instância já existe, apenas vamos conectar
            // O ID da instância na Stevo normalmente vem no retorno do webhook ou podemos tentar pegar
            // Por simplicidade, vamos apenas configurar o webhook.
            apiKeyToUse = customApiKey;
            stevoId = "manual-" + technicalName;
          } else {
            const stevoRes: any = await client.createInstance(technicalName, data.stevo_api_key);
            stevoId = stevoRes?.data?.id || stevoRes?.id;
          }

          if (stevoId) {\`
);

// Same for Evogo
content = content.replace(
  /const client = new EvoGoClient\(\{ host: company\.evogo_host, token: company\.evogo_global_token \}\);\s*try \{\s*const evoRes: any = await client\.createInstance\(technicalName, data\.evogo_api_key\);\s*const evogoId = evoRes\?\.data\?\.id \|\| evoRes\?\.id;\s*if \(evogoId\) \{/,
  \`const hostToUse = data.custom_host || company.evogo_host;
        const client = new EvoGoClient({ host: hostToUse, token: company.evogo_global_token });
        try {
          let evogoId = null;
          let apiKeyToUse = data.evogo_api_key;
          
          if (customApiKey) {
            apiKeyToUse = customApiKey;
            evogoId = "manual-" + technicalName;
          } else {
            const evoRes: any = await client.createInstance(technicalName, data.evogo_api_key);
            evogoId = evoRes?.data?.id || evoRes?.id;
          }

          if (evogoId) {\`
);

// 8. Update onClick call
content = content.replace(
  /verifyToken: oficialVerifyToken\s*\}\)/,
  'verifyToken: oficialVerifyToken,\n                customHost,\n                customApiKey\n              })'
);

// 9. Reset state on success
content = content.replace(
  /setOficialVerifyToken\(\"\"\);/,
  'setOficialVerifyToken("");\n      setCustomHost("");\n      setCustomApiKey("");'
);

fs.writeFileSync('src/routes/_authenticated/settings.tsx', content);
