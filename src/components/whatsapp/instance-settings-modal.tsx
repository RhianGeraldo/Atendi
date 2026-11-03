import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Settings,
  Loader2,
  Save,
  Globe,
  Copy,
  Building,
  PhoneCall,
  QrCode,
  CheckCircle2,
  RefreshCw,
  MessageSquare,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";
import { EvoGoClient } from "@/integrations/evogo/client";
import { StevoClient } from "@/integrations/stevo/client";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { WhatsappTemplatesTab } from "./whatsapp-templates-tab";
import { enderecoLocal, origemPublica } from "@/lib/endereco-publico";
import {
  getAtendiCallsStatusAction,
  createAtendiCallsInstanceAction,
  disconnectAtendiCallsInstanceAction,
} from "@/lib/api/atendicalls.functions";

interface InstanceSettingsModalProps {
  instance: any; // { id, name, instance_name, evogo_api_key, evogo_instance_id, webhook_url, department_id }
  company: any; // { evogo_host, evogo_global_token }
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: "messages" | "voice";
}

export function InstanceSettingsModal({
  instance,
  company,
  open,
  onOpenChange,
  defaultTab = "messages",
}: InstanceSettingsModalProps) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("messages");
  
  const [channelName, setChannelName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSugerido, setWebhookSugerido] = useState("");
  const [customHost, setCustomHost] = useState("");
  const [customApiKey, setCustomApiKey] = useState("");
  const [wavoipToken, setWavoipToken] = useState("");
  const [atendicallsToken, setAtendicallsToken] = useState("");
  const [atendicallsUrl, setAtendicallsUrl] = useState("https://calls.esteticaelaser.com.br");
  const [atendicallsStatus, setAtendicallsStatus] = useState<any>(null);
  const [checkingAtendicalls, setCheckingAtendicalls] = useState(false);
  const [oficialPhoneId, setOficialPhoneId] = useState("");
  const [oficialWabaId, setOficialWabaId] = useState("");
  const [oficialAccessToken, setOficialAccessToken] = useState("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [advSettings, setAdvSettings] = useState({
    rejectCall: false,
    readMessages: false,
    alwaysOnline: false
  });
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

    setActiveTab(defaultTab || "messages");

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
    const currentDomainWebhook = `${origemPublica()}/api/webhooks/${providerWebhookPath}`;
    
    const webhookKeyword = isZernio ? 'zernio' : providerWebhookPath;
    if (
      !defaultWebhook ||
      defaultWebhook.includes('supabase.co') ||
      !defaultWebhook.includes(webhookKeyword) ||
      enderecoLocal(defaultWebhook)
    ) {
      defaultWebhook = currentDomainWebhook;
    }

    setChannelName(instance.name || "");
    setAdvSettingsOriginal(null);
    setWebhookUrl(defaultWebhook);
    setWebhookSugerido(currentDomainWebhook);
    setCustomHost(instance.custom_host || "");
    setCustomApiKey(instance.provider === "stevo" ? (instance.stevo_api_key || "") : (instance.evogo_api_key || ""));
    const tokenChamada = instance.atendicalls_token || instance.wavoip_token || "";
    setWavoipToken(tokenChamada);
    setAtendicallsToken(tokenChamada);
    setAtendicallsUrl(instance.atendicalls_url || "https://calls.esteticaelaser.com.br");
    setAtendicallsStatus(null);
    setOficialPhoneId(instance.oficial_phone_number_id || "");
    setOficialWabaId(instance.oficial_waba_id || "");
    setOficialAccessToken(instance.oficial_access_token || "");
    setSelectedDepartmentId(instance.department_id || null);
    
    // Fetch advanced settings from EvoGo/Stevo
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
  }, [open, instance, company, defaultTab]);

  const handleCheckAtendiCalls = async () => {
    const tokenToTest = atendicallsToken.trim() || wavoipToken.trim();
    setCheckingAtendicalls(true);
    try {
      const res = await getAtendiCallsStatusAction({
        data: {
          instanceId: instance?.id,
          companyId: instance?.company_id,
          token: tokenToTest || undefined,
          apiUrl: atendicallsUrl.trim() || undefined,
          autoCreate: !tokenToTest,
        },
      });
      setAtendicallsStatus(res);
      if (res.token && !atendicallsToken) {
        setAtendicallsToken(res.token);
      }
      if (res.isConnected) {
        toast.success("AtendiCalls Conectado!", {
          description: `Linha ativa: ${res.instance?.pushName || res.instance?.jid || 'WhatsApp'}`
        });
      } else if (res.qrcode) {
        toast.info("Aguardando leitura do QR Code do WhatsApp");
      }
    } catch (err: any) {
      toast.error("Erro ao verificar AtendiCalls", { description: err.message });
    } finally {
      setCheckingAtendicalls(false);
    }
  };

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

    const webhookFinal = webhookUrl.trim();
    if (isProvedorQr && !/^https?:\/\/[^\s/]+/i.test(webhookFinal)) {
      toast.error("URL do webhook inválida", {
        description: "Informe o endereço completo, começando com https://.",
      });
      return;
    }

    if (isProvedorQr && enderecoLocal(webhookFinal)) {
      toast.error("URL do webhook inválida", {
        description: "O EvoGo/Stevo não consegue entregar mensagens em localhost ou rede local. Use o endereço público do Atendi.",
      });
      return;
    }

    const name = channelName.trim();
    if (!name) {
      toast.error("Informe um nome para o canal.");
      return;
    }

    const tokenFinal = atendicallsToken.trim() || wavoipToken.trim() || null;
    const urlFinal = atendicallsUrl.trim() || "https://calls.esteticaelaser.com.br";

    setSaving(true);

    try {
      if (isZernio) {
        const { error: dbErr } = await supabase
          .from("whatsapp_instances")
          .update({ 
            webhook_url: webhookFinal,
            wavoip_token: tokenFinal,
            atendicalls_token: tokenFinal,
            atendicalls_url: urlFinal,
            department_id: selectedDepartmentId || null,
            name,
          })
          .eq("id", instance.id);
        if (dbErr) throw dbErr;
      } else if (isCloudAPI) {
        const { error: dbErr } = await supabase
          .from("whatsapp_instances")
          .update({ 
             webhook_url: webhookFinal, 
             wavoip_token: tokenFinal,
             atendicalls_token: tokenFinal,
             atendicalls_url: urlFinal,
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
          if (webhookFinal !== instance.webhook_url || (customHost || null) !== (instance.custom_host || null) || (customApiKey || instance.stevo_api_key) !== instance.stevo_api_key) {
            await client.connectInstance(webhookFinal, customApiKey || instance.stevo_api_key);
          }
          const { error: dbErr } = await supabase.from("whatsapp_instances").update({ 
            webhook_url: webhookFinal, 
            wavoip_token: tokenFinal,
            atendicalls_token: tokenFinal,
            atendicalls_url: urlFinal,
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
          if (webhookFinal !== instance.webhook_url || (customHost || null) !== (instance.custom_host || null) || (customApiKey || instance.evogo_api_key) !== instance.evogo_api_key) {
            await client.connectInstance(webhookFinal, customApiKey || instance.evogo_api_key);
          }
          const { error: dbErr } = await supabase.from("whatsapp_instances").update({ 
            webhook_url: webhookFinal, 
            wavoip_token: tokenFinal,
            atendicalls_token: tokenFinal,
            atendicalls_url: urlFinal,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={isOficial ? "sm:max-w-4xl max-h-[90vh] overflow-y-auto" : "sm:max-w-2xl max-h-[90vh] overflow-y-auto"}>
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
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={`grid w-full ${isOficial ? "grid-cols-3" : "grid-cols-2"}`}>
              <TabsTrigger value="messages" className="gap-2 text-xs sm:text-sm">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                Mensagens (Chat)
              </TabsTrigger>
              <TabsTrigger value="voice" className="gap-2 text-xs sm:text-sm">
                <PhoneCall className="h-4 w-4 text-emerald-500" />
                Voz & IA (AtendiCalls)
              </TabsTrigger>
              {isOficial && (
                <TabsTrigger value="templates" className="text-xs sm:text-sm">Templates</TabsTrigger>
              )}
            </TabsList>

            {/* Aba 1: Conexão de Mensagens e CRM */}
            <TabsContent value="messages" className="space-y-4 pt-4">
              <SettingsFormContent 
                channelName={channelName} setChannelName={setChannelName}
                webhookUrl={webhookUrl} setWebhookUrl={setWebhookUrl} webhookSugerido={webhookSugerido}
                oficialPhoneId={oficialPhoneId} setOficialPhoneId={setOficialPhoneId}
                oficialWabaId={oficialWabaId} setOficialWabaId={setOficialWabaId}
                oficialAccessToken={oficialAccessToken} setOficialAccessToken={setOficialAccessToken}
                customHost={customHost} setCustomHost={setCustomHost}
                customApiKey={customApiKey} setCustomApiKey={setCustomApiKey}
                advSettings={advSettings} setAdvSettings={setAdvSettings} advCarregadas={!!advSettingsOriginal}
                selectedDepartmentId={selectedDepartmentId}
                setSelectedDepartmentId={setSelectedDepartmentId}
                departments={filteredDepartments}
                isOficial={isOficial}
                isInstagram={isInstagram}
                isMessenger={isMessenger}
                instance={instance}
                onGoToVoice={() => setActiveTab("voice")}
              />
              <Button 
                className="w-full mt-4" 
                onClick={handleSave} 
                disabled={saving}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar Configurações de Mensagens
              </Button>
            </TabsContent>

            {/* Aba 2: Conexão de Voz & IA (AtendiCalls) */}
            <TabsContent value="voice" className="space-y-4 pt-4">
              <AtendiCallsTabContent
                instance={instance}
                atendicallsToken={atendicallsToken}
                setAtendicallsToken={setAtendicallsToken}
                atendicallsUrl={atendicallsUrl}
                setAtendicallsUrl={setAtendicallsUrl}
                atendicallsStatus={atendicallsStatus}
                setAtendicallsStatus={setAtendicallsStatus}
                handleCheckAtendiCalls={handleCheckAtendiCalls}
                checkingAtendicalls={checkingAtendicalls}
                onSave={handleSave}
                saving={saving}
              />
            </TabsContent>

            {/* Aba 3: Templates (Oficial) */}
            {isOficial && (
              <TabsContent value="templates" className="pt-4">
                <WhatsappTemplatesTab companyId={company?.id} instanceId={instance?.id} />
              </TabsContent>
            )}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Conteúdo da Aba de Voz & Ligações AtendiCalls
 */
function AtendiCallsTabContent({
  instance,
  atendicallsToken,
  setAtendicallsToken,
  atendicallsUrl,
  setAtendicallsUrl,
  atendicallsStatus,
  setAtendicallsStatus,
  handleCheckAtendiCalls,
  checkingAtendicalls,
  onSave,
  saving,
}: any) {
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);

  // Consulta status ou auto-cria linha na VPS
  useEffect(() => {
    if (!instance?.id) return;
    let isPolling = true;

    const check = async () => {
      try {
        const res = await getAtendiCallsStatusAction({
          data: {
            instanceId: instance.id,
            companyId: instance.company_id,
            autoCreate: true,
          },
        });
        setAtendicallsStatus(res);
        if (res.qrcode) {
          setQrCodeBase64(res.qrcode);
        }
        if (res.token && !atendicallsToken) {
          setAtendicallsToken(res.token);
        }
      } catch (e) {
        console.warn("[AtendiCallsTab] Falha ao consultar status:", e);
      }
    };

    check();

    // Polling caso aguardando leitura do QR
    const poll = async () => {
      if (!isPolling) return;
      if (qrCodeBase64 || atendicallsStatus?.qrcode) {
        try {
          const res = await getAtendiCallsStatusAction({
            data: {
              instanceId: instance.id,
              companyId: instance.company_id,
            },
          });
          if (res.isConnected) {
            setAtendicallsStatus(res);
            toast.success("Linha de voz conectada com sucesso!");
            qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
            return;
          }
        } catch {}
      }
      if (isPolling) setTimeout(poll, 3000);
    };

    const timer = setTimeout(poll, 3000);

    return () => {
      isPolling = false;
      clearTimeout(timer);
    };
  }, [instance?.id]);

  const handleGenerateQr = async () => {
    if (!instance?.id) return;
    setGenerating(true);
    try {
      const res = await createAtendiCallsInstanceAction({
        data: {
          instanceId: instance.id,
          name: instance.instance_name || instance.name,
        },
      });
      if (res.token) setAtendicallsToken(res.token);
      if (res.qrcode) {
        setQrCodeBase64(res.qrcode);
        setAtendicallsStatus({ ...res, isConnected: false });
        toast.info("QR Code gerado! Aponte a câmera do WhatsApp.");
      } else {
        toast.success("Linha criada no AtendiCalls!");
      }
      qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
    } catch (e: any) {
      toast.error("Erro ao gerar QR Code", { description: e.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleDisconnectVoice = async () => {
    if (!instance?.id) return;
    setDisconnecting(true);
    try {
      await disconnectAtendiCallsInstanceAction({
        data: { instanceId: instance.id },
      });
      setAtendicallsToken("");
      setAtendicallsStatus(null);
      setQrCodeBase64(null);
      toast.success("Linha de voz desvinculada.");
      qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
    } catch (e: any) {
      toast.error("Erro ao desconectar voz", { description: e.message });
    } finally {
      setDisconnecting(false);
    }
  };

  const isConnected = atendicallsStatus?.isConnected;
  const qrDisplay = qrCodeBase64 || atendicallsStatus?.qrcode?.base64 || atendicallsStatus?.qrcode;

  return (
    <div className="space-y-4">
      {/* Banner Explicativo das 2 Conexões */}
      <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PhoneCall className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              2ª Conexão: Linha de Chamadas WhatsApp (IA)
            </span>
          </div>
          {isConnected ? (
            <Badge className="bg-emerald-600 text-white gap-1 text-[11px] py-0.5">
              <CheckCircle2 className="h-3 w-3" /> Voz Ativa
            </Badge>
          ) : qrDisplay ? (
            <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 gap-1 text-[11px] py-0.5">
              <QrCode className="h-3 w-3 animate-pulse" /> Aguardando QR Code
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[11px] py-0.5">
              Não Conectado
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Enquanto a aba <strong>Mensagens</strong> conecta o WhatsApp para envio e recebimento de textos/CRM, esta aba conecta a linha de áudio VoIP (UDP RTP) responsável por ligações com IA.
        </p>
      </div>

      {/* Estado: Conectado */}
      {isConnected ? (
        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
            <CheckCircle2 className="h-5 w-5" />
            Linha de Voz Ativa e Pronta para Ligações
          </div>

          <div className="bg-background/90 rounded-lg p-3 border space-y-1.5 text-xs text-left">
            {atendicallsStatus.instance?.pushName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nome no WhatsApp:</span>
                <span className="font-medium text-foreground">{atendicallsStatus.instance.pushName}</span>
              </div>
            )}
            {atendicallsStatus.instance?.jid && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Número / JID:</span>
                <span className="font-mono text-foreground">{atendicallsStatus.instance.jid}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">VPS Motor:</span>
              <span className="font-mono text-muted-foreground">calls.esteticaelaser.com.br</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDisconnectVoice}
              disabled={disconnecting}
              className="text-xs text-destructive hover:bg-destructive/10 border-destructive/20 gap-1.5"
            >
              {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
              Desconectar Linha de Voz
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCheckAtendiCalls}
              disabled={checkingAtendicalls}
              className="text-xs gap-1.5"
            >
              {checkingAtendicalls ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Verificar Conexão
            </Button>
          </div>
        </div>
      ) : qrDisplay ? (
        /* Estado: Exibir QR Code inline para leitura imediata */
        <div className="p-4 rounded-xl border bg-card space-y-3 text-center">
          <div className="mx-auto flex flex-col items-center justify-center p-3 bg-white rounded-xl shadow-inner border max-w-[260px]">
            <img
              src={qrDisplay}
              alt="QR Code WhatsApp AtendiCalls"
              className="w-52 h-52 object-contain"
            />
          </div>

          <div className="bg-muted/40 border rounded-lg p-2.5 text-left text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">Como conectar:</p>
            <p>1. Abra o WhatsApp no celular da clínica/empresa.</p>
            <p>2. Toque em <strong>Aparelhos Conectados &gt; Conectar aparelho</strong>.</p>
            <p>3. Aponte para o QR Code acima.</p>
          </div>

          <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
              Aguardando leitura no WhatsApp...
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerateQr}
              disabled={generating}
              className="text-xs h-7 gap-1"
            >
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Recarregar QR
            </Button>
          </div>
        </div>
      ) : (
        /* Estado: Não inicializado ainda */
        <div className="p-6 rounded-xl border bg-card text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <PhoneCall className="h-6 w-6" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              Linha de Voz ainda não gerada
            </h4>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Clique no botão abaixo para criar a linha no motor AtendiCalls e exibir o QR Code para leitura.
            </p>
          </div>

          <Button
            type="button"
            onClick={handleGenerateQr}
            disabled={generating}
            className="gap-1.5"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
            Gerar QR Code de Voz
          </Button>
        </div>
      )}

      {/* Configurações Técnicas Avançadas (VPS e Token) */}
      <div className="border rounded-xl p-3.5 space-y-2.5 bg-muted/20">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center justify-between w-full text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>Credenciais Técnicas (Avançado)</span>
          <span>{showAdvanced ? "▲ Ocultar" : "▼ Expandir"}</span>
        </button>

        {showAdvanced && (
          <div className="space-y-3 pt-2 border-t">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">URL da API (VPS AtendiCalls)</label>
              <Input
                value={atendicallsUrl}
                onChange={(e) => setAtendicallsUrl(e.target.value)}
                placeholder="https://calls.esteticaelaser.com.br"
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Token da Instância (X-API-Key)</label>
              <Input
                value={atendicallsToken}
                onChange={(e) => setAtendicallsToken(e.target.value)}
                placeholder="Token gerado pelo motor"
                className="text-xs font-mono"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSave}
              disabled={saving}
              className="text-xs gap-1.5 w-full"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Salvar Credenciais
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// Subcomponente com os campos de Mensagens & CRM
function SettingsFormContent({ 
  channelName, setChannelName,
  webhookUrl, setWebhookUrl, webhookSugerido,
  oficialPhoneId, setOficialPhoneId, 
  oficialWabaId, setOficialWabaId, 
  oficialAccessToken, setOficialAccessToken, 
  customHost, setCustomHost,
  customApiKey, setCustomApiKey,
  advSettings, setAdvSettings, advCarregadas,
  selectedDepartmentId, setSelectedDepartmentId,
  departments,
  isOficial, isInstagram, isMessenger, instance,
  onGoToVoice,
}: any) {
  const isZernio = instance?.provider === 'zernio';
  const isCloudAPI = isOficial || isInstagram || isMessenger || isZernio;
  
  return (
    <>
      {/* Banner de atalho para a conexão de voz */}
      <div className="flex items-center justify-between p-2.5 rounded-lg border border-primary/20 bg-primary/5 text-xs">
        <div className="flex items-center gap-2">
          <PhoneCall className="h-3.5 w-3.5 text-primary" />
          <span className="text-muted-foreground">
            Quer conectar o WhatsApp para <strong>ligações com IA</strong>?
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onGoToVoice}
          className="h-6 text-xs text-primary hover:text-primary font-semibold px-2"
        >
          Acessar Aba Voz →
        </Button>
      </div>

      {/* Nome de exibição do canal */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">Nome do canal</label>
        <Input
          value={channelName}
          onChange={(e) => setChannelName(e.target.value)}
          placeholder="Ex: WhatsApp Unidade Centro"
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
          <h4 className="text-sm font-medium">Webhook e Eventos de Mensagens</h4>
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
          {!isZernio && webhookSugerido && webhookUrl.trim() !== webhookSugerido && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <p className="text-[11px] text-muted-foreground">
                Diferente do endereço atual do Atendi.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs shrink-0"
                onClick={() => setWebhookUrl(webhookSugerido)}
                title={webhookSugerido}
              >
                Usar endereço atual
              </Button>
            </div>
          )}
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
          <h4 className="text-sm font-medium border-b pb-1">Opções Avançadas de Mensagens</h4>
          {!advCarregadas && (
            <p className="text-xs text-muted-foreground">
              Não foi possível ler estas opções do servidor do WhatsApp agora. Elas ficam como estão; tente de novo mais tarde para alterar.
            </p>
          )}
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">Rejeitar Ligações Diretas</label>
              <p className="text-xs text-muted-foreground">Recusa chamadas normais do WhatsApp automaticamente.</p>
            </div>
            <Switch 
              checked={advSettings.rejectCall}
              disabled={!advCarregadas}
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
              disabled={!advCarregadas}
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
              disabled={!advCarregadas}
              onCheckedChange={(c) => setAdvSettings((s: any) => ({ ...s, alwaysOnline: c }))}
            />
          </div>
        </div>
      )}
    </>
  );
}
