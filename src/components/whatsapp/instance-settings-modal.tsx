import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Loader2, Save, Globe, Copy, Building } from "lucide-react";
import { toast } from "sonner";
import { EvoGoClient } from "@/integrations/evogo/client";
import { StevoClient } from "@/integrations/stevo/client";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { WhatsappTemplatesTab } from "./whatsapp-templates-tab";

interface InstanceSettingsModalProps {
  instance: any; // { id, name, instance_name, evogo_api_key, evogo_instance_id, webhook_url, department_id }
  company: any; // { evogo_host, evogo_global_token }
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** localhost, 127.x, rede privada ou .local: endereço que um servidor externo não alcança. */
function enderecoLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === "localhost" ||
      host.endsWith(".local") ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    return false;
  }
}

export function InstanceSettingsModal({ instance, company, open, onOpenChange }: InstanceSettingsModalProps) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [channelName, setChannelName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [customHost, setCustomHost] = useState("");
  const [customApiKey, setCustomApiKey] = useState("");
  const [wavoipToken, setWavoipToken] = useState("");
  const [oficialPhoneId, setOficialPhoneId] = useState("");
  const [oficialWabaId, setOficialWabaId] = useState("");
  const [oficialAccessToken, setOficialAccessToken] = useState("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [advSettings, setAdvSettings] = useState({
    rejectCall: false,
    readMessages: false,
    alwaysOnline: false
  });
  // O que veio do provedor. null = não carregou: aí não se manda nada por cima.
  const [advSettingsOriginal, setAdvSettingsOriginal] = useState<typeof advSettings | null>(null);

  const { data: departments } = useQuery({
    queryKey: ["departments_for_instance", instance?.company_id],
    enabled: !!instance?.company_id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name, unit_id")
        .eq("company_id", instance.company_id)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredDepartments = (departments ?? []).filter((dept) => {
    if (!instance?.unit_id) return true;
    return !dept.unit_id || dept.unit_id === instance.unit_id;
  });

  useEffect(() => {
    if (!open || !instance) return;

    const isOficial = instance.provider === 'oficial';
    const isInstagram = instance.provider === 'instagram';
    const isMessenger = instance.provider === 'messenger';
    const isZernio = instance.provider === 'zernio';
    const isCloudAPI = isOficial || isInstagram || isMessenger || isZernio;

    let providerWebhookPath = 'evogo';
    if (instance.provider === 'stevo') providerWebhookPath = 'stevo';
    else if (isOficial) providerWebhookPath = 'whatsapp';
    else if (isInstagram) providerWebhookPath = 'instagram';
    else if (isMessenger) providerWebhookPath = 'messenger';
    else if (isZernio) providerWebhookPath = `zernio/${instance.company_id || ''}?k=${company?.zernio_webhook_secret || ''}`;

    let defaultWebhook = instance.webhook_url;
    const currentDomainWebhook = `${window.location.origin}/api/webhooks/${providerWebhookPath}`;
    
    // Corrige se estiver vazio, for do supabase antigo, for de outro provedor ou
    // apontar para endereço local. Uma URL pública que já funciona nunca é trocada
    // pelo endereço do navegador: aberto no localhost ou num preview, isso desviaria
    // as mensagens de produção. Para mudar de domínio, edite o campo à mão.
    const webhookKeyword = isZernio ? 'zernio' : providerWebhookPath;
    if (
      !defaultWebhook ||
      defaultWebhook.includes('supabase.co') ||
      !defaultWebhook.includes(webhookKeyword) ||
      (enderecoLocal(defaultWebhook) && !enderecoLocal(currentDomainWebhook))
    ) {
      defaultWebhook = currentDomainWebhook;
    }

    setChannelName(instance.name || "");
    setAdvSettingsOriginal(null);
    setWebhookUrl(defaultWebhook);
    setCustomHost(instance.custom_host || "");
    setCustomApiKey(instance.provider === "stevo" ? (instance.stevo_api_key || "") : (instance.evogo_api_key || ""));
    setWavoipToken(instance.wavoip_token || "");
    setOficialPhoneId(instance.oficial_phone_number_id || "");
    setOficialWabaId(instance.oficial_waba_id || "");
    setOficialAccessToken(instance.oficial_access_token || "");
    setSelectedDepartmentId(instance.department_id || null);
    
    // Fetch advanced settings from EvoGo
    const fetchSettings = async () => {
      if (isCloudAPI) {
        setLoading(false);
        return;
      }
      
      if (instance.provider === 'stevo' && !company?.stevo_host) { setLoading(false); return; }
      if (instance.provider === 'evogo' && !company?.evogo_host) { setLoading(false); return; }

      setLoading(true);
      try {
        if (instance.provider === 'stevo' && !instance.stevo_instance_id) throw new Error("Instância local sem ID do Stevo vinculado.");
        if (instance.provider === 'evogo' && !instance.evogo_instance_id) throw new Error("Instância local sem ID do EvoGo vinculado.");

        let res: any;
        if (instance.provider === 'stevo') {
          const client = new StevoClient({ host: instance.custom_host || company.stevo_host, token: company.stevo_global_token });
          res = await client.getAdvancedSettings(instance.stevo_instance_id, instance.stevo_api_key);
        } else {
          const client = new EvoGoClient({ host: instance.custom_host || company.evogo_host, token: company.evogo_global_token });
          res = await client.getAdvancedSettings(instance.evogo_instance_id, instance.evogo_api_key);
        }
        
        if (res) {
          const carregadas = {
            rejectCall: res.rejectCall ?? false,
            readMessages: res.readMessages ?? false,
            alwaysOnline: res.alwaysOnline ?? false
          };
          setAdvSettings(carregadas);
          setAdvSettingsOriginal(carregadas);
        }
      } catch (err: any) {
        console.error("Erro ao buscar configs avançadas:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [open, instance, company]);

  const handleSave = async () => {
    if (!instance) return;
    
    const isOficial = instance.provider === 'oficial';
    const isInstagram = instance.provider === 'instagram';
    const isMessenger = instance.provider === 'messenger';
    const isZernio = instance.provider === 'zernio';
    const isCloudAPI = isOficial || isInstagram || isMessenger;
    const isProvedorQr = instance.provider === "evogo" || instance.provider === "stevo" || !instance.provider;

    const advSettingsMudaram =
      !!advSettingsOriginal && JSON.stringify(advSettings) !== JSON.stringify(advSettingsOriginal);

    // O EvoGo/Stevo roda fora daqui: não tem como entregar num endereço local.
    if (isProvedorQr && enderecoLocal(webhookUrl)) {
      toast.error("URL do webhook inválida", {
        description: "O EvoGo/Stevo não consegue entregar mensagens em localhost ou rede local. Use o endereço público do Atendi.",
      });
      return;
    }

    // Só o nome de exibição; instance_name é o identificador técnico no EvoGo/Stevo.
    const name = channelName.trim();
    if (!name) {
      toast.error("Informe um nome para o canal.");
      return;
    }

    setSaving(true);

    try {
      if (isZernio) {
        const { error: dbErr } = await supabase
          .from("whatsapp_instances")
          .update({ 
            webhook_url: webhookUrl,
            wavoip_token: wavoipToken || null,
            department_id: selectedDepartmentId || null,
            name,
          })
          .eq("id", instance.id);
        if (dbErr) throw dbErr;
      } else if (isCloudAPI) {
        const { error: dbErr } = await supabase
          .from("whatsapp_instances")
          .update({ 
             webhook_url: webhookUrl, 
             oficial_phone_number_id: oficialPhoneId,
             oficial_waba_id: oficialWabaId,
             oficial_access_token: oficialAccessToken,
             department_id: selectedDepartmentId || null,
             name,
          })
          .eq("id", instance.id);
        if (dbErr) throw dbErr;
      } else {
        if (instance.provider === 'stevo' && !company?.stevo_host) throw new Error("Host da Stevo não configurado na empresa.");
        if (instance.provider === 'evogo' && !company?.evogo_host) throw new Error("Host da EvoGo não configurado na empresa.");
        if (instance.provider === 'stevo') {
          const client = new StevoClient({ host: customHost || company.stevo_host, token: company.stevo_global_token });
          // Só reenvia ao Stevo quando algo dele mudou: renomear ou trocar o
          // departamento não depende do servidor do Stevo estar no ar.
          if (webhookUrl !== instance.webhook_url || (customHost || null) !== (instance.custom_host || null) || (customApiKey || instance.stevo_api_key) !== instance.stevo_api_key) {
            await client.connectInstance(webhookUrl, customApiKey || instance.stevo_api_key);
          }
          const { error: dbErr } = await supabase.from("whatsapp_instances").update({ 
            webhook_url: webhookUrl, 
            wavoip_token: wavoipToken || null, 
            custom_host: customHost || null, 
            stevo_api_key: customApiKey || instance.stevo_api_key,
            department_id: selectedDepartmentId || null,
            name,
          }).eq("id", instance.id);
          if (dbErr) throw dbErr;
          if (instance.stevo_instance_id && advSettingsMudaram) {
            await client.updateAdvancedSettings(instance.stevo_instance_id, advSettings, customApiKey || instance.stevo_api_key);
          }
        } else {
          const client = new EvoGoClient({ host: customHost || company.evogo_host, token: company.evogo_global_token });
          // Só reenvia ao EvoGo quando algo dele mudou: renomear ou trocar o
          // departamento não depende do servidor do EvoGo estar no ar.
          if (webhookUrl !== instance.webhook_url || (customHost || null) !== (instance.custom_host || null) || (customApiKey || instance.evogo_api_key) !== instance.evogo_api_key) {
            await client.connectInstance(webhookUrl, customApiKey || instance.evogo_api_key);
          }
          const { error: dbErr } = await supabase.from("whatsapp_instances").update({ 
            webhook_url: webhookUrl, 
            wavoip_token: wavoipToken || null, 
            custom_host: customHost || null, 
            evogo_api_key: customApiKey || instance.evogo_api_key,
            department_id: selectedDepartmentId || null,
            name,
          }).eq("id", instance.id);
          if (dbErr) throw dbErr;
          if (instance.evogo_instance_id && advSettingsMudaram) {
            await client.updateAdvancedSettings(instance.evogo_instance_id, advSettings, customApiKey || instance.evogo_api_key);
          }
        }
      }

      toast.success("Configurações salvas com sucesso!");
      qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      qc.invalidateQueries({ queryKey: ["whatsapp_instances_filter"] });
      qc.invalidateQueries({ queryKey: ["whatsapp_instances"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const isOficial = instance?.provider === 'oficial';
  const isInstagram = instance?.provider === 'instagram';
  const isMessenger = instance?.provider === 'messenger';
  const isZernio = instance?.provider === 'zernio';
  const isCloudAPI = isOficial || isInstagram || isMessenger;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={isOficial ? "sm:max-w-4xl max-h-[90vh] overflow-y-auto" : "sm:max-w-[425px] max-h-[90vh] overflow-y-auto"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Configurações da Instância
          </DialogTitle>
          <DialogDescription>
            {instance?.name} {!(isOficial || isInstagram || isMessenger) && <span className="font-mono text-xs">({instance?.instance_name})</span>}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            <p className="text-sm">Carregando configurações...</p>
          </div>
        ) : (
          <>
            {isOficial ? (
              <Tabs defaultValue="settings" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="settings">Configurações</TabsTrigger>
                  <TabsTrigger value="templates">Templates</TabsTrigger>
                </TabsList>
                
                <TabsContent value="settings" className="space-y-4 pt-4">
                  <SettingsFormContent 
                    channelName={channelName} setChannelName={setChannelName}
                  webhookUrl={webhookUrl} setWebhookUrl={setWebhookUrl}
                    wavoipToken={wavoipToken} setWavoipToken={setWavoipToken}
                    oficialPhoneId={oficialPhoneId} setOficialPhoneId={setOficialPhoneId}
                    oficialWabaId={oficialWabaId} setOficialWabaId={setOficialWabaId}
                    oficialAccessToken={oficialAccessToken} setOficialAccessToken={setOficialAccessToken}
                    customHost={customHost} setCustomHost={setCustomHost}
                    customApiKey={customApiKey} setCustomApiKey={setCustomApiKey}
                    advSettings={advSettings} setAdvSettings={setAdvSettings}
                    selectedDepartmentId={selectedDepartmentId}
                    setSelectedDepartmentId={setSelectedDepartmentId}
                    departments={filteredDepartments}
                    isOficial={isOficial}
                    isInstagram={isInstagram}
                    isMessenger={isMessenger}
                    instance={instance}
                  />
                  <Button 
                    className="w-full mt-4" 
                    onClick={handleSave} 
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Salvar Configurações
                  </Button>
                </TabsContent>
                
                <TabsContent value="templates" className="pt-4">
                  <WhatsappTemplatesTab companyId={company?.id} instanceId={instance?.id} />
                </TabsContent>
              </Tabs>
            ) : (
              <div className="space-y-4 py-4">
                <SettingsFormContent 
                  channelName={channelName} setChannelName={setChannelName}
                  webhookUrl={webhookUrl} setWebhookUrl={setWebhookUrl}
                  wavoipToken={wavoipToken} setWavoipToken={setWavoipToken}
                  oficialPhoneId={oficialPhoneId} setOficialPhoneId={setOficialPhoneId}
                  oficialWabaId={oficialWabaId} setOficialWabaId={setOficialWabaId}
                  oficialAccessToken={oficialAccessToken} setOficialAccessToken={setOficialAccessToken}
                  customHost={customHost} setCustomHost={setCustomHost}
                  customApiKey={customApiKey} setCustomApiKey={setCustomApiKey}
                  advSettings={advSettings} setAdvSettings={setAdvSettings}
                  selectedDepartmentId={selectedDepartmentId}
                  setSelectedDepartmentId={setSelectedDepartmentId}
                  departments={filteredDepartments}
                  isOficial={isOficial}
                  isInstagram={isInstagram}
                  isMessenger={isMessenger}
                  instance={instance}
                />
                <Button 
                  className="w-full mt-4" 
                  onClick={handleSave} 
                  disabled={saving}
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar Configurações
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Subcomponente criado para reaproveitar os campos de input, não poluindo o retorno principal
function SettingsFormContent({ 
  channelName, setChannelName,
  webhookUrl, setWebhookUrl, 
  wavoipToken, setWavoipToken, 
  oficialPhoneId, setOficialPhoneId, 
  oficialWabaId, setOficialWabaId, 
  oficialAccessToken, setOficialAccessToken, 
  customHost, setCustomHost,
  customApiKey, setCustomApiKey,
  advSettings, setAdvSettings, 
  selectedDepartmentId, setSelectedDepartmentId,
  departments,
  isOficial, isInstagram, isMessenger, instance
}: any) {
  const isZernio = instance?.provider === 'zernio';
  const isCloudAPI = isOficial || isInstagram || isMessenger || isZernio;
  
  return (
    <>
      {/* Nome de exibição do canal */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">Nome do canal</label>
        <Input
          value={channelName}
          onChange={(e) => setChannelName(e.target.value)}
          placeholder="Ex: Instagram São Mateus"
          maxLength={80}
        />
        <p className="text-xs text-muted-foreground">
          É o nome que aparece na lista de canais e nas conversas.
        </p>
      </div>

      {/* Departamento Responsável */}
      <div className="space-y-2 p-3.5 rounded-xl border bg-muted/30">
        <div className="flex items-center gap-2">
          <Building className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Departamento com Acesso</h4>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Defina se este canal é de um departamento específico ou se todos os departamentos podem visualizar e atender por ele.
        </p>
        <div className="pt-1">
          <Select
            value={selectedDepartmentId || "all"}
            onValueChange={(val) => setSelectedDepartmentId(val === "all" ? null : val)}
          >
            <SelectTrigger className="w-full bg-background">
              <SelectValue placeholder="Selecione um departamento..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                🌐 Geral (Visível para todos os departamentos)
              </SelectItem>
              {departments?.map((dept: any) => (
                <SelectItem key={dept.id} value={dept.id}>
                  📁 {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">Webhook e Eventos</h4>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">URL do Webhook</label>
          <div className="flex gap-2">
            <Input 
              value={webhookUrl}
              readOnly={isCloudAPI}
              onChange={(e) => !isCloudAPI && setWebhookUrl(e.target.value)}
              className={isCloudAPI ? "bg-muted text-muted-foreground" : ""}
            />
            {isCloudAPI && (
              <Button 
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  toast.success("URL copiada!");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            )}
          </div>
          {isCloudAPI && (
            <p className="text-[10px] text-muted-foreground mt-1">
              {isZernio 
                ? "URL de webhook sincronizada com o provedor Zernio."
                : "Copie esta URL e cole no painel de desenvolvedores da Meta."}
            </p>
          )}
        </div>
        {!isCloudAPI && (
          <>
            <div className="space-y-1 mt-4">
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
            <div className="space-y-1 mt-4">
              <label className="text-xs text-muted-foreground">Wavoip Token (Chamadas)</label>
              <Input 
                placeholder="Seu token de dispositivo Wavoip" 
                value={wavoipToken}
                onChange={(e) => setWavoipToken(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      {isZernio ? (
        <div className="space-y-3 mt-4 p-3 bg-slate-50 dark:bg-slate-900/50 border rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Conexão Zernio Omnichannel</span>
            <Badge variant="outline" className="text-[10px] capitalize">
              Rede: {instance?.network || 'whatsapp'}
            </Badge>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>ID da Conta Social (Zernio Account ID):</p>
            <code className="text-xs font-mono bg-muted p-1.5 rounded block text-foreground">
              {instance?.zernio_account_id || 'Não configurado'}
            </code>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Esta conexão envia e recebe mensagens diretamente via API oficial Zernio ({instance?.network === 'instagram' ? 'Instagram Direct' : 'WhatsApp'}).
          </p>
        </div>
      ) : isCloudAPI ? (
        <div className="space-y-4 mt-4">
          <h4 className="text-sm font-medium border-b pb-1">Credenciais Meta / Cloud API</h4>
          <div className="space-y-1">
            {isMessenger && (
              <p className="text-xs text-muted-foreground mt-1 mb-2 bg-blue-500/10 p-2 rounded border border-blue-500/20">
                Para o Messenger, use o <strong>Page Access Token</strong> gerado na aba "Messenger" do seu App. E coloque o <strong>ID da Página</strong> no campo abaixo.
              </p>
            )}
            <label className="text-xs text-muted-foreground">
              {isInstagram ? 'Instagram Account ID' : isMessenger ? 'Facebook Page ID' : 'Phone Number ID'}
            </label>
            <Input 
              placeholder={isInstagram ? "Ex: 178414000000000" : isMessenger ? "Ex: 102938475619283" : "Ex: 106540352242922"} 
              value={oficialPhoneId}
              onChange={(e) => setOficialPhoneId(e.target.value)}
            />
          </div>
          {!isMessenger && (
            <div className="space-y-1 mt-2">
              <label className="text-xs text-muted-foreground">
                {isInstagram ? 'Facebook Page ID' : 'WABA ID (WhatsApp Business Account)'}
              </label>
              <Input 
                placeholder={isInstagram ? "Ex: 102938475619283" : "Ex: 119358594050135"} 
                value={oficialWabaId}
                onChange={(e) => setOficialWabaId(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1 mt-2">
            <label className="text-xs text-muted-foreground">Access Token (Permanente)</label>
            <Input 
              placeholder="EAA..." 
              type="password"
              value={oficialAccessToken}
              onChange={(e) => setOficialAccessToken(e.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4 mt-4">
          <h4 className="text-sm font-medium border-b pb-1">Opções Avançadas</h4>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">Rejeitar Ligações</label>
              <p className="text-xs text-muted-foreground">Recusa chamadas de voz e vídeo automaticamente.</p>
            </div>
            <Switch 
              checked={advSettings.rejectCall}
              onCheckedChange={(c) => setAdvSettings((s: any) => ({ ...s, rejectCall: c }))}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">Marcar como Lido</label>
              <p className="text-xs text-muted-foreground">Marca mensagens como lidas ao receber.</p>
            </div>
            <Switch 
              checked={advSettings.readMessages}
              onCheckedChange={(c) => setAdvSettings((s: any) => ({ ...s, readMessages: c }))}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">Always Online</label>
              <p className="text-xs text-muted-foreground">Força o status "Online" no WhatsApp.</p>
            </div>
            <Switch 
              checked={advSettings.alwaysOnline}
              onCheckedChange={(c) => setAdvSettings((s: any) => ({ ...s, alwaysOnline: c }))}
            />
          </div>
        </div>
      )}
    </>
  );
}
