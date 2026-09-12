import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Smartphone,
  Instagram,
  Facebook,
  QrCode,
  Globe,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EvoGoClient } from "@/integrations/evogo/client";
import { StevoClient } from "@/integrations/stevo/client";
import { listZernioAccountsAction, syncZernioWebhookAction } from "@/lib/api/zernio.functions";

export type ChannelType = "whatsapp" | "instagram" | "messenger";

export type ProviderType = "zernio" | "evogo" | "stevo" | "oficial" | "instagram" | "messenger";

interface CreateChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  unitId?: string | null;
  onSuccess?: () => void;
}

export function CreateChannelDialog({
  open,
  onOpenChange,
  companyId,
  unitId,
  onSuccess,
}: CreateChannelDialogProps) {
  const qc = useQueryClient();

  // 1. Estados principais do canal
  const [channelType, setChannelType] = useState<ChannelType>("whatsapp");
  const [provider, setProvider] = useState<ProviderType>("zernio");
  const [channelName, setChannelName] = useState("");

  // 2. Estados específicos da Zernio
  const [selectedZernioAccountId, setSelectedZernioAccountId] = useState("");

  // 3. Estados específicos do EvoGo / Stevo
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customHost, setCustomHost] = useState("");
  const [customApiKey, setCustomApiKey] = useState("");
  const [customInstanceId, setCustomInstanceId] = useState("");

  // 4. Estados específicos da Meta (Direto)
  const [oficialNumberId, setOficialNumberId] = useState("");
  const [oficialWabaId, setOficialWabaId] = useState("");
  const [oficialToken, setOficialToken] = useState("");
  const [oficialVerifyToken, setOficialVerifyToken] = useState("");
  const [selectedMetaAccountId, setSelectedMetaAccountId] = useState("");
  const [useManualToken, setUseManualToken] = useState(false);
  const [metaAccounts, setMetaAccounts] = useState<any[]>([]);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);

  // Buscar dados da empresa para checar credenciais de provedores
  const { data: company } = useQuery({
    queryKey: ["company", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", companyId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && open,
  });

  // Buscar contas da Zernio disponíveis
  const { data: zernioAccountsData, isLoading: isLoadingZernioAccounts } = useQuery({
    queryKey: ["zernio-accounts", companyId, channelType],
    queryFn: async () => {
      if (!company?.zernio_api_key) return [];
      const res = await listZernioAccountsAction({
        data: {
          companyId,
          platform: channelType === "instagram" ? "instagram" : "whatsapp",
        },
      });
      return res?.accounts || [];
    },
    enabled: !!company?.zernio_api_key && provider === "zernio" && open,
  });

  const zernioAccounts = zernioAccountsData || [];

  // Buscar contas da Meta quando aplicável
  useEffect(() => {
    if (
      open &&
      company?.meta_system_user_token &&
      (provider === "instagram" || provider === "messenger")
    ) {
      const fetchAccounts = async () => {
        setIsLoadingMeta(true);
        try {
          const res = await fetch(
            `https://graph.facebook.com/v20.0/me/accounts?fields=name,access_token,instagram_business_account{id,name,username,profile_picture_url}&access_token=${company.meta_system_user_token}`,
          );
          const json = await res.json();
          let accounts = json.data || [];
          if (provider === "instagram") {
            accounts = accounts.filter((a: any) => a.instagram_business_account);
          }
          setMetaAccounts(accounts);
        } catch (e: any) {
          console.warn("Erro ao buscar contas Meta:", e);
        } finally {
          setIsLoadingMeta(false);
        }
      };
      fetchAccounts();
    }
  }, [open, provider, company?.meta_system_user_token]);

  // Atualizar o provedor padrão ao mudar o tipo de canal
  const handleSelectChannelType = (type: ChannelType) => {
    setChannelType(type);
    setSelectedZernioAccountId("");
    if (type === "whatsapp") {
      setProvider(company?.zernio_api_key ? "zernio" : "evogo");
    } else if (type === "instagram") {
      setProvider(company?.zernio_api_key ? "zernio" : "instagram");
    } else {
      setProvider("messenger");
    }
  };

  // Resetar campos ao abrir/fechar
  useEffect(() => {
    if (!open) {
      setChannelName("");
      setSelectedZernioAccountId("");
      setCustomHost("");
      setCustomApiKey("");
      setCustomInstanceId("");
      setShowAdvanced(false);
      setOficialNumberId("");
      setOficialWabaId("");
      setOficialToken("");
      setOficialVerifyToken("");
      setSelectedMetaAccountId("");
      setUseManualToken(false);
    }
  }, [open]);

  // Mutation de criação
  const createChannelMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("ID da empresa não informado.");
      if (!channelName.trim()) throw new Error("Informe um nome para o canal de atendimento.");

      // Validações por provedor
      if (provider === "zernio") {
        if (!company?.zernio_api_key) {
          throw new Error(
            "Configure a chave de API da Zernio em Configurações antes de criar este canal.",
          );
        }
        if (!selectedZernioAccountId) {
          throw new Error("Selecione a conta social conectada na Zernio.");
        }
      }

      if (provider === "evogo" && !company?.evogo_host && !customHost) {
        throw new Error("Configure o Host Global do EvoGo ou preencha o Host customizado.");
      }

      if (provider === "stevo" && !company?.stevo_host && !customHost) {
        throw new Error("Configure o Host Global do StevoChat ou preencha o Host customizado.");
      }

      let finalNumberId = oficialNumberId;
      let finalAccessToken = oficialToken;
      let finalWabaId = oficialWabaId;

      if (
        (provider === "instagram" || provider === "messenger") &&
        company?.meta_system_user_token &&
        !useManualToken &&
        selectedMetaAccountId
      ) {
        const account = metaAccounts.find((a) => a.id === selectedMetaAccountId);
        if (account) {
          finalAccessToken = account.access_token;
          if (provider === "instagram") {
            finalNumberId = account.instagram_business_account.id;
            finalWabaId = account.id;
          } else {
            finalNumberId = account.id;
          }
        }
      }

      if (!finalAccessToken && company?.meta_system_user_token) {
        finalAccessToken = company.meta_system_user_token;
      }

      let finalVerifyToken = oficialVerifyToken;
      if (!finalVerifyToken) {
        finalVerifyToken = `atendi_${Math.random().toString(36).substring(2, 11)}`;
      }

      if (
        (provider === "oficial" || provider === "instagram" || provider === "messenger") &&
        (!finalNumberId || !finalAccessToken || !finalVerifyToken)
      ) {
        throw new Error(
          "Preencha todos os campos da credencial Meta (ID, Token e Verify Token) ou selecione uma conta.",
        );
      }

      // Geração de slug técnico para a instância
      const slugify = (s: string) =>
        s
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/\s+/g, "")
          .replace(/[^\w-]/g, "");

      let unitSlugPart = "";
      if (unitId) {
        const { data: unitData } = await supabase
          .from("units")
          .select("name")
          .eq("id", unitId)
          .single();
        if (unitData?.name) {
          unitSlugPart = `-${slugify(unitData.name)}`;
        }
      }

      const randomSuffix = Math.random().toString(36).substring(2, 6);
      const technicalName = `${slugify(company.name || "atendi")}${unitSlugPart}-${slugify(channelName)}-${provider}-${randomSuffix}`;

      let defaultWebhookUrl = null;
      if (provider === "oficial") {
        defaultWebhookUrl = `${window.location.origin}/api/webhooks/whatsapp`;
      } else if (provider === "instagram") {
        defaultWebhookUrl = `${window.location.origin}/api/webhooks/instagram`;
      } else if (provider === "messenger") {
        defaultWebhookUrl = `${window.location.origin}/api/webhooks/messenger`;
      } else if (provider === "zernio") {
        defaultWebhookUrl = `${window.location.origin}/api/webhooks/zernio/${companyId}?k=${encodeURIComponent(company?.zernio_webhook_secret || "")}`;
      }

      const network =
        channelType === "instagram"
          ? "instagram"
          : channelType === "messenger"
            ? "messenger"
            : "whatsapp";

      // 1. Gravar registro em whatsapp_instances
      const { data: newInst, error: insertErr } = await supabase
        .from("whatsapp_instances")
        .insert({
          company_id: companyId,
          unit_id: unitId || null,
          name: channelName.trim(),
          instance_name: technicalName,
          provider,
          network,
          zernio_account_id: provider === "zernio" ? selectedZernioAccountId : null,
          status: provider === "zernio" ? "connected" : "disconnected",
          oficial_phone_number_id: finalNumberId,
          oficial_waba_id: finalWabaId || null,
          oficial_access_token: finalAccessToken,
          oficial_verify_token: finalVerifyToken,
          webhook_url: defaultWebhookUrl,
          custom_host: customHost || null,
          ...(customApiKey && provider === "evogo" ? { evogo_api_key: customApiKey } : {}),
          ...(customApiKey && provider === "stevo" ? { stevo_api_key: customApiKey } : {}),
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      // 2. Ações pós-criação específicas
      if (provider === "zernio") {
        syncZernioWebhookAction({
          data: { companyId, appOrigin: window.location.origin },
        }).catch((err) => console.warn("[zernio] Erro ao sincronizar webhook na criação:", err));
      } else if (provider === "evogo") {
        const hostToUse = customHost || company.evogo_host;
        const client = new EvoGoClient({ host: hostToUse, token: company.evogo_global_token });
        try {
          let evogoId = null;
          let apiKeyToUse = newInst.evogo_api_key;

          if (customApiKey) {
            apiKeyToUse = customApiKey;
            evogoId = customInstanceId || "manual-" + technicalName;
          } else {
            const evoRes: any = await client.createInstance(technicalName, newInst.evogo_api_key);
            evogoId = evoRes?.data?.id || evoRes?.id;
          }

          if (evogoId) {
            const webhookUrl = `${window.location.origin}/api/webhooks/evogo`;
            await supabase
              .from("whatsapp_instances")
              .update({ evogo_instance_id: evogoId, webhook_url: webhookUrl })
              .eq("id", newInst.id);

            await client.connectInstance(webhookUrl, apiKeyToUse).catch(console.error);
            await client
              .updateAdvancedSettings(
                evogoId,
                { rejectCalls: false, readMessages: false, readStatus: false, alwaysOnline: false },
                apiKeyToUse,
              )
              .catch(console.error);
          }
        } catch (e) {
          console.warn("Falha ao configurar instância no EvoGo:", e);
        }
      } else if (provider === "stevo") {
        const hostToUse = customHost || company.stevo_host;
        const client = new StevoClient({ host: hostToUse, token: company.stevo_global_token });
        try {
          let stevoId = null;
          let apiKeyToUse = newInst.stevo_api_key;

          if (customApiKey) {
            apiKeyToUse = customApiKey;
            stevoId = customInstanceId || "manual-" + technicalName;
          } else {
            const stevoRes: any = await client.createInstance(technicalName, newInst.stevo_api_key);
            stevoId = stevoRes?.data?.id || stevoRes?.id;
          }

          if (stevoId) {
            const webhookUrl = `${window.location.origin}/api/webhooks/stevo`;
            await supabase
              .from("whatsapp_instances")
              .update({ stevo_instance_id: stevoId, webhook_url: webhookUrl })
              .eq("id", newInst.id);

            await client.connectInstance(webhookUrl, apiKeyToUse).catch(console.error);
            await client
              .updateAdvancedSettings(
                stevoId,
                { rejectCalls: false, readMessages: false, readStatus: false, alwaysOnline: false },
                apiKeyToUse,
              )
              .catch(console.error);
          }
        } catch (e: any) {
          console.warn("Falha ao configurar instância no Stevo:", e);
        }
      }

      return newInst;
    },
    onSuccess: () => {
      toast.success("Canal de atendimento criado com sucesso!");
      qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err: any) => {
      toast.error("Erro ao criar canal: " + (err?.message || "Tente novamente."));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Novo Canal de Atendimento
          </DialogTitle>
          <DialogDescription>
            Escolha o canal onde seus clientes serão atendidos e o provedor responsável pela
            conexão.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* PASSO 1: SELETOR DE TIPO DE CANAL */}
          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center justify-between">
              <span>1. Tipo de Canal</span>
              <span className="text-xs font-normal text-muted-foreground">
                Onde seu cliente vai falar
              </span>
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => handleSelectChannelType("whatsapp")}
                className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  channelType === "whatsapp"
                    ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30"
                    : "border-border hover:border-muted-foreground/40 bg-card"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-600 flex items-center justify-center">
                    <Smartphone className="h-4 w-4" />
                  </span>
                  {channelType === "whatsapp" && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  )}
                </div>
                <div>
                  <div className="font-semibold text-sm">WhatsApp</div>
                  <div className="text-[11px] text-muted-foreground">Mensagens e áudios</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectChannelType("instagram")}
                className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  channelType === "instagram"
                    ? "border-pink-500 bg-pink-500/10 ring-2 ring-pink-500/30"
                    : "border-border hover:border-muted-foreground/40 bg-card"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="w-8 h-8 rounded-lg bg-pink-500/20 text-pink-600 flex items-center justify-center">
                    <Instagram className="h-4 w-4" />
                  </span>
                  {channelType === "instagram" && (
                    <CheckCircle2 className="h-4 w-4 text-pink-600" />
                  )}
                </div>
                <div>
                  <div className="font-semibold text-sm">Instagram</div>
                  <div className="text-[11px] text-muted-foreground">Direct e Stories</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectChannelType("messenger")}
                className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  channelType === "messenger"
                    ? "border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30"
                    : "border-border hover:border-muted-foreground/40 bg-card"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-600 flex items-center justify-center">
                    <Facebook className="h-4 w-4" />
                  </span>
                  {channelType === "messenger" && (
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  )}
                </div>
                <div>
                  <div className="font-semibold text-sm">Messenger</div>
                  <div className="text-[11px] text-muted-foreground">Páginas Facebook</div>
                </div>
              </button>
            </div>
          </div>

          {/* NOME DE EXIBIÇÃO DO CANAL */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">2. Nome de Exibição do Canal</label>
            <Input
              placeholder="Ex: Suporte Comercial, Recepção, @esteticaelaser"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Nome interno para identificar esta linha nas conversas e relatórios.
            </p>
          </div>

          {/* PASSO 2: ESCOLHA DO PROVEDOR DE CONEXÃO */}
          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center justify-between">
              <span>3. Provedor de Conexão</span>
              <span className="text-xs font-normal text-muted-foreground">
                Tecnologia que conecta a conta
              </span>
            </label>

            {/* Opções para WhatsApp */}
            {channelType === "whatsapp" && (
              <div className="space-y-2">
                {/* Zernio Oficial */}
                <div
                  onClick={() => setProvider("zernio")}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    provider === "zernio"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          Zernio (Meta Cloud API Oficial)
                          <Badge
                            variant="secondary"
                            className="text-[10px] text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40"
                          >
                            Oficial Recomendado
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          API Oficial da Meta sem risco de banimento de chip. Lista os números
                          vinculados no Zernio.
                        </p>
                      </div>
                    </div>
                    <input
                      type="radio"
                      checked={provider === "zernio"}
                      readOnly
                      className="accent-primary"
                    />
                  </div>
                </div>

                {/* EvoGo QR Code */}
                <div
                  onClick={() => setProvider("evogo")}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    provider === "evogo"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          EvoGo (Conexão via QR Code)
                          <Badge variant="outline" className="text-[10px]">
                            Pareamento Web
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Lê o QR Code com o aplicativo WhatsApp no celular físico. Suporta áudio
                          PTT e grupos.
                        </p>
                      </div>
                    </div>
                    <input
                      type="radio"
                      checked={provider === "evogo"}
                      readOnly
                      className="accent-primary"
                    />
                  </div>
                </div>

                {/* StevoChat QR Code */}
                <div
                  onClick={() => setProvider("stevo")}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    provider === "stevo"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          StevoChat (QR Code Alternativo)
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Servidor alternativo de instâncias WhatsApp não-oficiais.
                        </p>
                      </div>
                    </div>
                    <input
                      type="radio"
                      checked={provider === "stevo"}
                      readOnly
                      className="accent-primary"
                    />
                  </div>
                </div>

                {/* Meta Oficial Direta (Manual) */}
                <div
                  onClick={() => setProvider("oficial")}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    provider === "oficial"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          Meta Cloud API Direta (Manual)
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Conexão avançada via credenciais do Meta for Developers (Phone Number ID +
                          WABA).
                        </p>
                      </div>
                    </div>
                    <input
                      type="radio"
                      checked={provider === "oficial"}
                      readOnly
                      className="accent-primary"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Opções para Instagram */}
            {channelType === "instagram" && (
              <div className="space-y-2">
                {/* Zernio Instagram */}
                <div
                  onClick={() => setProvider("zernio")}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    provider === "zernio"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-pink-500"></span>
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          Zernio (Instagram Direct Oficial)
                          <Badge
                            variant="secondary"
                            className="text-[10px] text-pink-600 bg-pink-50 dark:bg-pink-950/40"
                          >
                            1 Clique
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Vincula diretamente aos perfis conectados no seu painel da Zernio.
                        </p>
                      </div>
                    </div>
                    <input
                      type="radio"
                      checked={provider === "zernio"}
                      readOnly
                      className="accent-primary"
                    />
                  </div>
                </div>

                {/* Meta Direct Instagram */}
                <div
                  onClick={() => setProvider("instagram")}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    provider === "instagram"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          Meta Graph API Direta (Facebook OAuth)
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Conecta usando o token do Facebook Login ou ID de página direto da Meta.
                        </p>
                      </div>
                    </div>
                    <input
                      type="radio"
                      checked={provider === "instagram"}
                      readOnly
                      className="accent-primary"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Opções para Messenger */}
            {channelType === "messenger" && (
              <div className="space-y-2">
                <div
                  onClick={() => setProvider("messenger")}
                  className="p-3 rounded-xl border border-primary bg-primary/5 ring-1 ring-primary cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                      <div>
                        <div className="font-medium text-sm">Meta Pages (Messenger Oficial)</div>
                        <p className="text-xs text-muted-foreground">
                          Conexão oficial para receber mensagens das páginas do Facebook.
                        </p>
                      </div>
                    </div>
                    <input type="radio" checked readOnly className="accent-primary" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* DETALHES ESPECÍFICOS DO PROVEDOR ESCOLHIDO */}

          {/* Caso ZERNIO */}
          {provider === "zernio" && (
            <div className="p-4 rounded-xl border bg-muted/30 space-y-3">
              {!company?.zernio_api_key ? (
                <div className="flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-900">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Chave Zernio não configurada:</span> Adicione
                    sua chave Bearer na aba{" "}
                    <strong>Canais & Atendimento &gt; Provedores de Mensageria &gt; Zernio</strong>{" "}
                    para poder listar suas contas conectadas.
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-semibold flex items-center justify-between">
                    <span>Conta Conectada no Zernio</span>
                    {isLoadingZernioAccounts && (
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    )}
                  </label>

                  {isLoadingZernioAccounts ? (
                    <div className="text-xs text-muted-foreground flex items-center gap-2 py-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Carregando contas disponíveis...
                    </div>
                  ) : zernioAccounts.length === 0 ? (
                    <div className="p-3 bg-background border border-dashed rounded-lg text-xs text-muted-foreground text-center">
                      Nenhuma conta de {channelType === "instagram" ? "Instagram" : "WhatsApp"}{" "}
                      encontrada na sua Zernio. Conecte primeiro a conta no painel da Zernio.
                    </div>
                  ) : (
                    <Select
                      value={selectedZernioAccountId}
                      onValueChange={(val) => {
                        setSelectedZernioAccountId(val);
                        const acc = zernioAccounts.find((a: any) => a.id === val);
                        if (acc && !channelName) {
                          const suggested =
                            acc.platform === "instagram"
                              ? acc.username
                                ? `@${acc.username}`
                                : acc.displayName || "Instagram"
                              : acc.metadata?.displayPhoneNumber ||
                                acc.displayName ||
                                "WhatsApp Oficial";
                          setChannelName(suggested);
                        }
                      }}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Selecione a conta..." />
                      </SelectTrigger>
                      <SelectContent>
                        {zernioAccounts.map((acc: any) => {
                          const label =
                            acc.platform === "instagram"
                              ? acc.username
                                ? `@${acc.username} (${acc.displayName || "Instagram"})`
                                : acc.displayName || acc.id
                              : acc.metadata?.displayPhoneNumber
                                ? `${acc.metadata.displayPhoneNumber} (${acc.displayName || "WhatsApp"})`
                                : acc.displayName || acc.id;

                          return (
                            <SelectItem key={acc.id} value={acc.id}>
                              <div className="flex items-center gap-2">
                                {acc.profilePicture && (
                                  <img
                                    src={acc.profilePicture}
                                    className="w-5 h-5 rounded-full object-cover"
                                  />
                                )}
                                <span>{label}</span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    O webhook e a sincronização são configurados de forma 100% automática.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Caso EVOGO ou STEVO */}
          {(provider === "evogo" || provider === "stevo") && (
            <div className="p-4 rounded-xl border bg-muted/30 space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <QrCode className="h-4 w-4 text-primary" />
                <span>
                  Ao clicar em <strong>Criar Canal</strong>, a instância será inicializada e o QR
                  Code estará pronto para leitura na lista de canais.
                </span>
              </div>

              {/* Toggle de Configurações Avançadas */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-xs text-primary hover:underline flex items-center gap-1 font-medium pt-1"
                >
                  {showAdvanced ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  {showAdvanced
                    ? "Ocultar configurações avançadas"
                    : "Configurações avançadas (Host / Token customizado)"}
                </button>

                {showAdvanced && (
                  <div className="space-y-3 pt-3 mt-2 border-t text-xs">
                    <div className="space-y-1">
                      <label className="font-medium">Host Customizado da API</label>
                      <Input
                        placeholder="Deixe em branco para usar o Host Global da Empresa"
                        className="text-xs h-8 bg-background"
                        value={customHost}
                        onChange={(e) => setCustomHost(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-medium">API Key Específica da Instância</label>
                      <Input
                        placeholder="Opcional. Gera automaticamente se vazio."
                        className="text-xs h-8 bg-background"
                        value={customApiKey}
                        onChange={(e) => setCustomApiKey(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-medium">ID da Instância Existente (Opcional)</label>
                      <Input
                        placeholder="Ex: 786abac3-77f8-4bfd-..."
                        className="text-xs h-8 bg-background"
                        value={customInstanceId}
                        onChange={(e) => setCustomInstanceId(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Caso META OFICIAL / INSTAGRAM DIRETO / MESSENGER */}
          {(provider === "oficial" || provider === "instagram" || provider === "messenger") && (
            <div className="p-4 rounded-xl border bg-muted/30 space-y-4">
              {/* Se Meta Token existe e é Instagram/Messenger, permite selecionar conta */}
              {company?.meta_system_user_token &&
              !useManualToken &&
              (provider === "instagram" || provider === "messenger") ? (
                <div className="space-y-2">
                  <label className="text-xs font-semibold">Conta da Meta Conectada</label>
                  {isLoadingMeta ? (
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> Buscando contas...
                    </div>
                  ) : metaAccounts.length === 0 ? (
                    <div className="text-xs text-destructive">
                      Nenhuma conta encontrada no token da Meta. Verifique as permissões.
                    </div>
                  ) : (
                    <Select value={selectedMetaAccountId} onValueChange={setSelectedMetaAccountId}>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Selecione a Página / Instagram" />
                      </SelectTrigger>
                      <SelectContent>
                        {metaAccounts.map((acc: any) => (
                          <SelectItem key={acc.id} value={acc.id}>
                            <div className="flex items-center gap-2">
                              {provider === "instagram" &&
                              acc.instagram_business_account?.profile_picture_url ? (
                                <img
                                  src={acc.instagram_business_account.profile_picture_url}
                                  className="w-5 h-5 rounded-full object-cover"
                                />
                              ) : (
                                <Globe className="w-4 h-4 text-muted-foreground" />
                              )}
                              <span>
                                {provider === "instagram"
                                  ? acc.instagram_business_account?.username || acc.name
                                  : acc.name}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    variant="link"
                    className="px-0 text-xs text-muted-foreground h-auto"
                    onClick={() => setUseManualToken(true)}
                  >
                    Inserir Credenciais Manualmente (ID e Token)
                  </Button>
                </div>
              ) : (
                /* Modo Manual de Credenciais da Meta */
                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <label className="font-medium">
                      {provider === "instagram"
                        ? "Instagram Account ID"
                        : provider === "messenger"
                          ? "Facebook Page ID"
                          : "Phone Number ID"}
                    </label>
                    <Input
                      placeholder="1234567890"
                      className="bg-background text-xs h-8"
                      value={oficialNumberId}
                      onChange={(e) => setOficialNumberId(e.target.value)}
                    />
                  </div>

                  {provider === "oficial" && (
                    <div className="space-y-1">
                      <label className="font-medium">WABA ID (WhatsApp Business Account)</label>
                      <Input
                        placeholder="Ex: 109876543210"
                        className="bg-background text-xs h-8"
                        value={oficialWabaId}
                        onChange={(e) => setOficialWabaId(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="font-medium">Access Token Permanente</label>
                    <Input
                      type="password"
                      placeholder="EAAS... ou IGA..."
                      className="bg-background text-xs h-8"
                      value={oficialToken}
                      onChange={(e) => setOficialToken(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-medium">Verify Token do Webhook</label>
                    <Input
                      placeholder="Crie uma senha (ex: atendi2026)"
                      className="bg-background text-xs h-8"
                      value={oficialVerifyToken}
                      onChange={(e) => setOficialVerifyToken(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => createChannelMutation.mutate()}
            disabled={createChannelMutation.isPending || !channelName.trim()}
          >
            {createChannelMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Criar Canal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
