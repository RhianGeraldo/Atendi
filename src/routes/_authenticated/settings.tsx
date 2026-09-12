import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  QrCode,
  Smartphone,
  Settings,
  Save,
  Server,
  Key,
  Building,
  User,
  Sparkles,
  Mic,
  MessageCircle,
  Zap,
  Tags,
  CheckCircle2,
  Bot,
  Users,
  Building2,
  Loader2,
  Globe,
  Facebook,
  Shield,
  Target,
  Cpu,
  RefreshCw,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  AlertCircle,
  Trash2,
  ArrowRight,
  Instagram,
  MessageSquare,
  Clock,
  MapPin,
  Mail,
  CircleDot,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { McpSettingsTab } from "@/components/settings/mcp-settings-tab";
import {
  saveZernioConfigAction,
  syncZernioWebhookAction,
  syncZernioAvatarsAction,
} from "@/lib/api/zernio.functions";
import { CreateChannelDialog } from "@/components/channels/create-channel-dialog";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { evogo, EvoGoClient } from "@/integrations/evogo/client";
import { StevoClient } from "@/integrations/stevo/client";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useUnit } from "@/lib/unit-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { QrCodeModal } from "@/components/whatsapp/qr-code-modal";
import { QuickMessagesTab } from "@/components/settings/quick-messages-tab";
import { ResolutionReasonsTab } from "@/components/settings/resolution-reasons-tab";
import { InstanceSettingsModal } from "@/components/whatsapp/instance-settings-modal";
import { DepartmentCard } from "@/components/settings/department-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DepartmentsTab } from "@/components/settings/departments-tab";
import { UsersTab } from "@/components/settings/users-tab";
import { RolesTab } from "@/components/settings/roles-tab";
import { LabelsTab } from "@/components/settings/labels-tab";
import { CrmTab } from "@/components/settings/crm-tab";
import { AiAgentsTab } from "@/components/settings/ai-agents-tab";
import { LeadRoutingSettings } from "@/components/settings/lead-routing-settings";
import { AutomationsTab } from "@/components/settings/automations-tab";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { profile, user } = useAuth();
  const { selectedUnitId } = useUnit();
  const { activeCompanyId } = useActiveCompany();
  const qc = useQueryClient();
  const [host, setHost] = useState("");
  const [stevoHost, setStevoHost] = useState("");
  const [token, setToken] = useState("");
  const [stevoToken, setStevoToken] = useState("");
  const [useSignature, setUseSignature] = useState(profile?.use_signature ?? true);

  const [aiSettings, setAiSettings] = useState({
    keys: { openai: "", groq: "", openrouter: "" },
    engines: { transcription: "none", chatbot: "none" },
    chatbot_models: ["meta-llama/llama-3-8b-instruct:free", "google/gemma-7b-it:free"],
    active_chatbot_model: "",
    sales_coach_prompt: "",
    sales_coach_evaluation_prompt: "",
    sales_coach_model: "",
    sales_coach_instances: [] as string[],
  });
  const [newModelInput, setNewModelInput] = useState("");

  const [newCompanyName, setNewCompanyName] = useState("");
  const [companyDocument, setCompanyDocument] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyBusinessHours, setCompanyBusinessHours] = useState("");
  const [companyMetaToken, setCompanyMetaToken] = useState("");
  const [companyCustomVars, setCompanyCustomVars] = useState<{ key: string; value: string }[]>([]);

  // Zernio State
  const [zernioApiKey, setZernioApiKey] = useState("");
  const [zernioBaseUrl, setZernioBaseUrl] = useState("https://zernio.com/api");
  const [isSavingZernio, setIsSavingZernio] = useState(false);
  const [isSyncingZernio, setIsSyncingZernio] = useState(false);
  const [isSyncingAvatars, setIsSyncingAvatars] = useState(false);

  // QrCode & Channels Modal State
  const [channelSubTab, setChannelSubTab] = useState("whatsapp");
  const [selectedInstance, setSelectedInstance] = useState<any>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const copyToClipboard = (text: string, label: string) => {
    if (!navigator?.clipboard) return;
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const openMetaOAuth = () => {
    const appId = import.meta.env.VITE_META_APP_ID || "1035728705567552";
    const redirectUri = encodeURIComponent(window.location.origin + "/facebook-signup");
    const oauthUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&state=${activeCompanyId}&scope=pages_show_list,pages_messaging,instagram_basic,instagram_manage_messages,whatsapp_business_management,whatsapp_business_messaging`;

    const width = 600;
    const height = 650;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;
    window.open(
      oauthUrl,
      "facebook-oauth",
      `width=${width},height=${height},left=${left},top=${top}`,
    );
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Se for a nossa própria janela de login (callback)
      if (event.origin === window.location.origin) {
        if (event.data?.type === "META_AUTH_SUCCESS") {
          toast.success("Conta do Facebook vinculada com sucesso!");
          qc.invalidateQueries({ queryKey: ["company", activeCompanyId] });
          return;
        }
      }

      // Se for o popup da Meta (para embedded signup)
      if (
        event.origin === "https://www.facebook.com" ||
        event.origin === "https://web.facebook.com"
      ) {
        try {
          const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
          if (data.type === "WA_EMBEDDED_SIGNUP") {
            console.log("Embedded Signup Data recebido:", data);
            toast.success("Vínculo do WhatsApp Embedded concluído!");
            qc.invalidateQueries({ queryKey: ["company", activeCompanyId] });
          }
        } catch {
          // Ignora
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [activeCompanyId]);

  const { data: company, isLoading: isLoadingCompany } = useQuery({
    queryKey: ["company", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select(
          "id, name, evogo_host, evogo_global_token, stevo_host, stevo_global_token, meta_system_user_token, ai_settings, document, address, business_hours, custom_variables, zernio_api_key, zernio_base_url, zernio_webhook_secret",
        )
        .eq("id", activeCompanyId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const createCompany = useMutation({
    mutationFn: async (name: string) => {
      const slug = name.toLowerCase().replace(/\s+/g, "-");
      const { data: newId, error } = await supabase.rpc("create_new_company", {
        company_name: name,
        company_slug: slug,
        user_id: user!.id,
      });
      if (error) throw error;
      return newId;
    },
    onSuccess: () => {
      toast.success("Empresa criada com sucesso! Recarregue a página.");
      // Force reload to update auth context
      window.location.reload();
    },
    onError: (e) => toast.error("Erro ao criar empresa", { description: (e as Error).message }),
  });

  useEffect(() => {
    if (company) {
      setHost(company.evogo_host || "");
      setStevoHost(company.stevo_host || "");
      setToken(company.evogo_global_token || "");
      setStevoToken(company.stevo_global_token || "");
      setZernioApiKey(company.zernio_api_key || "");
      setZernioBaseUrl(company.zernio_base_url || "https://zernio.com/api");
      setNewCompanyName(company.name || "");
      setCompanyDocument(company.document || "");
      setCompanyAddress(company.address || "");
      setCompanyBusinessHours(company.business_hours || "");
      setCompanyMetaToken(company.meta_system_user_token || "");

      const vars = company.custom_variables as Record<string, string>;
      if (vars && typeof vars === "object") {
        setCompanyCustomVars(
          Object.entries(vars).map(([k, v]) => ({ key: k, value: v as string })),
        );
      } else {
        setCompanyCustomVars([]);
      }

      if (company.ai_settings) {
        setAiSettings({
          keys: {
            openai: company.ai_settings.keys?.openai || "",
            groq: company.ai_settings.keys?.groq || "",
            openrouter: company.ai_settings.keys?.openrouter || "",
          },
          engines: {
            transcription: company.ai_settings.engines?.transcription || "none",
            chatbot: company.ai_settings.engines?.chatbot || "none",
          },
          chatbot_models: company.ai_settings.chatbot_models || [
            "meta-llama/llama-3-8b-instruct:free",
            "google/gemma-7b-it:free",
          ],
          active_chatbot_model: company.ai_settings.active_chatbot_model || "",
          sales_coach_prompt: company.ai_settings.sales_coach_prompt || "",
          sales_coach_evaluation_prompt: company.ai_settings.sales_coach_evaluation_prompt || "",
          sales_coach_model: company.ai_settings.sales_coach_model || "",
          sales_coach_instances: company.ai_settings.sales_coach_instances || [],
        });
      }
    }
  }, [company]);

  const saveEvoConfig = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Sem empresa vinculada");
      const { error } = await supabase
        .from("companies")
        .update({ evogo_host: host.trim(), evogo_global_token: token.trim() })
        .eq("id", activeCompanyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Credenciais da EvoGo salvas com sucesso!");
      qc.invalidateQueries({ queryKey: ["company", activeCompanyId] });
    },
    onError: (e) => toast.error("Erro ao salvar EvoGo", { description: (e as Error).message }),
  });

  const saveStevoConfig = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Sem empresa vinculada");
      const { error } = await supabase
        .from("companies")
        .update({ stevo_host: stevoHost.trim(), stevo_global_token: stevoToken.trim() })
        .eq("id", activeCompanyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Credenciais do StevoChat salvas com sucesso!");
      qc.invalidateQueries({ queryKey: ["company", activeCompanyId] });
    },
    onError: (e) => toast.error("Erro ao salvar StevoChat", { description: (e as Error).message }),
  });

  const saveMetaConfig = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Sem empresa vinculada");
      const { error } = await supabase
        .from("companies")
        .update({ meta_system_user_token: companyMetaToken.trim() || null })
        .eq("id", activeCompanyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Token da Meta salvo com sucesso!");
      qc.invalidateQueries({ queryKey: ["company", activeCompanyId] });
    },
    onError: (e) => toast.error("Erro ao salvar Token Meta", { description: (e as Error).message }),
  });

  const disconnectMeta = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Sem empresa vinculada");
      const { error } = await supabase
        .from("companies")
        .update({ meta_system_user_token: null })
        .eq("id", activeCompanyId);
      if (error) throw error;
    },
    onSuccess: () => {
      setCompanyMetaToken("");
      toast.success("Integração da Meta desconectada!");
      qc.invalidateQueries({ queryKey: ["company", activeCompanyId] });
    },
    onError: (e) => toast.error("Erro ao desconectar Meta", { description: (e as Error).message }),
  });

  const saveAiConfig = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Sem empresa vinculada");
      const { error } = await supabase
        .from("companies")
        .update({
          ai_settings: aiSettings,
        })
        .eq("id", activeCompanyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações de IA salvas!");
      qc.invalidateQueries({ queryKey: ["company", activeCompanyId] });
    },
    onError: (e) => toast.error("Erro ao salvar", { description: (e as Error).message }),
  });

  const saveCompanyDetails = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Sem empresa vinculada");

      const customVarsObj = companyCustomVars.reduce(
        (acc, curr) => {
          if (curr.key.trim()) {
            acc[curr.key.trim()] = curr.value;
          }
          return acc;
        },
        {} as Record<string, string>,
      );

      const { error } = await supabase
        .from("companies")
        .update({
          name: newCompanyName.trim(),
          document: companyDocument.trim() || null,
          address: companyAddress.trim() || null,
          business_hours: companyBusinessHours.trim() || null,
          custom_variables: customVarsObj,
        })
        .eq("id", activeCompanyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dados da empresa atualizados!");
      qc.invalidateQueries({ queryKey: ["company", activeCompanyId] });
      qc.invalidateQueries({ queryKey: ["company-name", activeCompanyId] }); // Update sidebar
    },
    onError: (e) => toast.error("Erro ao atualizar", { description: (e as Error).message }),
  });

  const toggleSignature = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!profile?.id) throw new Error("Sem usuário ativo");
      const { error } = await supabase
        .from("profiles")
        .update({ use_signature: enabled })
        .eq("id", profile.id);
      if (error) throw error;
      return enabled;
    },
    onSuccess: (enabled) => {
      setUseSignature(enabled);
      toast.success(enabled ? "Assinatura ativada!" : "Assinatura desativada!");
    },
    onError: (e) => {
      setUseSignature(!useSignature); // Revert on error
      toast.error("Erro ao alterar assinatura", { description: (e as Error).message });
    },
  });

  const { data: instances, isLoading: isLoadingInstances } = useQuery({
    queryKey: ["whatsapp-instances", activeCompanyId, selectedUnitId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      let q = supabase.from("whatsapp_instances").select("*").eq("company_id", activeCompanyId!);

      if (selectedUnitId) q = q.eq("unit_id", selectedUnitId);
      else q = q.is("unit_id", null);

      const { data, error } = await q.order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  if (!activeCompanyId) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="max-w-md mx-auto mt-20">
          <Card>
            <CardHeader>
              <CardTitle>Bem-vindo ao AtendiAI!</CardTitle>
              <CardDescription>
                Para acessar as configurações, você precisa cadastrar a sua Empresa Mãe primeiro.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome da Empresa</label>
                <Input
                  placeholder="Minha Empresa"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => createCompany.mutate(newCompanyName)}
                disabled={!newCompanyName || createCompany.isPending}
              >
                Cadastrar Empresa
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6 max-w-7xl mx-auto w-full">
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 bg-muted/60 rounded-xl gap-1 border">
          <TabsTrigger
            value="general"
            className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs text-xs sm:text-sm font-medium py-2 px-3.5"
          >
            <Building className="mr-2 h-4 w-4" />
            Empresa
          </TabsTrigger>
          <TabsTrigger
            value="channels"
            className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs text-xs sm:text-sm font-medium py-2 px-3.5"
          >
            <Smartphone className="mr-2 h-4 w-4" />
            Canais & Atendimento
          </TabsTrigger>
          <TabsTrigger
            value="ai"
            className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs text-xs sm:text-sm font-medium py-2 px-3.5"
          >
            <Bot className="mr-2 h-4 w-4" />
            Inteligência Artificial
          </TabsTrigger>
          <TabsTrigger
            value="crm"
            className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs text-xs sm:text-sm font-medium py-2 px-3.5"
          >
            <Target className="mr-2 h-4 w-4" />
            CRM & Funis
          </TabsTrigger>
          <TabsTrigger
            value="team"
            className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs text-xs sm:text-sm font-medium py-2 px-3.5"
          >
            <Users className="mr-2 h-4 w-4" />
            Equipe & Perfis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          {/* Dados da Empresa Matriz */}
          <Card>
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Building className="h-5 w-5 text-primary" />
                    Dados da Empresa (Matriz)
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Informações institucionais, localização e variáveis personalizadas desta
                    empresa.
                  </CardDescription>
                </div>
                <Button
                  onClick={() => saveCompanyDetails.mutate()}
                  disabled={saveCompanyDetails.isPending || !newCompanyName.trim()}
                  className="shrink-0 self-start sm:self-auto"
                >
                  {saveCompanyDetails.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Salvar Alterações
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {/* Seção 1: Identificação Corporativa */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5" />
                  Identificação Corporativa
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Nome da Empresa / Razão Social</label>
                    <Input
                      placeholder="Minha Empresa"
                      value={newCompanyName}
                      onChange={(e) => setNewCompanyName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Documento (CNPJ / CPF)</label>
                    <Input
                      placeholder="00.000.000/0000-00"
                      value={companyDocument}
                      onChange={(e) => setCompanyDocument(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Seção 2: Localização e Horários */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5" />
                  Localização & Horário Comercial
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-xs font-medium">Endereço Comercial Completo</label>
                    <Input
                      placeholder="Av. Exemplo, 123, Bairro - Cidade/UF"
                      value={companyAddress}
                      onChange={(e) => setCompanyAddress(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Horário de Atendimento</label>
                    <Input
                      placeholder="Seg a Sex: 08h às 18h"
                      value={companyBusinessHours}
                      onChange={(e) => setCompanyBusinessHours(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Seção 3: Variáveis Personalizadas para IA */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      Variáveis Dinâmicas para Agentes de IA
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Use estas variáveis nos prompts dos agentes com chaves duplas:{" "}
                      <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono">
                        {"{{nome_da_variavel}}"}
                      </code>
                      .
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs shrink-0 self-start sm:self-auto h-8"
                    onClick={() =>
                      setCompanyCustomVars([...companyCustomVars, { key: "", value: "" }])
                    }
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar Variável
                  </Button>
                </div>

                {companyCustomVars.length === 0 ? (
                  <div className="text-xs text-muted-foreground p-5 text-center border border-dashed rounded-xl bg-muted/20">
                    Nenhuma variável personalizada cadastrada ainda. Clique em "Adicionar Variável"
                    para criar atalhos reutilizáveis (ex:{" "}
                    <code className="font-mono">link_pagamento</code>,{" "}
                    <code className="font-mono">chave_pix</code>,{" "}
                    <code className="font-mono">catalogo_pdf</code>).
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {companyCustomVars.map((v, i) => (
                      <div
                        key={i}
                        className="flex gap-2 items-center bg-muted/40 p-2.5 rounded-xl border"
                      >
                        <Input
                          placeholder="chave (ex: link_site)"
                          className="w-2/5 text-xs h-8 bg-background font-mono"
                          value={v.key}
                          onChange={(e) => {
                            const newVars = [...companyCustomVars];
                            newVars[i].key = e.target.value;
                            setCompanyCustomVars(newVars);
                          }}
                        />
                        <Input
                          placeholder="valor dinâmico"
                          className="flex-1 text-xs h-8 bg-background"
                          value={v.value}
                          onChange={(e) => {
                            const newVars = [...companyCustomVars];
                            newVars[i].value = e.target.value;
                            setCompanyCustomVars(newVars);
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive shrink-0 hover:bg-destructive/10"
                          onClick={() => {
                            setCompanyCustomVars(companyCustomVars.filter((_, idx) => idx !== i));
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channels" className="space-y-4">
          <Tabs
            value={channelSubTab}
            onValueChange={setChannelSubTab}
            orientation="vertical"
            className="flex flex-col md:flex-row gap-6 w-full"
          >
            <TabsList className="flex md:flex-col h-auto w-full md:w-60 bg-transparent gap-1 justify-start overflow-x-auto pb-1 md:pb-0 md:border-r md:border-border/60 md:pr-4 shrink-0">
              <TabsTrigger
                value="whatsapp"
                className="w-full justify-start data-[state=active]:bg-muted/80 rounded-lg py-2"
              >
                <Smartphone className="mr-2 h-4 w-4" />
                Canais de Atendimento
              </TabsTrigger>
              <TabsTrigger
                value="providers"
                className="w-full justify-start data-[state=active]:bg-muted/80 rounded-lg py-2"
              >
                <Server className="mr-2 h-4 w-4" />
                Provedores de Mensageria
              </TabsTrigger>
              <TabsTrigger
                value="quick-messages"
                className="w-full justify-start data-[state=active]:bg-muted/80 rounded-lg py-2"
              >
                <Zap className="mr-2 h-4 w-4" />
                Mensagens Rápidas
              </TabsTrigger>
              <TabsTrigger
                value="labels"
                className="w-full justify-start data-[state=active]:bg-muted/80 rounded-lg py-2"
              >
                <Tags className="mr-2 h-4 w-4" />
                Etiquetas
              </TabsTrigger>
              <TabsTrigger
                value="automations"
                className="w-full justify-start data-[state=active]:bg-muted/80 rounded-lg py-2"
              >
                <Zap className="mr-2 h-4 w-4 text-amber-500" />
                Automações
              </TabsTrigger>
              <TabsTrigger
                value="reasons"
                className="w-full justify-start data-[state=active]:bg-muted/80 rounded-lg py-2"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Encerramento
              </TabsTrigger>
              <TabsTrigger
                value="routing"
                className="w-full justify-start data-[state=active]:bg-muted/80 rounded-lg py-2"
              >
                <Users className="mr-2 h-4 w-4" />
                Distribuição (Roleta)
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 w-full min-w-0">
              <TabsContent value="whatsapp" className="mt-0 border-none p-0 space-y-4">
                {/* Banner de atalho / status rápido dos provedores */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border bg-gradient-to-r from-muted/60 via-muted/30 to-background">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <Server className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold flex items-center gap-2">
                        Provedores Conectados
                        <div className="flex items-center gap-1.5 ml-1">
                          {company?.zernio_api_key && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20"
                            >
                              Zernio
                            </Badge>
                          )}
                          {company?.meta_system_user_token && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
                            >
                              Meta Oficial
                            </Badge>
                          )}
                          {company?.evogo_host && company?.evogo_global_token && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                            >
                              EvoGo
                            </Badge>
                          )}
                          {company?.stevo_host && company?.stevo_global_token && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20"
                            >
                              StevoChat
                            </Badge>
                          )}
                          {!company?.zernio_api_key &&
                            !company?.meta_system_user_token &&
                            !(company?.evogo_host && company?.evogo_global_token) &&
                            !(company?.stevo_host && company?.stevo_global_token) && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 text-muted-foreground"
                              >
                                Nenhum configurado
                              </Badge>
                            )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Configure as credenciais e conexões dos gateways na aba Provedores de
                        Mensageria.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-xs gap-1.5"
                    onClick={() => setChannelSubTab("providers")}
                  >
                    Gerenciar Provedores
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Global Instances Card */}
                <Card className={cn("col-span-full", !selectedUnitId && "lg:col-span-2")}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Smartphone className="h-5 w-5" />
                      Instâncias e Canais
                    </CardTitle>
                    <CardDescription>
                      {selectedUnitId
                        ? "Instâncias de atendimento desta unidade específica."
                        : "Instâncias vinculadas diretamente à Empresa Mãe (sem unidade)."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Instâncias Ativas
                        </h3>
                      </div>
                      <Button onClick={() => setCreateModalOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Criar Instância
                      </Button>
                    </div>

                    <div className="space-y-4">
                      {isLoadingInstances ? (
                        <div className="text-sm text-muted-foreground">Carregando...</div>
                      ) : instances?.length ? (
                        instances.map((inst) => (
                          <InstanceRow
                            key={inst.id}
                            instance={inst}
                            company={company}
                            onConnect={() => {
                              setSelectedInstance(inst);
                              setQrModalOpen(true);
                            }}
                            onSettings={() => {
                              setSelectedInstance(inst);
                              setSettingsModalOpen(true);
                            }}
                          />
                        ))
                      ) : (
                        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                          Nenhuma instância global configurada no momento.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="providers" className="mt-0 border-none p-0 space-y-6">
                {/* Provedores de Mensageria */}
                <div className="space-y-4 pt-2">
                  <div className="border-b pb-3">
                    <h3 className="text-base font-semibold tracking-tight flex items-center gap-2">
                      <Server className="h-5 w-5 text-primary" />
                      Provedores de Mensageria & Gateways
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Configure os servidores e credenciais de cada tecnologia de conexão. Quando
                      você for em <strong>Canais de Atendimento</strong> para criar um canal
                      (WhatsApp, Instagram ou Messenger), você escolherá qual destes provedores irá
                      alimentar aquela linha ou perfil.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Provedor 1: Zernio */}
                    <Card className="flex flex-col justify-between">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                              <Sparkles className="h-5 w-5" />
                            </div>
                            <div>
                              <CardTitle className="text-base">Zernio</CardTitle>
                              <CardDescription className="text-xs">
                                WhatsApp Cloud API & Instagram Direct Oficial
                              </CardDescription>
                            </div>
                          </div>
                          <Badge
                            variant={company?.zernio_api_key ? "default" : "secondary"}
                            className={
                              company?.zernio_api_key
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                                : ""
                            }
                          >
                            {company?.zernio_api_key ? (
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Configurado
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <AlertCircle className="h-3 w-3 text-muted-foreground" /> Não
                                configurado
                              </span>
                            )}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4 flex-1">
                        <p className="text-xs text-muted-foreground">
                          Provedor em nuvem oficial para múltiplos canais. Permite conectar números
                          de WhatsApp e perfis de Instagram Direct com webhook bidirecional
                          centralizado.
                        </p>

                        <div className="space-y-2">
                          <label className="text-xs font-medium">Chave de API (Bearer Token)</label>
                          <div className="relative">
                            <Key className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              type="password"
                              placeholder="zrk_..."
                              value={zernioApiKey}
                              onChange={(e) => setZernioApiKey(e.target.value)}
                              className="pl-8 text-xs"
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Gere no painel da Zernio em Configurações &gt; API Keys com permissão de
                            Inbox.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-medium">Base URL (Opcional)</label>
                          <div className="relative">
                            <Server className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              placeholder="https://zernio.com/api"
                              value={zernioBaseUrl}
                              onChange={(e) => setZernioBaseUrl(e.target.value)}
                              className="pl-8 text-xs"
                            />
                          </div>
                        </div>

                        {activeCompanyId && (
                          <div className="p-3 bg-muted/60 rounded-lg border text-xs space-y-2">
                            <div className="flex items-center justify-between font-medium">
                              <span className="text-[11px] text-muted-foreground">
                                URL do Webhook da Empresa
                              </span>
                              {company?.zernio_webhook_secret ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-emerald-600 bg-emerald-500/10"
                                >
                                  Sincronizado
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-amber-600 bg-amber-500/10"
                                >
                                  Pendente de Salvar
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <code className="text-[10px] font-mono break-all flex-1 bg-background p-1.5 rounded border">
                                {typeof window !== "undefined"
                                  ? `${window.location.origin}/api/webhooks/zernio/${activeCompanyId}${company?.zernio_webhook_secret ? `?k=${encodeURIComponent(company.zernio_webhook_secret)}` : ""}`
                                  : ""}
                              </code>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                onClick={() => {
                                  const url = `${window.location.origin}/api/webhooks/zernio/${activeCompanyId}${company?.zernio_webhook_secret ? `?k=${encodeURIComponent(company.zernio_webhook_secret)}` : ""}`;
                                  copyToClipboard(url, "URL do Webhook Zernio");
                                }}
                                title="Copiar URL"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2 pt-2">
                          <Button
                            className="flex-1 text-xs"
                            onClick={async () => {
                              if (!activeCompanyId || !zernioApiKey.trim()) {
                                toast.error("Informe a chave de API da Zernio.");
                                return;
                              }
                              setIsSavingZernio(true);
                              try {
                                await saveZernioConfigAction({
                                  data: {
                                    companyId: activeCompanyId,
                                    apiKey: zernioApiKey.trim(),
                                    baseUrl: zernioBaseUrl.trim() || undefined,
                                  },
                                });
                                toast.success("Credenciais Zernio validadas e salvas com sucesso!");
                                qc.invalidateQueries({ queryKey: ["company", activeCompanyId] });
                              } catch (err: any) {
                                toast.error("Erro ao salvar Zernio: " + err.message);
                              } finally {
                                setIsSavingZernio(false);
                              }
                            }}
                            disabled={isSavingZernio || !zernioApiKey}
                          >
                            {isSavingZernio ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Salvar Chave Zernio
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={async () => {
                              if (!activeCompanyId || !company?.zernio_api_key) {
                                toast.error("Salve a chave de API antes de sincronizar o webhook.");
                                return;
                              }
                              setIsSyncingZernio(true);
                              try {
                                await syncZernioWebhookAction({
                                  data: {
                                    companyId: activeCompanyId,
                                    appOrigin: window.location.origin,
                                  },
                                });
                                toast.success("Webhook configurado na Zernio com sucesso!");
                              } catch (err: any) {
                                toast.error("Erro ao sincronizar webhook: " + err.message);
                              } finally {
                                setIsSyncingZernio(false);
                              }
                            }}
                            disabled={isSyncingZernio || !company?.zernio_api_key}
                            title="Registrar / Atualizar Webhook na Zernio"
                          >
                            {isSyncingZernio ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Sync Webhook
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={async () => {
                              if (!activeCompanyId || !company?.zernio_api_key) {
                                toast.error("Salve a chave de API antes de sincronizar avatares.");
                                return;
                              }
                              setIsSyncingAvatars(true);
                              try {
                                const res = await syncZernioAvatarsAction({
                                  data: { companyId: activeCompanyId },
                                });
                                toast.success(
                                  `Fotos de perfil sincronizadas! (${res.updatedCount} fotos salvas)`,
                                );
                              } catch (err: any) {
                                toast.error("Erro ao sincronizar fotos: " + err.message);
                              } finally {
                                setIsSyncingAvatars(false);
                              }
                            }}
                            disabled={isSyncingAvatars || !company?.zernio_api_key}
                            title="Sincronizar fotos de perfil do Instagram e WhatsApp com o Storage permanente"
                          >
                            {isSyncingAvatars ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Sync Fotos
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Provedor 2: Meta Cloud API Oficial (Direto) */}
                    <Card className="flex flex-col justify-between">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
                              <Facebook className="h-5 w-5" />
                            </div>
                            <div>
                              <CardTitle className="text-base">Meta Cloud API (Direto)</CardTitle>
                              <CardDescription className="text-xs">
                                WhatsApp Oficial, Instagram Direct & Messenger
                              </CardDescription>
                            </div>
                          </div>
                          <Badge
                            variant={company?.meta_system_user_token ? "default" : "secondary"}
                            className={
                              company?.meta_system_user_token
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                                : ""
                            }
                          >
                            {company?.meta_system_user_token ? (
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Conectado
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <AlertCircle className="h-3 w-3 text-muted-foreground" /> Não
                                configurado
                              </span>
                            )}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4 flex-1">
                        <p className="text-xs text-muted-foreground">
                          Conexão direta com os servidores da Meta via Graph API usando login rápido
                          com Facebook ou Token de Usuário do Sistema permanente.
                        </p>

                        {/* Fast Connect Banner */}
                        {!company?.meta_system_user_token ? (
                          <div className="p-3 border rounded-lg bg-blue-50/50 dark:bg-blue-950/20 flex items-center justify-between gap-3">
                            <div className="text-xs">
                              <p className="font-medium text-blue-900 dark:text-blue-300">
                                Vínculo Rápido (Login com Facebook)
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                Conecte sua conta do Facebook para importar páginas e Instagram.
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              onClick={openMetaOAuth}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 px-3 shrink-0 flex items-center gap-1.5"
                            >
                              <Facebook className="h-3.5 w-3.5 fill-current" />
                              Conectar
                            </Button>
                          </div>
                        ) : (
                          <div className="p-3 border border-emerald-500/30 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center justify-between gap-3">
                            <div className="text-xs">
                              <p className="font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                Integração Meta Ativa
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                Sua conta do Facebook / Meta está autenticada.
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => disconnectMeta.mutate()}
                              disabled={disconnectMeta.isPending}
                              className="text-xs h-8 text-destructive hover:bg-destructive/10 shrink-0"
                            >
                              {disconnectMeta.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                "Desconectar"
                              )}
                            </Button>
                          </div>
                        )}

                        <div className="space-y-2">
                          <label className="text-xs font-medium">
                            Token Permanente (System User Token)
                          </label>
                          <div className="relative">
                            <Key className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              type="password"
                              placeholder="EAAS... ou cole token de longa duração"
                              value={companyMetaToken}
                              onChange={(e) => setCompanyMetaToken(e.target.value)}
                              className="pl-8 text-xs font-mono"
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Opcional caso tenha conectado via Facebook acima. Use para conexões
                            manuais avançadas do Meta Business Suite.
                          </p>
                        </div>

                        <div className="p-3 bg-muted/60 rounded-lg border text-xs space-y-1.5">
                          <span className="font-medium text-[11px] text-muted-foreground block">
                            Webhooks de Callback da Meta:
                          </span>
                          <div className="space-y-1 font-mono text-[10px]">
                            <div className="flex items-center justify-between bg-background p-1.5 rounded border">
                              <span className="truncate">
                                WhatsApp:{" "}
                                {typeof window !== "undefined"
                                  ? `${window.location.origin}/api/webhooks/whatsapp`
                                  : ""}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 shrink-0 ml-1"
                                onClick={() =>
                                  copyToClipboard(
                                    `${window.location.origin}/api/webhooks/whatsapp`,
                                    "Webhook WhatsApp",
                                  )
                                }
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="flex items-center justify-between bg-background p-1.5 rounded border">
                              <span className="truncate">
                                Instagram:{" "}
                                {typeof window !== "undefined"
                                  ? `${window.location.origin}/api/webhooks/instagram`
                                  : ""}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 shrink-0 ml-1"
                                onClick={() =>
                                  copyToClipboard(
                                    `${window.location.origin}/api/webhooks/instagram`,
                                    "Webhook Instagram",
                                  )
                                }
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>

                        <Button
                          className="w-full text-xs"
                          onClick={() => saveMetaConfig.mutate()}
                          disabled={saveMetaConfig.isPending}
                        >
                          {saveMetaConfig.isPending ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Salvar Token Meta
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Provedor 3: EvoGo API */}
                    <Card className="flex flex-col justify-between">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                              <Smartphone className="h-5 w-5" />
                            </div>
                            <div>
                              <CardTitle className="text-base">EvoGo API</CardTitle>
                              <CardDescription className="text-xs">
                                WhatsApp Baileys via Leitura de QR Code
                              </CardDescription>
                            </div>
                          </div>
                          <Badge
                            variant={
                              company?.evogo_host && company?.evogo_global_token
                                ? "default"
                                : "secondary"
                            }
                            className={
                              company?.evogo_host && company?.evogo_global_token
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                                : ""
                            }
                          >
                            {company?.evogo_host && company?.evogo_global_token ? (
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Configurado
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <AlertCircle className="h-3 w-3 text-muted-foreground" /> Não
                                configurado
                              </span>
                            )}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4 flex-1">
                        <p className="text-xs text-muted-foreground">
                          Servidor dedicado para instâncias de WhatsApp conectadas escaneando o QR
                          Code no celular.
                        </p>

                        <div className="space-y-2">
                          <label className="text-xs font-medium">
                            Host da API (URL do Servidor)
                          </label>
                          <div className="relative">
                            <Server className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              placeholder="https://api.evogo.com"
                              value={host}
                              onChange={(e) => setHost(e.target.value)}
                              className="pl-8 text-xs"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-medium">Global Token (Chave Mestra)</label>
                          <div className="relative">
                            <Key className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              type="password"
                              placeholder="Token global mestre da EvoGo"
                              value={token}
                              onChange={(e) => setToken(e.target.value)}
                              className="pl-8 text-xs"
                            />
                          </div>
                        </div>

                        <div className="p-3 bg-muted/60 rounded-lg border text-xs space-y-1.5">
                          <div className="flex items-center justify-between font-medium">
                            <span className="text-[11px] text-muted-foreground">
                              URL do Webhook Padrão
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <code className="text-[10px] font-mono break-all flex-1 bg-background p-1.5 rounded border">
                              {typeof window !== "undefined"
                                ? `${window.location.origin}/api/webhooks/evogo`
                                : ""}
                            </code>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() =>
                                copyToClipboard(
                                  `${window.location.origin}/api/webhooks/evogo`,
                                  "Webhook EvoGo",
                                )
                              }
                              title="Copiar URL"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        <Button
                          className="w-full text-xs"
                          onClick={() => saveEvoConfig.mutate()}
                          disabled={saveEvoConfig.isPending || isLoadingCompany}
                        >
                          {saveEvoConfig.isPending ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Salvar Credenciais EvoGo
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Provedor 4: StevoChat API */}
                    <Card className="flex flex-col justify-between">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-600">
                              <Server className="h-5 w-5" />
                            </div>
                            <div>
                              <CardTitle className="text-base">StevoChat API</CardTitle>
                              <CardDescription className="text-xs">
                                WhatsApp Web via Servidor Stevo
                              </CardDescription>
                            </div>
                          </div>
                          <Badge
                            variant={
                              company?.stevo_host && company?.stevo_global_token
                                ? "default"
                                : "secondary"
                            }
                            className={
                              company?.stevo_host && company?.stevo_global_token
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                                : ""
                            }
                          >
                            {company?.stevo_host && company?.stevo_global_token ? (
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Configurado
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <AlertCircle className="h-3 w-3 text-muted-foreground" /> Não
                                configurado
                              </span>
                            )}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4 flex-1">
                        <p className="text-xs text-muted-foreground">
                          Servidor StevoChat para gestão, leitura de QR Code e automação de disparos
                          de WhatsApp.
                        </p>

                        <div className="space-y-2">
                          <label className="text-xs font-medium">
                            Host da API (URL do Servidor)
                          </label>
                          <div className="relative">
                            <Server className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              placeholder="https://stevo.chat/api"
                              value={stevoHost}
                              onChange={(e) => setStevoHost(e.target.value)}
                              className="pl-8 text-xs"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-medium">Global Token (Chave Mestra)</label>
                          <div className="relative">
                            <Key className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              type="password"
                              placeholder="Token global mestre do StevoChat"
                              value={stevoToken}
                              onChange={(e) => setStevoToken(e.target.value)}
                              className="pl-8 text-xs"
                            />
                          </div>
                        </div>

                        <div className="p-3 bg-muted/60 rounded-lg border text-xs space-y-1.5">
                          <div className="flex items-center justify-between font-medium">
                            <span className="text-[11px] text-muted-foreground">
                              URL do Webhook Padrão
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <code className="text-[10px] font-mono break-all flex-1 bg-background p-1.5 rounded border">
                              {typeof window !== "undefined"
                                ? `${window.location.origin}/api/webhooks/stevo`
                                : ""}
                            </code>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() =>
                                copyToClipboard(
                                  `${window.location.origin}/api/webhooks/stevo`,
                                  "Webhook StevoChat",
                                )
                              }
                              title="Copiar URL"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        <Button
                          className="w-full text-xs"
                          onClick={() => saveStevoConfig.mutate()}
                          disabled={saveStevoConfig.isPending || isLoadingCompany}
                        >
                          {saveStevoConfig.isPending ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Salvar Credenciais StevoChat
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="quick-messages" className="mt-0 border-none p-0">
                <QuickMessagesTab />
              </TabsContent>

              <TabsContent value="reasons" className="mt-0 border-none p-0">
                <ResolutionReasonsTab />
              </TabsContent>

              <TabsContent value="labels" className="mt-0 border-none p-0">
                <LabelsTab />
              </TabsContent>

              <TabsContent value="automations" className="mt-0 border-none p-0">
                <AutomationsTab />
              </TabsContent>

              <TabsContent value="routing" className="mt-0 border-none p-0">
                <LeadRoutingSettings />
              </TabsContent>
            </div>
          </Tabs>
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <Tabs
            defaultValue="integrations"
            orientation="vertical"
            className="flex flex-col md:flex-row gap-6 w-full"
          >
            <TabsList className="flex md:flex-col h-auto w-full md:w-60 bg-transparent gap-1 justify-start overflow-x-auto pb-1 md:pb-0 md:border-r md:border-border/60 md:pr-4 shrink-0">
              <TabsTrigger
                value="integrations"
                className="w-full justify-start data-[state=active]:bg-muted/80 rounded-lg py-2"
              >
                <Key className="mr-2 h-4 w-4" />
                Chaves & Motores
              </TabsTrigger>
              <TabsTrigger
                value="sales-coach"
                className="w-full justify-start data-[state=active]:bg-muted/80 rounded-lg py-2"
              >
                <Target className="mr-2 h-4 w-4 text-amber-500" />
                Sales Coach (Treinador)
              </TabsTrigger>
              <TabsTrigger
                value="agents"
                className="w-full justify-start data-[state=active]:bg-muted/80 rounded-lg py-2"
              >
                <Bot className="mr-2 h-4 w-4" />
                Agentes de IA
              </TabsTrigger>
              <TabsTrigger
                value="mcp"
                className="w-full justify-start data-[state=active]:bg-muted/80 rounded-lg py-2"
              >
                <Cpu className="mr-2 h-4 w-4" />
                Servidor MCP & Conexões
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 w-full min-w-0">
              {/* Sub-aba 1: Chaves & Motores */}
              <TabsContent value="integrations" className="mt-0 border-none p-0 space-y-6">
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {/* Card de Chaves de API */}
                  <Card className="col-span-full lg:col-span-1 flex flex-col justify-between">
                    <div>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Key className="h-5 w-5 text-primary" />
                          Cofre de Chaves (API)
                        </CardTitle>
                        <CardDescription>
                          Cadastre as chaves dos provedores de LLM que deseja utilizar no sistema.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-xs font-medium">OpenRouter (Recomendado)</label>
                          <Input
                            type="password"
                            placeholder="sk-or-v1-..."
                            value={aiSettings.keys.openrouter}
                            onChange={(e) =>
                              setAiSettings({
                                ...aiSettings,
                                keys: { ...aiSettings.keys, openrouter: e.target.value },
                              })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium">Groq (Ultra Rápido)</label>
                          <Input
                            type="password"
                            placeholder="gsk_..."
                            value={aiSettings.keys.groq}
                            onChange={(e) =>
                              setAiSettings({
                                ...aiSettings,
                                keys: { ...aiSettings.keys, groq: e.target.value },
                              })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium">OpenAI (Whisper / GPT)</label>
                          <Input
                            type="password"
                            placeholder="sk-..."
                            value={aiSettings.keys.openai}
                            onChange={(e) =>
                              setAiSettings({
                                ...aiSettings,
                                keys: { ...aiSettings.keys, openai: e.target.value },
                              })
                            }
                          />
                        </div>
                      </CardContent>
                    </div>
                  </Card>

                  {/* Card de Motores */}
                  <Card className="col-span-full lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Sparkles className="h-5 w-5 text-amber-500" />
                        Motores de Inteligência Artificial
                      </CardTitle>
                      <CardDescription>
                        Defina qual provedor de IA será responsável pela conversão de áudio e
                        geração de respostas.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Motor de Transcrição */}
                      <div className="space-y-3 p-4 border rounded-xl bg-muted/20">
                        <div className="flex items-center gap-2">
                          <Mic className="h-4 w-4 text-primary" />
                          <h4 className="font-semibold text-sm">
                            Motor de Transcrição de Áudio (Speech-to-Text)
                          </h4>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          O provedor selecionado converterá áudios do WhatsApp em texto
                          automaticamente.
                        </p>
                        <Select
                          value={aiSettings.engines.transcription}
                          onValueChange={(val) =>
                            setAiSettings({
                              ...aiSettings,
                              engines: { ...aiSettings.engines, transcription: val },
                            })
                          }
                        >
                          <SelectTrigger className="w-full sm:w-[320px]">
                            <SelectValue placeholder="Selecione um motor" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nenhum (Desativado)</SelectItem>
                            <SelectItem value="groq">Groq (whisper-large-v3-turbo)</SelectItem>
                            <SelectItem value="openai">OpenAI (whisper-1)</SelectItem>
                            <SelectItem value="openrouter">
                              OpenRouter (via groq/whisper)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Motor de Chatbot */}
                      <div className="space-y-3 p-4 border rounded-xl bg-muted/20">
                        <div className="flex items-center gap-2">
                          <MessageCircle className="h-4 w-4 text-primary" />
                          <h4 className="font-semibold text-sm">
                            Motor de Chatbot Padrão (Respostas e IA)
                          </h4>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          O provedor selecionado gerará as respostas automáticas e análises gerais.
                        </p>
                        <Select
                          value={aiSettings.engines.chatbot}
                          onValueChange={(val) =>
                            setAiSettings({
                              ...aiSettings,
                              engines: { ...aiSettings.engines, chatbot: val },
                            })
                          }
                        >
                          <SelectTrigger className="w-full sm:w-[320px]">
                            <SelectValue placeholder="Selecione um motor" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nenhum (Desativado)</SelectItem>
                            <SelectItem value="openrouter">OpenRouter</SelectItem>
                            <SelectItem value="groq">Groq</SelectItem>
                            <SelectItem value="openai">OpenAI</SelectItem>
                          </SelectContent>
                        </Select>

                        {/* Seleção de Modelo Específico (Se OpenRouter) */}
                        {aiSettings.engines.chatbot === "openrouter" && (
                          <div className="mt-4 space-y-2 pt-4 border-t border-border/50">
                            <label className="text-xs font-semibold">
                              Modelo Selecionado do OpenRouter
                            </label>
                            <div className="flex items-center gap-2 max-w-md">
                              <Select
                                value={aiSettings.active_chatbot_model}
                                onValueChange={(val) =>
                                  setAiSettings({ ...aiSettings, active_chatbot_model: val })
                                }
                              >
                                <SelectTrigger className="flex-1">
                                  <SelectValue placeholder="Escolha um modelo salvo" />
                                </SelectTrigger>
                                <SelectContent>
                                  {aiSettings.chatbot_models.map((mod) => (
                                    <SelectItem key={mod} value={mod}>
                                      {mod}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="flex items-center gap-2 mt-2 max-w-md">
                              <Input
                                placeholder="Adicionar novo modelo (ex: anthropic/claude-3-haiku)"
                                value={newModelInput}
                                onChange={(e) => setNewModelInput(e.target.value)}
                                className="flex-1 h-9 text-xs"
                              />
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-9 shrink-0"
                                onClick={() => {
                                  if (
                                    newModelInput &&
                                    !aiSettings.chatbot_models.includes(newModelInput)
                                  ) {
                                    setAiSettings({
                                      ...aiSettings,
                                      chatbot_models: [...aiSettings.chatbot_models, newModelInput],
                                      active_chatbot_model: newModelInput,
                                    });
                                    setNewModelInput("");
                                  }
                                }}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="pt-2">
                        <Button
                          onClick={() => saveAiConfig.mutate()}
                          disabled={saveAiConfig.isPending || isLoadingCompany}
                          className="w-full sm:w-auto"
                        >
                          {saveAiConfig.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          Salvar Chaves e Motores
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Sub-aba 2: Sales Coach (Treinador) */}
              <TabsContent value="sales-coach" className="mt-0 border-none p-0 space-y-6">
                <Card>
                  <CardHeader className="border-b bg-muted/20 pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Target className="h-5 w-5 text-amber-500" />
                          Sales Coach (Treinador de Vendas em Tempo Real)
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Configure como o assistente orienta os consultores e audita a condução do
                          atendimento.
                        </CardDescription>
                      </div>
                      <Button
                        onClick={() => saveAiConfig.mutate()}
                        disabled={saveAiConfig.isPending || isLoadingCompany}
                        className="shrink-0 self-start sm:self-auto"
                      >
                        {saveAiConfig.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        Salvar Sales Coach
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6 pt-6">
                    {/* Prompt do Sales Coach */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <label className="font-semibold text-sm">Prompt Base do Treinador</label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Define a postura do coach ao analisar a conversa do chat (ex: contorno de
                        objeções, tom persuasivo, perguntas abertas).
                      </p>
                      <Textarea
                        placeholder="Você é um treinador de vendas..."
                        className="min-h-[100px] text-sm"
                        value={aiSettings.sales_coach_prompt}
                        onChange={(e) =>
                          setAiSettings({ ...aiSettings, sales_coach_prompt: e.target.value })
                        }
                      />
                    </div>

                    <Separator />

                    {/* Scorecard da Arena */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-amber-500" />
                        <label className="font-semibold text-sm">
                          Critérios do Scorecard (Arena de Treinamento)
                        </label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Critérios de notas (0 a 10) que o Sales Coach usará para auditar a simulação
                        das consultoras. Deixe em branco para os critérios padrão.
                      </p>
                      <Textarea
                        placeholder={`CRITÉRIOS DE AVALIAÇÃO (Scorecard 0 a 10):\n1. Condução do Funil: Liderou a conversa com perguntas?\n2. Investigação de Dor: Fez perguntas abertas antes de ofertar?\n3. Construção de Valor: Conectou benefícios às dores do cliente?\n4. Ancoragem de Preço: Defendeu valor antes de falar o preço?\n5. Contorno de Objeções: Desarmou hesitações sem dar desconto precipitado?\n6. Chance de Conversão: Qual a probabilidade real de fechamento?`}
                        className="min-h-[120px] text-xs font-mono"
                        value={aiSettings.sales_coach_evaluation_prompt}
                        onChange={(e) =>
                          setAiSettings({
                            ...aiSettings,
                            sales_coach_evaluation_prompt: e.target.value,
                          })
                        }
                      />
                    </div>

                    <Separator />

                    {/* Modelo da IA */}
                    <div className="space-y-2">
                      <label className="text-sm font-semibold">
                        Modelo Dedicado do Sales Coach
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Selecione o modelo específico que o treinador usará para avaliar as
                        respostas.
                      </p>
                      <div className="flex items-center gap-2 max-w-md">
                        <Select
                          value={aiSettings.sales_coach_model}
                          onValueChange={(val) =>
                            setAiSettings({ ...aiSettings, sales_coach_model: val })
                          }
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Escolha ou deixe em branco para o padrão" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="openai/gpt-4o-mini">
                              gpt-4o-mini (Padrão OpenAI)
                            </SelectItem>
                            <SelectItem value="openai/gpt-oss-120b:free">
                              gpt-oss-120b:free (Padrão OpenRouter)
                            </SelectItem>
                            <SelectItem value="google/gemma-7b-it:free">
                              gemma-7b-it:free
                            </SelectItem>
                            {aiSettings.chatbot_models.map(
                              (mod) =>
                                ![
                                  "openai/gpt-4o-mini",
                                  "openai/gpt-oss-120b:free",
                                  "google/gemma-7b-it:free",
                                ].includes(mod) && (
                                  <SelectItem key={mod} value={mod}>
                                    {mod}
                                  </SelectItem>
                                ),
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Separator />

                    {/* Instâncias Ativas */}
                    <div className="space-y-2">
                      <label className="text-sm font-semibold">
                        Canais Ativos para o Sales Coach
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Selecione em quais canais/instâncias o botão do Sales Coach deve aparecer.
                        Deixe vazio para ativar em todas.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                        {instances?.map((inst: any) => {
                          const isActive = aiSettings.sales_coach_instances.includes(inst.id);
                          return (
                            <div
                              key={inst.id}
                              className="flex items-center space-x-2.5 bg-muted/30 border p-2.5 rounded-xl"
                            >
                              <Switch
                                checked={isActive}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setAiSettings((prev) => ({
                                      ...prev,
                                      sales_coach_instances: [
                                        ...prev.sales_coach_instances,
                                        inst.id,
                                      ],
                                    }));
                                  } else {
                                    setAiSettings((prev) => ({
                                      ...prev,
                                      sales_coach_instances: prev.sales_coach_instances.filter(
                                        (id) => id !== inst.id,
                                      ),
                                    }));
                                  }
                                }}
                              />
                              <span className="text-xs truncate font-medium">{inst.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Sub-aba 3: Agentes de IA */}
              <TabsContent value="agents" className="mt-0 border-none p-0">
                <AiAgentsTab />
              </TabsContent>

              {/* Sub-aba 4: Servidor MCP */}
              <TabsContent value="mcp" className="mt-0 border-none p-0">
                <McpSettingsTab companyId={activeCompanyId} />
              </TabsContent>
            </div>
          </Tabs>
        </TabsContent>

        <TabsContent value="crm" className="grid gap-4">
          <CrmTab />
        </TabsContent>

        <TabsContent value="team" className="space-y-4">
          <Tabs
            defaultValue="profile"
            orientation="vertical"
            className="flex flex-col md:flex-row gap-6 w-full"
          >
            <TabsList className="flex md:flex-col h-auto w-full md:w-60 bg-transparent gap-1 justify-start overflow-x-auto pb-1 md:pb-0 md:border-r md:border-border/60 md:pr-4 shrink-0">
              <TabsTrigger
                value="profile"
                className="w-full justify-start data-[state=active]:bg-muted/80 rounded-lg py-2"
              >
                <User className="mr-2 h-4 w-4" />
                Minha Conta
              </TabsTrigger>
              <TabsTrigger
                value="users"
                className="w-full justify-start data-[state=active]:bg-muted/80 rounded-lg py-2"
              >
                <Users className="mr-2 h-4 w-4" />
                Membros
              </TabsTrigger>
              <TabsTrigger
                value="departments"
                className="w-full justify-start data-[state=active]:bg-muted/80 rounded-lg py-2"
              >
                <Building2 className="mr-2 h-4 w-4" />
                Departamentos
              </TabsTrigger>
              <TabsTrigger
                value="roles"
                className="w-full justify-start data-[state=active]:bg-muted/80 rounded-lg py-2"
              >
                <Shield className="mr-2 h-4 w-4" />
                Cargos & Permissões
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 w-full min-w-0">
              <TabsContent value="profile" className="mt-0 border-none p-0 space-y-6">
                {/* Perfil do Usuário */}
                <Card>
                  <CardHeader className="border-b bg-muted/20 pb-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <User className="h-5 w-5 text-primary" />
                      Meu Perfil de Acesso
                    </CardTitle>
                    <CardDescription>
                      Informações da sua conta de operador e permissões no sistema.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <Avatar className="h-16 w-16 border-2 border-primary/20 shadow-xs">
                        <AvatarImage src={profile?.avatar_url || ""} />
                        <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">
                          {profile?.name
                            ? profile.name.slice(0, 2).toUpperCase()
                            : user?.email?.slice(0, 2).toUpperCase() || "US"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-base text-foreground">
                            {profile?.name || "Usuário"}
                          </h3>
                          <Badge variant="secondary" className="capitalize text-xs">
                            {profile?.custom_role?.name ||
                              (profile?.role === "admin_company"
                                ? "Administrador"
                                : profile?.role === "manager"
                                  ? "Gerente"
                                  : "Agente")}
                          </Badge>
                          {profile?.has_matriz_access && (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-primary/10 text-primary border-primary/20"
                            >
                              Acesso Matriz
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5" />
                          {profile?.email || user?.email}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Preferências de Atendimento */}
                <Card>
                  <CardHeader className="border-b bg-muted/20 pb-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Settings className="h-5 w-5 text-primary" />
                      Preferências de Atendimento
                    </CardTitle>
                    <CardDescription>
                      Configure como suas mensagens serão assinadas durante o chat.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between space-x-4 border rounded-xl p-4 bg-muted/20">
                      <div className="space-y-0.5">
                        <label className="text-sm font-semibold">Assinatura de Mensagem</label>
                        <p className="text-xs text-muted-foreground">
                          Adicionar automaticamente seu nome ("*{profile?.name || "Seu Nome"}*:") ao
                          final das mensagens enviadas aos clientes.
                        </p>
                      </div>
                      <Switch
                        checked={useSignature}
                        onCheckedChange={(v) => toggleSignature.mutate(v)}
                        disabled={toggleSignature.isPending}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="users" className="mt-0 border-none p-0">
                <UsersTab />
              </TabsContent>

              <TabsContent value="departments" className="mt-0 border-none p-0">
                <DepartmentsTab />
              </TabsContent>

              <TabsContent value="roles" className="mt-0 border-none p-0">
                <RolesTab />
              </TabsContent>
            </div>
          </Tabs>
        </TabsContent>
      </Tabs>

      <QrCodeModal
        open={qrModalOpen}
        onOpenChange={setQrModalOpen}
        instance={selectedInstance}
        company={company}
      />
      <InstanceSettingsModal
        open={settingsModalOpen}
        onOpenChange={setSettingsModalOpen}
        instance={selectedInstance}
        company={company}
      />

      <CreateChannelDialog
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        companyId={activeCompanyId || ""}
        unitId={selectedUnitId}
      />
    </div>
  );
}

function InstanceRow({
  instance,
  company,
  onConnect,
  onSettings,
}: {
  instance: any;
  company: any;
  onConnect: () => void;
  onSettings: () => void;
}) {
  const qc = useQueryClient();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: "disconnect" | "delete" | null;
  }>({ open: false, type: null });

  const isInstagram = instance.network === "instagram" || instance.provider === "instagram";
  const isMessenger =
    instance.network === "messenger" ||
    instance.provider === "messenger" ||
    instance.provider === "facebook";
  const isOfficial = instance.provider === "zernio" || instance.provider === "oficial";
  const isConnected = instance.status === "connected";

  const handleDisconnect = async () => {
    try {
      if (instance.provider === "stevo") {
        const client = new StevoClient({
          host: company.stevo_host,
          token: company.stevo_global_token,
        });
        await client.logoutInstance(instance.stevo_api_key);
      } else {
        const client = new EvoGoClient({
          host: company.evogo_host,
          token: company.evogo_global_token,
        });
        await client.logoutInstance(instance.evogo_api_key);
      }
      await supabase
        .from("whatsapp_instances")
        .update({ status: "disconnected" })
        .eq("id", instance.id);
      toast.success("Aparelho desconectado.");
      qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
    } catch (e: any) {
      toast.error("Erro ao desconectar", { description: e.message });
    } finally {
      setConfirmDialog({ open: false, type: null });
    }
  };

  const handleDelete = async () => {
    try {
      let apiDeleted = true;
      try {
        if (
          instance.provider === "stevo" &&
          instance.stevo_instance_id &&
          !instance.stevo_instance_id.startsWith("manual-")
        ) {
          const client = new StevoClient({
            host: company.stevo_host,
            token: company.stevo_global_token,
          });
          if ((client as any).host) {
            await client.deleteInstance(instance.stevo_instance_id);
          }
        } else if (
          instance.provider === "evogo" &&
          instance.evogo_instance_id &&
          !instance.evogo_instance_id.startsWith("manual-")
        ) {
          const client = new EvoGoClient({
            host: company.evogo_host,
            token: company.evogo_global_token,
          });
          if ((client as any).host) {
            await client.deleteInstance(instance.evogo_instance_id);
          }
        }
      } catch (apiError) {
        console.warn("Failed to delete instance from provider API:", apiError);
        apiDeleted = false;
      }

      await supabase.from("whatsapp_instances").delete().eq("id", instance.id);
      toast.success(apiDeleted ? "Canal removido com sucesso." : "Removido localmente.");
      qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
    } catch (e: any) {
      toast.error("Erro ao deletar do banco de dados", { description: e.message });
    } finally {
      setConfirmDialog({ open: false, type: null });
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border bg-card p-4 hover:border-primary/30 transition-colors shadow-xs">
      <div className="flex items-center gap-3.5 min-w-0">
        <div
          className={cn(
            "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-xs",
            isInstagram
              ? "bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white"
              : isMessenger
                ? "bg-blue-600 text-white"
                : "bg-emerald-600 text-white",
          )}
        >
          {isInstagram ? (
            <Instagram className="h-5 w-5" />
          ) : isMessenger ? (
            <MessageSquare className="h-5 w-5" />
          ) : (
            <Smartphone className="h-5 w-5" />
          )}
        </div>

        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-sm leading-tight text-foreground truncate">
              {instance.name}
            </p>
            {instance.provider === "zernio" ? (
              <Badge
                variant="outline"
                className="text-[10px] px-2 py-0 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20"
              >
                Zernio Cloud
              </Badge>
            ) : instance.provider === "oficial" ? (
              <Badge
                variant="outline"
                className="text-[10px] px-2 py-0 bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
              >
                Meta Oficial
              </Badge>
            ) : instance.provider === "evogo" ? (
              <Badge
                variant="outline"
                className="text-[10px] px-2 py-0 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
              >
                EvoGo QR
              </Badge>
            ) : instance.provider === "stevo" ? (
              <Badge
                variant="outline"
                className="text-[10px] px-2 py-0 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20"
              >
                StevoChat
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono text-[11px] truncate max-w-[200px]">
              {instance.instance_name}
            </span>
            <span className="text-muted-foreground/40">•</span>
            {isOfficial ? (
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                API Oficial Ativa
              </span>
            ) : (
              <span
                className={cn(
                  "flex items-center gap-1.5 font-medium",
                  isConnected
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400",
                )}
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500",
                  )}
                />
                {isConnected ? "Conectado" : "Aguardando Leitura"}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
        {!isOfficial &&
          (isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDialog({ open: true, type: "disconnect" })}
              className="text-xs h-8 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
            >
              Desconectar
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={onConnect}
              className="text-xs h-8 gap-1.5 bg-primary"
            >
              <QrCode className="h-3.5 w-3.5" />
              Conectar QR
            </Button>
          ))}

        <Button
          variant="outline"
          size="icon"
          onClick={onSettings}
          title="Configurações do Canal"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={() => setConfirmDialog({ open: true, type: "delete" })}
          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
          title="Excluir Canal"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => !open && setConfirmDialog({ open: false, type: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.type === "disconnect" ? "Desconectar Aparelho?" : "Deletar Canal?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.type === "disconnect"
                ? "Isso irá deslogar o WhatsApp do aparelho atual. Será necessário ler o QR Code novamente para reconectar."
                : "Isso apagará permanentemente as configurações deste canal no sistema e no servidor de mensageria."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDialog.type === "disconnect" ? handleDisconnect : handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {confirmDialog.type === "disconnect" ? "Sim, Desconectar" : "Sim, Deletar Canal"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
