const fs = require('fs');
let content = fs.readFileSync('src/routes/_authenticated/settings.tsx', 'utf8');

// 1. Import StevoClient
if (!content.includes('import { StevoClient }')) {
  content = content.replace(
    'import { EvoGoClient } from "@/integrations/evogo/client";',
    'import { EvoGoClient } from "@/integrations/evogo/client";\nimport { StevoClient } from "@/integrations/stevo/client";'
  );
}

// 2. States
content = content.replace(
  'const [host, setHost] = useState("");',
  'const [host, setHost] = useState("");\n  const [stevoHost, setStevoHost] = useState("");'
);
content = content.replace(
  'const [token, setToken] = useState("");',
  'const [token, setToken] = useState("");\n  const [stevoToken, setStevoToken] = useState("");'
);

// 3. Query
content = content.replace(
  'select("id, name, evogo_host, evogo_global_token, meta_system_user_token',
  'select("id, name, evogo_host, evogo_global_token, stevo_host, stevo_global_token, meta_system_user_token'
);

// 4. Set state
content = content.replace(
  'setHost(company.evogo_host || "");',
  'setHost(company.evogo_host || "");\n      setStevoHost(company.stevo_host || "");'
);
content = content.replace(
  'setToken(company.evogo_global_token || "");',
  'setToken(company.evogo_global_token || "");\n      setStevoToken(company.stevo_global_token || "");'
);

// 5. Save Config
content = content.replace(
  '.update({ evogo_host: host, evogo_global_token: token })',
  '.update({ evogo_host: host, evogo_global_token: token, stevo_host: stevoHost, stevo_global_token: stevoToken })'
);

// 6. UI Form
const uiForm = `
        <Card className="col-span-full lg:col-span-1 mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              API StevoChat (Empresa Mãe)
            </CardTitle>
            <CardDescription>
              Configure o servidor base e o token mestre do StevoChat.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Host (URL da API)</label>
              <div className="relative">
                <Server className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input 
                  placeholder="https://stevo.chat/api" 
                  value={stevoHost}
                  onChange={(e) => setStevoHost(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Global Token</label>
              <div className="relative">
                <Key className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input 
                  type="password"
                  placeholder="Seu token global" 
                  value={stevoToken}
                  onChange={(e) => setStevoToken(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Button 
              className="w-full" 
              onClick={() => saveConfig.mutate()}
              disabled={saveConfig.isPending || isLoadingCompany}
            >
              <Save className="mr-2 h-4 w-4" />
              Salvar Credenciais
            </Button>
          </CardContent>
        </Card>
`;

content = content.replace(
  /<\/CardContent>\s*<\/Card>\s*<\/TabsContent>/,
  '</CardContent>\n        </Card>\n' + uiForm + '\n        </TabsContent>'
);

// 7. Stevo disabled remove
content = content.replace(
  '<SelectItem value="stevo" disabled>Stevo (Em Breve)</SelectItem>',
  '<SelectItem value="stevo">StevoChat</SelectItem>'
);

// 8. Create Instance Mutation - condition
content = content.replace(
  "if (provider === 'evogo' && (!company?.evogo_host || !company?.evogo_global_token)) {",
  "if (provider === 'evogo' && (!company?.evogo_host || !company?.evogo_global_token)) {\n        throw new Error('Configure Host e Token primeiro para usar a EvoGo.');\n      }\n      if (provider === 'stevo' && (!company?.stevo_host || !company?.stevo_global_token)) {"
);
content = content.replace(
  "throw new Error(\"Configure Host e Token primeiro para usar a EvoGo.\");",
  "throw new Error('Configure Host e Token primeiro.');"
);

// 9. Create Instance - client logic
const createStevoBlock = `
      } else if (provider === 'stevo') {
        const client = new StevoClient({ host: company.stevo_host, token: company.stevo_global_token });
        try {
          const stevoRes: any = await client.createInstance(technicalName, data.stevo_api_key);
          const stevoId = stevoRes?.data?.id || stevoRes?.id;

          if (stevoId) {
            const webhookUrl = \`\${window.location.origin}/api/webhooks/stevo\`;
          
            await supabase.from("whatsapp_instances").update({
              stevo_instance_id: stevoId,
              webhook_url: webhookUrl
            }).eq("id", data.id);

            await client.connectInstance(webhookUrl, data.stevo_api_key).catch(console.error);
            await client.updateAdvancedSettings(stevoId, {
              rejectCalls: false,
              readMessages: false,
              readStatus: false,
              alwaysOnline: false
            }, data.stevo_api_key).catch(console.error);
          }
        } catch (e: any) {
          console.error("Stevo Create Error:", e);
          throw new Error("Falha ao criar instância no Stevo: " + e.message);
        }
`;

content = content.replace(
  /\} catch \(e: any\) \{\s*console\.error\("EvoGo Create Error:", e\);\s*throw new Error\("Falha ao criar instância na EvoGo: " \+ e\.message\);\s*\}\s*\}/,
  '} catch (e: any) {\n          console.error("EvoGo Create Error:", e);\n          throw new Error("Falha ao criar instância na EvoGo: " + e.message);\n        }\n' + createStevoBlock + '\n      }'
);

// 10. Disable state in button
content = content.replace(
  "disabled={!instanceName || createInstance.isPending || (instanceProvider === 'evogo' && !company?.evogo_host)}",
  "disabled={!instanceName || createInstance.isPending || (instanceProvider === 'evogo' && !company?.evogo_host) || (instanceProvider === 'stevo' && !company?.stevo_host)}"
);

// 11. Disconnect and delete logic
content = content.replace(
  /const client = new EvoGoClient\(\{ host: company\.evogo_host, token: company\.evogo_global_token \}\);\s*await client\.logoutInstance\(instance\.evogo_api_key\);/,
  `if (instance.provider === 'stevo') {
        const client = new StevoClient({ host: company.stevo_host, token: company.stevo_global_token });
        await client.logoutInstance(instance.stevo_api_key);
      } else {
        const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });
        await client.logoutInstance(instance.evogo_api_key);
      }`
);

content = content.replace(
  /if \(instance\.evogo_instance_id\) \{\s*const client = new EvoGoClient\(\{ host: company\.evogo_host, token: company\.evogo_global_token \}\);\s*await client\.deleteInstance\(instance\.evogo_instance_id\);\s*\}/,
  `if (instance.provider === 'stevo' && instance.stevo_instance_id) {
        const client = new StevoClient({ host: company.stevo_host, token: company.stevo_global_token });
        await client.deleteInstance(instance.stevo_instance_id);
      } else if (instance.provider === 'evogo' && instance.evogo_instance_id) {
        const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });
        await client.deleteInstance(instance.evogo_instance_id);
      }`
);

fs.writeFileSync('src/routes/_authenticated/settings.tsx', content);
