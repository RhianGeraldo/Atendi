import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Settings, Loader2, Save, Globe, Copy } from "lucide-react";
import { toast } from "sonner";
import { EvoGoClient } from "@/integrations/evogo/client";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WhatsappTemplatesTab } from "./whatsapp-templates-tab";

interface InstanceSettingsModalProps {
  instance: any; // { id, name, instance_name, evogo_api_key, evogo_instance_id, webhook_url }
  company: any; // { evogo_host, evogo_global_token }
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InstanceSettingsModal({ instance, company, open, onOpenChange }: InstanceSettingsModalProps) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [webhookUrl, setWebhookUrl] = useState("");
  const [wavoipToken, setWavoipToken] = useState("");
  const [oficialPhoneId, setOficialPhoneId] = useState("");
  const [oficialWabaId, setOficialWabaId] = useState("");
  const [oficialAccessToken, setOficialAccessToken] = useState("");
  const [advSettings, setAdvSettings] = useState({
    rejectCall: false,
    readMessages: false,
    alwaysOnline: false
  });

  useEffect(() => {
    if (!open || !instance) return;

    const isOficial = instance.provider === 'oficial';
    const isInstagram = instance.provider === 'instagram';
    const isCloudAPI = isOficial || isInstagram;

    let providerWebhookPath = 'evogo';
    if (isOficial) providerWebhookPath = 'whatsapp-cloud';
    else if (isInstagram) providerWebhookPath = 'instagram';

    let defaultWebhook = instance.webhook_url;
    const currentDomainWebhook = `${window.location.origin}/api/webhooks/${providerWebhookPath}`;
    
    // Se estiver vazio, for do supabase antigo, for de um domínio antigo, ou for de outro provedor, corrige
    if (!defaultWebhook || defaultWebhook.includes('supabase.co') || !defaultWebhook.startsWith(window.location.origin) || !defaultWebhook.includes(providerWebhookPath)) {
      defaultWebhook = currentDomainWebhook;
    }

    setWebhookUrl(defaultWebhook);
    setWavoipToken(instance.wavoip_token || "");
    setOficialPhoneId(instance.oficial_phone_number_id || "");
    setOficialWabaId(instance.oficial_waba_id || "");
    setOficialAccessToken(instance.oficial_access_token || "");
    
    // Fetch advanced settings from EvoGo
    const fetchSettings = async () => {
      if (isCloudAPI) {
        setLoading(false);
        return;
      }
      
      if (!company?.evogo_host) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        if (!instance.evogo_instance_id) {
          throw new Error("Instância local sem ID do EvoGo vinculado.");
        }

        const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });
        const res: any = await client.getAdvancedSettings(instance.evogo_instance_id, instance.evogo_api_key);
        
        if (res) {
          setAdvSettings({
            rejectCall: res.rejectCall ?? false,
            readMessages: res.readMessages ?? false,
            alwaysOnline: res.alwaysOnline ?? false
          });
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
    const isCloudAPI = isOficial || isInstagram;

    setSaving(true);

    try {
      if (isCloudAPI) {
        await supabase
          .from("whatsapp_instances")
          .update({ 
             webhook_url: webhookUrl, 
             oficial_phone_number_id: oficialPhoneId,
             oficial_waba_id: oficialWabaId,
             oficial_access_token: oficialAccessToken,
          })
          .eq("id", instance.id);
      } else {
        if (!company?.evogo_host) {
          throw new Error("Host da EvoGo não configurado na empresa.");
        }
        const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });

        // 1. Save Webhook and Wavoip Token
        await client.connectInstance(webhookUrl, instance.evogo_api_key);
        await supabase
          .from("whatsapp_instances")
          .update({ webhook_url: webhookUrl, wavoip_token: wavoipToken || null })
          .eq("id", instance.id);

        // 2. Save Advanced Settings
        if (instance.evogo_instance_id) {
          await client.updateAdvancedSettings(instance.evogo_instance_id, advSettings, instance.evogo_api_key);
        }
      }

      toast.success("Configurações salvas com sucesso!");
      qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
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
                    webhookUrl={webhookUrl} setWebhookUrl={setWebhookUrl}
                    wavoipToken={wavoipToken} setWavoipToken={setWavoipToken}
                    oficialPhoneId={oficialPhoneId} setOficialPhoneId={setOficialPhoneId}
                    oficialWabaId={oficialWabaId} setOficialWabaId={setOficialWabaId}
                    oficialAccessToken={oficialAccessToken} setOficialAccessToken={setOficialAccessToken}
                    advSettings={advSettings} setAdvSettings={setAdvSettings}
                    isOficial={isOficial}
                    isInstagram={isInstagram}
                    isMessenger={isMessenger}
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
                  webhookUrl={webhookUrl} setWebhookUrl={setWebhookUrl}
                  wavoipToken={wavoipToken} setWavoipToken={setWavoipToken}
                  oficialPhoneId={oficialPhoneId} setOficialPhoneId={setOficialPhoneId}
                  oficialWabaId={oficialWabaId} setOficialWabaId={setOficialWabaId}
                  oficialAccessToken={oficialAccessToken} setOficialAccessToken={setOficialAccessToken}
                  advSettings={advSettings} setAdvSettings={setAdvSettings}
                  isOficial={isOficial}
                  isInstagram={isInstagram}
                  isMessenger={isMessenger}
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
  webhookUrl, setWebhookUrl, 
  wavoipToken, setWavoipToken, 
  oficialPhoneId, setOficialPhoneId, 
  oficialWabaId, setOficialWabaId, 
  oficialAccessToken, setOficialAccessToken, 
  advSettings, setAdvSettings, 
  isOficial, isInstagram, isMessenger
}: any) {
  const isCloudAPI = isOficial || isInstagram || isMessenger;
  
  return (
    <>
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
              Copie esta URL e cole no painel de desenvolvedores da Meta.
            </p>
          )}
        </div>
        <div className="space-y-1 mt-2">
          <label className="text-xs text-muted-foreground">Wavoip Token (Chamadas)</label>
          <Input 
            placeholder="Seu token de dispositivo Wavoip" 
            value={wavoipToken}
            onChange={(e) => setWavoipToken(e.target.value)}
          />
        </div>
      </div>

      {isCloudAPI ? (
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
